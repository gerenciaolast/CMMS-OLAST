import { describe, expect, it } from 'vitest';
import { buildDowntimeBlocks, colombianHolidays, isNonWorkingDay, type DowntimeKind } from '../src';

const m = (entries: [string, DowntimeKind][]) => new Map(entries);
const range = (from: string, to: string, kind: DowntimeKind, skip: string[] = []) => {
  const out: [string, DowntimeKind][] = [];
  for (let d = new Date(`${from}T12:00:00Z`); d <= new Date(`${to}T12:00:00Z`); d = new Date(d.getTime() + 86_400_000)) {
    const s = d.toISOString().slice(0, 10);
    if (!skip.includes(s)) out.push([s, kind]);
  }
  return out;
};

describe('festivos de Colombia', () => {
  it('2026 completo (incluye los trasladados a lunes y los de Semana Santa)', () => {
    expect([...colombianHolidays(2026)].sort()).toEqual([
      '2026-01-01', '2026-01-12', '2026-03-23', '2026-04-02', '2026-04-03', '2026-05-01', '2026-05-18', '2026-06-08', '2026-06-15',
      '2026-06-29', '2026-07-20', '2026-08-07', '2026-08-17', '2026-10-12', '2026-11-02', '2026-11-16', '2026-12-08', '2026-12-25',
    ]);
  });
  it('domingos y festivos no son hábiles', () => {
    expect(isNonWorkingDay('2026-02-08')).toBe(true); // domingo
    expect(isNonWorkingDay('2026-03-23')).toBe(true); // San José trasladado
    expect(isNonWorkingDay('2026-03-24')).toBe(false);
  });
});

describe('paradas desde el cuadro diario', () => {
  it('un mes entero en el taller con los domingos en blanco es UNA parada', () => {
    const sundays = ['2026-02-01', '2026-02-08', '2026-02-15', '2026-02-22'];
    const b = buildDowntimeBlocks(m(range('2026-02-02', '2026-02-28', 'corrective', sundays)));
    expect(b).toEqual([{ start: '2026-02-02', end: '2026-02-28', days: 27, markedDays: 24, kind: 'corrective' }]);
  });
  it('domingo + lunes festivo en blanco no cortan la parada', () => {
    const b = buildDowntimeBlocks(m([['2026-03-21', 'corrective'], ['2026-03-24', 'corrective']]));
    expect(b).toHaveLength(1);
    expect(b[0]).toMatchObject({ days: 4, markedDays: 2 });
  });
  it('un día hábil sin marcar separa dos paradas', () => {
    const b = buildDowntimeBlocks(m([['2026-03-02', 'preventive'], ['2026-03-04', 'corrective']]));
    expect(b.map((x) => [x.start, x.kind])).toEqual([['2026-03-02', 'preventive'], ['2026-03-04', 'corrective']]);
  });
  it('preventivo dentro de una parada correctiva: la parada es correctiva', () => {
    const b = buildDowntimeBlocks(m([['2026-05-04', 'preventive'], ['2026-05-05', 'corrective'], ['2026-05-06', 'preventive']]));
    expect(b).toEqual([{ start: '2026-05-04', end: '2026-05-06', days: 3, markedDays: 3, kind: 'corrective' }]);
  });
  it('cruza el cambio de mes', () => {
    const b = buildDowntimeBlocks(m([['2026-04-30', 'corrective'], ['2026-05-02', 'corrective']])); // 1 de mayo festivo
    expect(b).toHaveLength(1);
  });
});
