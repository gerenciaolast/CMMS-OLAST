import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import ExcelJS from 'exceljs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PrismaClient } from '@prisma/client';
import { hash } from '@node-rs/argon2';
import { ADMIN, RUN, TEST_DB, bootApp, createRunAdmin, login } from './helpers';
import { importFleetWorkbook } from '../src/modules/vehicles/fleet-import';

let app: INestApplication;
let http: ReturnType<INestApplication['getHttpServer']>;
let token: string;
let modelId: string;
const prisma = new PrismaClient({ datasourceUrl: TEST_DB });
const P = (s: string) => `${s}${RUN.slice(-6)}`.toUpperCase(); // 7 caracteres, único por ejecución
const auth = (r: request.Test, t = token) => r.auth(t, { type: 'bearer' });

beforeAll(async () => {
  // Flujo real: el jefe de mantenimiento gestiona la flota (el admin no cambia estados, doc 06 §2).
  const manager = `jefe-${RUN}@olast.local`;
  await createRunAdmin(prisma, 'maintenance_manager', manager);
  app = await bootApp();
  http = app.getHttpServer();
  token = (await login(app, manager, ADMIN.password)).accessToken;
  const type = await prisma.vehicleType.findUniqueOrThrow({ where: { code: 'CAR' } });
  modelId = (await prisma.vehicleModel.upsert({
    where: { make_model: { make: 'CHEVROLET', model: 'NKR PRUEBA' } },
    create: { make: 'CHEVROLET', model: 'NKR PRUEBA', vehicleTypeId: type.id },
    update: {},
  })).id;
});
afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

async function newVehicle(prefix: string, extra: object = {}) {
  const r = await auth(request(http).post('/api/v1/vehicles'))
    .send({ plate: P(prefix), siteCode: 'BOG', vehicleModelId: modelId, year: 2021, serviceType: 'PUBLICO', loadCapacityKg: 2800, ...extra })
    .expect(201);
  return r.body.id as string;
}

describe('alta y hoja de vida (E1-H1, E1-H3)', () => {
  it('crea en reserva y normaliza la placa', async () => {
    const r = await auth(request(http).post('/api/v1/vehicles'))
      .send({ plate: ` ${P('a').toLowerCase()} `, siteCode: 'BOG', vehicleModelId: modelId, initialOdometer: 1000 })
      .expect(201);
    expect(r.body.plate).toBe(P('a'));
    expect(r.body.status).toBe('reserve');
    expect(r.body.currentOdometer).toBe(1000);
  });

  it('placa duplicada → 409', async () => {
    await auth(request(http).post('/api/v1/vehicles')).send({ plate: P('a'), siteCode: 'BOG', vehicleModelId: modelId }).expect(409);
  });

  it('no permite crear directamente operativo (doc 02 P1)', async () => {
    const r = await auth(request(http).post('/api/v1/vehicles'))
      .send({ plate: P('b'), siteCode: 'BOG', vehicleModelId: modelId, status: 'operational', initialOdometer: 5 })
      .expect(422);
    expect(r.body.code).toBe('INVALID_INITIAL_STATUS');
  });

  it('la hoja de vida lista los pendientes y la completitud', async () => {
    const id = await newVehicle('c');
    const r = await auth(request(http).get(`/api/v1/vehicles/${id}`)).expect(200);
    expect(r.body.missing.map((m: { field: string }) => m.field)).toEqual(['currentOdometer', 'criticality', 'doc.SOAT', 'doc.RTM', 'vin']);
    expect(r.body.completeness).toBe(29);
    expect(r.body.statusLog).toHaveLength(1);
  });

  it('el listado filtra por "ficha incompleta" y búsqueda', async () => {
    const r = await auth(request(http).get(`/api/v1/vehicles?incomplete=true&q=${P('c')}`)).expect(200);
    expect(r.body).toHaveLength(1);
    expect(r.body[0].plate).toBe(P('c'));
  });
});

