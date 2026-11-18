import { describe, expect, it } from 'vitest';
import { computeCriticality, usageScore, suggestPriority, PRIORITY_TARGET_HOURS } from '../src';

describe('criticidad A/B/C (doc 03 §2)', () => {
  it('A por puntaje ≥ 10', () => {
    expect(computeCriticality({ operationalImpact: 3, safety: 2, repairCost: 3, usage: 2 })).toEqual({ score: 10, category: 'A' });
  });
  it('A siempre que seguridad = 3, aunque el puntaje sea bajo', () => {
    expect(computeCriticality({ operationalImpact: 1, safety: 3, repairCost: 1, usage: 1 }).category).toBe('A');
  });
  it('B entre 7 y 9', () => {
    expect(computeCriticality({ operationalImpact: 2, safety: 2, repairCost: 2, usage: 1 }).category).toBe('B');
    expect(computeCriticality({ operationalImpact: 3, safety: 2, repairCost: 2, usage: 2 }).category).toBe('B');
  });
  it('C entre 4 y 6', () => {
    expect(computeCriticality({ operationalImpact: 1, safety: 1, repairCost: 1, usage: 1 }).category).toBe('C');
    expect(computeCriticality({ operationalImpact: 2, safety: 2, repairCost: 1, usage: 1 }).category).toBe('C');
  });
  it('rechaza valores fuera de 1–3', () => {
    expect(() => computeCriticality({ operationalImpact: 4 as 3, safety: 1, repairCost: 1, usage: 1 })).toThrow(RangeError);
  });
  it('puntaje de uso por km/mes', () => {
    expect(usageScore(2999)).toBe(1);
    expect(usageScore(3000)).toBe(2);
    expect(usageScore(8000)).toBe(2);
    expect(usageScore(8001)).toBe(3);
  });
});

describe('matriz de prioridad (doc 03 §3)', () => {
  it.each([
    ['safety_legal', 'C', 'P1'],
    ['stops_operation', 'A', 'P1'],
    ['stops_operation', 'B', 'P2'],
    ['degraded', 'A', 'P2'],
    ['degraded', 'C', 'P3'],
    ['no_impact', 'A', 'P3'],
    ['no_impact', 'B', 'P4'],
  ] as const)('%s × %s → %s', (c, k, p) => expect(suggestPriority(c, k)).toBe(p));
  it('P1 debe resolverse en ≤ 24 h', () => expect(PRIORITY_TARGET_HOURS.P1.resolution).toBe(24));
});
