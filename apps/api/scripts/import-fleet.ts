/**
 * Importa la plantilla de inventario de flota.
 * Uso: pnpm --filter @cmms/api fleet:import <ruta/Plantilla_flota_OLAST.xlsx>
 */
import { PrismaClient } from '@prisma/client';
import { importFleetWorkbook } from '../src/modules/vehicles/fleet-import';

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error('Indique la ruta de la plantilla .xlsx');
  try {
    process.loadEnvFile();
  } catch {
    /* sin .env */
  }
  const prisma = new PrismaClient();
  try {
    const r = await importFleetWorkbook(prisma, file);
    console.log(`Creados: ${r.created.length} ${r.created.join(' ')}`);
    console.log(`Actualizados: ${r.updated.length} ${r.updated.join(' ')}`);
    console.log(`Omitidos (Incluir=NO): ${r.skipped.join(' ') || '—'}`);
    console.log(`Lecturas: ${r.readings} · Documentos: ${r.documents} · Criticidades: ${r.criticality}`);
    if (r.warnings.length) console.log(`Advertencias:\n  - ${r.warnings.join('\n  - ')}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