describe('lecturas de odómetro (E2-H1, E2-H2)', () => {
  let id: string;
  beforeAll(async () => {
    id = await newVehicle('r', { initialOdometer: 100_000 });
    await prisma.meterReading.updateMany({ where: { vehicleId: id }, data: { readAt: new Date(Date.now() - 10 * 86_400_000) } });
  });

  it('acepta una lectura válida y actualiza el kilometraje vigente', async () => {
    const r = await auth(request(http).post(`/api/v1/vehicles/${id}/readings`)).send({ value: 102_000 }).expect(201);
    expect(r.body.status).toBe('accepted');
    const v = await prisma.vehicle.findUniqueOrThrow({ where: { id } });
    expect(v.currentOdometer).toBe(102_000);
  });

  it('rechaza una lectura menor con código y la lectura anterior', async () => {
    const r = await auth(request(http).post(`/api/v1/vehicles/${id}/readings`)).send({ value: 101_000 }).expect(422);
    expect(r.body.code).toBe('READING_DECREASING');
    expect(r.body.details.previous.value).toBe(102_000);
  });

  it('rechaza fechas futuras', async () => {
    const r = await auth(request(http).post(`/api/v1/vehicles/${id}/readings`))
      .send({ value: 103_000, readAt: new Date(Date.now() + 86_400_000).toISOString() })
      .expect(400);
    expect(r.body.code).toBe('FUTURE_DATE');
  });

  it('marca "a validar" un salto improbable sin mover el km vigente; al validarla sí lo mueve', async () => {
    const r = await auth(request(http).post(`/api/v1/vehicles/${id}/readings`)).send({ value: 150_000 }).expect(201);
    expect(r.body.status).toBe('flagged');
    expect((await prisma.vehicle.findUniqueOrThrow({ where: { id } })).currentOdometer).toBe(102_000);
    await auth(request(http).post(`/api/v1/vehicles/${id}/readings/${r.body.id}/validate`)).expect(201);
    expect((await prisma.vehicle.findUniqueOrThrow({ where: { id } })).currentOdometer).toBe(150_000);
  });

  it('cambio de odómetro conserva el acumulado y permite lecturas menores en bruto', async () => {
    await auth(request(http).post(`/api/v1/vehicles/${id}/meter-replacements`))
      .send({ oldFinalValue: 150_100, newInitialValue: 0, reason: 'Cambio de tablero' })
      .expect(201);
    const r = await auth(request(http).post(`/api/v1/vehicles/${id}/readings`)).send({ value: 500 }).expect(201);
    expect(r.body.accumulatedValue).toBe(150_600);
    const v = await auth(request(http).get(`/api/v1/vehicles/${id}`)).expect(200);
    expect(v.body.currentOdometer).toBe(500);
    expect(v.body.accumulatedOdometer).toBe(150_600);
  });
});

describe('criticidad, estados y documentos (E1-H2, E1-H4)', () => {
  let id: string;
  beforeAll(async () => {
    id = await newVehicle('s');
  });

  it('no deja pasar a operativo sin criticidad ni kilometraje', async () => {
    const r = await auth(request(http).post(`/api/v1/vehicles/${id}/status`)).send({ status: 'operational', reason: 'Inicio' }).expect(422);
    expect(r.body.code).toBe('INCOMPLETE_FOR_OPERATION');
  });

  it('calcula criticidad A cuando seguridad = 3', async () => {
    const r = await auth(request(http).put(`/api/v1/vehicles/${id}/criticality`))
      .send({ operationalImpact: 1, safety: 3, repairCost: 1, usage: 1 })
      .expect(200);
    expect(r.body.criticality).toBe('A');
    expect(r.body.criticalityScore.score).toBe(6);
  });

  it('con criticidad y lectura pasa a operativo; el historial cierra el estado anterior', async () => {
    await auth(request(http).post(`/api/v1/vehicles/${id}/readings`)).send({ value: 10 }).expect(201);
    await auth(request(http).post(`/api/v1/vehicles/${id}/status`)).send({ status: 'operational', reason: 'Listo para operar' }).expect(201);
    const log = await prisma.vehicleStatusLog.findMany({ where: { vehicleId: id }, orderBy: { startedAt: 'asc' } });
    expect(log.map((l) => l.status)).toEqual(['reserve', 'operational']);
    expect(log[0]!.endedAt).not.toBeNull();
    expect(log[1]!.endedAt).toBeNull();
  });

  it('exige motivo', async () => {
    const r = await auth(request(http).post(`/api/v1/vehicles/${id}/status`)).send({ status: 'reserve', reason: '' }).expect(422);
    expect(r.body.code).toBe('REASON_REQUIRED');
  });

  it('documentos: valida fechas y registra vencimientos', async () => {
    await auth(request(http).put(`/api/v1/vehicles/${id}/documents/SOAT`)).send({ issuedAt: '2026-06-01', expiresAt: '2026-01-01' }).expect(400);
    const r = await auth(request(http).put(`/api/v1/vehicles/${id}/documents/SOAT`)).send({ number: '123', issuedAt: '2026-06-01', expiresAt: '2027-06-01' }).expect(200);
    expect(r.body.documentType.code).toBe('SOAT');
    const v = await auth(request(http).get(`/api/v1/vehicles/${id}`)).expect(200);
    expect(v.body.missing.map((m: { field: string }) => m.field)).not.toContain('doc.SOAT');
  });

  it('dar de baja es definitivo', async () => {
    await auth(request(http).post(`/api/v1/vehicles/${id}/status`)).send({ status: 'retired', reason: 'Vendido' }).expect(201);
    const r = await auth(request(http).post(`/api/v1/vehicles/${id}/status`)).send({ status: 'operational', reason: 'x' }).expect(422);
    expect(r.body.code).toBe('RETIRED');
  });
});

