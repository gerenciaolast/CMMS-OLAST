import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { ADMIN, RUN, TEST_DB, bootApp, createRunAdmin, login } from './helpers';

let app: INestApplication;
let http: ReturnType<INestApplication['getHttpServer']>;
let mgr: string;
let drv: string;
let vehicleId: string;
let otherId: string;
let items: { id: string; text: string; isCritical: boolean; requiresPhotoOnFail: boolean }[];
const prisma = new PrismaClient({ datasourceUrl: TEST_DB });
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex');
const DAY = 86_400_000;
const as = (t: string) => ({
  get: (u: string) => request(http).get(`/api/v1${u}`).auth(t, { type: 'bearer' }),
  post: (u: string) => request(http).post(`/api/v1${u}`).auth(t, { type: 'bearer' }),
  put: (u: string) => request(http).put(`/api/v1${u}`).auth(t, { type: 'bearer' }),
});
const item = (text: string) => items.find((i) => i.text.startsWith(text))!;
const answers = (over: Record<string, { answer: 'defect' | 'na'; comment?: string }> = {}) =>
  items.map((i) => ({ itemId: i.id, answer: over[i.id]?.answer ?? 'ok', comment: over[i.id]?.comment ?? null }));
function submit(t: string, body: object, photos: Record<string, Buffer> = {}) {
  let r = as(t).post('/inspections').field('data', JSON.stringify(body));
  for (const [itemId, buf] of Object.entries(photos)) r = r.attach(`photo:${itemId}`, buf, 'f.png');
  return r;
}
let n = 0;
async function vehicle() {
  const type = await prisma.vehicleType.findUniqueOrThrow({ where: { code: 'CAR' } });
  const model = await prisma.vehicleModel.upsert({ where: { make_model: { make: 'CHEVROLET', model: 'NPR INS' } }, create: { make: 'CHEVROLET', model: 'NPR INS', vehicleTypeId: type.id }, update: {} });
  const v = await as(mgr).post('/vehicles').send({ plate: `I${RUN.slice(-4)}${++n}`.toUpperCase(), siteCode: 'BOG', vehicleModelId: model.id, initialOdometer: 50_000, year: 2022, serviceType: 'PUBLICO' }).expect(201);
  await prisma.meterReading.updateMany({ where: { vehicleId: v.body.id }, data: { readAt: new Date(Date.now() - 3 * DAY) } });
  await as(mgr).put(`/vehicles/${v.body.id}/criticality`).send({ operationalImpact: 2, safety: 2, repairCost: 2, usage: 2 }).expect(200);
  await as(mgr).post(`/vehicles/${v.body.id}/status`).send({ status: 'operational', reason: 'Listo' }).expect(201);
  return v.body.id as string;
}
const status = async (id: string) => (await prisma.vehicle.findUniqueOrThrow({ where: { id } })).status;

