import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { ADMIN, RUN, TEST_DB, bootApp, createRunAdmin, login } from './helpers';

let app: INestApplication;
let http: ReturnType<INestApplication['getHttpServer']>;
let t: string;
let plan: { id: string; routines: { id: string; code: string; intervalDistance: number }[] };
const prisma = new PrismaClient({ datasourceUrl: TEST_DB });
const api = {
  get: (u: string) => request(http).get(`/api/v1${u}`).auth(t, { type: 'bearer' }),
  post: (u: string) => request(http).post(`/api/v1${u}`).auth(t, { type: 'bearer' }),
  put: (u: string) => request(http).put(`/api/v1${u}`).auth(t, { type: 'bearer' }),
  patch: (u: string) => request(http).patch(`/api/v1${u}`).auth(t, { type: 'bearer' }),
};
const DAY = 86_400_000;
let n = 0;

async function vehicleWithPlan(km: number) {
  const type = await prisma.vehicleType.findUniqueOrThrow({ where: { code: 'CAR' } });
  const model = await prisma.vehicleModel.upsert({ where: { make_model: { make: 'CHEVROLET', model: 'NQR PM' } }, create: { make: 'CHEVROLET', model: 'NQR PM', vehicleTypeId: type.id }, update: {} });
  const plate = `P${RUN.slice(-4)}${++n}`.toUpperCase();
  const v = await api.post('/vehicles').send({ plate, siteCode: 'BOG', vehicleModelId: model.id, initialOdometer: km }).expect(201);
  // Lecturas antiguas para que el uso diario y los saltos sean realistas
  await prisma.meterReading.updateMany({ where: { vehicleId: v.body.id }, data: { readAt: new Date(Date.now() - 60 * DAY) } });
  await prisma.vehicle.update({ where: { id: v.body.id }, data: { lastReadingAt: new Date(Date.now() - 60 * DAY) } });
  await api.put(`/vehicles/${v.body.id}/pm-plan`).send({ planId: plan.id }).expect(200);
  return v.body.id as string;
}
const routine = (code: string) => plan.routines.find((r) => r.code === code)!;
const openPm = (vehicleId: string) => prisma.workOrder.findMany({ where: { vehicleId, origin: 'pm', status: { notIn: ['closed', 'cancelled'] } }, include: { pmRoutine: true, tasks: true } });