describe('permisos', () => {
  it('el administrador no puede cambiar el estado de un vehículo (doc 06 §2)', async () => {
    const id = await newVehicle('p');
    const adminEmail = `admin2-${RUN}@olast.local`;
    await createRunAdmin(prisma, 'admin', adminEmail);
    const t = (await login(app, adminEmail, ADMIN.password)).accessToken;
    const r = await auth(request(http).post(`/api/v1/vehicles/${id}/status`), t).send({ status: 'reserve', reason: 'x' }).expect(403);
    expect(r.body.details.missing).toEqual(['vehicle.change_status']);
  });
});

describe('visibilidad por sede', () => {
  it('un técnico de Tunja no ve vehículos de Bogotá', async () => {
    const id = await newVehicle('v');
    const org = await prisma.organization.findFirstOrThrow({ where: { name: 'OLAST' } });
    const role = await prisma.role.findUniqueOrThrow({ where: { organizationId_code: { organizationId: org.id, code: 'technician' } } });
    const tun = await prisma.site.findUniqueOrThrow({ where: { organizationId_code: { organizationId: org.id, code: 'TUN' } } });
    const email = `tec-tun-${RUN}@olast.local`;
    await prisma.user.create({
      data: { organizationId: org.id, roleId: role.id, email, fullName: 'Técnico Tunja', passwordHash: await hash(ADMIN.password), sites: { create: [{ siteId: tun.id }] } },
    });
    const t = (await login(app, email, ADMIN.password)).accessToken;
    await auth(request(http).get(`/api/v1/vehicles/${id}`), t).expect(404);
    const list = await auth(request(http).get('/api/v1/vehicles?includeRetired=true'), t).expect(200);
    expect(list.body.every((v: { site: { code: string } }) => v.site.code === 'TUN')).toBe(true);
    await auth(request(http).post('/api/v1/vehicles'), t).send({ plate: P('w'), siteCode: 'TUN', vehicleModelId: modelId }).expect(403);
  });
});

describe('importación de plantilla', () => {
  it('crea, es idempotente y no borra datos con celdas vacías', async () => {
    const file = join(tmpdir(), `plantilla-${RUN}.xlsx`);
    const build = async (rows: (string | number | null)[][]) => {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Vehiculos');
      ws.addRow(['Placa', 'Incluir (SI/NO)', 'Sede', 'Estado', 'Marca', 'Línea / tipo', 'Tipo vehículo (código)', 'Año modelo', 'VIN / chasis',
        'Kilometraje actual', 'Fecha de la lectura (AAAA-MM-DD)', 'Crit. impacto operacional (1-3)', 'Crit. seguridad (1-3)', 'Crit. costo reparación (1-3)', 'Crit. uso (1-3)']);
      rows.forEach((r) => ws.addRow(r));
      const ds = wb.addWorksheet('Documentos');
      ds.addRow(['Placa', 'Documento (código)', 'Documento', 'Número', 'Entidad / aseguradora', 'Fecha expedición', 'Fecha vencimiento']);
      ds.addRow([P('i'), 'SOAT', 'SOAT', null, null, null, '2027-03-01']);
      await wb.xlsx.writeFile(file);
    };
    await build([
      [P('i'), 'SI', 'NEI', 'Operativo', 'Chevrolet', 'NHR import', 'CAR', 2021, 'VIN123', 200_000, '2026-09-01', 2, 2, 2, 2],
      [P('j'), 'NO', 'NEI', 'Operativo', 'JMC', 'CHR', 'CAR', 2022, null, null, null, null, null, null, null],
    ]);
    const r1 = await importFleetWorkbook(prisma, file);
    expect(r1.created).toEqual([P('i')]);
    expect(r1.skipped).toEqual([P('j')]);
    expect(r1).toMatchObject({ readings: 1, documents: 1, criticality: 1 });

    await build([[P('i'), 'SI', 'NEI', 'Operativo', 'Chevrolet', 'NHR import', 'CAR', 2021, null, null, null, null, null, null, null]]);
    const r2 = await importFleetWorkbook(prisma, file);
    expect(r2.updated).toEqual([P('i')]);
    expect(r2.readings).toBe(0);
    const v = await prisma.vehicle.findFirstOrThrow({ where: { plate: P('i') } });
    expect(v).toMatchObject({ vin: 'VIN123', currentOdometer: 200_000, criticality: 'B', status: 'operational' });
    expect(await prisma.vehicleStatusLog.count({ where: { vehicleId: v.id } })).toBe(1);
  });
});
