import { describe, expect, it } from 'vitest';
import { validateReading, accumulatedValue, replacementOffset, averageDailyUsage } from '../src';

const d = (s: string) => new Date(s);
const prev = { value: 100_000, readAt: d('2026-11-01T08:00:00Z') };

describe('validación de lecturas (doc 02 P2)', () => {
  it('acepta la primera lectura', () => expect(validateReading(5, d('2026-11-01'), null, 1200).status).toBe('accepted'));
  it('rechaza lectura menor a la anterior', () =>
    expect(validateReading(99_999, d('2026-11-02'), prev, 1200)).toEqual({ status: 'rejected', reason: 'decreasing' }));
  it('rechaza lectura negativa', () => expect(validateReading(-1, d('2026-11-02'), prev, 1200).status).toBe('rejected'));
  it('rechaza lectura con fecha anterior a la previa', () =>
    expect(validateReading(100_100, d('2026-10-30'), prev, 1200)).toEqual({ status: 'rejected', reason: 'before_previous' }));
  it('acepta lectura igual (vehículo detenido)', () =>
    expect(validateReading(100_000, d('2026-11-02'), prev, 1200).status).toBe('accepted'));
  it('marca "a validar" un salto improbable', () => {
    const r = validateReading(103_000, d('2026-11-02T08:00:00Z'), prev, 1200);
    expect(r.status).toBe('flagged');
  });
  it('usa mínimo 1 día para no marcar lecturas del mismo día', () =>
    expect(validateReading(100_900, d('2026-11-01T10:00:00Z'), prev, 1200).status).toBe('accepted'));
});

describe('cambio de odómetro', () => {
  it('mantiene el kilometraje acumulado', () => {
    const offset = replacementOffset(250_000, 0);
    expect(accumulatedValue(1_500, offset)).toBe(251_500);
  });
  it('rechaza valores negativos', () => expect(() => replacementOffset(-1, 0)).toThrow());
});

describe('uso promedio diario', () => {
  const asOf = d('2026-11-30T00:00:00Z');
  it('calcula km/día en la ventana de 30 días', () => {
    const r = averageDailyUsage(
      [
        { value: 10_000, readAt: d('2026-11-10T00:00:00Z') },
        { value: 12_000, readAt: d('2026-11-20T00:00:00Z') },
        { value: 1_000, readAt: d('2026-01-01T00:00:00Z') },
      ],
      asOf,
    );
    expect(r).toBe(200);
  });
  it('null con menos de dos lecturas', () => expect(averageDailyUsage([prev], asOf)).toBeNull());
  it('null si las lecturas son del mismo instante', () =>
    expect(averageDailyUsage([{ value: 1, readAt: asOf }, { value: 2, readAt: asOf }], asOf)).toBeNull());
});
