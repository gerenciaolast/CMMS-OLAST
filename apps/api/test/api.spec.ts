import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { ADMIN, RUN, TEST_DB, bootApp, createRunAdmin, login } from './helpers';

let app: INestApplication;
let http: ReturnType<INestApplication['getHttpServer']>;
const prisma = new PrismaClient({ datasourceUrl: TEST_DB });
const TECH = `tecnico-${RUN}@olast.local`;

beforeAll(async () => {
  await createRunAdmin(prisma);
  app = await bootApp();
  http = app.getHttpServer();
});
afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe('salud y documentación', () => {
  it('GET /health sin sesión', async () => {
    const r = await request(http).get('/api/v1/health').expect(200);
    expect(r.body).toMatchObject({ status: 'ok', db: 'ok' });
  });
});

describe('autenticación', () => {
  it('rechaza endpoints protegidos sin token con formato uniforme', async () => {
    const r = await request(http).get('/api/v1/auth/me').expect(401);
    expect(r.body).toEqual({ code: 'UNAUTHENTICATED', message: 'Sesión requerida' });
  });

  it('valida el cuerpo del login', async () => {
    const r = await request(http).post('/api/v1/auth/login').send({ email: 'no-es-correo' }).expect(400);
    expect(r.body.code).toBe('VALIDATION_ERROR');
  });

  it('login de un admin nuevo exige cambiar contraseña', async () => {
    const t = await login(app);
    expect(t.mustChangePassword).toBe(true);
    const me = await request(http).get('/api/v1/auth/me').auth(t.accessToken, { type: 'bearer' }).expect(200);
    expect(me.body.role.code).toBe('admin');
    expect(me.body.siteIds).toBeNull();
  });

  it('refresh rota el token: el anterior deja de servir', async () => {
    const t = await login(app);
    const r = await request(http).post('/api/v1/auth/refresh').send({ refreshToken: t.refreshToken }).expect(200);
    expect(r.body.accessToken).toBeTruthy();
    await request(http).post('/api/v1/auth/refresh').send({ refreshToken: t.refreshToken }).expect(401);
  });

  it('logout revoca el refresh token', async () => {
    const t = await login(app);
    await request(http).post('/api/v1/auth/logout').send({ refreshToken: t.refreshToken }).expect(204);
    await request(http).post('/api/v1/auth/refresh').send({ refreshToken: t.refreshToken }).expect(401);
  });
});

describe('usuarios, permisos y sedes', () => {
  let adminToken: string;
  let techPassword: string;

  beforeAll(async () => {
    adminToken = (await login(app)).accessToken;
  });

  it('crea un técnico en Tunja con contraseña temporal y queda auditado', async () => {
    const r = await request(http)
      .post('/api/v1/users')
      .auth(adminToken, { type: 'bearer' })
      .send({ email: TECH.toUpperCase(), fullName: 'Técnico Tunja', roleCode: 'technician', siteCodes: ['TUN'] })
      .expect(201);
    expect(r.body.email).toBe(TECH);
    expect(r.body.temporaryPassword).toHaveLength(12);
    techPassword = r.body.temporaryPassword;
    const audit = await prisma.auditLog.findFirst({ where: { entity: 'user', entityId: r.body.id } });
    expect(audit).not.toBeNull();
    expect(JSON.stringify(audit!.diff)).not.toContain(techPassword);
  });

  it('rechaza correo duplicado con 409', async () => {
    const r = await request(http)
      .post('/api/v1/users')
      .auth(adminToken, { type: 'bearer' })
      .send({ email: TECH, fullName: 'Duplicado', roleCode: 'technician' })
      .expect(409);
    expect(r.body.code).toBe('DUPLICATE');
  });

  it('rechaza sede o rol inexistente', async () => {
    const r = await request(http)
      .post('/api/v1/users')
      .auth(adminToken, { type: 'bearer' })
      .send({ email: `x-${RUN}@olast.local`, fullName: 'Sin sede', roleCode: 'technician', siteCodes: ['XXX'] })
      .expect(400);
    expect(r.body.code).toBe('UNKNOWN_SITE');
  });

  it('el técnico no puede administrar usuarios (403) y solo ve su sede', async () => {
    const t = await login(app, TECH, techPassword);
    const r = await request(http).get('/api/v1/users').auth(t.accessToken, { type: 'bearer' }).expect(403);
    expect(r.body.code).toBe('FORBIDDEN');
    const sites = await request(http).get('/api/v1/sites').auth(t.accessToken, { type: 'bearer' }).expect(200);
    expect(sites.body.map((s: { code: string }) => s.code)).toEqual(['TUN']);
  });

  it('el admin ve todas las sedes', async () => {
    const r = await request(http).get('/api/v1/sites').auth(adminToken, { type: 'bearer' }).expect(200);
    expect(r.body.length).toBeGreaterThanOrEqual(7);
  });

  it('desactivar un usuario corta su acceso', async () => {
    const t = await login(app, TECH, techPassword);
    const u = await prisma.user.findFirstOrThrow({ where: { email: TECH } });
    await request(http).patch(`/api/v1/users/${u.id}`).auth(adminToken, { type: 'bearer' }).send({ active: false }).expect(200);
    await request(http).get('/api/v1/auth/me').auth(t.accessToken, { type: 'bearer' }).expect(401);
  });
});

