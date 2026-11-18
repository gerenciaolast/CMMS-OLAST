import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp } from '../src/bootstrap';
import { loadConfig } from '../src/config';

import { hash } from '@node-rs/argon2';
import { PrismaClient } from '@prisma/client';

export const TEST_DB = process.env.TEST_DATABASE_URL ?? 'postgresql://cmms:cmms@localhost:5432/cmms_test?schema=public';
export const RUN = Date.now().toString(36);
export const ADMIN = { email: `admin-${RUN}@olast.local`, password: 'Admin.Test.2026' };

/** Crea un administrador propio de esta ejecución (con cambio de contraseña pendiente). */
export async function createRunAdmin(prisma: PrismaClient) {
  const org = await prisma.organization.findFirstOrThrow({ where: { name: 'OLAST' } });
  const role = await prisma.role.findUniqueOrThrow({ where: { organizationId_code: { organizationId: org.id, code: 'admin' } } });
  await prisma.user.create({
    data: { organizationId: org.id, roleId: role.id, email: ADMIN.email, fullName: 'Admin pruebas',
      passwordHash: await hash(ADMIN.password), mustChangePassword: true },
  });
}

export async function bootApp(): Promise<INestApplication> {
  const cfg = loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: TEST_DB,
    JWT_SECRET: 'test-secret-0123456789-0123456789-abc',
    LOGIN_MAX_ATTEMPTS: '3',
  });
  const app = await createApp(cfg);
  await app.init();
  return app;
}

export async function login(app: INestApplication, email = ADMIN.email, password = ADMIN.password) {
  const r = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email, password }).expect(200);
  return r.body as { accessToken: string; refreshToken: string; mustChangePassword: boolean };
}
