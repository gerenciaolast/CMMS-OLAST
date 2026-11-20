import ExcelJS from 'exceljs';
import { createHash } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { canonicalPlate, normalizePlate } from '@cmms/domain';
import { nextDocumentNumber } from '../../common/counters';

/**
 * Migración del historial de mantenimiento en Excel ("Hoja de vida de mantto de vehículos") a OT cerradas.
 * - Una OT histórica por fila (is_historical = true, origen "import"), idempotente por source_ref.
 * - Correctivos: codificación de falla con los patrones del catálogo (doc 09). Preventivos: tareas hechas.
 * - El costo total del Excel queda como servicio externo (el Excel no separa mano de obra y repuestos).
 */

export interface HistoryReport {
  dryRun: boolean;
  created: number;
  updated: number;
  skippedExisting: number;
  approximateDates: number;
  byVehicle: Record<string, number>;
  newRows: { plate: string; date: string; km: number | null; type: string; amount: number; description: string }[];
  updatedRows: { plate: string; number: string; changes: string[] }[];
  /** OT históricas que ya no aparecen en el archivo (no se borran: se reportan). */
  notInFile: { plate: string; number: string; date: string; description: string }[];
  /** Vehículos cuyo kilometraje se actualizó con el dato más reciente del historial. */
  meterUpdates: { vehicleId: string; plate: string; km: number; date: string }[];
  warnings: string[];
}

/** Huella de contenido de una intervención: identifica la fila aunque cambie de posición en la hoja. */
export function historyFingerprint(plate: string, date: Date, km: number | null, description: string, amount: number): string {
  const desc = normalizeText(description).replace(/\s+/g, ' ').trim();
  return createHash('sha1').update([plate, date.toISOString().slice(0, 10), km ?? '', desc, Math.round(amount)].join('|')).digest('hex').slice(0, 24);
}

const SKIP_SHEETS = new Set(['2024', 'RutinaMantenimiento', 'Hoja2']);
/** Errores de digitación conocidos en el archivo de OLAST. */
const PLATE_ALIASES: Record<string, string> = { '539AFB': '593AFB' };
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const TYPOS: [string, string][] = [
  ['aciete', 'aceite'], ['aceitte', 'aceite'], ['aceito', 'aceite'], ['filtors', 'filtros'], ['filltros', 'filtros'], ['fltros', 'filtros'],
  ['isuzo', 'isuzu'], ['cambiod e', 'cambio de'], ['cambiod', 'cambio'], ['maguera', 'manguera'], ['rodmaientos', 'rodamientos'],
  ['delnateros', 'delanteros'], ['delnteros', 'delanteros'], ['delanterso', 'delanteros'], ['delnateras', 'delanteras'],
  ['fuegon', 'furgon'], ['furgo ', 'furgon '], ['bagon', 'vagon'],
];
const REWRITES: [RegExp, string][] = [
  [/corre[ao]s? (del? )?alternador/g, 'correa accesorios'], [/vacio alternador/g, 'vacio'], [/mangueras? (de )?(agua )?radiador/g, 'manguera refrigeracion'],
  [/aceite (de )?caja (de )?(velocidades|cambios|transmision)/g, 'aceite de caja'], [/rodillos y bujes/g, 'rodillos'], [/escobillas y rodamientos/g, 'escobillas'],
  [/sellos? (de )?aceite/g, 'sello rueda'], [/motor del arranque/g, 'arranque'], [/guayas de control acelerador/g, 'guaya acelerador'], [/deposito radiador/g, 'deposito'],
];
const ACTIONS: [string, RegExp][] = [
  ['REE', /cambi|reemplaz|instalacion|adicion/], ['REP', /repar|arreglo|soldad|soldar|rectific|vulcaniz|remach|recalz|grafado|torno|correc/],
  ['AJU', /gradua|graduar|gradur|grduar|graudar|tension|ajust|calibra|alinea|aleneacion|balanceo|blanceo|rotacion|purga/],
  ['LUB', /engrase|grasa|adicion/], ['LIM', /lavado|limpi|desoxid|inmuniz|raspado/], ['INS', /revis|inspecc|escan|scaneo|verificaci|diagnost|alistamiento/],
  ['REC', /pintura|impermeabil|modificacion/],
];
const MODES: [string, RegExp][] = [
  ['SOB', /recalentamiento|sobrecalent/], ['FUG', /fuga|perdida de refrigerante|filtracion/], ['ROT', /rot[oa]s?\b|fractura|dañad|danad/],
  ['DES', /desgaste/], ['ELC', /corto|bajo amperaje|voltaje bajo|falla electrica|fundido|no daba/], ['COR', /oxid/], ['BAJ', /falta de presion/], ['DSJ', /desplazado|se saltaba/],
];
const CAUSES: [string, RegExp][] = [['DNO', /desgaste/], ['VAN', /paro camionero/], ['FMA', /prematuro/]];

