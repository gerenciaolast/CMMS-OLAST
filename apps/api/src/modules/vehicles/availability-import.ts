import ExcelJS from 'exceljs';
import type { PrismaClient } from '@prisma/client';
import { buildDowntimeBlocks, canonicalPlate, isNonWorkingDay, normalizePlate, type DowntimeKind } from '@cmms/domain';
import { CORRECTIVE_WORK_ORDER_TYPES, type WorkOrderType } from '@cmms/shared';
import { localDayRange } from '../../common/time';

/**
 * Importa el «Cálculo de disponibilidad de flota» (una hoja por mes: SUCURSAL · PLACA · MANTENIMIENTO
 * PREVENTIVO/CORRECTIVO · un día por columna con «FDS» = fuera de servicio).
 *
 * Reconstruye el historial de estados de cada vehículo en los meses del cuadro (operativo / fuera de servicio
 * por mantenimiento), uniendo las paradas partidas por domingos y festivos, y liga cada parada a su OT del historial.
 * Es repetible: reemplaza lo que haya cargado antes desde el cuadro y nunca toca estados registrados en el CMMS.
 */

export const SHEET_SOURCE = 'availability_sheet';
const MATCH_DAYS = 3;

export interface AvailabilityReport {
  dryRun: boolean;
  /** availability: fórmula del cuadro (solo resta paradas correctivas); availabilityAll: resta también las preventivas. */
  months: { sheet: string; month: string; workdays: number | null; realWorkdays: number; vehicles: number; correctiveDays: number; preventiveDays: number; availability: number | null; availabilityAll: number | null }[];
  vehicles: number;
  stops: { corrective: number; preventive: number; days: number };
  averageDays: { corrective: number | null; preventive: number | null };
  linkedOrders: number;
  intervalsCreated: number;
  intervalsReplaced: number;
  byVehicle: { plate: string; stops: number; days: number; longest: { start: string; end: string; days: number; kind: DowntimeKind } | null }[];
  unknownPlates: string[];
  skippedSheets: string[];
  warnings: string[];
}

