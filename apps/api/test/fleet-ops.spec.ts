import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import ExcelJS from 'exceljs';
import { PrismaClient } from '@prisma/client';
import { ADMIN, RUN, TEST_DB, bootApp, createRunAdmin, login } from './helpers';

let app: INestApplication;
let http: ReturnType<INestApplication['getHttpServer']>;
let token: string;
let carModel: string;
let mcaModel: string;
const prisma = new PrismaClient({ datasourceUrl: TEST_DB });
const suffix = RUN.slice(-3).toUpperCase().replace(/[^A-Z]/g, 'X').padEnd(3, 'X');
const digits = String(Date.now()).slice(-3);
const auth = (r: request.Test) => r.auth(token, { type: 'bearer' });

async function model(make: string, name: string, type: string) {
  const t = await prisma.vehicleType.findUniqueOrThrow({ where: { code: type } });
  return (await prisma.vehicleModel.upsert({ where: { make_model: { make, model: name } }, create: { make, model: name, vehicleTypeId: t.id }, update: { vehicleTypeId: t.id } })).id;
}

async function vehicle(plate: string, modelId = carModel, extra: object = {}) {
  const r = await auth(request(http).post('/api/v1/vehicles'))
    .send({ plate, siteCode: 'BOG', vehicleModelId: modelId, year: 2021, initialOdometer: 100_000, tires: { frontQty: 2, rearQty: 4, frontSize: '205/75R17.5' }, ...extra })
    .expect(201);
  return r.body as { id: string; plate: string; plateWarning: string | null };
}

beforeAll(async () => {
  const manager = `jefe-ops-${RUN}@olast.local`;
  await createRunAdmin(prisma, 'maintenance_manager', manager);
  app = await bootApp();
  http = app.getHttpServer();
  token = (await login(app, manager, ADMIN.password)).accessToken;
  carModel = await model('CHEVROLET', 'NKR OPS', 'CAR');
  mcaModel = await model('BAJAJ', 'RE MAXIMA OPS', 'MCA');
});
afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe('placas de motocarro', () => {
  it('corrige letras-primero al formato 123ABC', async () => {
    const v = await vehicle(`${suffix}${digits}`, mcaModel);
    expect(v.plate).toBe(`${digits}${suffix}`);
    expect(v.plateWarning).toBeNull();
  });
  it('advierte si una placa no cumple el formato del tipo', async () => {
    const v = await vehicle(`${digits}${suffix.slice(0, 2)}Q`, carModel);
    expect(v.plateWarning).toContain('ABC123');
  });
});

describe('traslados entre sedes', () => {
  it('cierra la sede vigente, abre la nueva y conserva el historial', async () => {
    const v = await vehicle(`T${suffix}${digits.slice(0, 2)}`);
    await auth(request(http).post(`/api/v1/vehicles/${v.id}/transfer`)).send({ siteCode: 'NEI', reason: 'Apoyo operación Huila' }).expect(201);
    await auth(request(http).post(`/api/v1/vehicles/${v.id}/transfer`)).send({ siteCode: 'NEI', reason: 'otra vez' }).expect(422);
    const d = await auth(request(http).get(`/api/v1/vehicles/${v.id}`)).expect(200);
    expect(d.body.site.code).toBe('NEI');
    expect(d.body.siteHistory.map((h: { site: { code: string }; endedAt: string | null }) => [h.site.code, h.endedAt === null])).toEqual([['NEI', true], ['BOG', false]]);
  });
  it('la sede no se puede cambiar con PATCH (debe quedar historial)', async () => {
    const v = await vehicle(`U${suffix}${digits.slice(0, 2)}`);
    const r = await auth(request(http).patch(`/api/v1/vehicles/${v.id}`)).send({ siteCode: 'CAL' }).expect(400);
    expect(r.body.code).toBe('VALIDATION_ERROR');
  });
  it('exige motivo', async () => {
    const v = await vehicle(`V${suffix}${digits.slice(0, 2)}`);
    await auth(request(http).post(`/api/v1/vehicles/${v.id}/transfer`)).send({ siteCode: 'CAL', reason: '' }).expect(400);
  });
});

describe('conductores', () => {
  it('un vehículo puede tener dos conductores y uno principal', async () => {
    const v = await vehicle(`D${suffix}${digits.slice(0, 2)}`);
    const a = await auth(request(http).post('/api/v1/drivers')).send({ fullName: 'Conductor Uno', documentId: `1${RUN}`, siteCode: 'BOG' }).expect(201);
    const b = await auth(request(http).post('/api/v1/drivers')).send({ fullName: 'Conductor Dos', documentId: `2${RUN}` }).expect(201);
    expect(a.body.fullName).toBe('CONDUCTOR UNO');
    const r = await auth(request(http).put(`/api/v1/vehicles/${v.id}/drivers`)).send({ driverIds: [a.body.id, b.body.id], primaryDriverId: b.body.id }).expect(200);
    expect(r.body).toHaveLength(2);
    expect(r.body[0]).toMatchObject({ isPrimary: true, driver: { id: b.body.id } });
    const d = await auth(request(http).get(`/api/v1/vehicles/${v.id}`)).expect(200);
    expect(d.body.drivers).toHaveLength(2);
    // quitar uno
    await auth(request(http).put(`/api/v1/vehicles/${v.id}/drivers`)).send({ driverIds: [a.body.id] }).expect(200);
    expect(await prisma.vehicleDriver.count({ where: { vehicleId: v.id } })).toBe(1);
  });
  it('cédula duplicada → 409', async () => {
    await auth(request(http).post('/api/v1/drivers')).send({ fullName: 'Otro', documentId: `1${RUN}` }).expect(409);
  });
  it('el principal debe estar entre los asignados', async () => {
    const v = await vehicle(`E${suffix}${digits.slice(0, 2)}`);
    const a = await prisma.driver.findFirstOrThrow({ where: { documentId: `1${RUN}` } });
    const b = await prisma.driver.findFirstOrThrow({ where: { documentId: `2${RUN}` } });
    const r = await auth(request(http).put(`/api/v1/vehicles/${v.id}/drivers`)).send({ driverIds: [a.id], primaryDriverId: b.id }).expect(400);
    expect(r.body.code).toBe('PRIMARY_NOT_ASSIGNED');
  });
});

