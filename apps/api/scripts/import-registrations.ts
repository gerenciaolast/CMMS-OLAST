/**
 * Carga datos de licencias de tránsito (tarjetas de propiedad) desde un JSON: [{ "plate": "ABC123", ...Registration }].
 * Uso: pnpm --filter @cmms/api registrations:import licencias.json [--dry-run]
 * El archivo contiene datos de propietarios: guárdelo fuera del repositorio.
 */
import fs from 'node:fs';
import { PrismaService } from '../src/common/prisma.service';
import { Registration, applyRegistration, vehicleByPlate } from '../src/modules/vehicles/registration';

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error('Indique la ruta del JSON de licencias');
  try { process.loadEnvFile(); } catch { /* sin .env */ }
  const dryRun = process.argv.includes('--dry-run');
  const rows = JSON.parse(fs.readFileSync(file, 'utf8')) as ({ plate: string } & Record<string, unknown>)[];
  const prisma = new PrismaService();
  try {
    const org = await prisma.organization.findFirstOrThrow();
    let ok = 0;
    for (const { plate, ...rest } of rows) {
      const v = await vehicleByPlate(prisma, org.id, plate);
      if (!v) { console.log(`✗ ${plate}: no está en la flota`); continue; }
      const parsed = Registration.safeParse(rest);
      if (!parsed.success) { console.log(`✗ ${plate}: ${parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`); continue; }
      const r = await applyRegistration(prisma, v.id, parsed.data, { dryRun });
      ok++;
      console.log(`✓ ${r.plate}${r.changes.length ? ': ' + r.changes.map((c) => `${c.field} ${c.from ?? '∅'} → ${c.to}`).join(' · ') : ': solo datos de la licencia'}`);
      for (const n of r.registration.reviewNotes ?? []) console.log(`    verificar: ${n}`);
    }
    console.log(`${dryRun ? '[SIMULACIÓN] ' : ''}${ok} de ${rows.length} licencias ${dryRun ? 'revisadas' : 'cargadas'}`);
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
