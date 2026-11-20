/**
 * Importa el historial de mantenimiento en Excel como OT cerradas (históricas).
 * Uso: pnpm --filter @cmms/api history:import <HOJA_DE_VIDA_DE_MANTTO.xlsx> [--dry-run]
 * Identifica cada intervención por su contenido: se puede volver a importar el archivo actualizado sin duplicar.
 */
import { importMaintenanceHistory } from '../src/modules/maintenance/history-import';
import { PrismaService } from '../src/common/prisma.service';
import { PmService } from '../src/modules/pm/pm.service';

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error('Indique la ruta del historial .xlsx');
  try { process.loadEnvFile(); } catch { /* sin .env */ }
  const dryRun = process.argv.includes('--dry-run');
  const prisma = new PrismaService();
  try {
    const r = await importMaintenanceHistory(prisma, file, { dryRun });
    console.log(`${dryRun ? '[SIMULACIÓN] ' : ''}Nuevas: ${r.created} · corregidas: ${r.updated} · sin cambios: ${r.skippedExisting} · no están en el archivo: ${r.notInFile.length}`);
    r.updatedRows.forEach((u) => console.log(`  corregida ${u.plate} ${u.number}: ${u.changes.join(', ')}`));
    r.notInFile.forEach((u) => console.log(`  ya no está en el archivo: ${u.plate} ${u.number} ${u.date} ${u.description.slice(0, 60)}`));
    r.meterUpdates.forEach((m) => console.log(`  kilometraje ${m.plate}: ${m.km.toLocaleString('es-CO')} (${m.date})`));
    if (r.warnings.length) console.log(`Advertencias (${r.warnings.length}):\n  - ${r.warnings.join('\n  - ')}`);
    if (!dryRun) {
      const pm = await new PmService(prisma).refreshFromHistory((await prisma.organization.findFirstOrThrow({ where: { name: 'OLAST' } })).id);
      pm.cancelled.forEach((c) => console.log(`  OT preventiva cancelada ${c.plate} ${c.number}: ${c.reason}`));
      console.log(`Líneas base de preventivo actualizadas: ${pm.baselines.length}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
