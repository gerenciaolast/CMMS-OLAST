import { describe, expect, it } from 'vitest';
import { kpi } from '../src';

const d = (s: string) => new Date(`${s}T00:00:00Z`);

describe('indicadores (doc 05)', () => {
  it('disponibilidad: 1 vehículo, 3 de 30 días en taller → 90 %', () => {
    const r = kpi.fleetAvailability(
      [
        { vehicleId: 'V1', status: 'operational', startedAt: d('2026-10-01'), endedAt: d('2026-11-10') },
        { vehicleId: 'V1', status: 'out_of_service_maintenance', startedAt: d('2026-11-10'), endedAt: d('2026-11-13') },
        { vehicleId: 'V1', status: 'operational', startedAt: d('2026-11-13'), endedAt: null },
      ],
      d('2026-11-01'),
      d('2026-12-01'),
    );
    expect(r).toBeCloseTo(0.9, 6);
  });
  it('disponibilidad: siniestro no resta y baja se excluye', () => {
    const r = kpi.fleetAvailability(
      [
        { vehicleId: 'V1', status: 'out_of_service_accident', startedAt: d('2026-11-01'), endedAt: null },
        { vehicleId: 'V2', status: 'retired', startedAt: d('2026-11-01'), endedAt: null },
      ],
      d('2026-11-01'),
      d('2026-11-02'),
    );
    expect(r).toBe(1);
  });
  it('disponibilidad sin datos → null', () => expect(kpi.fleetAvailability([], d('2026-11-01'), d('2026-11-02'))).toBeNull());
  it('cumplimiento PM', () =>
    expect(kpi.pmCompliance([{ result: 'on_time' }, { result: 'early' }, { result: 'late' }, { result: 'not_done' }])).toBe(0.5));
  it('% planificado excluye siniestros', () =>
    expect(kpi.plannedPercentage([{ type: 'PM', weight: 8 }, { type: 'CE', weight: 2 }, { type: 'SIN', weight: 50 }])).toBe(0.8));
  it('MTBF excluye accidentes', () => expect(kpi.mtbf(30_000, [{ cause: 'DNO' }, { cause: 'ACC' }, { cause: null }])).toBe(15_000));
  it('MTTR en horas', () =>
    expect(kpi.mttrHours([
      { actualStart: new Date('2026-11-01T08:00:00Z'), actualEnd: new Date('2026-11-01T12:00:00Z') },
      { actualStart: new Date('2026-11-02T08:00:00Z'), actualEnd: new Date('2026-11-02T10:00:00Z') },
    ])).toBe(3));
  it('costo por km, backlog y porcentaje', () => {
    expect(kpi.costPerKm(500_000, 1_000)).toBe(500);
    expect(kpi.backlogWeeks(120, 40)).toBe(3);
    expect(kpi.percentage(0, 0)).toBeNull();
  });
});

describe('indicadores · Sprint 5', () => {
  const p = (s: string, km: number) => ({ at: d(s), km });
  it('km del periodo: interpola entre lecturas y no extrapola', () => {
    const pts = [p('2026-01-01', 10_000), p('2026-03-02', 16_000)]; // 100 km/día
    expect(kpi.distanceInPeriod(pts, d('2026-01-01'), d('2026-02-01'))).toBe(3_100);
    expect(kpi.distanceInPeriod(pts, d('2025-06-01'), d('2026-01-01'))).toBe(0);
    expect(kpi.distanceInPeriod(pts, d('2026-03-01'), d('2026-12-01'))).toBe(100);
    expect(kpi.distanceInPeriod([p('2026-01-01', 1)], d('2026-01-01'), d('2026-12-01'))).toBe(0);
  });
  it('km del periodo: ignora lecturas que retroceden', () => {
    expect(kpi.distanceInPeriod([p('2026-01-01', 10_000), p('2026-01-15', 9_000), p('2026-02-01', 11_000)], d('2026-01-01'), d('2026-02-01'))).toBe(1_000);
  });
  it('cumplimiento PM por intervalo real (+10 %)', () => {
    const r = kpi.pmIntervalResults([p('2026-01-01', 0), p('2026-02-01', 6_500), p('2026-03-01', 13_200), p('2026-03-01', 13_200)], 6_000);
    expect(r.map((x) => [x.gapKm, x.onTime])).toEqual([[6_500, true], [6_700, false]]);
  });
  it('SLA por prioridad', () => {
    expect(kpi.withinSla(d('2026-01-01'), d('2026-01-02'), 24)).toBe(true);
    expect(kpi.withinSla(d('2026-01-01'), d('2026-01-03'), 24)).toBe(false);
  });
  it('Pareto: orden, acumulado y pocos vitales', () => {
    const r = kpi.pareto([{ key: 'FRN', value: 50 }, { key: 'MOT', value: 30 }, { key: 'ILU', value: 15 }, { key: 'NEU', value: 5 }, { key: 'X', value: 0 }]);
    expect(r.map((x) => x.key)).toEqual(['FRN', 'MOT', 'ILU', 'NEU']);
    expect(r.map((x) => x.vital)).toEqual([true, true, false, false]);
    expect(r[1]!.cumulative).toBeCloseTo(0.8);
  });
  it('semáforo', () => {
    expect(kpi.kpiLight(0.96, 0.95, 'higher')).toBe('ok');
    expect(kpi.kpiLight(0.9, 0.95, 'higher')).toBe('warn');
    expect(kpi.kpiLight(0.5, 0.95, 'higher')).toBe('bad');
    expect(kpi.kpiLight(0.02, 0.03, 'lower')).toBe('ok');
    expect(kpi.kpiLight(0.1, 0.03, 'lower')).toBe('bad');
    expect(kpi.kpiLight(3, [2, 4], 'range')).toBe('ok');
    expect(kpi.kpiLight(null, 0.9, 'higher')).toBeNull();
  });
});
