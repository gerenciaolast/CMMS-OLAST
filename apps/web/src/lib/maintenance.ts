export type WoStatus = 'planned' | 'scheduled' | 'in_progress' | 'on_hold' | 'completed' | 'closed' | 'cancelled';

export const WO_STATUS_LABEL: Record<WoStatus, string> = {
  planned: 'Planificada', scheduled: 'Programada', in_progress: 'En ejecución', on_hold: 'En espera',
  completed: 'Terminada (por verificar)', closed: 'Cerrada', cancelled: 'Cancelada',
};
export const WO_STATUS_TONE: Record<WoStatus, string> = {
  planned: 'border-line bg-canvas text-ink', scheduled: 'border-sky/60 bg-sky/25 text-brand-800', in_progress: 'border-brand/40 bg-brand/10 text-brand',
  on_hold: 'border-warn/40 bg-warn/10 text-warn', completed: 'border-ok/40 bg-ok/10 text-ok', closed: 'border-line bg-line/60 text-muted', cancelled: 'border-line text-muted line-through',
};
export const WO_TYPE_LABEL: Record<string, string> = {
  PM: 'Preventivo', INS: 'Inspección', PDM: 'Predictivo', CP: 'Correctivo planificado', CE: 'Correctivo de emergencia',
  AUX: 'Auxilio vial', SIN: 'Siniestro', MEJ: 'Mejora', CAM: 'Campaña',
};
export const PRIORITY_TONE: Record<string, string> = {
  P1: 'bg-danger text-white border-danger', P2: 'bg-warn text-white border-warn', P3: 'bg-brand-600 text-white border-brand-600', P4: 'bg-line text-muted border-line',
};
export const PRIORITY_LABEL: Record<string, string> = { P1: 'P1 Emergencia', P2: 'P2 Urgente', P3: 'P3 Normal', P4: 'P4 Oportunidad' };
export const HOLD_LABEL: Record<string, string> = {
  REPUESTO: 'Repuesto', PROVEEDOR: 'Proveedor / taller externo', APROBACION: 'Aprobación de presupuesto', TECNICO: 'Sin técnico disponible',
  VEHICULO: 'Operaciones no libera el vehículo', DIAGNOSTICO: 'Diagnóstico especializado', GARANTIA: 'Garantía',
};
export const CONSEQUENCE_LABEL: Record<string, string> = {
  safety_legal: 'Seguridad / legal (no puede operar)', stops_operation: 'Detiene la operación', degraded: 'Opera con restricción / degrada', no_impact: 'Sin impacto inmediato',
};
export const CAN_OPERATE_LABEL: Record<string, string> = { yes: 'Puede operar', restricted: 'Opera con restricción', no: 'No puede operar' };
export const REQUEST_STATUS_LABEL: Record<string, string> = { new: 'Nuevo', in_review: 'En revisión', approved: 'Aprobado', rejected: 'Rechazado', merged: 'Agrupado' };
export const ACTION_LABEL: Record<string, string> = {
  create: 'OT creada', schedule: 'Programada', start: 'Iniciada', hold: 'En espera', resume: 'Reanudada', complete: 'Terminada',
  reject_verification: 'Verificación rechazada', close: 'Cerrada y verificada', cancel: 'Cancelada', merge_request: 'Aviso agrupado', import: 'Importada del historial',
};

export interface WorkOrderRow {
  id: string; number: string; type: string; priority: string; status: WoStatus; description: string; workshopType: string;
  isRework: boolean; isHistorical: boolean; plannedStart: string | null; actualStart: string | null; actualEnd: string | null; closedAt: string | null;
  createdAt: string; totalCost: string; estimatedHours: string | null; odometerIn: number | null;
  vehicle: { id: string; plate: string; criticality: string | null; status: string; vehicleModel: { model: string } };
  supplier: { id: string; name: string } | null;
  _count: { requests: number };
}

export interface WorkRequestRow {
  id: string; number: string; description: string; systemCode: string | null; canOperate: 'yes' | 'restricted' | 'no'; consequence: string | null;
  priority: string | null; status: string; rejectionReason: string | null; reportedAt: string; odometer: number | null; source: string;
  vehicle: { id: string; plate: string; criticality: string | null; status: string; site: { code: string; name: string }; vehicleModel: { make: string; model: string } };
  photos: { id: string }[];
  workOrder: { id: string; number: string; status: WoStatus } | null;
}

export const PM_STATUS_LABEL: Record<string, string> = { ok: 'Al día', upcoming: 'Próximo', due: 'Vence ya', overdue: 'Vencido' };
export const PM_STATUS_TONE: Record<string, string> = {
  ok: 'border-ok/30 text-ok', upcoming: 'border-sky/60 bg-sky/20 text-brand-800', due: 'border-warn/40 bg-warn/10 text-warn', overdue: 'border-danger/40 bg-danger/10 text-danger',
};

export interface PmScheduleRow {
  id: string; status: string; pctConsumed: string; nextDueMeter: number | null; nextDueDate: string | null; projectedDueDate: string | null;
  drivingDimension: string | null; lastDoneAt: string; lastDoneMeter: number; baselineEstimated: boolean; openWorkOrderId: string | null;
  routine: { id: string; code: string; name: string; intervalDistance: number | null; intervalDays: number | null; plan?: { code: string; name: string } };
  vehicle?: { id: string; plate: string; currentOdometer: number | null; lastReadingAt: string | null; criticality: string | null; site: { code: string; name: string }; vehicleModel: { model: string } };
}

export interface PmPlan {
  id: string; code: string; name: string; description: string | null; basis: string | null; _count: { vehicles: number };
  routines: { id: string; code: string; name: string; intervalDistance: number | null; intervalDays: number | null; includes: string[]; estimatedHours: string | null;
    tasks: { id: string; description: string; componentCode: string | null; rationale: string | null }[] }[];
}
