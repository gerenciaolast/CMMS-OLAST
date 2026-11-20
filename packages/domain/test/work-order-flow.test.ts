import { describe, expect, it } from 'vitest';
import { vehicleStatusForRequest, vehicleStatusForWorkOrderEvent as ev, formatDocumentNumber, workOrderTotals, isFailureCodingComplete } from '../src';

describe('aviso → estado del vehículo', () => {
  it('no puede operar → fuera de servicio', () => expect(vehicleStatusForRequest('no', 'operational')).toBe('out_of_service_maintenance'));
  it('con restricción → operativo con restricción', () => expect(vehicleStatusForRequest('restricted', 'operational')).toBe('operational_restricted'));
  it('puede operar → sin cambio', () => expect(vehicleStatusForRequest('yes', 'operational')).toBeNull());
  it('ya fuera de servicio o de baja → sin cambio', () => {
    expect(vehicleStatusForRequest('no', 'out_of_service_accident')).toBeNull();
    expect(vehicleStatusForRequest('no', 'retired')).toBeNull();
  });
});

describe('OT → estado del vehículo (doc 02 P8)', () => {
  it('iniciar OT lleva el vehículo a taller', () => {
    expect(ev('operational', 'start')).toBe('out_of_service_maintenance');
    expect(ev('operational_restricted', 'start')).toBe('out_of_service_maintenance');
    expect(ev('out_of_service_maintenance', 'start')).toBeNull();
  });
  it('respeta siniestro y administrativo', () => {
    expect(ev('out_of_service_accident', 'start')).toBeNull();
    expect(ev('out_of_service_accident', 'close')).toBeNull();
  });
  it('espera por repuesto/proveedor/garantía → espera repuesto; otras esperas no', () => {
    expect(ev('out_of_service_maintenance', 'hold', { holdReason: 'REPUESTO' })).toBe('out_of_service_parts');
    expect(ev('out_of_service_maintenance', 'hold', { holdReason: 'GARANTIA' })).toBe('out_of_service_parts');
    expect(ev('out_of_service_maintenance', 'hold', { holdReason: 'APROBACION' })).toBeNull();
  });
  it('reanudar vuelve a mantenimiento', () => expect(ev('out_of_service_parts', 'resume')).toBe('out_of_service_maintenance'));
  it('cerrar devuelve a operación si no hay otra OT activa', () => {
    expect(ev('out_of_service_maintenance', 'close')).toBe('operational');
    expect(ev('out_of_service_maintenance', 'close', { otherActiveOrders: 1 })).toBeNull();
    expect(ev('operational', 'close')).toBeNull();
  });
  it('vehículo de baja no cambia', () => expect(ev('retired', 'start')).toBeNull());
});

describe('numeración y costos', () => {
  it('formato correlativo', () => {
    expect(formatDocumentNumber('OT', 2026, 123)).toBe('OT-2026-000123');
    expect(formatDocumentNumber('AV', 2027, 1)).toBe('AV-2027-000001');
  });
  it('totales sin errores de redondeo', () => {
    const t = workOrderTotals({
      labor: [{ hours: 1.5, hourlyCost: 25_000.1 }],
      parts: [{ quantity: 3, unitCost: 0.1 }, { quantity: 2, unitCost: 45_900 }],
      external: [{ amount: 1_082_366.33 }],
    });
    expect(t).toEqual({ laborCost: 37_500.15, partsCost: 91_800.3, externalCost: 1_082_366.33, totalCost: 1_211_666.78 });
  });
});

describe('codificación de falla completa (doc 03 §4)', () => {
  it('exige nivel 3, modo, causa y acción en cada registro', () => {
    expect(isFailureCodingComplete([])).toBe(false);
    expect(isFailureCodingComplete([{ componentCode: 'FRN.FRI.BAN', failureMode: 'DES', cause: 'DNO', action: 'REE' }])).toBe(true);
    expect(isFailureCodingComplete([{ componentCode: 'FRN.FRI', failureMode: 'DES', cause: 'DNO', action: 'REE' }])).toBe(false);
    expect(isFailureCodingComplete([
      { componentCode: 'FRN.FRI.BAN', failureMode: 'DES', cause: 'DNO', action: 'REE' },
      { componentCode: 'RUE.ROD.ROD', failureMode: 'DES', cause: null, action: 'REE' },
    ])).toBe(false);
  });
});