export function normalizeText(text: string): string {
  let t = text.toLowerCase().normalize('NFD').replace(/(?!̃)[̀-ͯ]/g, '').normalize('NFC');
  for (const [a, b] of TYPOS) t = t.split(a).join(b);
  for (const [a, b] of REWRITES) t = t.replace(a, b);
  return t;
}

/** Interpreta las fechas del Excel, incluidos errores frecuentes ("12/09/204", "02-19-26"). */
/** Exportada para pruebas. */
export function parseHistoryDate(raw: unknown, monthName?: string | null, fallbackYear?: number): { date: Date | null; approximate: boolean } {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) return { date: raw, approximate: false };
  const s = String(raw ?? '').trim();
  let m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(s);
  if (m) {
    let y = Number(m[3]);
    if (m[3]!.length === 3) y = Number(`202${m[3]!.slice(-1)}`); // "204" → 2024 (se omitió un dígito)
    if (y < 100) y += 2000;
    const d = new Date(Date.UTC(y, Number(m[2]) - 1, Number(m[1])));
    if (Number(m[2]) <= 12 && !Number.isNaN(d.getTime())) return { date: d, approximate: m[3]!.length === 3 };
  }
  m = /^(\d{1,2})-(\d{1,2})-(\d{2})$/.exec(s);
  if (m && Number(m[1]) <= 12) return { date: new Date(Date.UTC(2000 + Number(m[3]), Number(m[1]) - 1, Number(m[2]))), approximate: false };
  const month = MONTHS.indexOf((monthName ?? '').toLowerCase().trim());
  if (month >= 0 && fallbackYear) return { date: new Date(Date.UTC(fallbackYear, month, 15)), approximate: true };
  return { date: null, approximate: true };
}

function cell(v: ExcelJS.CellValue): unknown {
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    if ('result' in v) return (v as ExcelJS.CellFormulaValue).result;
    if ('richText' in v) return (v as ExcelJS.CellRichTextValue).richText.map((t) => t.text).join('');
  }
  return v;
}