function text(v: ExcelJS.CellValue): string {
  if (v == null) return '';
  if (typeof v === 'object' && 'result' in v) return text(v.result as ExcelJS.CellValue);
  if (typeof v === 'object' && 'richText' in v) return v.richText.map((t) => t.text).join('');
  if (v instanceof Date) return v.toISOString();
  return String(v).trim();
}
const num = (v: ExcelJS.CellValue): number | null => {
  const x = typeof v === 'object' && v && 'result' in v ? v.result : v;
  return typeof x === 'number' ? x : null;
};
const dayOf = (v: ExcelJS.CellValue): string | null => {
  const x = typeof v === 'object' && v && 'result' in v ? v.result : v;
  return x instanceof Date ? x.toISOString().slice(0, 10) : null;
};
const addDays = (s: string, n: number) => new Date(new Date(`${s}T12:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);

interface Parsed { site: string; plate: string; marked: Map<string, DowntimeKind>; coverage: Set<string> }

export function parseAvailabilityWorkbook(wb: ExcelJS.Workbook) {
  const vehicles = new Map<string, Parsed>();
  const months: AvailabilityReport['months'] = [];
  const skipped: string[] = [];
  for (const ws of wb.worksheets) {
    let hdr = 0, col = 0;
    ws.eachRow((row, r) => {
      if (hdr) return;
      row.eachCell((c, ci) => { if (!hdr && text(c.value).toUpperCase() === 'SUCURSAL') { hdr = r; col = ci; } });
    });
    const header = hdr ? ws.getRow(hdr) : null;
    if (!header || text(header.getCell(col + 1).value).toUpperCase() !== 'PLACA') { skipped.push(ws.name.trim()); continue; }
    const days: { ci: number; day: string }[] = [];
    header.eachCell((c, ci) => { const d = dayOf(c.value); if (d && ci > col + 2) days.push({ ci, day: d }); });
    if (!days.length) { skipped.push(ws.name.trim()); continue; }
    // Días programados del mes: el número que el cuadro usa como base (celda numérica sobre el encabezado).
    let workdays: number | null = null;
    for (let r = 1; r < hdr && workdays == null; r++) ws.getRow(r).eachCell((c) => { const v = num(c.value); if (workdays == null && v != null && v >= 15 && v <= 31) workdays = v; });

    let current: Parsed | null = null;
    const perVehicle = new Map<string, { c: number; p: number }>();
    for (let r = hdr + 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const kindText = text(row.getCell(col + 2).value).toUpperCase();
      if (kindText !== 'PREVENTIVO' && kindText !== 'CORRECTIVO') continue;
      if (kindText === 'PREVENTIVO') {
        const raw = text(row.getCell(col + 1).value);
        if (!raw) { current = null; continue; }
        const plate = normalizePlate(raw);
        current = vehicles.get(plate) ?? { site: text(row.getCell(col).value), plate, marked: new Map(), coverage: new Set() };
        vehicles.set(plate, current);
        days.forEach((d) => current!.coverage.add(d.day));
      }
      if (!current) continue;
      const kind: DowntimeKind = kindText === 'CORRECTIVO' ? 'corrective' : 'preventive';
      for (const d of days) {
        if (text(row.getCell(d.ci).value).toUpperCase() !== 'FDS') continue;
        if (current.marked.get(d.day) !== 'corrective') current.marked.set(d.day, kind);
        const t = perVehicle.get(current.plate) ?? { c: 0, p: 0 };
        if (kind === 'corrective') t.c++; else t.p++;
        perVehicle.set(current.plate, t);
      }
    }
    // Fórmula del cuadro: (días programados − días de parada correctiva) / días programados, promediada en TODA la flota
    // (el resumen del archivo promedia solo las primeras filas). availabilityAll resta también los días preventivos.
    const plates = [...vehicles.values()].filter((v) => v.coverage.has(days[0]!.day));
    const tot = [...perVehicle.values()].reduce((a, b) => ({ c: a.c + b.c, p: a.p + b.p }), { c: 0, p: 0 });
    const avg = (f: (t: { c: number; p: number }) => number) =>
      workdays && plates.length ? plates.reduce((a, v) => a + Math.max(0, (workdays! - f(perVehicle.get(v.plate) ?? { c: 0, p: 0 })) / workdays!), 0) / plates.length : null;
    months.push({ sheet: ws.name.trim(), month: days[0]!.day.slice(0, 7), workdays, realWorkdays: days.filter((x) => !isNonWorkingDay(x.day)).length, vehicles: plates.length, correctiveDays: tot.c, preventiveDays: tot.p, availability: avg((t) => t.c), availabilityAll: avg((t) => t.c + t.p) });
  }
  return { vehicles, months, skipped };
}

export async function importAvailability(prisma: PrismaClient, file: string | Buffer, opts: { organizationId?: string; dryRun?: boolean } = {}): Promise<AvailabilityReport> {
  const wb = new ExcelJS.Workbook();
  if (typeof file === 'string') await wb.xlsx.readFile(file);
  else await wb.xlsx.load(file as unknown as ArrayBuffer);
  const dryRun = !!opts.dryRun;
  const parsed = parseAvailabilityWorkbook(wb);
  if (!parsed.vehicles.size) throw new Error('No se encontraron hojas con el formato del cuadro (SUCURSAL · PLACA · MANTENIMIENTO · días del mes)');
  const org = opts.organizationId ? await prisma.organization.findUniqueOrThrow({ where: { id: opts.organizationId } }) : await prisma.organization.findFirstOrThrow();
  const start = (day: string) => localDayRange(org.timezone, new Date(`${day}T12:00:00Z`)).start;

  const all = await prisma.vehicle.findMany({ where: { organizationId: org.id }, select: { id: true, plate: true, vehicleModel: { select: { vehicleType: { select: { code: true } } } } } });
  const byPlate = new Map<string, (typeof all)[number]>();
  for (const v of all) { byPlate.set(v.plate, v); byPlate.set(normalizePlate(v.plate), v); }

  const report: AvailabilityReport = {
    dryRun, months: parsed.months, vehicles: 0, stops: { corrective: 0, preventive: 0, days: 0 }, averageDays: { corrective: null, preventive: null },
    linkedOrders: 0, intervalsCreated: 0, intervalsReplaced: 0, byVehicle: [], unknownPlates: [], skippedSheets: parsed.skipped, warnings: [],
  };
  const durations: Record<DowntimeKind, number[]> = { corrective: [], preventive: [] };

  for (const p of parsed.vehicles.values()) {
    const v = byPlate.get(p.plate) ?? all.find((x) => canonicalPlate(p.plate, x.vehicleModel.vehicleType.code) === x.plate);
    if (!v) { report.unknownPlates.push(p.plate); continue; }
    report.vehicles++;
    const cover = [...p.coverage].sort();
    const from = cover[0]!, toDay = cover[cover.length - 1]!;
    const firstOwn = await prisma.vehicleStatusLog.findFirst({ where: { vehicleId: v.id, source: { not: SHEET_SOURCE } }, orderBy: { startedAt: 'asc' } });
    const cutoff = new Date(Math.min(start(addDays(toDay, 1)).getTime(), firstOwn?.startedAt.getTime() ?? Infinity));
    if (start(from) >= cutoff) { report.warnings.push(`${v.plate}: el CMMS ya tiene estados desde antes del cuadro; no se cargó`); continue; }
    if (cutoff < start(addDays(toDay, 1))) report.warnings.push(`${v.plate}: el cuadro se cargó hasta ${cutoff.toISOString().slice(0, 10)} (desde ahí manda el historial del CMMS)`);

    const blocks = buildDowntimeBlocks(p.marked).filter((b) => start(b.start) < cutoff);
    const orders = await prisma.workOrder.findMany({
      where: { vehicleId: v.id, status: { in: ['completed', 'closed'] }, actualEnd: { gte: start(addDays(from, -MATCH_DAYS)), lt: start(addDays(toDay, MATCH_DAYS + 1)) } },
      select: { id: true, type: true, actualEnd: true },
    });
    const intervals: { status: 'operational' | 'out_of_service_maintenance'; startedAt: Date; endedAt: Date; reason: string; workOrderId: string | null }[] = [];
    let cursor = start(from);
    for (const b of blocks) {
      const s = start(b.start), e = new Date(Math.min(start(addDays(b.end, 1)).getTime(), cutoff.getTime()));
      if (s > cursor) intervals.push({ status: 'operational', startedAt: cursor, endedAt: s, reason: 'Cuadro de disponibilidad', workOrderId: null });
      const lo = start(addDays(b.start, -MATCH_DAYS)).getTime(), hi = start(addDays(b.end, MATCH_DAYS + 1)).getTime();
      const wo = orders
        .filter((o) => o.actualEnd!.getTime() >= lo && o.actualEnd!.getTime() < hi && (b.kind === 'preventive' ? o.type === 'PM' : CORRECTIVE_WORK_ORDER_TYPES.includes(o.type as WorkOrderType)))
        .sort((a, z) => Math.abs(a.actualEnd!.getTime() - e.getTime()) - Math.abs(z.actualEnd!.getTime() - e.getTime()))[0];
      if (wo) report.linkedOrders++;
      intervals.push({
        status: 'out_of_service_maintenance', startedAt: s, endedAt: e, workOrderId: wo?.id ?? null,
        reason: `Cuadro de disponibilidad: parada ${b.kind === 'corrective' ? 'correctiva' : 'preventiva'} de ${b.days} día(s)`,
      });
      cursor = e;
      report.stops[b.kind]++;
      report.stops.days += b.days;
      durations[b.kind].push(b.days);
    }
    if (cursor < cutoff) intervals.push({ status: 'operational', startedAt: cursor, endedAt: cutoff, reason: 'Cuadro de disponibilidad', workOrderId: null });
    const longest = [...blocks].sort((a, z) => z.days - a.days)[0];
    report.byVehicle.push({ plate: v.plate, stops: blocks.length, days: blocks.reduce((a, b) => a + b.days, 0), longest: longest ? { start: longest.start, end: longest.end, days: longest.days, kind: longest.kind } : null });
    report.intervalsCreated += intervals.length;
    if (dryRun) {
      report.intervalsReplaced += await prisma.vehicleStatusLog.count({ where: { vehicleId: v.id, source: SHEET_SOURCE } });
      continue;
    }
    await prisma.$transaction(async (tx) => {
      report.intervalsReplaced += (await tx.vehicleStatusLog.deleteMany({ where: { vehicleId: v.id, source: SHEET_SOURCE } })).count;
      await tx.vehicleStatusLog.createMany({ data: intervals.map((i) => ({ ...i, vehicleId: v.id, source: SHEET_SOURCE })) });
    });
  }
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  report.averageDays = { corrective: avg(durations.corrective), preventive: avg(durations.preventive) };
  report.byVehicle.sort((a, b) => b.days - a.days);
  for (const m of report.months)
    if (m.workdays != null && m.workdays !== m.realWorkdays)
      report.warnings.push(`${m.month}: el cuadro usa ${m.workdays} días programados y el mes tiene ${m.realWorkdays} días hábiles (lunes a sábado sin festivos). El CMMS calcula con ${m.realWorkdays}.`);
  if (report.skippedSheets.length) report.warnings.push(`Hojas omitidas (no tienen el formato de vehículos): ${report.skippedSheets.join(', ')}`);
  if (report.unknownPlates.length) report.warnings.push(`Placas que no están en la flota: ${report.unknownPlates.join(', ')}`);
  return report;
}
