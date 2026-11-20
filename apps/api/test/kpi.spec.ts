import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import ExcelJS from 'exceljs';
import { PrismaClient } from '@prisma/client';
import { ADMIN, RUN, TEST_DB, bootApp, createRunAdmin, login } from './helpers';

/**
 * Tablero de indicadores (doc 05) con un tipo de vehículo exclusivo de esta ejecución, para que los datos
 * de otras pruebas no alteren los números. Valores esperados calculados a mano.
 */
let app: INestApplication;
let token: string;
let vehicleId: string;
const prisma = new PrismaClient({ datasourceUrl: TEST_DB });
const TYPE = `K${RUN.slice(-5)}`.toUpperCase();
const Q = `from=2026-01-01&to=2026-03-31&type=${TYPE}`;
const get = (u: string) => request(app.getHttpServer()).get(`/api/v1${u}`).auth(token, { type: 'bearer' });
const at = (s: string) => new Date(`${s}T15:00:00Z`);

beforeAll(async () => {
  const email = `gerencia-kpi-${RUN}@olast.local`;
  await createRunAdmin(prisma, 'management', email);
  const admin = await prisma.user.findFirstOrThrow({ where: { email } });
  app = await bootApp();
  token = (await login(app, email, ADMIN.password)).accessToken;
  const site = await prisma.site.findFirstOrThrow({ where: { organizationId: admin.organizationId, code: 'BOG' } });
  const type = await prisma.vehicleType.create({ data: { code: TYPE, name: `Prueba KPI ${RUN}`, maxDailyUsage: 800 } });
  const model = await prisma.vehicleModel.create({ data: { make: 'KPI', model: `M-${RUN}`, vehicleTypeId: type.id } });
  const plan = await prisma.maintenancePlan.findFirstOrThrow({ where: { code: 'CAM-6K' } });
  const v = await prisma.vehicle.create({
    data: { organizationId: admin.organizationId, siteId: site.id, vehicleModelId: model.id, plate: `K${RUN.slice(-5)}`.toUpperCase(), maintenancePlanId: plan.id, year: 2022 },
  });
  vehicleId = v.id;
  let i = 0;
  const wo = (type: string, day: string, km: number, cost: number, component?: string) =>
    prisma.workOrder.create({
      data: {
        organizationId: admin.organizationId, number: `KPI-${RUN}-${++i}`, vehicleId: v.id, siteId: site.id, type, status: 'closed', origin: 'import',
        description: `${type} prueba`, isHistorical: true, odometerIn: km, actualStart: at(day), actualEnd: at(day), closedAt: at(day), totalCost: cost,
        ...(component ? { failures: { create: [{ componentCode: component, action: 'REE', cause: type === 'SIN' ? 'ACC' : null }] } } : {}),
      },
    });
  await wo('PM', '2026-01-10', 10_000, 500_000);
  await wo('PM', '2026-02-10', 16_000, 500_000); // 6 000 km: a tiempo
  await wo('CP', '2026-02-15', 17_000, 1_000_000, 'FRN.FRI.PAS');
  await wo('CP', '2026-03-01', 18_500, 2_000_000, 'FRN.FRI.PAS'); // mismo componente en 14 días: retrabajo
  await wo('SIN', '2026-03-05', 19_000, 5_000_000, 'CAR.CAB.PUE'); // siniestro: fuera de costo/km y MTBF
  await wo('PM', '2026-03-20', 23_000, 500_000); // 7 000 km > 6 600: tarde
});
afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe('indicadores (doc 05)', () => {
  it('tablero: valores calculados con el historial', async () => {
    const r = await get(`/kpi/dashboard?${Q}`).expect(200);
    const k = Object.fromEntries(r.body.kpis.map((x: { code: string }) => [x.code, x]));
    expect(r.body.kpis).toHaveLength(14);
    expect(k.pm_compliance.value).toBeCloseTo(0.5);
    expect(k.pm_compliance.light).toBe('bad');
    expect(k.mtbf.value).toBe(6_500); // 13 000 km / 2 correctivas
    expect(k.cost_per_km.value).toBeCloseTo(4_500_000 / 13_000);
    expect(k.rework.value).toBeCloseTo(0.5);
    expect(k.mttr.value).toBeNull(); // historial: sin tiempos de reparación
    expect(k.data_quality.value).toBeNull();
    expect(k.documents.value).toBe(0);
    expect(k.pm_compliance.trend.map((t: { month: string }) => t.month)).toEqual(['2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03']);
    expect(k.pm_compliance.trend.slice(-2).map((t: { value: number }) => t.value)).toEqual([1, 0]);
    expect(r.body.summary).toMatchObject({ orders: 6, totalCost: 9_500_000, preventiveCost: 1_500_000, km: 13_000 });
    expect(r.body.costByMonth.find((m: { month: string }) => m.month === '2026-03')).toMatchObject({ CP: 2_000_000, SIN: 5_000_000, PM: 500_000 });
  });

  it('Pareto por sistema y costo, con las OT para profundizar', async () => {
    const r = await get(`/kpi/pareto?${Q}&by=system&metric=cost`).expect(200);
    expect(r.body).toHaveLength(1);
    expect(r.body[0]).toMatchObject({ key: 'FRN', name: 'Frenos', value: 3_000_000, cumulative: 1, vital: true });
    expect(r.body[0].orders).toHaveLength(2);
    const c = await get(`/kpi/pareto?${Q}&by=component`).expect(200);
    expect(c.body[0]).toMatchObject({ key: 'FRN.FRI.PAS', value: 2 });
  });

  it('malos actores', async () => {
    const r = await get(`/kpi/bad-actors?${Q}&metric=costPerKm`).expect(200);
    expect(r.body).toHaveLength(1);
    expect(r.body[0]).toMatchObject({ id: vehicleId, failures: 2, cost: 4_500_000, km: 13_000 });
  });

  it('exportación a Excel', async () => {
    const r = await get(`/kpi/export?${Q}`).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    }).expect(200);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(r.body);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Indicadores', 'Costo por mes', 'Pareto sistemas (costo)', 'Pareto componentes (fallas)', 'Malos actores', 'OT del periodo']);
    expect(wb.getWorksheet('OT del periodo')!.rowCount).toBe(7);
  });

  it('el técnico no ve indicadores', async () => {
    const email = `tec-kpi-${RUN}@olast.local`;
    await createRunAdmin(prisma, 'technician', email);
    const t = (await login(app, email, ADMIN.password)).accessToken;
    await request(app.getHttpServer()).get('/api/v1/kpi/dashboard').auth(t, { type: 'bearer' }).expect(403);
  });
});
