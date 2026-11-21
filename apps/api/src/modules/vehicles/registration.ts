import { z } from 'zod';
import type { Prisma, PrismaClient } from '@prisma/client';
import { normalizePlate } from '@cmms/domain';

/**
 * Licencia de tránsito (tarjeta de propiedad) del vehículo.
 * Los datos que ya tienen columna en la ficha (VIN, motor, modelo, color, servicio, titular, propiedad, capacidad)
 * se guardan ahí; el resto de la tarjeta queda en `attributes.registration`.
 */
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha AAAA-MM-DD').nullable().optional();
const text = (max = 80) => z.string().trim().max(max).nullable().optional();

export const Registration = z.object({
  licenseNumber: text(20),
  cardNumber: text(20),
  make: text(40),
  line: text(60),
  year: z.number().int().min(1950).max(2100).nullable().optional(),
  displacementCc: z.number().int().min(0).max(30_000).nullable().optional(),
  color: text(40),
  serviceType: z.enum(['PUBLICO', 'PARTICULAR', 'OFICIAL', 'DIPLOMATICO']).nullable().optional(),
  vehicleClass: text(40),
  bodyType: text(40),
  fuel: text(30),
  capacity: text(20),
  engineNumber: text(40),
  vin: text(17),
  serialNumber: text(40),
  chassisNumber: text(40),
  ownerName: text(120),
  ownerId: text(40),
  powerHp: z.number().int().min(0).max(2000).nullable().optional(),
  importDeclaration: text(30),
  importDate: day,
  doors: z.number().int().min(0).max(9).nullable().optional(),
  ownershipLimitation: text(120),
  armor: text(40),
  registeredAt: day,
  issuedAt: day,
  authority: text(80),
  /** Lo que no se pudo leer o se debe verificar contra la tarjeta física. */
  reviewNotes: z.array(z.string().max(300)).max(10).optional(),
});
export type RegistrationInput = z.infer<typeof Registration>;
export type RegistrationData = RegistrationInput & { updatedAt: string };

const LEASING_HOLDER = /\b(BANCO|BANCOLOMBIA|LEASING|FINANCIERA|DAVIVIENDA|BBVA|ITA[UÚ]|OCCIDENTE|POPULAR|AV VILLAS|SUFI)\b/i;

/** Propiedad según el titular de la licencia: entidad financiera ⇒ leasing; si no, propio. */
export function ownershipFromHolder(holder: string | null | undefined): 'own' | 'leasing' | null {
  if (!holder) return null;
  return LEASING_HOLDER.test(holder) ? 'leasing' : 'own';
}

/** Carga útil en kg desde «CAPACIDAD Kg/PSJ» (en motocarros es número de pasajeros y no aplica). */
function capacityKg(capacity: string | null | undefined, vehicleClass: string | null | undefined): number | null {
  if (!capacity || /MOTO/i.test(vehicleClass ?? '')) return null;
  const n = Number(capacity.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) && n >= 50 ? Math.round(n) : null;
}

export interface RegistrationChange { field: string; from: unknown; to: unknown }

/** Aplica la licencia a un vehículo. Devuelve los cambios en las columnas de la ficha (dryRun no guarda). */
export async function applyRegistration(prisma: PrismaClient | Prisma.TransactionClient, vehicleId: string, r: RegistrationInput, opts: { dryRun?: boolean } = {}) {
  const v = await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicleId } });
  const next = {
    vin: r.vin ?? undefined,
    engineNumber: r.engineNumber ?? undefined,
    year: r.year ?? undefined,
    color: r.color ?? undefined,
    serviceType: r.serviceType ?? undefined,
    titleHolder: r.ownerName ?? undefined,
    ownership: ownershipFromHolder(r.ownerName) ?? undefined,
    loadCapacityKg: capacityKg(r.capacity, r.vehicleClass) ?? undefined,
  };
  const changes: RegistrationChange[] = [];
  for (const [k, val] of Object.entries(next)) {
    if (val === undefined) continue;
    const cur = (v as Record<string, unknown>)[k];
    if (cur !== val) changes.push({ field: k, from: cur ?? null, to: val });
  }
  const attrs = (v.attributes ?? {}) as Record<string, unknown>;
  const prev = attrs.registration as RegistrationData | undefined;
  const registration: RegistrationData = { ...r, updatedAt: new Date().toISOString() };
  if (prev?.engineNumber && r.engineNumber && prev.engineNumber !== r.engineNumber)
    registration.reviewNotes = [...(r.reviewNotes ?? []), `Cambio de número de motor: antes ${prev.engineNumber}`];
  if (!opts.dryRun) {
    const data: Prisma.VehicleUpdateInput = { attributes: { ...attrs, registration } as Prisma.InputJsonValue };
    for (const c of changes) (data as Record<string, unknown>)[c.field] = c.to;
    await prisma.vehicle.update({ where: { id: vehicleId }, data });
  }
  return { plate: v.plate, changes, registration };
}

/** Busca el vehículo por placa (con o sin espacios). */
export async function vehicleByPlate(prisma: PrismaClient, organizationId: string, plate: string) {
  const p = normalizePlate(plate);
  return prisma.vehicle.findFirst({ where: { organizationId, plate: p }, select: { id: true, plate: true } });
}