beforeAll(async () => {
  const email = `jefe-pm-${RUN}@olast.local`;
  await createRunAdmin(prisma, 'maintenance_manager', email);
  app = await bootApp();
  http = app.getHttpServer();
  t = (await login(app, email, ADMIN.password)).accessToken;
  const plans = (await api.get('/pm/plans').expect(200)).body as (typeof plan & { code: string })[];
  expect(plans.map((p) => p.code).sort()).toEqual(['CAM-10K', 'CAM-6K', 'MCA-3K', 'VAN-10K', 'VAN-5K']);
  plan = plans.find((p) => p.code === 'CAM-6K')!;
});
afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe('preventivo: lo que ocurra primero, OT automática al 90 % (doc 02 P5)', () => {
  it('asignar el plan crea los vencimientos con línea base estimada', async () => {
    const id = await vehicleWithPlan(100_000);
    const r = await api.get(`/vehicles/${id}/pm`).expect(200);
    expect(r.body.plan.code).toBe('CAM-6K');
    expect(r.body.schedules.map((s: { routine: { code: string } }) => s.routine.code)).toEqual(['A', 'B', 'C', 'D']);
    expect(r.body.schedules.every((s: { baselineEstimated: boolean; status: string }) => s.baselineEstimated && s.status === 'ok')).toBe(true);
  });

  it('al llegar al 90 % se genera la OT del servicio A con sus tareas, sin duplicar', async () => {
    const id = await vehicleWithPlan(100_000);
    let r = await api.post(`/vehicles/${id}/readings`).send({ value: 105_000 }).expect(201);
    expect(r.body.pmGenerated).toEqual([]);
    r = await api.post(`/vehicles/${id}/readings`).send({ value: 105_500 }).expect(201);
    expect(r.body.pmGenerated).toHaveLength(1);
    const open = await openPm(id);
    expect(open).toHaveLength(1);
    expect(open[0]!.pmRoutine!.code).toBe('A');
    expect(open[0]!.tasks.length).toBeGreaterThan(5);
    expect(open[0]!.priority).toBe('P3');
    r = await api.post(`/vehicles/${id}/readings`).send({ value: 105_800 }).expect(201);
    expect(r.body.pmGenerated).toEqual([]);
    const f = await api.get('/pm/forecast?status=due,overdue').expect(200);
    const row = f.body.find((x: { vehicle: { id: string }; routine: { code: string } }) => x.vehicle.id === id && x.routine.code === 'A');
    expect(row).toMatchObject({ status: 'due', nextDueMeter: 106_000 });
    expect(row.openWorkOrderId).toBe(open[0]!.id);
  });

  it('si vencen A, B y C se genera solo la C con todas las tareas', async () => {
    const id = await vehicleWithPlan(100_000);
    const r = await api.post(`/vehicles/${id}/readings`).send({ value: 122_000 }).expect(201);
    expect(r.body.pmGenerated).toHaveLength(1);
    const open = await openPm(id);
    expect(open.map((o) => o.pmRoutine!.code)).toEqual(['C']);
    expect(open[0]!.priority).toBe('P2'); // A y B vencidas por encima de la tolerancia
    const descriptions = open[0]!.tasks.map((x) => x.description);
    expect(descriptions).toContain('Cambio de aceite de motor (especificación del fabricante)');
    expect(descriptions).toContain('Cambio de filtro de combustible y drenaje de trampa de agua');
    expect(descriptions.some((d) => d.includes('rodamientos de rueda'))).toBe(true);
    expect(new Set(descriptions).size).toBe(descriptions.length);
  });

  it('cerrar la OT reinicia la rutina y las que incluye', async () => {
    const id = await vehicleWithPlan(100_000);
    await api.post(`/vehicles/${id}/readings`).send({ value: 112_500 }).expect(201);
    const [wo] = await openPm(id);
    expect(wo!.pmRoutine!.code).toBe('B');
    await api.post(`/work-orders/${wo!.id}/start`).send({ odometerIn: 112_600 }).expect(201);
    for (const task of wo!.tasks) await api.patch(`/work-orders/${wo!.id}/tasks/${task.id}`).send({ status: 'done' }).expect(200);
    await api.post(`/work-orders/${wo!.id}/complete`).send({ odometerOut: 112_600 }).expect(201);
    await api.post(`/work-orders/${wo!.id}/close`).send({}).expect(201);
    const s = (await api.get(`/vehicles/${id}/pm`).expect(200)).body.schedules as { routine: { code: string }; lastDoneMeter: number; baselineEstimated: boolean; status: string; nextDueMeter: number }[];
    const by = Object.fromEntries(s.map((x) => [x.routine.code, x]));
    expect(by.A).toMatchObject({ lastDoneMeter: 112_600, baselineEstimated: false, nextDueMeter: 118_600, status: 'ok' });
    expect(by.B).toMatchObject({ lastDoneMeter: 112_600, nextDueMeter: 124_600 });
    expect(by.C!.lastDoneMeter).toBe(100_000);
    expect(await openPm(id)).toHaveLength(0);
  });

  it('el tiempo también vence la rutina aunque no haya kilómetros', async () => {
    const id = await vehicleWithPlan(100_000);
    await api.put(`/vehicles/${id}/pm/${routine('A').id}/baseline`).send({ doneAt: new Date(Date.now() - 175 * DAY).toISOString(), meter: 99_000 }).expect(200);
    const open = await openPm(id);
    expect(open.map((o) => o.pmRoutine!.code)).toEqual(['A']);
    const s = (await api.get(`/vehicles/${id}/pm`).expect(200)).body.schedules.find((x: { routine: { code: string } }) => x.routine.code === 'A');
    expect(s.drivingDimension).toBe('days');
  });

  it('registrar la última ejecución valida datos', async () => {
    const id = await vehicleWithPlan(100_000);
    await api.put(`/vehicles/${id}/pm/${routine('A').id}/baseline`).send({ doneAt: new Date(Date.now() + DAY).toISOString(), meter: 99_000 }).expect(400);
    await api.put(`/vehicles/${id}/pm/${routine('A').id}/baseline`).send({ doneAt: new Date().toISOString(), meter: 150_000 }).expect(400);
  });

  it('cambiar el intervalo de una rutina recalcula los vehículos', async () => {
    const id = await vehicleWithPlan(100_000);
    await api.post(`/vehicles/${id}/readings`).send({ value: 104_000 }).expect(201);
    const p10k = (await api.get('/pm/plans').expect(200)).body.find((p: { code: string }) => p.code === 'VAN-10K');
    const rA = p10k.routines.find((r: { code: string }) => r.code === 'A');
    await api.put(`/vehicles/${id}/pm-plan`).send({ planId: p10k.id }).expect(200);
    await api.put(`/vehicles/${id}/pm/${rA.id}/baseline`).send({ doneAt: new Date(Date.now() - 30 * DAY).toISOString(), meter: 100_000 }).expect(200);
    expect(await openPm(id)).toHaveLength(0);
    try {
      await api.patch(`/pm/routines/${rA.id}`).send({ intervalDistance: 4_000 }).expect(200);
      expect((await openPm(id)).map((o) => o.pmRoutine!.code)).toEqual(['A']);
    } finally {
      await api.patch(`/pm/routines/${rA.id}`).send({ intervalDistance: 10_000 }).expect(200); // restaurar el plan compartido
    }
  });
});