describe('cambio de llantas', () => {
  let id: string;
  beforeAll(async () => {
    id = (await vehicle(`L${suffix}${digits.slice(0, 2)}`)).id;
  });
  it('desgaste de las 4 traseras con costo', async () => {
    const r = await auth(request(http).post(`/api/v1/vehicles/${id}/tire-changes`)).send({ axle: 'rear', quantity: 4, reason: 'wear', unitCost: 950_000 }).expect(201);
    expect(r.body).toMatchObject({ quantity: 4, reason: 'wear', odometer: 100_000 });
    expect(Number(r.body.totalCost)).toBe(3_800_000);
  });
  it('daño en la vía de una delantera con posición y nuevo kilometraje (queda como lectura)', async () => {
    await prisma.meterReading.updateMany({ where: { vehicleId: id }, data: { readAt: new Date(Date.now() - 5 * 86_400_000) } });
    const r = await auth(request(http).post(`/api/v1/vehicles/${id}/tire-changes`))
      .send({ axle: 'front', quantity: 1, positions: ['DEL-DER'], reason: 'road_damage', odometer: 101_500 })
      .expect(201);
    expect(r.body.readingStatus).toBe('accepted');
    expect((await prisma.vehicle.findUniqueOrThrow({ where: { id } })).currentOdometer).toBe(101_500);
  });
  it('robo del repuesto exige descripción', async () => {
    const r = await auth(request(http).post(`/api/v1/vehicles/${id}/tire-changes`)).send({ axle: 'spare', quantity: 1, reason: 'theft' }).expect(422);
    expect(r.body.code).toBe('NOTES_REQUIRED');
    await auth(request(http).post(`/api/v1/vehicles/${id}/tire-changes`)).send({ axle: 'spare', quantity: 1, reason: 'theft', notes: 'Hurto en parqueadero' }).expect(201);
  });
  it('no permite más llantas de las que tiene el eje', async () => {
    const r = await auth(request(http).post(`/api/v1/vehicles/${id}/tire-changes`)).send({ axle: 'front', quantity: 3, reason: 'wear' }).expect(422);
    expect(r.body.code).toBe('TOO_MANY_TIRES');
  });
  it('aparece en la hoja de vida', async () => {
    const d = await auth(request(http).get(`/api/v1/vehicles/${id}`)).expect(200);
    expect(d.body.tireChanges.map((t: { reason: string }) => t.reason).sort()).toEqual(['road_damage', 'theft', 'wear']);
  });
});

describe('plantilla: descargar, completar y subir', () => {
  it('descarga con hojas Vehiculos, Conductores, Documentos y Pendientes', async () => {
    const r = await auth(request(http).get('/api/v1/imports/fleet-template')).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    }).expect(200);
    expect(r.headers['content-type']).toContain('spreadsheetml');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(r.body);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Instrucciones', 'Vehiculos', 'Conductores', 'Documentos', 'Pendientes']);
  });

  it('sube conductores con varias placas y un traslado', async () => {
    const plate = `W${suffix}${digits.slice(0, 2)}`;
    const v = await vehicle(plate);
    const wb = new ExcelJS.Workbook();
    const vs = wb.addWorksheet('Vehiculos');
    vs.addRow(['Placa', 'Incluir (SI/NO)', 'Sede', 'Estado', 'Marca', 'Línea / tipo', 'Tipo vehículo (código)']);
    vs.addRow([plate, 'SI', 'TUN', 'Reserva', 'CHEVROLET', 'NKR OPS', 'CAR']);
    const cs = wb.addWorksheet('Conductores');
    cs.addRow(['Nombre completo', 'Cédula', 'Teléfono', 'Correo', 'No. licencia', 'Categoría licencia', 'Vence licencia', 'Sede', 'Placas asignadas', 'Activo (SI/NO)']);
    cs.addRow([`Ana ${RUN}`, `3${RUN}`, '3001234567', null, 'L1', 'c2', '2028-01-01', 'TUN', plate, 'SI']);
    cs.addRow([`Luis ${RUN}`, `4${RUN}`, null, null, null, null, null, 'TUN', `${plate}, NOEXISTE1`, 'SI']);
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    const r = await auth(request(http).post('/api/v1/imports/fleet')).attach('file', buf, 'plantilla.xlsx').expect(201);
    expect(r.body).toMatchObject({ updated: [plate], drivers: 2, transfers: 1 });
    expect(r.body.warnings.join(' ')).toContain('NOEXISTE1');
    const d = await auth(request(http).get(`/api/v1/vehicles/${v.id}`)).expect(200);
    expect(d.body.site.code).toBe('TUN');
    expect(d.body.drivers).toHaveLength(2);
    expect(d.body.drivers.filter((x: { isPrimary: boolean }) => x.isPrimary)).toHaveLength(1);
  });

  it('rechaza archivos que no son .xlsx', async () => {
    const r = await auth(request(http).post('/api/v1/imports/fleet')).attach('file', Buffer.from('hola'), 'x.csv').expect(415);
    expect(r.body.code).toBe('INVALID_FILE');
  });
});
