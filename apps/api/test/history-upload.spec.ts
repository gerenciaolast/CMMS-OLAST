import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import ExcelJS from 'exceljs';
import { PrismaClient } from '@prisma/client';
import { ADMIN, RUN, TEST_DB, bootApp, createRunAdmin, login } from './helpers';

let app: INestApplication;
let http: ReturnType<INestApplication['getHttpServer']>;
let t: string;
let plate: string;
const prisma = new PrismaClient({ datasourceUrl: TEST_DB });

async function workbook(rows: (string | number | Date)[][]) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(plate.toLowerCase());
  ws.addRow(['Mes', 'Fecha', 'Sucursal', 'Placa', 'Kilometraje', 'Tipo Mantenimiento', 'Descripcion Intervencion', 'Valor_Total']);
  rows.forEach((r) => ws.addRow(r));
  return Buffer.from(await wb.xlsx.writeBuffer());
}
const upload = (buf: Buffer, dry: boolean) =>
  request(http).post(`/api/v1/imports/maintenance-history${dry ? '?dryRun=true' : ''}`).auth(t, { type: 'bearer' }).attach('file', buf, 'historial.xlsx');

beforeAll(async () => {
  const email = `jefe-hist-${RUN}@olast.local`;
  await createRunAdmin(prisma, 'maintenance_manager', email);
  app = await bootApp();
  http = app.getHttpServer();
  t = (await login(app, email, ADMIN.password)).accessToken;
  const type = await prisma.vehicleType.findUniqueOrThrow({ where: { code: 'CAR' } });
  const model = await prisma.vehicleModel.upsert({ where: { make_model: { make: 'CHEVROLET', model: 'NHR HIST' } }, create: { make: 'CHEVROLET', model: 'NHR HIST', vehicleTypeId: type.id }, update: {} });
  plate = `H${RUN.slice(-5)}`.toUpperCase();
  const v = await request(http).post('/api/v1/vehicles').auth(t, { type: 'bearer' }).send({ plate, siteCode: 'BOG', vehicleModelId: model.id, initialOdometer: 100_000 }).expect(201);
  await prisma.meterReading.updateMany({ where: { vehicleId: v.body.id }, data: { readAt: new Date('2026-01-01T00:00:00Z') } });
  await prisma.vehicle.update({ where: { id: v.body.id }, data: { lastReadingAt: new Date('2026-01-01T00:00:00Z') } });
});
afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe('historial en Excel: subir, revisar y actualizar sin duplicar', () => {
  const base = () => [
    ['Febrero', new Date('2026-02-10T00:00:00Z'), 'Bogota', plate, 104_000, 'Preventivo', 'Cambio de aceite y filtros', 600_000],
    ['Marzo', new Date('2026-03-15T00:00:00Z'), 'Bogota', plate, 107_500, 'Correctivo', 'Cambio de bandas traseras y graduar frenos', 900_000],
  ];

  it('la simulación no escribe nada', async () => {
    const r = await upload(await workbook(base()), true).expect(201);
    expect(r.body).toMatchObject({ dryRun: true, created: 2, updated: 0 });
    expect(await prisma.workOrder.count({ where: { vehicle: { plate }, isHistorical: true } })).toBe(0);
  });

  it('aplicar crea las OT históricas, clasifica y actualiza el kilometraje', async () => {
    const r = await upload(await workbook(base()), false).expect(201);
    expect(r.body).toMatchObject({ created: 2, skippedExisting: 0 });
    expect(r.body.meterUpdates).toEqual([expect.objectContaining({ plate, km: 107_500 })]);
    const cp = await prisma.workOrder.findFirstOrThrow({ where: { vehicle: { plate }, type: 'CP' }, include: { failures: true } });
    expect(cp.failures.map((f) => f.componentCode)).toEqual(expect.arrayContaining(['FRN.FRI.BAN', 'FRN.AJU.GRA']));
    expect((await prisma.vehicle.findFirstOrThrow({ where: { plate } })).currentOdometer).toBe(107_500);
  });

  it('el archivo actualizado (filas insertadas y una corregida) no duplica', async () => {
    const rows = base();
    rows.splice(1, 0, ['Febrero', new Date('2026-02-20T00:00:00Z'), 'Bogota', plate, 105_000, 'Correctivo', 'Cambio de bombillo stop', 30_000]);
    rows[2]![1] = new Date('2026-03-16T00:00:00Z'); // corrigen la fecha del correctivo
    const r = await upload(await workbook(rows), false).expect(201);
    expect(r.body).toMatchObject({ created: 1, updated: 1, skippedExisting: 1 });
    expect(r.body.updatedRows[0].changes).toEqual(['fecha 2026-03-15 → 2026-03-16']);
    expect(await prisma.workOrder.count({ where: { vehicle: { plate }, isHistorical: true } })).toBe(3);
    const again = await upload(await workbook(rows), true).expect(201);
    expect(again.body).toMatchObject({ created: 0, updated: 0, skippedExisting: 3 });
  });

  it('reporta (sin borrar) lo que ya no aparece en el archivo', async () => {
    const r = await upload(await workbook(base().slice(0, 1)), true).expect(201);
    expect(r.body.notInFile.length).toBeGreaterThanOrEqual(1);
  });
});
