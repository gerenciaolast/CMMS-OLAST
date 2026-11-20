import { Prisma, VehicleStatus } from '@prisma/client';

/** Cambia el estado del vehículo cerrando el registro vigente del historial (doc 02 P8). */
export async function setVehicleStatus(
  tx: Prisma.TransactionClient,
  vehicleId: string,
  status: VehicleStatus,
  ctx: { reason: string; userId?: string | null; source?: 'manual' | 'auto' | 'import'; workOrderId?: string | null; at?: Date },
) {
  const at = ctx.at ?? new Date();
  await tx.vehicleStatusLog.updateMany({ where: { vehicleId, endedAt: null }, data: { endedAt: at } });
  await tx.vehicleStatusLog.create({
    data: { vehicleId, status, reason: ctx.reason, startedAt: at, userId: ctx.userId ?? null, source: ctx.source ?? 'auto', workOrderId: ctx.workOrderId ?? null },
  });
  await tx.vehicle.update({
    where: { id: vehicleId },
    data: { status, statusReason: ctx.reason, ...(status === 'retired' ? { retiredAt: at, retirementReason: ctx.reason } : {}) },
  });
}
