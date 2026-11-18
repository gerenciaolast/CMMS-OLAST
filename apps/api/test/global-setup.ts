import { execSync } from 'node:child_process';

/**
 * Prepara la base de pruebas sin borrarla: aplica migraciones pendientes y el seed (idempotente).
 * Las pruebas usan datos únicos por ejecución. Requiere TEST_DATABASE_URL (o usa cmms_test local).
 */
export default function globalSetup() {
  const url = process.env.TEST_DATABASE_URL ?? 'postgresql://cmms:cmms@localhost:5432/cmms_test?schema=public';
  process.env.DATABASE_URL = url;
  const env = { ...process.env, DATABASE_URL: url, SEED_ADMIN_PASSWORD: 'Admin.Test.2026', SEED_ADMIN_EMAIL: 'admin@olast.local' };
  execSync('pnpm exec prisma migrate deploy', { env, stdio: 'ignore' });
  execSync('pnpm exec ts-node --transpile-only prisma/seed/seed.ts', { env, stdio: 'ignore' });
}
