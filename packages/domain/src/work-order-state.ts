import { CORRECTIVE_WORK_ORDER_TYPES, type WorkOrderStatus, type WorkOrderType } from '@cmms/shared';

/** Máquina de estados de la OT (doc 02 P7). */
export type WorkOrderAction =
  | 'schedule'
  | 'start'
  | 'hold'
  | 'resume'
  | 'complete'
  | 'reject_verification'
  | 'close'
  | 'cancel';

const TRANSITIONS: Record<WorkOrderAction, { from: WorkOrderStatus[]; to: WorkOrderStatus }> = {
  schedule: { from: ['planned'], to: 'scheduled' },
  start: { from: ['scheduled', 'planned'], to: 'in_progress' },
  hold: { from: ['in_progress'], to: 'on_hold' },
  resume: { from: ['on_hold'], to: 'in_progress' },
  complete: { from: ['in_progress'], to: 'completed' },
  reject_verification: { from: ['completed'], to: 'in_progress' },
  close: { from: ['completed'], to: 'closed' },
  cancel: { from: ['planned', 'scheduled'], to: 'cancelled' },
};

export interface WorkOrderSnapshot {
  type: WorkOrderType;
  status: WorkOrderStatus;
  hasCompleteFailureCoding: boolean;
  /** Tareas pendientes (ni hechas ni justificadas como no hechas). */
  pendingTasks: number;
}

export interface ActionContext {
  holdReason?: string;
  cancelReason?: string;
}

export class WorkOrderTransitionError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'WorkOrderTransitionError';
  }
}

export function requiresFailureCoding(type: WorkOrderType): boolean {
  return CORRECTIVE_WORK_ORDER_TYPES.includes(type);
}

export function availableActions(status: WorkOrderStatus): WorkOrderAction[] {
  return (Object.keys(TRANSITIONS) as WorkOrderAction[]).filter((a) => TRANSITIONS[a].from.includes(status));
}

/** Devuelve el nuevo estado o lanza WorkOrderTransitionError con un código y mensaje para el usuario. */
export function applyWorkOrderAction(
  wo: WorkOrderSnapshot,
  action: WorkOrderAction,
  ctx: ActionContext = {},
): WorkOrderStatus {
  const t = TRANSITIONS[action];
  if (!t.from.includes(wo.status)) {
    throw new WorkOrderTransitionError(
      'INVALID_TRANSITION',
      `No se puede ejecutar "${action}" sobre una OT en estado "${wo.status}"`,
    );
  }
  if (action === 'hold' && !ctx.holdReason) {
    throw new WorkOrderTransitionError('HOLD_REASON_REQUIRED', 'Indique el motivo de espera');
  }
  if (action === 'cancel' && !ctx.cancelReason?.trim()) {
    throw new WorkOrderTransitionError('CANCEL_REASON_REQUIRED', 'Indique el motivo de cancelación');
  }
  if (action === 'complete') {
    if (requiresFailureCoding(wo.type) && !wo.hasCompleteFailureCoding) {
      throw new WorkOrderTransitionError(
        'FAILURE_CODING_REQUIRED',
        'Una OT correctiva requiere codificación completa (componente, modo, causa y acción) para terminarse',
      );
    }
    if (wo.pendingTasks > 0) {
      throw new WorkOrderTransitionError(
        'PENDING_TASKS',
        'Hay tareas sin marcar como hechas o no hechas (con motivo)',
      );
    }
  }
  return t.to;
}
