/**
 * Importa el cuadro de disponibilidad de flota (una hoja por mes, «FDS» por día) como historial de estados.
 * Uso: pnpm --filter @cmms/api availability:import <Calculo_Disponibilidad_Flota.xlsx> [--dry-run]
 * Repetible: reemplaza lo cargado antes desde el cuadro; nunca toca los estados registrados en el CMMS.
 */
import { importAvailability } from '../src/modules/vehicles/availability-import';
import { PrismaService } from '../src/common/prisma.service';

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error('Indique la ruta del cuadro .xlsx');
  try { process.loadEnvFile(); } catch { /* sin .env */ }
  const dryRun = process.argv.includes('--dry-run');
  const prisma = new PrismaService();
  try {
    const r = await importAvailability(prisma, file, { dryRun });
    const pct = (v: number | null) => (v == null ? '—' : `${(v * 100).toFixed(1)} %`);
    console.log(`${dryRun ? '[SIMULACIÓN] ' : ''}Vehículos: ${r.vehicles} · paradas correctivas: ${r.stops.corrective} · preventivas: ${r.stops.preventive} · días fuera de servicio: ${r.stops.days}`);
    console.log(`Promedio por parada: correctiva ${r.averageDays.corrective?.toFixed(1) ?? '—'} d · preventiva ${r.averageDays.preventive?.toFixed(1) ?? '—'} d · ligadas a OT: ${r.linkedOrders}`);
    r.months.forEach((m) => console.log(`  ${m.month}: ${m.correctiveDays} d correctivo + ${m.preventiveDays} d preventivo en ${m.vehicles} vehículos · disponibilidad ${pct(m.availability)} sin preventivos (como el cuadro) · ${pct(m.availabilityAll)} con preventivos`));
    r.byVehicle.slice(0, 5).forEach((v) => console.log(`  ${v.plate}: ${v.stops} paradas, ${v.days} días${v.longest ? ` (la más larga: ${v.longest.days} d desde ${v.longest.start})` : ''}`));
    console.log(`Intervalos de estado: ${r.intervalsCreated} nuevos · ${r.intervalsReplaced} reemplazados`);
    if (r.warnings.length) console.log(`Advertencias:\n  - ${r.warnings.join('\n  - ')}`);
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
