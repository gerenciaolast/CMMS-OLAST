import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { ADMIN, RUN, TEST_DB, bootApp, createRunAdmin, login } from './helpers';

let app: INestApplication;
let http: ReturnType<INestApplication['getHttpServer']>;
let manager: string;
let driver: string;
let tech: string;
let vehicleId: string;
let technicianId: string;
let supplierId: string;
const prisma = new PrismaClient({ datasourceUrl: TEST_DB });
const as = (t: string) => ({
  get: (u: string) => request(http).get(u).auth(t, { type: 'bearer' }),
  post: (u: string) => request(http).post(u).auth(t, { type: 'bearer' }),
  patch: (u: string) => request(http).patch(u).auth(t, { type: 'bearer' }),
});
// PNG 1x1 válido
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex');
const vstatus = async () => (await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicleId } })).status;

beforeAll(async () => {
  const m = `jefe-mt-${RUN}@olast.local`, d = `cond-mt-${RUN}@olast.local`, t = `tec-mt-${RUN}@olast.local`;
  await createRunAdmin(prisma, 'maintenance_manager', m);
  await createRunAdmin(prisma, 'driver', d);
  await createRunAdmin(prisma, 'technician', t);
  const org = await prisma.organization.findFirstOrThrow({ where: { name: 'OLAST' } });
  const bog = await prisma.site.findUniqueOrThrow({ where: { organizationId_code: { organizationId: org.id, code: 'BOG' } } });
  for (const email of [d, t]) {
    const u = await prisma.user.findFirstOrThrow({ where: { email } });
    await prisma.userSite.create({ data: { userId: u.id, siteId: bog.id } });
  }
  app = await bootApp();
  http = app.getHttpServer();
  [manager, driver, tech] = await Promise.all([m, d, t].map(async (e) => (await login(app, e, ADMIN.password)).accessToken));

  const type = await prisma.vehicleType.findUniqueOrThrow({ where: { code: 'CAR' } });
  const model = await prisma.vehicleModel.upsert({ where: { make_model: { make: 'CHEVROLET', model: 'NHR MT' } }, create: { make: 'CHEVROLET', model: 'NHR MT', vehicleTypeId: type.id }, update: {} });
  const plate = `M${RUN.slice(-5)}`.toUpperCase();
  const v = await as(manager).post('/api/v1/vehicles').send({ plate, siteCode: 'BOG', vehicleModelId: model.id, initialOdometer: 200_000 }).expect(201);
  vehicleId = v.body.id;
  await prisma.meterReading.updateMany({ where: { vehicleId }, data: { readAt: new Date(Date.now() - 20 * 86_400_000) } });
  await as(manager).post(`/api/v1/vehicles/${vehicleId}/criticality`).send({});
  await request(http).put(`/api/v1/vehicles/${vehicleId}/criticality`).auth(manager, { type: 'bearer' }).send({ operationalImpact: 2, safety: 2, repairCost: 2, usage: 2 }).expect(200);
  await as(manager).post(`/api/v1/vehicles/${vehicleId}/status`).send({ status: 'operational', reason: 'Listo' }).expect(201);
  technicianId = (await as(manager).post('/api/v1/technicians').send({ name: `Técnico ${RUN}`, hourlyCost: 30_000 }).expect(201)).body.id;
  supplierId = (await as(manager).post('/api/v1/suppliers').send({ name: `Taller ${RUN}`, city: 'Bogotá' }).expect(201)).body.id;
});
afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe('aviso → OT → ejecución → cierre (doc 02 P4, P7, P8)', () => {
  let requestId: string;
  let orderId: string;

  it('el conductor reporta una falla con foto; el vehículo queda fuera de servicio', async () => {
    const r = await as(driver).post('/api/v1/work-requests')
      .field('vehicleId', vehicleId).field('description', 'Frenos traseros no responden bien').field('systemCode', 'FRN').field('canOperate', 'no').field('odometer', '201200')
      .attach('photos', PNG, 'foto.png')
      .expect(201);
    requestId = r.body.id;
    expect(r.body.number).toMatch(/^AV-\d{4}-\d{6}$/);
    expect(r.body).toMatchObject({ status: 'new', priority: 'P2', consequence: 'stops_operation' });
    expect(r.body.photos).toHaveLength(1);
    expect(await vstatus()).toBe('out_of_service_maintenance');
    expect((await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicleId } })).currentOdometer).toBe(201_200);
    const photo = await as(manager).get(`/api/v1/attachments/${r.body.photos[0].id}`).expect(200);
    expect(photo.headers['content-type']).toBe('image/png');
  });

  it('rechaza archivos que no son fotos', async () => {
    const r = await as(driver).post('/api/v1/work-requests').field('vehicleId', vehicleId).field('description', 'Prueba archivo').attach('photos', Buffer.from('%PDF-1.4'), 'x.png').expect(415);
    expect(r.body.code).toBe('INVALID_FILE');
  });

  it('el conductor no puede aprobar avisos', async () => {
    await as(driver).post(`/api/v1/work-requests/${requestId}/review`).send({ decision: 'reject', reason: 'no corresponde' }).expect(403);
  });

  it('el jefe aprueba: se crea la OT con la prioridad de la matriz', async () => {
    const r = await as(manager).post(`/api/v1/work-requests/${requestId}/review`).send({ decision: 'approve', type: 'CE', consequence: 'stops_operation', supplierId }).expect(201);
    expect(r.body.status).toBe('approved');
    orderId = r.body.workOrder.id;
    const wo = await as(manager).get(`/api/v1/work-orders/${orderId}`).expect(200);
    expect(wo.body).toMatchObject({ type: 'CE', priority: 'P2', status: 'planned', origin: 'request', codingRequired: true });
    expect(wo.body.number).toMatch(/^OT-\d{4}-\d{6}$/);
    expect(wo.body.requests).toHaveLength(1);
    await as(manager).post(`/api/v1/work-requests/${requestId}/review`).send({ decision: 'reject', reason: 'otra vez' }).expect(409);
  });

  it('inicia, espera repuesto (vehículo en espera de repuesto) y reanuda', async () => {
    await as(tech).post(`/api/v1/work-orders/${orderId}/start`).send({}).expect(201);
    expect(await vstatus()).toBe('out_of_service_maintenance');
    await as(tech).post(`/api/v1/work-orders/${orderId}/hold`).send({}).expect(400);
    await as(tech).post(`/api/v1/work-orders/${orderId}/hold`).send({ reason: 'REPUESTO', comment: 'Bandas en pedido' }).expect(201);
    expect(await vstatus()).toBe('out_of_service_parts');
    await as(tech).post(`/api/v1/work-orders/${orderId}/resume`).send({}).expect(201);
    expect(await vstatus()).toBe('out_of_service_maintenance');
  });

  it('mano de obra, repuestos y servicio externo recalculan el costo total', async () => {
    await as(tech).post(`/api/v1/work-orders/${orderId}/lines/labor`).send({ technicianId, hours: 2 }).expect(201);
    await as(tech).post(`/api/v1/work-orders/${orderId}/lines/parts`).send({ description: 'Bandas traseras', quantity: 2, unitCost: 45_000 }).expect(201);
    const r = await as(tech).post(`/api/v1/work-orders/${orderId}/lines/external`).send({ description: 'Rectificado de campanas', invoiceNumber: 'FV-123', amount: 100_000 }).expect(201);
    expect(r.body.totals).toEqual({ laborCost: 60_000, partsCost: 90_000, externalCost: 100_000, totalCost: 250_000 });
  });

  it('no se puede terminar sin codificación completa', async () => {
    let r = await as(tech).post(`/api/v1/work-orders/${orderId}/complete`).send({}).expect(422);
    expect(r.body.code).toBe('FAILURE_CODING_REQUIRED');
    await as(tech).post(`/api/v1/work-orders/${orderId}/lines/failures`).send({ componentCode: 'FRN.FRI.XXX', failureMode: 'DES' }).expect(400);
    await as(tech).post(`/api/v1/work-orders/${orderId}/lines/failures`).send({ componentCode: 'FRN.FRI.BAN', failureMode: 'DES', cause: 'ZZZ', action: 'REE' }).expect(400);
    await as(tech).post(`/api/v1/work-orders/${orderId}/lines/failures`).send({ componentCode: 'FRN.FRI.BAN', failureMode: 'DES', cause: 'DNO', action: 'REE' }).expect(201);
    r = await as(tech).post(`/api/v1/work-orders/${orderId}/complete`).send({ completionNotes: 'Cambio de bandas' }).expect(201);
    expect(r.body.status).toBe('completed');
  });

  it('el técnico no puede cerrar; el jefe verifica y cierra y el vehículo vuelve a operar', async () => {
    await as(tech).post(`/api/v1/work-orders/${orderId}/close`).send({}).expect(403);
    await as(manager).post(`/api/v1/work-orders/${orderId}/close`).send({}).expect(201);
    expect(await vstatus()).toBe('operational');
    const r = await as(manager).post(`/api/v1/work-orders/${orderId}/lines/parts`).send({ description: 'Repuesto tardío', quantity: 1, unitCost: 1 }).expect(409);
    expect(r.body.code).toBe('LOCKED');
    const wo = await as(manager).get(`/api/v1/work-orders/${orderId}`).expect(200);
    expect(wo.body.events.map((e: { action: string }) => e.action)).toEqual(['create', 'start', 'hold', 'resume', 'complete', 'close']);
    const log = await prisma.vehicleStatusLog.findMany({ where: { vehicleId }, orderBy: { startedAt: 'asc' } });
    expect(log.map((l) => l.status)).toEqual(['reserve', 'operational', 'out_of_service_maintenance', 'out_of_service_parts', 'out_of_service_maintenance', 'operational']);
  });

  it('la misma falla a los pocos días se marca como retrabajo', async () => {
    const r = await as(manager).post('/api/v1/work-orders').send({ vehicleId, type: 'CP', priority: 'P3', description: 'Vuelve a fallar frenos traseros' }).expect(201);
    await as(tech).post(`/api/v1/work-orders/${r.body.id}/start`).send({}).expect(201);
    await as(tech).post(`/api/v1/work-orders/${r.body.id}/lines/failures`).send({ componentCode: 'FRN.FRI.BAN', failureMode: 'DES', cause: 'INS', action: 'AJU' }).expect(201);
    const c = await as(tech).post(`/api/v1/work-orders/${r.body.id}/complete`).send({}).expect(201);
    expect(c.body.isRework).toBe(true);
    expect(c.body.reworkOfId).toBe(orderId);
    await as(manager).post(`/api/v1/work-orders/${r.body.id}/close`).send({}).expect(201);
  });
});

