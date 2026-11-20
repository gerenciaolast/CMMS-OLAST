import {
  PLANNED_WORK_ORDER_TYPES,
  UNAVAILABLE_FOR_AVAILABILITY,
  type VehicleStatus,
  type WorkOrderType,
} from '@cmms/shared';

/** Fórmulas de indicadores (doc 05). Todas devuelven null cuando el denominador es 0. */

const HOUR_MS = 3_600_000;
const ratio = (num: number, den: number): number | null => (den > 0 ? num / den : null);

export interface StatusInterval {
  vehicleId: string;
  status: VehicleStatus;
  startedAt: Date;
  endedAt: Date | null;
}

/**
 * #1 Disponibilidad: horas disponibles / horas calendario de vehículos activos en [from, to).
 * Excluye el tiempo en estado "retired". Siniestro y administrativo se reportan aparte (no restan aquí).
 */
export function fleetAvailability(intervals: StatusInterval[], from: Date, to: Date): number | null {
  let calendar = 0;
  let unavailable = 0;
  for (const i of intervals) {
    const start = Math.max(i.startedAt.getTime(), from.getTime());
    const end = Math.min((i.endedAt ?? to).getTime(), to.getTime());
    if (end <= start || i.status === 'retired') continue;
    const h = (end - start) / HOUR_MS;
    calendar += h;
    if (UNAVAILABLE_FOR_AVAILABILITY.includes(i.status)) unavailable += h;
  }
  return ratio(calendar - unavailable, calendar);
}

/** #2 Cumplimiento PM: PM a tiempo / PM que vencieron en el periodo. */
export function pmCompliance(executions: { result: 'early' | 'on_time' | 'late' | 'not_done' }[]): number | null {
  const ok = executions.filter((e) => e.result === 'on_time' || e.result === 'early').length;
  return ratio(ok, executions.length);
}

/** #3 % planificado (por horas u otro peso, p. ej. costo). Excluye SIN. */
export function plannedPercentage(items: { type: WorkOrderType; weight: number }[]): number | null {
  const considered = items.filter((i) => i.type !== 'SIN');
  const planned = considered.filter((i) => PLANNED_WORK_ORDER_TYPES.includes(i.type));
  return ratio(sum(planned.map((i) => i.weight)), sum(considered.map((i) => i.weight)));
}

/** #4 MTBF: distancia (u horas) recorrida / número de fallas (excluye accidentes, causa ACC). */
export function mtbf(distance: number, failures: { cause?: string | null }[]): number | null {
  const n = failures.filter((f) => f.cause !== 'ACC').length;
  return ratio(distance, n);
}

/** #5 MTTR en horas: Σ (fin − inicio de ejecución) / nº de OT correctivas. */
export function mttrHours(repairs: { actualStart: Date; actualEnd: Date }[]): number | null {
  const total = sum(repairs.map((r) => (r.actualEnd.getTime() - r.actualStart.getTime()) / HOUR_MS));
  return ratio(total, repairs.length);
}

/** #7 Costo por km. */
export function costPerKm(totalCost: number, distance: number): number | null {
  return ratio(totalCost, distance);
}

/** #8 Backlog en semanas: horas estimadas pendientes / capacidad semanal. */
export function backlogWeeks(pendingHours: number, weeklyCapacityHours: number): number | null {
  return ratio(pendingHours, weeklyCapacityHours);
}

/** Genérico para #9–#14 (cumplimiento de programa, retrabajo, inspección, SLA, calidad de dato, documentos). */
export function percentage(part: number, total: number): number | null {
  return ratio(part, total);
}

function sum(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0);
}

// ───────────── Sprint 5: apoyo al tablero ─────────────

export interface KmPoint { at: Date; km: number }

/**
 * Km recorridos en [from, to) a partir de puntos (lecturas, OT con km) interpolando linealmente.
 * No extrapola: fuera del rango con datos se usa el punto más cercano. Ignora lecturas que retroceden.
 */
