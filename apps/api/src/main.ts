import 'reflect-metadata';
import { createApp } from './bootstrap';
import { loadConfig } from './config';

async function main() {
  try {
    process.loadEnvFile();
  } catch {
    /* sin .env: se usan las variables del entorno */
  }
  const cfg = loadConfig();
  const app = await createApp(cfg);
  await app.listen(cfg.PORT);
}

void main();
