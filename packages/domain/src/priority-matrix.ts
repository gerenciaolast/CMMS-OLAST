import type { Criticality, FailureConsequence, Priority } from '@cmms/shared';

/** Matriz de prioridad: consecuencia de la falla × criticidad del vehículo (doc 03 §3). */
const MATRIX: Record<FailureConsequence, Record<Criticality, Priority>> = {
  safety_legal: { A: 'P1', B: 'P1', C: 'P1' },
  stops_operation: { A: 'P1', B: 'P2', C: 'P2' },
  degraded: { A: 'P2', B: 'P3', C: 'P3' },
  no_impact: { A: 'P3', B: 'P4', C: 'P4' },
};

export function suggestPriority(consequence: FailureConsequence, criticality: Criticality): Priority {
  return MATRIX[consequence][criticality];
}

/** Tiempos objetivo en horas (doc 03 §3). P3/P4 respuesta = programar (se expresan en horas de calendario). */
export const PRIORITY_TARGET_HOURS: Record<Priority, { response: number; resolution: number }> = {
  P1: { response: 2, resolution: 24 },
  P2: { response: 24, resolution: 72 },
  P3: { response: 7 * 24, resolution: 15 * 24 },
  P4: { response: 30 * 24, resolution: 30 * 24 },
};