describe('cambio de contraseña y bloqueo', () => {
  it('cambia la contraseña y apaga mustChangePassword', async () => {
    const t = await login(app);
    await request(http)
      .post('/api/v1/auth/change-password')
      .auth(t.accessToken, { type: 'bearer' })
      .send({ currentPassword: ADMIN.password, newPassword: 'corta' })
      .expect(400);
    await request(http)
      .post('/api/v1/auth/change-password')
      .auth(t.accessToken, { type: 'bearer' })
      .send({ currentPassword: ADMIN.password, newPassword: 'NuevaClave2026' })
      .expect(204);
    const again = await login(app, ADMIN.email, 'NuevaClave2026');
    expect(again.mustChangePassword).toBe(false);
    ADMIN.password = 'NuevaClave2026';
  });

  it('bloquea la cuenta tras 3 intentos fallidos (configurado en pruebas)', async () => {
    for (let i = 0; i < 3; i++)
      await request(http).post('/api/v1/auth/login').send({ email: ADMIN.email, password: 'mala' }).expect(401);
    const r = await request(http).post('/api/v1/auth/login').send(ADMIN).expect(423);
    expect(r.body.code).toBe('ACCOUNT_LOCKED');
    await prisma.user.updateMany({ where: { email: ADMIN.email }, data: { lockedUntil: null } });
  });
});

describe('catálogos semilla (doc 03 y 09)', () => {
  let token: string;
  beforeAll(async () => {
    token = (await login(app)).accessToken;
  });

  it('22 sistemas con referencia VMRS en frenos', async () => {
    const r = await request(http).get('/api/v1/catalog/components?level=1').auth(token, { type: 'bearer' }).expect(200);
    expect(r.body).toHaveLength(22);
    expect(r.body.find((s: { code: string }) => s.code === 'FRN').vmrsCode).toBe('013');
  });

  it('conjuntos de frenos', async () => {
    const r = await request(http).get('/api/v1/catalog/components?parent=FRN').auth(token, { type: 'bearer' }).expect(200);
    expect(r.body.map((c: { code: string }) => c.code)).toContain('FRN.FRI');
  });

  it('codificación de fallas y tipos de OT', async () => {
    const f = await request(http).get('/api/v1/catalog/failure-coding').auth(token, { type: 'bearer' }).expect(200);
    expect(f.body.modes).toHaveLength(14);
    expect(f.body.causes).toHaveLength(10);
    const w = await request(http).get('/api/v1/catalog/work-order').auth(token, { type: 'bearer' }).expect(200);
    expect(w.body.types.find((t: { code: string }) => t.code === 'CE').requiresFailureCoding).toBe(true);
    expect(w.body.priorities[0]).toMatchObject({ code: 'P1', targetResolutionHours: 24 });
  });

  it('checklist pre-operacional con ítems críticos', async () => {
    const r = await request(http).get('/api/v1/catalog/checklists').auth(token, { type: 'bearer' }).expect(200);
    expect(r.body.length).toBeGreaterThan(0);
    expect(r.body[0].items.filter((i: { isCritical: boolean }) => i.isCritical).length).toBe(7);
  });

  it('documentos de Colombia: SOAT bloqueante', async () => {
    const r = await request(http).get('/api/v1/catalog/document-types').auth(token, { type: 'bearer' }).expect(200);
    expect(r.body.find((d: { code: string }) => d.code === 'SOAT').isBlocking).toBe(true);
  });
});
