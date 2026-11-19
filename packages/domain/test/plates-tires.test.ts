import { describe, expect, it } from 'vitest';
import { canonicalPlate, plateFormatIssue, requiresTechnicalInspection, tirePositions, validateTireChange, TireRuleError } from '../src';

const code = (fn: () => unknown) => {
  try { fn(); } catch (e) { return (e as TireRuleError).code; }
  return null;
};

describe('placas', () => {
  it('motocarro: corrige letras-primero al formato 123ABC', () => {
    expect(canonicalPlate('AFB591', 'MCA')).toBe('591AFB');
    expect(canonicalPlate('591-afb', 'MCA')).toBe('591AFB');
  });
  it('no toca placas de otros tipos', () => {
    expect(canonicalPlate('woo 579', 'CAR')).toBe('WOO579');
    expect(canonicalPlate('ABC123', null)).toBe('ABC123');
  });
  it('valida el formato por tipo', () => {
    expect(plateFormatIssue('WOO579', 'CAR')).toBeNull();
    expect(plateFormatIssue('591AFB', 'MCA')).toBeNull();
    expect(plateFormatIssue('ABC12D', 'MOT')).toBeNull();
    expect(plateFormatIssue('AFB591', 'MCA')).toContain('123ABC');
    expect(plateFormatIssue('591AFB', 'CAR')).toContain('ABC123');
  });
  it('motocarro: técnico-mecánica desde los 2 años', () => {
    const today = new Date('2026-11-19T00:00:00Z');
    expect(requiresTechnicalInspection({ year: 2025, serviceType: 'PARTICULAR', vehicleTypeCode: 'MCA' }, today)).toBe(false);
    expect(requiresTechnicalInspection({ year: 2024, serviceType: 'PARTICULAR', vehicleTypeCode: 'MCA' }, today)).toBe(true);
  });
});

describe('llantas', () => {
  const nkr = { frontQty: 2, rearQty: 4 };
  it('posiciones según configuración', () => {
    expect(tirePositions(nkr, 'front')).toEqual(['DEL-IZQ', 'DEL-DER']);
    expect(tirePositions(nkr, 'rear')).toHaveLength(4);
    expect(tirePositions({ rearQty: 8 }, 'rear')).toHaveLength(8);
    expect(tirePositions({ rearQty: 2 }, 'rear')).toEqual(['TRAS-IZQ', 'TRAS-DER']);
    expect(tirePositions({ rearQty: 1 }, 'rear')).toEqual(['TRAS']);
    expect(tirePositions({ frontQty: 1 }, 'front')).toEqual(['DEL']);
    expect(tirePositions({}, 'spare')).toEqual(['REPUESTO']);
    expect(tirePositions({ spareQty: 2 }, 'spare')).toEqual(['REPUESTO', 'REPUESTO-2']);
  });
  it('desgaste de las 4 traseras: válido', () => {
    expect(() => validateTireChange({ axle: 'rear', quantity: 4, reason: 'wear' }, nkr)).not.toThrow();
  });
  it('daño en la vía de una llanta con posición', () => {
    expect(() => validateTireChange({ axle: 'front', quantity: 1, reason: 'road_damage', positions: ['DEL-DER'] }, nkr)).not.toThrow();
  });
  it('robo del repuesto exige descripción', () => {
    expect(code(() => validateTireChange({ axle: 'spare', quantity: 1, reason: 'theft' }, nkr))).toBe('NOTES_REQUIRED');
    expect(() => validateTireChange({ axle: 'spare', quantity: 1, reason: 'theft', notes: 'Robada en parqueadero, denuncia 123' }, nkr)).not.toThrow();
  });
  it('rechaza más llantas de las que tiene el eje', () => {
    expect(code(() => validateTireChange({ axle: 'front', quantity: 3, reason: 'wear' }, nkr))).toBe('TOO_MANY_TIRES');
  });
  it('rechaza cantidad cero', () => expect(code(() => validateTireChange({ axle: 'rear', quantity: 0, reason: 'wear' }, nkr))).toBe('INVALID_QUANTITY'));
  it('valida posiciones', () => {
    expect(code(() => validateTireChange({ axle: 'front', quantity: 1, reason: 'wear', positions: ['TRAS-IZQ-EXT'] }, nkr))).toBe('INVALID_POSITION');
    expect(code(() => validateTireChange({ axle: 'front', quantity: 2, reason: 'wear', positions: ['DEL-IZQ', 'DEL-IZQ'] }, nkr))).toBe('DUPLICATE_POSITION');
    expect(code(() => validateTireChange({ axle: 'front', quantity: 2, reason: 'wear', positions: ['DEL-IZQ'] }, nkr))).toBe('POSITIONS_MISMATCH');
  });
  it('la rotación no aplica al repuesto', () =>
    expect(code(() => validateTireChange({ axle: 'spare', quantity: 1, reason: 'rotation' }, nkr))).toBe('INVALID_ROTATION'));
});