describe('gestión de avisos y backlog', () => {
  it('agrupar un aviso en una OT abierta del mismo vehículo', async () => {
    const wo = await as(manager).post('/api/v1/work-orders').send({ vehicleId, type: 'PM', description: 'Servicio de 10.000 km', tasks: ['Cambio de aceite', 'Filtros'] }).expect(201);
    const av = await as(driver).post('/api/v1/work-requests').field('vehicleId', vehicleId).field('description', 'Ruido en suspensión delantera').expect(201);
    expect(av.body.priority).toBe('P4');
    const g = await as(manager).get(`/api/v1/work-requests/${av.body.id}`).expect(200);
    expect(g.body.openOrders.map((o: { id: string }) => o.id)).toContain(wo.body.id);
    await as(manager).post(`/api/v1/work-requests/${av.body.id}/review`).send({ decision: 'merge', workOrderId: wo.body.id }).expect(201);
    const d = await as(manager).get(`/api/v1/work-orders/${wo.body.id}`).expect(200);
    expect(d.body.tasks).toHaveLength(3);
    expect(d.body.pendingTasks).toBe(3);
  });

  it('una OT preventiva no exige codificación pero sí cerrar tareas', async () => {
    const wo = await as(manager).post('/api/v1/work-orders').send({ vehicleId, type: 'PM', description: 'Servicio de prueba', tasks: ['Cambio de aceite'] }).expect(201);
    await as(manager).post(`/api/v1/work-orders/${wo.body.id}/schedule`).send({}).expect(400);
    await as(manager).post(`/api/v1/work-orders/${wo.body.id}/schedule`).send({ plannedStart: new Date().toISOString(), estimatedHours: 2 }).expect(201);
    await as(tech).post(`/api/v1/work-orders/${wo.body.id}/start`).send({}).expect(201);
    const r = await as(tech).post(`/api/v1/work-orders/${wo.body.id}/complete`).send({}).expect(422);
    expect(r.body.code).toBe('PENDING_TASKS');
    const d = await as(tech).get(`/api/v1/work-orders/${wo.body.id}`).expect(200);
    await as(tech).patch(`/api/v1/work-orders/${wo.body.id}/tasks/${d.body.tasks[0].id}`).send({ status: 'not_done' }).expect(400);
    await as(tech).patch(`/api/v1/work-orders/${wo.body.id}/tasks/${d.body.tasks[0].id}`).send({ status: 'done' }).expect(200);
    await as(tech).post(`/api/v1/work-orders/${wo.body.id}/complete`).send({}).expect(201);
  });

  it('rechazo exige motivo; cancelación exige motivo y solo antes de iniciar', async () => {
    const av = await as(driver).post('/api/v1/work-requests').field('vehicleId', vehicleId).field('description', 'Prueba de rechazo').expect(201);
    await as(manager).post(`/api/v1/work-requests/${av.body.id}/review`).send({ decision: 'reject', reason: '' }).expect(400);
    const r = await as(manager).post(`/api/v1/work-requests/${av.body.id}/review`).send({ decision: 'reject', reason: 'Duplicado del aviso anterior' }).expect(201);
    expect(r.body.status).toBe('rejected');
    const wo = await as(manager).post('/api/v1/work-orders').send({ vehicleId, type: 'MEJ', description: 'Instalar estribo' }).expect(201);
    await as(manager).post(`/api/v1/work-orders/${wo.body.id}/cancel`).send({ reason: 'No aplica' }).expect(201);
  });

  it('numeración correlativa sin huecos', async () => {
    const a = await as(manager).post('/api/v1/work-orders').send({ vehicleId, type: 'INS', description: 'Inspección A' }).expect(201);
    const b = await as(manager).post('/api/v1/work-orders').send({ vehicleId, type: 'INS', description: 'Inspección B' }).expect(201);
    const n = (s: string) => Number(s.split('-')[2]);
    expect(n(b.body.number)).toBe(n(a.body.number) + 1);
  });

  it('backlog: listado de abiertas y resumen', async () => {
    const l = await as(manager).get(`/api/v1/work-orders?vehicleId=${vehicleId}`).expect(200);
    expect(l.body.every((o: { status: string }) => ['planned', 'scheduled', 'in_progress', 'on_hold', 'completed'].includes(o.status))).toBe(true);
    const s = await as(manager).get('/api/v1/work-orders/summary').expect(200);
    expect(s.body.byStatus.planned).toBeGreaterThan(0);
  });
});
