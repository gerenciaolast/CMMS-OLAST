/** Enumeraciones del dominio. Fuente: docs/03-catalogos-y-codificacion.md y docs/02-procesos.md */

export const WORK_ORDER_TYPES = ['PM', 'INS', 'PDM', 'CP', 'CE', 'AUX', 'SIN', 'MEJ', 'CAM'] as const;
export type WorkOrderType = (typeof WORK_ORDER_TYPES)[number];

/** Tipos de OT que cuentan como trabajo planificado (doc 03 §1). SIN se excluye del indicador. */
export const PLANNED_WORK_ORDER_TYPES: readonly WorkOrderType[] = ['PM', 'INS', 'PDM', 'CP', 'MEJ', 'CAM'];
/** Tipos de OT que exigen codificación de falla para pasar a TERMINADA (doc 02 P7). */
export const CORRECTIVE_WORK_ORDER_TYPES: readonly WorkOrderType[] = ['CP', 'CE', 'AUX'];

export const WORK_ORDER_STATUSES = [
  'planned',
  'scheduled',
  'in_progress',
  'on_hold',
  'completed',
  'closed',
  'cancelled',
] as const;
export type WorkOrderStatus = (typeof WORK_ORDER_STATUSES)[number];

export const PRIORITIES = ['P1', 'P2', 'P3', 'P4'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const CRITICALITIES = ['A', 'B', 'C'] as const;
export type Criticality = (typeof CRITICALITIES)[number];

export const FAILURE_CONSEQUENCES = ['safety_legal', 'stops_operation', 'degraded', 'no_impact'] as const;
export type FailureConsequence = (typeof FAILURE_CONSEQUENCES)[number];

export const VEHICLE_STATUSES = [
  'operational',
  'operational_restricted',
  'out_of_service_maintenance',
  'out_of_service_parts',
  'out_of_service_accident',
  'out_of_service_administrative',
  'reserve',
  'retired',
] as const;
export type VehicleStatus = (typeof VEHICLE_STATUSES)[number];

/** Estados que cuentan como NO disponible en el KPI de disponibilidad (doc 05 §1). */
export const UNAVAILABLE_FOR_AVAILABILITY: readonly VehicleStatus[] = [
  'out_of_service_maintenance',
  'out_of_service_parts',
];

export const METER_TYPES = ['odometer', 'hourmeter'] as const;
export type MeterType = (typeof METER_TYPES)[number];

export const METER_SOURCES = ['inspection', 'work_order', 'fuel', 'gps', 'manual'] as const;
export type MeterSource = (typeof METER_SOURCES)[number];

export const PM_SCHEDULE_STATUSES = ['ok', 'upcoming', 'due', 'overdue'] as const;
export type PmScheduleStatus = (typeof PM_SCHEDULE_STATUSES)[number];

export const HOLD_REASONS = [
  'REPUESTO',
  'PROVEEDOR',
  'APROBACION',
  'TECNICO',
  'VEHICULO',
  'DIAGNOSTICO',
  'GARANTIA',
] as const;
export type HoldReason = (typeof HOLD_REASONS)[number];
