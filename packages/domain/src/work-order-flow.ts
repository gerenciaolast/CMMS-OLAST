import type { VehicleStatus, WorkOrderStatus } from '@cmms/shared';

/**
 * Efectos de avisos y OT sobre el estado del vehículo (doc 02 P4, P7 y P8).
 * El estado del vehículo es la base del KPI de disponibilidad, por eso se automatiza.
 */

export type WorkOrderEventKind = 'start' | 'hold' | 'resume' | 'close' | 'cancel';
const PARTS_HOLDS = new Set(['REPUESTO', 'PROVEEDOR', 'GARANTIA']);
const MANAGED: VehicleStatus[] = ['out_of_service_maintenance', 'out_of_service_parts'];

/** Aviso nuevo: si el vehículo no puede operar queda fuera de servicio; si opera con restricción, se marca. */
export function vehicleStatusForRequest(canOperate: 'yes' | 'restricted' | 'no', current: VehicleStatus): VehicleStatus | null {
  if (current === 'retired' || current.startsWith('out_of_service')) return null;
  if (canOperate === 'no') return 'out_of_service_maintenance';
  if (canOperate === 'restricted' && current === 'operational') return 'operational_restricted';
  return null;
}

/**
 * Nuevo estado del vehículo tras un evento de la OT, o null si no cambia.
 * @param otherActiveOrders OT del mismo vehículo en ejecución o en espera (sin contar esta).
 */
export function vehicleStatusForWorkOrderEvent(
  current: VehicleStatus,
  event: WorkOrderEventKind,
  opts: { holdReason?: string; otherActiveOrders?: number } = {},
): VehicleStatus | null {
  if (current === 'retired') return null;
  switch (event) {
    case 'start':
      // Ingresa a taller. Siniestro y administrativo se respetan (tienen su propio indicador).
      return current === 'operational' || current === 'operational_restricted' || current === 'reserve' || current === 'out_of_service_parts'
        ? 'out_of_service_maintenance'
        : null;
    case 'hold':
      return current === 'out_of_service_maintenance' && PARTS_HOLDS.has(opts.holdReason ?? '') ? 'out_of_service_parts' : null;
    case 'resume':
      return current === 'out_of_service_parts' ? 'out_of_service_maintenance' : null;
    case 'close':
    case 'cancel':
      // Vuelve a operar solo si ninguna otra OT lo mantiene en taller.
      return MANAGED.includes(current) && (opts.otherActiveOrders ?? 0) === 0 ? 'operational' : null;
  }
}

export const ACTIVE_WORK_ORDER_STATUSES: WorkOrderStatus[] = ['in_progress', 'on_hold'];
export const OPEN_WORK_ORDER_STATUSES: WorkOrderStatus[] = ['planned', 'scheduled', 'in_progress', 'on_hold', 'completed'];

/** AV-2026-000123 / OT-2026-000123 */
export function formatDocumentNumber(series: 'AV' | 'OT', year: number, n: number): string {
  return `${series}-${year}-${String(n).padStart(6, '0')}`;
}

/** Totales en pesos con aritmética en centavos (sin errores de punto flotante). */
export function workOrderTotals(input: {
  labor: { hours: number; hourlyCost: number }[];
  parts: { quantity: number; unitCost: number }[];
  external: { amount: number }[];
}) {
  const c = (n: number) => Math.round(n * 100);
  const labor = input.labor.reduce((a, l) => a + Math.round(l.hours * c(l.hourlyCost)), 0);
  const parts = input.parts.reduce((a, p) => a + Math.round(p.quantity * c(p.unitCost)), 0);
  const external = input.external.reduce((a, e) => a + c(e.amount), 0);
  return { laborCost: labor / 100, partsCost: parts / 100, externalCost: external / 100, totalCost: (labor + parts + external) / 100 };
}

export interface FailureCoding {
  componentCode: string;
  failureMode?: string | null;
  cause?: string | null;
  action?: string | null;
}

/** Completa = al menos un registro con componente de nivel 3 (SIS.CON.COM), modo, causa y acción (doc 03 §4). */
export function isFailureCodingComplete(records: FailureCoding[]): boolean {
  return records.length > 0 && records.every((r) => r.componentCode.split('.').length === 3 && !!r.failureMode && !!r.cause && !!r.action);
}