beforeAll(async () => {
  const m = `jefe-ins-${RUN}@olast.local`;
  await createRunAdmin(prisma, 'maintenance_manager', m);
  app = await bootApp();
  http = app.getHttpServer();
  mgr = (await login(app, m, ADMIN.password)).accessToken;
  vehicleId = await vehicle();
  otherId = await vehicle();
  const d = await as(mgr).post('/drivers').send({ fullName: `Conductor Insp ${RUN}`, documentId: `9${RUN}`, siteCode: 'BOG' }).expect(201);
  const acc = await as(mgr).post(`/drivers/${d.body.id}/access`).send({ email: `cond-ins-${RUN}@olast.local` }).expect(201);
  await as(mgr).post(`/drivers/${d.body.id}/access`).send({ email: `x-${RUN}@olast.local` }).expect(400);
  await as(mgr).put(`/vehicles/${vehicleId}/drivers`).send({ driverIds: [d.body.id] }).expect(200);
  drv = (await login(app, acc.body.email, acc.body.temporaryPassword)).accessToken;
});
afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe('inspección pre-operacional (doc 02 P3)', () => {
  it('el conductor solo ve e inspecciona los vehículos que tiene asignados', async () => {
    const mine = await as(drv).get('/inspections/my-vehicles').expect(200);
    expect(mine.body.map((v: { id: string }) => v.id)).toEqual([vehicleId]);
    const r = await as(drv).get(`/inspections/start/${otherId}`).expect(403);
    expect(r.body.code).toBe('NOT_ASSIGNED');
    const s = await as(drv).get(`/inspections/start/${vehicleId}`).expect(200);
    items = s.body.template.items;
    expect(items.length).toBe(16);
    expect(items.filter((i) => i.isCritical)).toHaveLength(7);
  });

  it('todo OK → APTO y el kilometraje queda registrado', async () => {
    const r = await submit(drv, { vehicleId, odometer: 50_300, signatureName: 'Conductor Insp', answers: answers(), durationSeconds: 95 }).expect(201);
    expect(r.body).toMatchObject({ result: 'fit', resultLabel: 'APTO', createdRequests: [] });
    expect((await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicleId } })).currentOdometer).toBe(50_300);
  });

  it('valida kilometraje, ítems completos y firma', async () => {
    let r = await submit(drv, { vehicleId, odometer: 50_000, signatureName: 'Conductor Insp', answers: answers() }).expect(422);
    expect(r.body.code).toBe('READING_DECREASING');
    r = await submit(drv, { vehicleId, odometer: 50_400, signatureName: 'Conductor Insp', answers: answers().slice(1) }).expect(422);
    expect(r.body.code).toBe('ITEMS_MISSING');
    await submit(drv, { vehicleId, odometer: 50_400, signatureName: '', answers: answers() }).expect(400);
    expect(await prisma.inspection.count({ where: { vehicleId } })).toBe(1);
  });

  it('defecto no crítico → APTO CON OBSERVACIONES y aviso de prioridad baja', async () => {
    const aseo = item('Limpieza');
    const r = await submit(drv, { vehicleId, odometer: 50_400, signatureName: 'Conductor Insp', answers: answers({ [aseo.id]: { answer: 'defect', comment: 'Cojinería rota' } }) }).expect(201);
    expect(r.body.result).toBe('fit_with_observations');
    expect(r.body.createdRequests).toHaveLength(1);
    expect(await status(vehicleId)).toBe('operational');
  });

  it('llantas exige foto del defecto', async () => {
    const llantas = item('Neumáticos');
    const r = await submit(drv, { vehicleId, odometer: 50_450, signatureName: 'Conductor Insp', answers: answers({ [llantas.id]: { answer: 'defect', comment: 'Corte lateral' } }) }).expect(422);
    expect(r.body.code).toBe('PHOTO_REQUIRED');
  });

  it('defecto crítico → NO APTO: vehículo fuera de servicio, aviso P1/P2 y notificación al jefe', async () => {
    const frenos = item('Frenos');
    const r = await submit(drv, { vehicleId, odometer: 50_500, signatureName: 'Conductor Insp', answers: answers({ [frenos.id]: { answer: 'defect', comment: 'Pedal se va al fondo' } }) }).expect(201);
    expect(r.body).toMatchObject({ result: 'unfit', resultLabel: 'NO APTO' });
    expect(await status(vehicleId)).toBe('out_of_service_maintenance');
    const req = await prisma.workRequest.findFirstOrThrow({ where: { number: r.body.createdRequests[0] } });
    expect(req).toMatchObject({ source: 'inspection', canOperate: 'no', systemCode: 'FRN', priority: 'P2' });
    const note = await prisma.notification.findFirst({ where: { kind: 'critical_defect', title: { contains: 'NO APTO' } }, orderBy: { createdAt: 'desc' } });
    expect(note).not.toBeNull();
  });

  it('el mismo defecto en la siguiente inspección se liga al aviso abierto (no se duplica)', async () => {
    const s = await as(drv).get(`/inspections/start/${vehicleId}`).expect(200);
    expect(s.body.openDefects.map((d: { itemId: string }) => d.itemId)).toEqual(expect.arrayContaining([item('Frenos').id]));
    const before = await prisma.workRequest.count({ where: { vehicleId } });
    const llantas = item('Neumáticos');
    const r = await submit(drv, {
      vehicleId, odometer: 50_500, signatureName: 'Conductor Insp',
      answers: answers({ [item('Frenos').id]: { answer: 'defect', comment: 'Sigue igual' }, [llantas.id]: { answer: 'defect', comment: 'Corte lateral' } }),
    }, { [llantas.id]: PNG }).expect(201);
    expect(r.body.linkedRequests).toHaveLength(1);
    expect(r.body.createdRequests).toHaveLength(1);
    expect(await prisma.workRequest.count({ where: { vehicleId } })).toBe(before + 1);
    const detail = await as(mgr).get(`/inspections/${r.body.id}`).expect(200);
    expect(detail.body.results.find((x: { item: { text: string } }) => x.item.text.startsWith('Frenos')).alreadyReported).toBe(true);
    const tire = detail.body.results.find((x: { item: { text: string } }) => x.item.text.startsWith('Neumáticos'));
    expect(tire.workRequest.photos).toHaveLength(1);
    await as(mgr).get(`/attachments/${tire.workRequest.photos[0].id}`).expect(200);
  });

  it('la foto de un defecto ya reportado queda en la inspección y se puede ver', async () => {
    const frenos = item('Frenos');
    const r = await submit(drv, { vehicleId, odometer: 50_500, signatureName: 'Conductor Insp', answers: answers({ [frenos.id]: { answer: 'defect', comment: 'Igual' } }) }, { [frenos.id]: PNG }).expect(201);
    expect(r.body.linkedRequests).toHaveLength(1);
    const d = await as(mgr).get(`/inspections/${r.body.id}`).expect(200);
    const res = d.body.results.find((x: { item: { text: string } }) => x.item.text.startsWith('Frenos'));
    expect(res.photos).toHaveLength(1);
    await as(mgr).get(`/attachments/${res.photos[0].id}`).expect(200);
  });

  it('cumplimiento diario', async () => {
    const d = await as(mgr).get('/inspections/daily?site=BOG').expect(200);
    const row = d.body.vehicles.find((v: { id: string }) => v.id === vehicleId);
    expect(row.inspections.length).toBeGreaterThanOrEqual(3);
    expect(d.body.expected).toBeGreaterThan(0);
  });
});

