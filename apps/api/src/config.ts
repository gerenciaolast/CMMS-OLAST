import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3001),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET debe tener al menos 32 caracteres'),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().default(900),
  REFRESH_TTL_DAYS: z.coerce.number().default(14),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  LOGIN_MAX_ATTEMPTS: z.coerce.number().default(5),
  LOGIN_LOCK_MINUTES: z.coerce.number().default(15),
});

export type AppConfig = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const r = schema.safeParse(env);
  if (!r.success) {
    const msg = r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Configuración inválida: ${msg}`);
  }
  return r.data;
}

export const APP_CONFIG = Symbol('APP_CONFIG');
