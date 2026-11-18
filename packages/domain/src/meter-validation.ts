/** Validación de lecturas de odómetro/horómetro (doc 02 P2). */

export interface PreviousReading {
  value: number;
  readAt: Date;
}

export type ReadingValidation =
  | { status: 'accepted' }
  | { status: 'flagged'; reason: 'improbable_jump'; impliedDailyUsage: number }
  | { status: 'rejected'; reason: 'decreasing' | 'negative' | 'before_previous' };

const DAY_MS = 86_400_000;

export function validateReading(
  newValue: number,
  readAt: Date,
  previous: PreviousReading | null,
  maxDailyUsage: number,
): ReadingValidation {
  if (!Number.isFinite(newValue) || newValue < 0) return { status: 'rejected', reason: 'negative' };
  if (!previous) return { status: 'accepted' };
  if (newValue < previous.value) return { status: 'rejected', reason: 'decreasing' };
  if (readAt.getTime() < previous.readAt.getTime()) return { status: 'rejected', reason: 'before_previous' };
  const days = Math.max((readAt.getTime() - previous.readAt.getTime()) / DAY_MS, 1);
  const impliedDailyUsage = (newValue - previous.value) / days;
  if (impliedDailyUsage > maxDailyUsage) return { status: 'flagged', reason: 'improbable_jump', impliedDailyUsage };
  return { status: 'accepted' };
}

/**
 * Kilometraje acumulado real: valor del medidor actual + compensación acumulada de cambios de odómetro.
 * offset = Σ (lectura final del medidor viejo − lectura inicial del nuevo).
 */
export function accumulatedValue(rawValue: number, offset: number): number {
  return rawValue + offset;
}

export function replacementOffset(oldFinalValue: number, newInitialValue: number): number {
  if (oldFinalValue < 0 || newInitialValue < 0) throw new RangeError('Las lecturas no pueden ser negativas');
  return oldFinalValue - newInitialValue;
}

/** Uso promedio diario a partir de lecturas (ordenadas o no) dentro de la ventana dada. */
export function averageDailyUsage(readings: PreviousReading[], asOf: Date, windowDays = 30): number | null {
  const from = asOf.getTime() - windowDays * DAY_MS;
  const inWindow = readings.filter((r) => r.readAt.getTime() >= from && r.readAt.getTime() <= asOf.getTime());
  if (inWindow.length < 2) return null;
  inWindow.sort((a, b) => a.readAt.getTime() - b.readAt.getTime());
  const first = inWindow[0]!;
  const last = inWindow[inWindow.length - 1]!;
  const days = (last.readAt.getTime() - first.readAt.getTime()) / DAY_MS;
  if (days <= 0) return null;
  return (last.value - first.value) / days;
}