describe('documentos (doc 02 P9)', () => {
  it('SOAT vencido bloquea el vehículo; al renovarlo vuelve a operar', async () => {
    const yesterday = new Date(Date.now() - DAY).toISOString().slice(0, 10);
    let r = await as(mgr).put(`/vehicles/${otherId}/documents/SOAT`).send({ expiresAt: yesterday }).expect(200);
    expect(r.body.vehicleStatusChange).toBe('out_of_service_administrative');
    expect(await status(otherId)).toBe('out_of_service_administrative');
    const ov = await as(mgr).get('/documents/overview').expect(200);
    expect(ov.body.documents.find((d: { vehicleId: string; type: string }) => d.vehicleId === otherId && d.type === 'SOAT').level).toBe('expired');
    expect(ov.body.documents.find((d: { vehicleId: string; type: string }) => d.vehicleId === otherId && d.type === 'RTM').level).toBe('missing');
    r = await as(mgr).put(`/vehicles/${otherId}/documents/SOAT`).send({ expiresAt: new Date(Date.now() + 200 * DAY).toISOString().slice(0, 10) }).expect(200);
    expect(r.body.vehicleStatusChange).toBe('operational');
    expect(await status(otherId)).toBe('operational');
  });

  it('un documento no obligatorio vencido no bloquea', async () => {
    const r = await as(mgr).put(`/vehicles/${otherId}/documents/EXT`).send({ expiresAt: new Date(Date.now() - 5 * DAY).toISOString().slice(0, 10) }).expect(200);
    expect(r.body.vehicleStatusChange).toBeNull();
    expect(await status(otherId)).toBe('operational');
  });
});
