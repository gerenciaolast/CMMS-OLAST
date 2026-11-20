import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import ExcelJS from 'exceljs';
import { PrismaClient } from '@prisma/client';
import { ADMIN, RUN, TEST_DB, bootApp, createRunAdmin, login } from './helpers';

/** Cuadro de disponibilidad (formato OLAST): una hoja por mes, «FDS» por día, domingos en blanco. */
let app: INestApplication;
let token: string;
let vehicleId: string;
const prisma = new PrismaClient({ datasourceUrl: TEST_DB });
const TYPE = `D${RUN.slice(-5)}`.toUpperCase();
const PLATE = `Q${RUN.slice(-5)}`.toUpperCase();
const at = (s: string) => new Date(`${s}T15:00:00Z`);

async function workbook() {
  const wb = new ExcelJS.Workbook();
  // Hoja de otro proceso (como las de 2022 del archivo real): se omite.
  wb.addWorksheet('FEB-2022').addRow(['PROCESO', 'EQUIPO PADRE SAP', 'DESCRIPCION EQUIPO', 'MANTENIMIENTO']);
  const ws = wb.addWorksheet('FEB-2026');
  ws.addRow(['REPORTE DIARIO DE ESTADO DE VEHICULOS']);
  ws.addRow([24]); // días programados del mes
  const days = Array.from({ length: 28 }, (_, i) => new Date(Date.UTC(2026, 1, i + 1)));
  ws.addRow(['SUCURSAL', 'PLACA', 'MANTENIMIENTO', ...days, 'TOTAL DIAS PARADA', 'DISP MES']);
  const mark = (list: number[]) => days.map((_, i) => (list.includes(i + 1) ? 'FDS' : null));
  // Correctivo del lunes 2 al sábado 14 con el domingo 8 en blanco (una sola parada); preventivo el viernes 20.
  ws.addRow(['BOGOTA', ` ${PLATE.slice(0, 1)} ${PLATE.slice(1)}`, 'PREVENTIVO', ...mark([20])]);
  ws.addRow([null, null, 'CORRECTIVO', ...mark([2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14])]);
  ws.addRow(['BOGOTA', 'ZZZ000', 'PREVENTIVO', ...mark([])]);
  ws.addRow([null, null, 'CORRECTIVO', ...mark([])]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}
let xlsx: Buffer;
const upload = (dry: boolean) =>
  request(app.getHttpServer()).post(`/api/v1/imports/availability${dry ? '?dryRun=true' : ''}`).auth(token, { type: 'bearer' }).attach('file', xlsx, 'Disponibilidad.xlsx');

beforeAll(async () => {
  const email = `jefe-disp-${RUN}@olast.local`;
  await createRunAdmin(prisma, 'maintenance_manager', email);
  const user = await prisma.user.findFirstOrThrow({ where: { email } });
  xlsx = await workbook();
  app = await bootApp();
  token = (await login(app, email, ADMIN.password)).accessToken;
  const site = await prisma.site.findFirstOrThrow({ where: { organizationId: user.organizationId, code: 'BOG' } });
  const type = await prisma.vehicleType.create({ data: { code: TYPE, name: `Prueba disponibilidad ${RUN}`, maxDailyUsage: 800 } });
  const model = await prisma.vehicleModel.create({ data: { make: 'DISP', model: `M-${RUN}`, vehicleTypeId: type.id } });
  const v = await prisma.vehicle.create({ data: { organizationId: user.organizationId, siteId: site.id, vehicleModelId: model.id, plate: PLATE } });
  vehicleId = v.id;
  await prisma.workOrder.create({
    data: {
      organizationId: user.organizationId, number: `DISP-${RUN}`, vehicleId: v.id, siteId: site.id, type: 'CP', status: 'closed', origin: 'import', isHistorical: true,
      description: 'Cambio de embrague', actualStart: at('2026-02-14'), actualEnd: at('2026-02-14'), closedAt: at('2026-02-14'), odometerIn: 10_000, totalCost: 1_000_000,
    },
  });
});
afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe('cuadro de disponibilidad', () => {
  it('simulación: une la parada partida por el domingo, calcula como el cuadro y no guarda nada', async () => {
    const r = await upload(true).expect(201);
    expect(r.body).toMatchObject({ dryRun: true, stops: { corrective: 1, preventive: 1, days: 14 }, linkedOrders: 1, intervalsCreated: 5 });
    expect(r.body.skippedSheets).toEqual(['FEB-2022']);
    expect(r.body.unknownPlates).toEqual(['ZZZ000']);
    const feb = r.body.months[0];
    expect(feb).toMatchObject({ month: '2026-02', workdays: 24, realWorkdays: 24, correctiveDays: 12, preventiveDays: 1 });
    expect(feb.availability).toBeCloseTo(((24 - 12) / 24 + 1) / 2); // promedio de los 2 vehículos del cuadro, solo correctivo
    expect(await prisma.vehicleStatusLog.count({ where: { vehicleId } })).toBe(0);
  });

  it('aplica: historial de estados con la parada ligada a su OT, y se puede repetir sin duplicar', async () => {
    await upload(false).expect(201);
    const logs = await prisma.vehicleStatusLog.findMany({ where: { vehicleId }, orderBy: { startedAt: 'asc' } });
    expect(logs.map((l) => l.status)).toEqual(['operational', 'out_of_service_maintenance', 'operational', 'out_of_service_maintenance', 'operational']);
    expect(logs[1]!.reason).toContain('correctiva de 13 día(s)');
    expect(logs[1]!.workOrderId).not.toBeNull();
    expect(logs[3]!.reason).toContain('preventiva');
    const again = await upload(false).expect(201);
    expect(again.body.intervalsReplaced).toBe(5);
    expect(await prisma.vehicleStatusLog.count({ where: { vehicleId } })).toBe(5);
  });

  it('alimenta la disponibilidad como el cuadro: días hábiles y sin preventivos (política 2026)', async () => {
    const r = await request(app.getHttpServer()).get(`/api/v1/kpi/dashboard?from=2026-02-01&to=2026-02-28&type=${TYPE}`).auth(token, { type: 'bearer' }).expect(200);
    const k = Object.fromEntries(r.body.kpis.map((x: { code: string }) => [x.code, x]));
    // Febrero 2026: 24 días hábiles (lunes a sábado). Correctivo: 12 días hábiles (el domingo 8 no cuenta). Preventivo: 1.
    expect(k.availability.value).toBeCloseTo(12 / 24);
    expect(k.availability.name).toBe('Disponibilidad de flota (sin preventivos)');
    expect(k.availability.detail).toBe('Con preventivos: 45,8 % · 24 días hábiles');
    expect(k.downtime.value).toBeCloseTo(12);
    expect(k.downtime.detail).toBe('2 paradas · correctiva 12,0 d (1) · preventiva 1,0 d (1)');
    const actors = await request(app.getHttpServer()).get(`/api/v1/kpi/bad-actors?from=2026-02-01&to=2026-02-28&type=${TYPE}`).auth(token, { type: 'bearer' }).expect(200);
    expect(actors.body[0].availability).toBeCloseTo(12 / 24);
  });

  it('la política se puede cambiar (para el próximo año): con preventivos', async () => {
    const put = (includePreventive: boolean) =>
      request(app.getHttpServer()).put('/api/v1/kpi/settings').auth(token, { type: 'bearer' }).send({ availability: { includePreventive } }).expect(200);
    try {
      await put(true);
      const r = await request(app.getHttpServer()).get(`/api/v1/kpi/dashboard?from=2026-02-01&to=2026-02-28&type=${TYPE}`).auth(token, { type: 'bearer' }).expect(200);
      const k = Object.fromEntries(r.body.kpis.map((x: { code: string }) => [x.code, x]));
      expect(k.availability.value).toBeCloseTo(11 / 24);
      expect(k.availability.detail).toBe('Sin preventivos: 50,0 % · 24 días hábiles');
      expect(k.downtime.value).toBeCloseTo(6.5);
    } finally {
      await put(false);
    }
    const g = await request(app.getHttpServer()).get('/api/v1/kpi/settings').auth(token, { type: 'bearer' }).expect(200);
    expect(g.body).toEqual({ availability: { includePreventive: false } });
  });

  it('solo jefes y supervisores pueden cargarlo', async () => {
    const email = `tec-disp-${RUN}@olast.local`;
    await createRunAdmin(prisma, 'technician', email);
    const t = (await login(app, email, ADMIN.password)).accessToken;
    await request(app.getHttpServer()).post('/api/v1/imports/availability').auth(t, { type: 'bearer' }).attach('file', await workbook(), 'D.xlsx').expect(403);
  });
});
