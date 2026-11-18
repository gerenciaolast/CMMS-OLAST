import type { Criticality } from '@cmms/shared';

/** Criterios de criticidad, cada uno de 1 a 3 puntos (doc 03 §2). */
export interface CriticalityCriteria {
  operationalImpact: 1 | 2 | 3;
  safety: 1 | 2 | 3;
  repairCost: 1 | 2 | 3;
  usage: 1 | 2 | 3;
}

export interface CriticalityResult {
  score: number;
  category: Criticality;
}

/** A: 10–12 puntos o 3 en seguridad · B: 7–9 · C: 4–6. */
export function computeCriticality(c: CriticalityCriteria): CriticalityResult {
  for (const v of Object.values(c)) {
    if (![1, 2, 3].includes(v)) throw new RangeError('Cada criterio de criticidad debe valer 1, 2 o 3');
  }
  const score = c.operationalImpact + c.safety + c.repairCost + c.usage;
  const category: Criticality = score >= 10 || c.safety === 3 ? 'A' : score >= 7 ? 'B' : 'C';
  return { score, category };
}

/** Uso mensual (km) → puntaje del criterio "exigencia de uso". */
export function usageScore(kmPerMonth: number): 1 | 2 | 3 {
  if (kmPerMonth > 8000) return 3;
  if (kmPerMonth >= 3000) return 2;
  return 1;
}