export function distanceInPeriod(points: KmPoint[], from: Date, to: Date): number {
  const pts = [...points].sort((a, b) => a.at.getTime() - b.at.getTime());
  const clean: KmPoint[] = [];
  for (const p of pts) if (!clean.length || p.km >= clean[clean.length - 1]!.km) clean.push(p);
  if (clean.length < 2) return 0;
  const at = (t: number) => {
    if (t <= clean[0]!.at.getTime()) return clean[0]!.km;
    const last = clean[clean.length - 1]!;
    if (t >= last.at.getTime()) return last.km;
    for (let i = 1; i < clean.length; i++) {
      const a = clean[i - 1]!, b = clean[i]!;
      if (t <= b.at.getTime()) {
        const span = b.at.getTime() - a.at.getTime();
        return span === 0 ? b.km : a.km + ((b.km - a.km) * (t - a.at.getTime())) / span;
      }
    }
    return last.km;
  };
  return Math.max(0, Math.round(at(to.getTime()) - at(from.getTime())));
}

/**
 * #2 Cumplimiento PM medido sobre la ejecución real: cada PM se compara con el anterior del mismo vehículo.
 * A tiempo si el recorrido entre ambos no supera el intervalo del plan + tolerancia (10 % por defecto).
 */
export function pmIntervalResults(pms: KmPoint[], intervalKm: number, tolerance = 0.1): { at: Date; km: number; gapKm: number; onTime: boolean }[] {
  const s = [...pms].sort((a, b) => a.at.getTime() - b.at.getTime() || a.km - b.km);
  const out: { at: Date; km: number; gapKm: number; onTime: boolean }[] = [];
  for (let i = 1; i < s.length; i++) {
    const gap = s[i]!.km - s[i - 1]!.km;
    if (gap <= 0) continue; // mismo servicio registrado dos veces o km inconsistente
    out.push({ at: s[i]!.at, km: s[i]!.km, gapKm: gap, onTime: gap <= intervalKm * (1 + tolerance) });
  }
  return out;
}

/** #12 ¿Se resolvió dentro del tiempo objetivo de su prioridad? */
export function withinSla(createdAt: Date, resolvedAt: Date, targetHours: number): boolean {
  return (resolvedAt.getTime() - createdAt.getTime()) / HOUR_MS <= targetHours;
}

export interface ParetoRow { key: string; value: number; share: number; cumulative: number; vital: boolean }

/** Pareto: ordena de mayor a menor, con participación y acumulado; «vital» = las causas que suman el primer 80 %. */
export function pareto(rows: { key: string; value: number }[]): ParetoRow[] {
  const total = sum(rows.map((r) => r.value));
  let acc = 0;
  return [...rows]
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value || a.key.localeCompare(b.key))
    .map((r) => {
      const before = acc;
      acc += r.value;
      return { key: r.key, value: r.value, share: total ? r.value / total : 0, cumulative: total ? acc / total : 0, vital: total > 0 && before / total < 0.8 };
    });
}

export type KpiDirection = 'higher' | 'lower' | 'range';
export type KpiLight = 'ok' | 'warn' | 'bad';

/**
 * Semáforo frente a la meta. `higher`: ≥ meta verde, dentro de `band` (relativo) amarillo.
 * `lower`: ≤ meta verde. `range`: [min, max] verde.
 */
export function kpiLight(value: number | null, target: number | [number, number] | null, direction: KpiDirection, band = 0.1): KpiLight | null {
  if (value == null || target == null) return null;
  if (direction === 'range') {
    const [lo, hi] = target as [number, number];
    if (value >= lo && value <= hi) return 'ok';
    return value >= lo * (1 - band) && value <= hi * (1 + band) ? 'warn' : 'bad';
  }
  const t = target as number;
  if (direction === 'higher') return value >= t ? 'ok' : value >= t * (1 - band) ? 'warn' : 'bad';
  return value <= t ? 'ok' : value <= t * (1 + band) || (t === 0 && value <= band) ? 'warn' : 'bad';
}
