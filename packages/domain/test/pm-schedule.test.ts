import { describe, expect, it } from 'vitest';
import {
  computePmSchedule,
  shouldGenerateWorkOrder,
  classifyPmExecution,
  resolveRoutinesToExecute,
  routinesResetByCompletion,
} from '../src';

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const base = { lastDoneAt: d('2026-01-01'), lastDoneMeter: 100_000 };
const rule = { intervalDistance: 10_000, intervalDays: 180 };

describe('vencimiento PM: lo que ocurra primero (doc 02 P5)', () => {
  it('al día', () => {
    const r = computePmSchedule(rule, base, { asOf: d('2026-02-01'), meter: 105_000 });
    expect(r.status).toBe('ok');
    expect(r.nextDueMeter).toBe(110_000);
    expect(r.nextDueDate?.toISOString().slice(0, 10)).toBe('2026-06-30');
  });
  it('próximo al 80 %', () =>
    expect(computePmSchedule(rule, base, { asOf: d('2026-02-01'), meter: 108_000 }).status).toBe('upcoming'));
  it('genera OT al 90 %', () =>
    expect(computePmSchedule(rule, base, { asOf: d('2026-02-01'), meter: 109_000 }).status).toBe('due'));
  it('entre 100 % y 100 % + tolerancia sigue "due"', () =>
    expect(computePmSchedule(rule, base, { asOf: d('2026-02-01'), meter: 110_900 }).status).toBe('due'));
  it('vencido por encima de la tolerancia', () =>
    expect(computePmSchedule(rule, base, { asOf: d('2026-02-01'), meter: 111_001 }).status).toBe('overdue'));
  it('gana el tiempo si se cumple antes que los km', () => {
    const r = computePmSchedule(rule, base, { asOf: d('2026-06-20'), meter: 102_000 });
    expect(r.drivingDimension).toBe('days');
    expect(r.status).toBe('due');
  });
  it('gana el km si se cumple antes que el tiempo', () => {
    const r = computePmSchedule(rule, base, { asOf: d('2026-01-20'), meter: 109_500 });
    expect(r.drivingDimension).toBe('distance');
  });
  it('proyecta la fecha con el uso diario', () => {
    const r = computePmSchedule(rule, base, { asOf: d('2026-02-01'), meter: 105_000, avgDailyUsage: 250 });
    expect(r.projectedDueDate?.toISOString().slice(0, 10)).toBe('2026-02-21');
  });
  it('sin uso diario, la proyección es la fecha por tiempo', () => {
    const r = computePmSchedule(rule, base, { asOf: d('2026-02-01'), meter: 105_000 });
    expect(r.projectedDueDate?.toISOString().slice(0, 10)).toBe('2026-06-30');
  });
  it('soporta horómetro (maquinaria)', () => {
    const r = computePmSchedule(
      { intervalHours: 250 },
      { ...base, lastDoneHours: 1_000 },
      { asOf: d('2026-02-01'), meter: 0, hours: 1_240, avgDailyHours: 8 },
    );
    expect(r.drivingDimension).toBe('hours');
    expect(r.status).toBe('due');
    expect(r.nextDueHours).toBe(1_250);
    expect(r.projectedDueDate).not.toBeNull();
  });
  it('rutina sin intervalos es un error', () =>
    expect(() => computePmSchedule({}, base, { asOf: d('2026-02-01'), meter: 1 })).toThrow(RangeError));
  it('rutina solo por horas sin lecturas de horas es un error', () =>
    expect(() => computePmSchedule({ intervalHours: 250 }, base, { asOf: d('2026-02-01'), meter: 1 })).toThrow());
  it('respeta umbrales configurados', () =>
    expect(
      computePmSchedule({ ...rule, generateAtPct: 0.95 }, base, { asOf: d('2026-02-01'), meter: 109_000 }).status,
    ).toBe('upcoming'));
});

describe('generación automática de OT', () => {
  const due = computePmSchedule(rule, base, { asOf: d('2026-02-01'), meter: 109_500 });
  it('genera si está vencida y no hay OT abierta', () => expect(shouldGenerateWorkOrder(due, false)).toBe(true));
  it('no duplica si ya hay OT abierta', () => expect(shouldGenerateWorkOrder(due, true)).toBe(false));
  it('no genera si está al día', () =>
    expect(shouldGenerateWorkOrder(computePmSchedule(rule, base, { asOf: d('2026-02-01'), meter: 101_000 }), false)).toBe(false));
});

describe('cumplimiento de PM ejecutado', () => {
  it('a tiempo dentro de ±10 %', () => expect(classifyPmExecution(rule, base, d('2026-03-01'), 110_500)).toBe('on_time'));
  it('tarde por encima de +10 %', () => expect(classifyPmExecution(rule, base, d('2026-03-01'), 111_500)).toBe('late'));
  it('temprano por debajo de −10 %', () => expect(classifyPmExecution(rule, base, d('2026-03-01'), 105_000)).toBe('early'));
});

describe('rutinas anidadas (servicio C incluye A y B)', () => {
  const routines = [
    { id: 'A', includes: [] },
    { id: 'B', includes: ['A'] },
    { id: 'C', includes: ['B'] },
  ];
  it('si vencen A, B y C, solo se ejecuta C', () => expect(resolveRoutinesToExecute(['A', 'B', 'C'], routines)).toEqual(['C']));
  it('si vence solo A, se ejecuta A', () => expect(resolveRoutinesToExecute(['A'], routines)).toEqual(['A']));
  it('cerrar C reinicia C, B y A', () => expect(routinesResetByCompletion('C', routines).sort()).toEqual(['A', 'B', 'C']));
  it('tolera ciclos en la configuración', () =>
    expect(routinesResetByCompletion('X', [{ id: 'X', includes: ['Y'] }, { id: 'Y', includes: ['X'] }]).sort()).toEqual(['X', 'Y']));
});
