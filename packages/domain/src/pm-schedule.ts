import type { PmScheduleStatus } from '@cmms/shared';

/**
 * Cálculo de vencimientos de mantenimiento preventivo (doc 02 P5).
 * Regla: km, horas motor o días — LO QUE OCURRA PRIMERO. Programación flotante desde la última ejecución real.
 */
export interface PmRoutineRule {
  intervalDistance?: number | null;
  intervalHours?: number | null;
  intervalDays?: number | null;
  /** Tolerancia de cumplimiento, fracción (0.10 = ±10 %). */
  tolerancePct?: number;
  /** Umbral para generar la OT automáticamente, fracción (0.90). */
  generateAtPct?: number;
  /** Umbral para marcar "próximo", fracción (0.80). */
  upcomingAtPct?: number;
}

export interface PmBaseline {
  lastDoneAt: Date;
  lastDoneMeter: number;
  lastDoneHours?: number | null;
}

export interface PmCurrent {
  asOf: Date;
  meter: number;
  hours?: number | null;
  /** Uso promedio diario (km/día) de los últimos 30 días; null si no hay datos. */
  avgDailyUsage?: number | null;
  avgDailyHours?: number | null;
}

export interface PmScheduleResult {
  nextDueMeter: number | null;
  nextDueHours: number | null;
  nextDueDate: Date | null;
  /** Fecha estimada de vencimiento considerando el uso proyectado. */
  projectedDueDate: Date | null;
  /** Fracción consumida del intervalo (la mayor de las dimensiones). 1 = vencido justo. */
  pctConsumed: number;
  drivingDimension: 'distance' | 'hours' | 'days';
  status: PmScheduleStatus;
}

const DAY_MS = 86_400_000;
export const PM_DEFAULTS = { tolerancePct: 0.1, generateAtPct: 0.9, upcomingAtPct: 0.8 } as const;

function positive(n: number | null | undefined): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n > 0;
}

export function computePmSchedule(rule: PmRoutineRule, base: PmBaseline, cur: PmCurrent): PmScheduleResult {
  const tolerance = rule.tolerancePct ?? PM_DEFAULTS.tolerancePct;
  const generateAt = rule.generateAtPct ?? PM_DEFAULTS.generateAtPct;
  const upcomingAt = rule.upcomingAtPct ?? PM_DEFAULTS.upcomingAtPct;

  if (!positive(rule.intervalDistance) && !positive(rule.intervalHours) && !positive(rule.intervalDays)) {
    throw new RangeError('La rutina debe tener al menos un intervalo (km, horas o días)');
  }

  const candidates: { dim: PmScheduleResult['drivingDimension']; pct: number; projected: Date | null }[] = [];
  let nextDueMeter: number | null = null;
  let nextDueHours: number | null = null;
  let nextDueDate: Date | null = null;

  if (positive(rule.intervalDistance)) {
    nextDueMeter = base.lastDoneMeter + rule.intervalDistance;
    const pct = (cur.meter - base.lastDoneMeter) / rule.intervalDistance;
    const remaining = nextDueMeter - cur.meter;
    const projected = positive(cur.avgDailyUsage)
      ? new Date(cur.asOf.getTime() + (remaining / cur.avgDailyUsage) * DAY_MS)
      : null;
    candidates.push({ dim: 'distance', pct, projected });
  }
  if (positive(rule.intervalHours) && base.lastDoneHours != null && cur.hours != null) {
    nextDueHours = base.lastDoneHours + rule.intervalHours;
    const pct = (cur.hours - base.lastDoneHours) / rule.intervalHours;
    const projected = positive(cur.avgDailyHours)
      ? new Date(cur.asOf.getTime() + ((nextDueHours - cur.hours) / cur.avgDailyHours) * DAY_MS)
      : null;
    candidates.push({ dim: 'hours', pct, projected });
  }
  if (positive(rule.intervalDays)) {
    nextDueDate = new Date(base.lastDoneAt.getTime() + rule.intervalDays * DAY_MS);
    const pct = (cur.asOf.getTime() - base.lastDoneAt.getTime()) / (rule.intervalDays * DAY_MS);
    candidates.push({ dim: 'days', pct, projected: nextDueDate });
  }
  if (candidates.length === 0) throw new RangeError('Faltan lecturas para evaluar la rutina');

  const driving = candidates.reduce((a, b) => (b.pct > a.pct ? b : a));
  const projections = candidates.map((c) => c.projected).filter((d): d is Date => d !== null);
  const projectedDueDate = projections.length
    ? new Date(Math.min(...projections.map((d) => d.getTime())))
    : null;

  const pct = Math.max(driving.pct, 0);
  const status: PmScheduleStatus =
    pct > 1 + tolerance ? 'overdue' : pct >= generateAt ? 'due' : pct >= upcomingAt ? 'upcoming' : 'ok';

  return {
    nextDueMeter,
    nextDueHours,
    nextDueDate,
    projectedDueDate,
    pctConsumed: Math.round(pct * 10_000) / 10_000,
    drivingDimension: driving.dim,
    status,
  };
}

/** ¿Debe generarse la OT automáticamente? Solo si llegó al umbral y no hay OT abierta para la rutina. */
export function shouldGenerateWorkOrder(result: PmScheduleResult, hasOpenWorkOrder: boolean): boolean {
  return !hasOpenWorkOrder && (result.status === 'due' || result.status === 'overdue');
}

/**
 * Cumplimiento de un PM ejecutado (KPI doc 05 #2): a tiempo si al ejecutarse no superó 100 % + tolerancia.
 * Ejecutar antes no se penaliza en cumplimiento (sí se puede analizar como "temprano").
 */
export function classifyPmExecution(
  rule: PmRoutineRule,
  base: PmBaseline,
  executedAt: Date,
  executedMeter: number,
  executedHours?: number | null,
): 'early' | 'on_time' | 'late' {
  const tolerance = rule.tolerancePct ?? PM_DEFAULTS.tolerancePct;
  const r = computePmSchedule(rule, base, { asOf: executedAt, meter: executedMeter, hours: executedHours });
  if (r.pctConsumed > 1 + tolerance) return 'late';
  if (r.pctConsumed < 1 - tolerance) return 'early';
  return 'on_time';
}

export interface NestedRoutine {
  id: string;
  /** IDs de rutinas incluidas (p. ej. el servicio C de 30 000 km incluye A y B). */
  includes: string[];
}

function includedClosure(id: string, byId: Map<string, NestedRoutine>, seen = new Set<string>()): Set<string> {
  for (const child of byId.get(id)?.includes ?? []) {
    if (!seen.has(child)) {
      seen.add(child);
      includedClosure(child, byId, seen);
    }
  }
  return seen;
}

/** De las rutinas vencidas, ejecutar solo las de mayor nivel: se descartan las incluidas en otra vencida. */
export function resolveRoutinesToExecute(dueIds: string[], routines: NestedRoutine[]): string[] {
  const byId = new Map(routines.map((r) => [r.id, r]));
  const covered = new Set<string>();
  for (const id of dueIds) for (const c of includedClosure(id, byId)) covered.add(c);
  return dueIds.filter((id) => !covered.has(id));
}

/** Al cerrar la OT de una rutina se actualiza la última ejecución de ella y de todas las incluidas. */
export function routinesResetByCompletion(executedId: string, routines: NestedRoutine[]): string[] {
  const byId = new Map(routines.map((r) => [r.id, r]));
  return [...new Set([executedId, ...includedClosure(executedId, byId)])];
}