export async function importMaintenanceHistory(prisma: PrismaClient, file: string | Buffer, opts: { organizationName?: string; dryRun?: boolean } = {}): Promise<HistoryReport> {
  const organizationName = opts.organizationName ?? 'OLAST';
  const dryRun = !!opts.dryRun;
  const wb = new ExcelJS.Workbook();
  if (typeof file === 'string') await wb.xlsx.readFile(file);
  else await wb.xlsx.load(file as unknown as ArrayBuffer);
  const org = await prisma.organization.findFirstOrThrow({ where: { name: organizationName } });
  const patterns = (await prisma.componentCode.findMany({ where: { level: 3, matchPattern: { not: null } } })).map((c) => ({ code: c.code, name: c.name, rx: new RegExp(c.matchPattern!) }));
  const report: HistoryReport = { dryRun, created: 0, updated: 0, skippedExisting: 0, approximateDates: 0, byVehicle: {}, newRows: [], updatedRows: [], notInFile: [], meterUpdates: [], warnings: [] };
  const supplierCache = new Map<string, string>();

  // Índice de lo ya cargado por huella de contenido (y por referencia de origen, para cargas anteriores).
  const existing = await prisma.workOrder.findMany({
    where: { organizationId: org.id, isHistorical: true },
    select: { id: true, number: true, sourceRef: true, description: true, odometerIn: true, totalCost: true, closedAt: true, type: true, vehicle: { select: { id: true, plate: true } } },
  });
  const byPrint = new Map(existing.map((w) => [historyFingerprint(w.vehicle.plate, w.closedAt!, w.odometerIn, w.description, Number(w.totalCost)), w]));
  const matched = new Set<string>();
  const latestKm = new Map<string, { km: number; date: Date; plate: string }>();
  type Row = { ref: string; print: string; plate: string; vehicle: { id: string; plate: string; siteId: string }; date: Date; approximate: boolean; isPm: boolean; description: string; amount: number; km: number | null; shop: string; sheet: string; n: number };
  const unmatched: Row[] = [];

  for (const ws of wb.worksheets) {
    if (SKIP_SHEETS.has(ws.name)) continue;
    const head: string[] = [];
    ws.getRow(1).eachCell((c, i) => (head[i] = String(cell(c.value) ?? '').trim()));
    if (!head.includes('Placa') || !head.includes('Descripcion Intervencion')) continue;
    let lastYear: number | undefined;

    for (let n = 2; n <= ws.rowCount; n++) {
      const row: Record<string, unknown> = {};
      ws.getRow(n).eachCell({ includeEmpty: false }, (c, i) => head[i] && (row[head[i]!] = cell(c.value)));
      const description = String(row['Descripcion Intervencion'] ?? '').trim();
      if (!description) continue;

      let plate = normalizePlate(String(row['Placa'] ?? ''));
      plate = PLATE_ALIASES[plate] ?? plate;
      const vehicle =
        (await prisma.vehicle.findUnique({ where: { organizationId_plate: { organizationId: org.id, plate } } })) ??
        (await prisma.vehicle.findUnique({ where: { organizationId_plate: { organizationId: org.id, plate: canonicalPlate(plate, 'MCA') } } }));
      if (!vehicle) { report.warnings.push(`[${ws.name} fila ${n}] placa ${plate} no está en la flota: omitida`); continue; }

      const parsed = parseHistoryDate(row['Fecha'], row['Mes'] as string, lastYear);
      if (!parsed.date) { report.warnings.push(`[${vehicle.plate} fila ${n}] fecha ilegible "${String(row['Fecha'])}": omitida`); continue; }
      let date = parsed.date;
      let approximate = parsed.approximate;
      if (date.getTime() > Date.now()) {
        // Año mal digitado (p. ej. 2026-12-08 registrado en 2025): se toma el año anterior y se marca como aproximada.
        const fixed = new Date(Date.UTC(date.getUTCFullYear() - 1, date.getUTCMonth(), date.getUTCDate()));
        report.warnings.push(`[${vehicle.plate} fila ${n}] fecha futura ${date.toISOString().slice(0, 10)} → ${fixed.toISOString().slice(0, 10)} (aproximada)`);
        date = fixed;
        approximate = true;
      }
      if (date.getUTCFullYear() < 2015) { approximate = true; date = new Date(Date.UTC(lastYear ?? 2025, date.getUTCMonth(), date.getUTCDate())); }
      lastYear = date.getUTCFullYear();
      if (approximate) report.approximateDates++;

      const isPm = String(row['Tipo Mantenimiento'] ?? '').toLowerCase().startsWith('prev');
      const amount = Number(row['Valor_Total'] ?? 0) || 0;
      const km = Number(row['Kilometraje']) || null;
      if (km) {
        const prev = latestKm.get(vehicle.id);
        if (!prev || km > prev.km) latestKm.set(vehicle.id, { km, date, plate: vehicle.plate });
      }
      const print = historyFingerprint(vehicle.plate, date, km, description, amount);
      const found = byPrint.get(print);
      if (found) { matched.add(found.id); report.skippedExisting++; continue; }
      unmatched.push({ ref: `hist:${print}`, print, plate: vehicle.plate, vehicle, date, approximate, isPm, description, amount, km, shop: String(row['Taller'] ?? row['TALLER'] ?? '').trim(), sheet: ws.name, n });
    }
  }

  // Filas corregidas: misma placa y (mismo km o misma descripción) que una OT histórica que ya no coincide.
  const leftovers = existing.filter((w) => !matched.has(w.id));
  const creates: Row[] = [];
  for (const r of unmatched) {
    const i = leftovers.findIndex((w) => w.vehicle.id === r.vehicle.id && (w.odometerIn === r.km || normalizeText(w.description) === normalizeText(r.description)));
    if (i < 0) { creates.push(r); continue; }
    const w = leftovers.splice(i, 1)[0]!;
    const changes: string[] = [];
    if (w.closedAt!.toISOString().slice(0, 10) !== r.date.toISOString().slice(0, 10)) changes.push(`fecha ${w.closedAt!.toISOString().slice(0, 10)} → ${r.date.toISOString().slice(0, 10)}`);
    if (w.odometerIn !== r.km) changes.push(`km ${w.odometerIn} → ${r.km}`);
    if (Number(w.totalCost) !== r.amount) changes.push(`valor ${Number(w.totalCost)} → ${r.amount}`);
    if (w.description !== r.description) changes.push('descripción');
    if ((w.type === 'PM') !== r.isPm) changes.push(`tipo → ${r.isPm ? 'preventivo' : 'correctivo'}`);
    report.updatedRows.push({ plate: r.plate, number: w.number, changes });
    report.updated++;
    if (dryRun) continue;
    await prisma.$transaction(async (tx) => {
      await tx.workOrder.update({
        where: { id: w.id },
        data: {
          description: r.description, type: r.isPm ? 'PM' : 'CP', odometerIn: r.km, odometerOut: r.km, actualStart: r.date, actualEnd: r.date, closedAt: r.date,
          externalCost: r.amount, totalCost: r.amount, completionNotes: `Importado del historial en Excel (hoja ${r.sheet}, fila ${r.n}) · actualizado ${new Date().toISOString().slice(0, 10)}${r.approximate ? ' · fecha aproximada' : ''}`,
        },
      });
      await tx.workOrderExternalService.updateMany({ where: { workOrderId: w.id }, data: { amount: r.amount } });
      await tx.workOrderEvent.create({ data: { workOrderId: w.id, action: 'import', comment: `Corrección desde el historial: ${changes.join(', ')}` } });
    });
  }
  report.notInFile = leftovers.map((w) => ({ plate: w.vehicle.plate, number: w.number, date: w.closedAt!.toISOString().slice(0, 10), description: w.description }));

  for (const r of creates) {
    report.newRows.push({ plate: r.plate, date: r.date.toISOString().slice(0, 10), km: r.km, type: r.isPm ? 'PM' : 'CP', amount: r.amount, description: r.description });
    report.byVehicle[r.plate] = (report.byVehicle[r.plate] ?? 0) + 1;
    report.created++;
    if (dryRun) continue;
    const text = normalizeText(r.description);
    const components = patterns.filter((p) => p.rx.test(text));
    const action = ACTIONS.find(([, rx]) => rx.test(text))?.[0] ?? null;
    const mode = MODES.find(([, rx]) => rx.test(text))?.[0] ?? null;
    const cause = CAUSES.find(([, rx]) => rx.test(text))?.[0] ?? null;
    let supplierId: string | null = null;
    if (r.shop) {
      supplierId = supplierCache.get(r.shop) ?? null;
      if (!supplierId) {
        const sup = await prisma.supplier.upsert({ where: { organizationId_name: { organizationId: org.id, name: r.shop } }, create: { organizationId: org.id, name: r.shop }, update: {} });
        supplierId = sup.id;
        supplierCache.set(r.shop, sup.id);
      }
    }
    await prisma.$transaction(async (tx) => {
      const number = await nextDocumentNumber(tx, org.id, 'OT', r.date);
      await tx.workOrder.create({
        data: {
          organizationId: org.id, number, vehicleId: r.vehicle.id, siteId: r.vehicle.siteId, type: r.isPm ? 'PM' : 'CP', priority: 'P3', status: 'closed',
          origin: 'import', description: r.description, workshopType: 'external', supplierId, odometerIn: r.km, odometerOut: r.km,
          actualStart: r.date, actualEnd: r.date, closedAt: r.date, createdAt: r.date, isHistorical: true, sourceRef: r.ref,
          externalCost: r.amount, totalCost: r.amount,
          completionNotes: `Importado del historial en Excel (hoja ${r.sheet}, fila ${r.n})${r.approximate ? ' · fecha aproximada' : ''}`,
          externalServices: r.amount ? { create: { supplierId, description: 'Valor total registrado en el historial', amount: r.amount } } : undefined,
          tasks: r.isPm ? { create: components.map((c, i) => ({ sequence: (i + 1) * 10, description: c.name, status: 'done' })) } : undefined,
          failures: r.isPm ? undefined : { create: components.map((c) => ({ componentCode: c.code, failureMode: mode, cause, action, comment: 'Clasificación automática del historial' })) },
          events: { create: { action: 'import', toStatus: 'closed', comment: 'Migración del historial', createdAt: r.date } },
        },
      });
    });
  }

  // Kilometraje más reciente del historial → lectura de odómetro (si es mayor al vigente).
  for (const [vehicleId, l] of latestKm) {
    const v = await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicleId } });
    if (v.status === 'retired' || (v.currentOdometer != null && l.km <= v.currentOdometer) || (v.lastReadingAt && l.date < v.lastReadingAt)) continue;
    report.meterUpdates.push({ vehicleId, plate: l.plate, km: l.km, date: l.date.toISOString().slice(0, 10) });
    if (dryRun) continue;
    await prisma.$transaction([
      prisma.meterReading.create({ data: { vehicleId, value: l.km, accumulatedValue: l.km + v.odometerOffset, readAt: l.date, source: 'import', flagReason: 'Último kilometraje del historial de mantenimiento' } }),
      prisma.vehicle.update({ where: { id: vehicleId }, data: { currentOdometer: l.km, lastReadingAt: l.date } }),
    ]);
  }
  return report;
}
