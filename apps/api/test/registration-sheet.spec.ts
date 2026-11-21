import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { ADMIN, RUN, TEST_DB, bootApp, createRunAdmin, login } from './helpers';

/** Licencia de tránsito en la ficha y hoja de vida en PDF. */
let app: INestApplication;
let mgr: string;
let tech: string;
let vehicleId: string;
const PLATE = `R${RUN.slice(-5)}`.toUpperCase();
const prisma = new PrismaClient({ datasourceUrl: TEST_DB });
const http = () => request(app.getHttpServer());
const pdf = (r: request.Test) => r.buffer(true).parse((res, cb) => { const c: Buffer[] = []; res.on('data', (x: Buffer) => c.push(x)); res.on('end', () => cb(null, Buffer.concat(c))); });

const CARD = {
  licenseNumber: '10000000001', cardNumber: 'LT00000000001', make: 'CHEVROLET', line: 'NKR', year: 2021, displacementCc: 2999, color: 'BLANCO NIEBLA',
  serviceType: 'PUBLICO', vehicleClass: 'CAMION', bodyType: 'FURGON', fuel: 'DIESEL', capacity: '2.280', engineNumber: '4K0001', vin: '9GDNMR85XTEST0001',
  serialNumber: '9GDNMR85XTEST0001', chassisNumber: '9GDNMR85XTEST0001', ownerName: 'BANCO DE BOGOTA', ownerId: 'NIT 860002964', powerHp: 122,
  importDeclaration: '000000000000001', importDate: '2020-09-04', doors: 2, registeredAt: '2020-10-15', issuedAt: '2026-07-31', authority: 'ITBOY - DIST TTO No 1/COMBITA',
};

beforeAll(async () => {
  const m = `jefe-reg-${RUN}@olast.local`, t = `tec-reg-${RUN}@olast.local`;
  await createRunAdmin(prisma, 'maintenance_manager', m);
  await createRunAdmin(prisma, 'technician', t);
  app = await bootApp();
  mgr = (await login(app, m, ADMIN.password)).accessToken;
  const user = await prisma.user.findFirstOrThrow({ where: { email: m } });
  const site = await prisma.site.findFirstOrThrow({ where: { organizationId: user.organizationId, code: 'BOG' } });
  const techUser = await prisma.user.findFirstOrThrow({ where: { email: t } });
  await prisma.userSite.create({ data: { userId: techUser.id, siteId: site.id } });
  tech = (await login(app, t, ADMIN.password)).accessToken;
  const model = await prisma.vehicleModel.findFirstOrThrow();
  vehicleId = (await prisma.vehicle.create({ data: { organizationId: user.organizationId, siteId: site.id, vehicleModelId: model.id, plate: PLATE, year: 2020, attributes: { tires: { frontQty: 2, rearQty: 4, frontSize: '215/75R17.5' } } } })).id;
  await prisma.workOrder.create({
    data: { organizationId: user.organizationId, number: `REG-${RUN}`, vehicleId, siteId: site.id, type: 'CP', status: 'closed', origin: 'import', isHistorical: true,
      description: 'Cambio de pastillas de freno delanteras', actualEnd: new Date(), closedAt: new Date(), odometerIn: 120_000, totalCost: 850_000 },
  });
});
afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe('licencia de tránsito', () => {
  it('actualiza la ficha y guarda el resto de la tarjeta; banco ⇒ leasing; conserva las llantas', async () => {
    const r = await http().put(`/api/v1/vehicles/${vehicleId}/registration`).auth(mgr, { type: 'bearer' }).send(CARD).expect(200);
    expect(r.body.changes.map((c: { field: string }) => c.field).sort()).toEqual(['color', 'engineNumber', 'loadCapacityKg', 'ownership', 'serviceType', 'titleHolder', 'vin', 'year']);
    const v = await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicleId } });
    expect(v).toMatchObject({ vin: CARD.vin, year: 2021, ownership: 'leasing', titleHolder: 'BANCO DE BOGOTA', loadCapacityKg: 2280 });
    const attrs = v.attributes as { tires: object; registration: { licenseNumber: string; authority: string } };
    expect(attrs.registration).toMatchObject({ licenseNumber: CARD.licenseNumber, authority: CARD.authority });
    expect(attrs.tires).toMatchObject({ frontQty: 2 });
  });

  it('un cambio de motor queda anotado para verificar', async () => {
    const r = await http().put(`/api/v1/vehicles/${vehicleId}/registration`).auth(mgr, { type: 'bearer' }).send({ ...CARD, engineNumber: '4K9999', ownerName: 'DISTRIBUIDORA COLOMBIANA DE MEDICA' }).expect(200);
    expect(r.body.registration.reviewNotes).toEqual(['Cambio de número de motor: antes 4K0001']);
    expect((await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicleId } })).ownership).toBe('own');
  });

  it('valida fechas y solo la edita quien puede editar vehículos', async () => {
    const r = await http().put(`/api/v1/vehicles/${vehicleId}/registration`).auth(mgr, { type: 'bearer' }).send({ ...CARD, issuedAt: '31/07/2026' }).expect(400);
    expect(r.body.code).toBe('VALIDATION_ERROR');
    await http().put(`/api/v1/vehicles/${vehicleId}/registration`).auth(tech, { type: 'bearer' }).send(CARD).expect(403);
  });
});

describe('hoja de vida en PDF', () => {
  it('descarga la ficha de un vehículo', async () => {
    const r = await pdf(http().get(`/api/v1/vehicles/${vehicleId}/sheet`).auth(mgr, { type: 'bearer' })).expect(200);
    expect(r.headers['content-type']).toBe('application/pdf');
    expect(r.headers['content-disposition']).toContain(`Hoja_de_vida_${PLATE}.pdf`);
    expect((r.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('el técnico también la descarga (sin costos) y la flota sale en un solo archivo', async () => {
    const t = await pdf(http().get(`/api/v1/vehicles/${vehicleId}/sheet`).auth(tech, { type: 'bearer' })).expect(200);
    const m = await pdf(http().get(`/api/v1/vehicles/${vehicleId}/sheet`).auth(mgr, { type: 'bearer' })).expect(200);
    expect((t.body as Buffer).length).toBeLessThan((m.body as Buffer).length); // sin la sección de costos
    const all = await pdf(http().get('/api/v1/vehicle-sheets?site=BOG').auth(mgr, { type: 'bearer' })).expect(200);
    expect((all.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    expect((all.body as Buffer).length).toBeGreaterThan((m.body as Buffer).length);
  });
});
