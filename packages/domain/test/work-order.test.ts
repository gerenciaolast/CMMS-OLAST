import { describe, expect, it } from 'vitest';
import { applyWorkOrderAction, availableActions, requiresFailureCoding, WorkOrderTransitionError, findReworkOrigin } from '../src';
import type { WorkOrderSnapshot } from '../src';

const wo = (over: Partial<WorkOrderSnapshot> = {}): WorkOrderSnapshot => ({
  type: 'CE', status: 'in_progress', hasCompleteFailureCoding: true, pendingTasks: 0, ...over,
});
const code = (fn: () => unknown) => {
  try { fn(); } catch (e) { return (e as WorkOrderTransitionError).code; }
  return null;
};

describe('máquina de estados de OT (doc 02 P7)', () => {
  it('flujo completo', () => {
    expect(applyWorkOrderAction(wo({ status: 'planned' }), 'schedule')).toBe('scheduled');
    expect(applyWorkOrderAction(wo({ status: 'scheduled' }), 'start')).toBe('in_progress');
    expect(applyWorkOrderAction(wo(), 'hold', { holdReason: 'REPUESTO' })).toBe('on_hold');
    expect(applyWorkOrderAction(wo({ status: 'on_hold' }), 'resume')).toBe('in_progress');
    expect(applyWorkOrderAction(wo(), 'complete')).toBe('completed');
    expect(applyWorkOrderAction(wo({ status: 'completed' }), 'close')).toBe('closed');
  });
  it('verificación rechazada vuelve a ejecución (retrabajo)', () =>
    expect(applyWorkOrderAction(wo({ status: 'completed' }), 'reject_verification')).toBe('in_progress'));
  it('no se puede cerrar una OT en ejecución', () => expect(code(() => applyWorkOrderAction(wo(), 'close'))).toBe('INVALID_TRANSITION'));
  it('no se puede cancelar una OT en ejecución', () =>
    expect(code(() => applyWorkOrderAction(wo(), 'cancel', { cancelReason: 'x' }))).toBe('INVALID_TRANSITION'));
  it('la espera exige motivo', () => expect(code(() => applyWorkOrderAction(wo(), 'hold'))).toBe('HOLD_REASON_REQUIRED'));
  it('la cancelación exige motivo', () =>
    expect(code(() => applyWorkOrderAction(wo({ status: 'planned' }), 'cancel', { cancelReason: ' ' }))).toBe('CANCEL_REASON_REQUIRED'));
  it('cancelar con motivo', () =>
    expect(applyWorkOrderAction(wo({ status: 'planned' }), 'cancel', { cancelReason: 'Vehículo vendido' })).toBe('cancelled'));
  it('correctiva sin codificación no puede terminarse', () =>
    expect(code(() => applyWorkOrderAction(wo({ hasCompleteFailureCoding: false }), 'complete'))).toBe('FAILURE_CODING_REQUIRED'));
  it('preventiva no exige codificación', () =>
    expect(applyWorkOrderAction(wo({ type: 'PM', hasCompleteFailureCoding: false }), 'complete')).toBe('completed'));
  it('tareas pendientes impiden terminar', () =>
    expect(code(() => applyWorkOrderAction(wo({ type: 'PM', pendingTasks: 2 }), 'complete'))).toBe('PENDING_TASKS'));
  it('acciones disponibles por estado', () => {
    expect(availableActions('in_progress').sort()).toEqual(['complete', 'hold']);
    expect(availableActions('closed')).toEqual([]);
  });
  it('tipos que requieren codificación', () => {
    expect(requiresFailureCoding('CP')).toBe(true);
    expect(requiresFailureCoding('AUX')).toBe(true);
    expect(requiresFailureCoding('PM')).toBe(false);
    expect(requiresFailureCoding('SIN')).toBe(false);
  });
});

describe('retrabajo: 30 días o 3 000 km', () => {
  const hist = [{ workOrderId: 'OT-1', vehicleId: 'V1', componentCodes: ['FRN.FRI.BAN'], closedAt: new Date('2026-01-01'), odometerOut: 100_000 }];
  const cur = { vehicleId: 'V1', componentCodes: ['FRN.FRI.BAN'], openedAt: new Date('2026-01-31'), odometer: 105_000 };
  it('día 30 es retrabajo', () => expect(findReworkOrigin(cur, hist)).toBe('OT-1'));
  it('día 31 con más de 3 000 km no es retrabajo', () =>
    expect(findReworkOrigin({ ...cur, openedAt: new Date('2026-02-01') }, hist)).toBeNull());
  it('día 60 pero solo 2 500 km es retrabajo', () =>
    expect(findReworkOrigin({ ...cur, openedAt: new Date('2026-03-02'), odometer: 102_500 }, hist)).toBe('OT-1'));
  it('otro componente no es retrabajo', () => expect(findReworkOrigin({ ...cur, componentCodes: ['MOT.LUB.ACE'] }, hist)).toBeNull());
  it('otro vehículo no es retrabajo', () => expect(findReworkOrigin({ ...cur, vehicleId: 'V2' }, hist)).toBeNull());
  it('elige la OT más reciente', () =>
    expect(findReworkOrigin(cur, [...hist, { ...hist[0]!, workOrderId: 'OT-2', closedAt: new Date('2026-01-15') }])).toBe('OT-2'));
});
