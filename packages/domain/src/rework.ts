/** Detección de retrabajo (doc 02 P7): mismo vehículo + mismo componente dentro de 30 días o 3 000 km. */
export interface ClosedRepair {
  workOrderId: string;
  vehicleId: string;
  componentCodes: string[];
  closedAt: Date;
  odometerOut: number;
}

export interface NewRepair {
  vehicleId: string;
  componentCodes: string[];
  openedAt: Date;
  odometer: number;
}

export const REWORK_WINDOW = { days: 30, distance: 3000 } as const;
const DAY_MS = 86_400_000;

/** Devuelve la OT original de la que esta es retrabajo (la más reciente), o null. */
export function findReworkOrigin(
  current: NewRepair,
  history: ClosedRepair[],
  window: { days: number; distance: number } = REWORK_WINDOW,
): string | null {
  const codes = new Set(current.componentCodes);
  const matches = history
    .filter((h) => h.vehicleId === current.vehicleId)
    .filter((h) => h.componentCodes.some((c) => codes.has(c)))
    .filter((h) => {
      const days = (current.openedAt.getTime() - h.closedAt.getTime()) / DAY_MS;
      const km = current.odometer - h.odometerOut;
      return days >= 0 && (days <= window.days || (km >= 0 && km <= window.distance));
    })
    .sort((a, b) => b.closedAt.getTime() - a.closedAt.getTime());
  return matches[0]?.workOrderId ?? null;
}
