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
