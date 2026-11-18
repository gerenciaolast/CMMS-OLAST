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
