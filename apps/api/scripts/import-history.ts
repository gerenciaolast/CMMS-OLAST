/**
 * Importa el historial de mantenimiento en Excel como OT cerradas (históricas).
 * Uso: pnpm --filter @cmms/api history:import <HOJA_DE_VIDA_DE_MANTTO.xlsx>
 */
import { PrismaClient } from '@prisma/client';
import { importMaintenanceHistory } from '../src/modules/maintenance/history-import';

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error('Indique la ruta del historial .xlsx');
  try { process.loadEnvFile(); } catch { /* sin .env */ }
  const prisma = new PrismaClient();
  try {
    const r = await importMaintenanceHistory(prisma, file);
    console.log(`OT históricas creadas: ${r.created} · ya existentes: ${r.skippedExisting} · fechas aproximadas: ${r.approximateDates}`);
    console.log(Object.entries(r.byVehicle).map(([p, n]) => `${p}:${n}`).join(' '));
    if (r.warnings.length) console.log(`Advertencias (${r.warnings.length}):\n  - ${r.warnings.join('\n  - ')}`);
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
