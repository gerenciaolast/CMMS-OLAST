import { describe, expect, it } from 'vitest';
import {
  missingVehicleFields,
  vehicleCompleteness,
  requiresTechnicalInspection,
  validateStatusChange,
  normalizePlate,
  VehicleRuleError,
  type VehicleRecord,
} from '../src';

const today = new Date('2026-11-19T00:00:00Z');
const full: VehicleRecord = {
  plate: 'WOO579', vin: '9GDNKR77XMB000001', year: 2021, serviceType: 'PUBLICO', vehicleTypeCode: 'CAR',
  criticality: 'B', currentOdometer: 362_333, loadCapacityKg: 2800, documentsWithExpiry: ['SOAT', 'RTM'],
};
const code = (fn: () => unknown) => {
  try { fn(); } catch (e) { return (e as VehicleRuleError).code; }
  return null;
};

describe('ficha del vehículo (doc 02 P1)', () => {
  it('completa: sin pendientes y 100 %', () => {
    expect(missingVehicleFields(full, today)).toEqual([]);
    expect(vehicleCompleteness(full, today)).toBe(100);
  });
  it('importada solo con datos del inventario: lista lo pendiente', () => {
    const v: VehicleRecord = { plate: 'PUM402', year: 2026, serviceType: 'PUBLICO', vehicleTypeCode: 'CPE', loadCapacityKg: 16200, documentsWithExpiry: [] };
    const fields = missingVehicleFields(v, today).map((m) => m.field);
    expect(fields).toEqual(['currentOdometer', 'criticality', 'doc.SOAT', 'vin']);
    expect(vehicleCompleteness(v, today)).toBe(33);
  });
  it('los pendientes críticos van primero', () => {
    const m = missingVehicleFields({ plate: 'X', documentsWithExpiry: [] }, today);
    const firstNonCritical = m.findIndex((x) => !x.critical);
    expect(m.slice(firstNonCritical).every((x) => !x.critical)).toBe(true);
  });
  it('motocicleta: no pide capacidad de carga', () => {
    const m = missingVehicleFields({ ...full, vehicleTypeCode: 'MOT', loadCapacityKg: null, year: 2025, serviceType: 'PARTICULAR' }, today);
    expect(m).toEqual([]);
  });
  it('maquinaria pide horómetro', () => {
    const m = missingVehicleFields({ ...full, primaryMeter: 'hourmeter', currentHourmeter: null }, today);
    expect(m[0]?.label).toBe('Horómetro actual');
  });
});

describe('revisión técnico-mecánica', () => {
  it('público desde 2 años', () => {
    expect(requiresTechnicalInspection({ year: 2025, serviceType: 'PUBLICO' }, today)).toBe(false);
    expect(requiresTechnicalInspection({ year: 2024, serviceType: 'PUBLICO' }, today)).toBe(true);
  });
  it('particular desde 6 años; moto desde 2', () => {
    expect(requiresTechnicalInspection({ year: 2021, serviceType: 'PARTICULAR' }, today)).toBe(false);
    expect(requiresTechnicalInspection({ year: 2020, serviceType: 'PARTICULAR' }, today)).toBe(true);
    expect(requiresTechnicalInspection({ year: 2024, serviceType: 'PARTICULAR', vehicleTypeCode: 'MOT' }, today)).toBe(true);
  });
  it('sin año no se exime', () => expect(requiresTechnicalInspection({}, today)).toBe(true));
});

describe('cambio de estado (doc 02 P8)', () => {
  const ok = { reason: 'Ingreso a taller', criticality: 'B' as const, hasReading: true };
  it('permitido con motivo', () => expect(() => validateStatusChange('operational', 'out_of_service_maintenance', ok)).not.toThrow());
  it('exige motivo', () => expect(code(() => validateStatusChange('operational', 'reserve', { ...ok, reason: ' ' }))).toBe('REASON_REQUIRED'));
  it('mismo estado', () => expect(code(() => validateStatusChange('reserve', 'reserve', ok))).toBe('SAME_STATUS'));
  it('baja es definitiva', () => expect(code(() => validateStatusChange('retired', 'operational', ok))).toBe('RETIRED'));
  it('para operar exige criticidad y lectura', () => {
    expect(code(() => validateStatusChange('reserve', 'operational', { ...ok, criticality: null }))).toBe('INCOMPLETE_FOR_OPERATION');
    expect(code(() => validateStatusChange('reserve', 'operational_restricted', { ...ok, hasReading: false }))).toBe('INCOMPLETE_FOR_OPERATION');
  });
});

describe('placas', () => {
  it('normaliza espacios, guiones y minúsculas', () => {
    expect(normalizePlate('L JW938')).toBe('LJW938');
    expect(normalizePlate('woo-579')).toBe('WOO579');
  });
});
