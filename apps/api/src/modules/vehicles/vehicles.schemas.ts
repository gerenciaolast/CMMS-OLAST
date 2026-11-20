import { z } from 'zod';
import { VEHICLE_STATUSES } from '@cmms/shared';
import { normalizePlate } from '@cmms/domain';

const optStr = z.string().trim().min(1).nullable().optional();
const optDate = z.coerce.date().nullable().optional();
const score = z.union([z.literal(1), z.literal(2), z.literal(3)]);

export const TireSpec = z.object({
  frontSize: z.string().nullable().optional(),
  frontQty: z.number().int().min(0).max(4).nullable().optional(),
  rearSize: z.string().nullable().optional(),
  rearQty: z.number().int().min(0).max(16).nullable().optional(),
  brand: z.string().nullable().optional(),
  loadIndex: z.number().int().nullable().optional(),
});

const base = {
  siteCode: z.string(),
  vehicleModelId: z.string().uuid(),
  internalCode: optStr,
  vin: optStr,
  engineNumber: optStr,
  year: z.number().int().min(1980).max(2100).nullable().optional(),
  color: optStr,
  serviceType: z.enum(['PUBLICO', 'PARTICULAR']).nullable().optional(),
  registrationCity: optStr,
  ownership: z.enum(['own', 'leasing', 'rental', 'third_party']).optional(),
  titleHolder: optStr,
  loadCapacityKg: z.number().int().min(0).nullable().optional(),
  acquisitionDate: optDate,
  inServiceDate: optDate,
  costCenter: optStr,
  notes: z.string().nullable().optional(),
  tires: TireSpec.optional(),
};

export const CreateVehicle = z.object({
  plate: z.string().transform(normalizePlate).pipe(z.string().min(5, 'Placa inválida').max(8, 'Placa inválida')),
  ...base,
  /** Lectura inicial (doc 02 P1). */
  initialOdometer: z.number().int().min(0).optional(),
  status: z.enum(VEHICLE_STATUSES).optional(),
});
export type CreateVehicle = z.infer<typeof CreateVehicle>;

/** La sede no se cambia aquí: los traslados van por POST /vehicles/:id/transfer para conservar el historial. */
const { siteCode: _siteCode, ...editable } = base;
export const UpdateVehicle = z.object({ ...editable, vehicleModelId: base.vehicleModelId.optional() }).partial().strict();
export type UpdateVehicle = z.infer<typeof UpdateVehicle>;

export const SetCriticality = z.object({ operationalImpact: score, safety: score, repairCost: score, usage: score });

export const ChangeStatus = z.object({ status: z.enum(VEHICLE_STATUSES), reason: z.string() });

export const RecordReading = z.object({
  value: z.number().int().min(0),
  meterType: z.enum(['odometer', 'hourmeter']).default('odometer'),
  readAt: z.coerce.date().optional(),
  source: z.enum(['inspection', 'work_order', 'fuel', 'gps', 'manual', 'import']).default('manual'),
});

export const MeterReplacementBody = z.object({
  meterType: z.enum(['odometer', 'hourmeter']).default('odometer'),
  oldFinalValue: z.number().int().min(0),
  newInitialValue: z.number().int().min(0),
  replacedAt: z.coerce.date().optional(),
  reason: z.string().min(3),
});

export const UpsertDocument = z.object({
  number: optStr,
  issuer: optStr,
  issuedAt: optDate,
  expiresAt: optDate,
  notes: z.string().nullable().optional(),
});

export const CreateModel = z.object({
  vehicleTypeCode: z.string(),
  make: z.string().trim().min(2),
  model: z.string().trim().min(1),
  fuelType: optStr,
});

export const ListQuery = z.object({
  site: z.string().optional(),
  status: z.enum(VEHICLE_STATUSES).optional(),
  type: z.string().optional(),
  q: z.string().optional(),
  incomplete: z.enum(['true', 'false']).optional(),
  includeRetired: z.enum(['true', 'false']).optional(),
});

export const Transfer = z.object({ siteCode: z.string(), reason: z.string().trim().min(3, 'Indique el motivo del traslado'), effectiveAt: z.coerce.date().optional() });

export const SetDrivers = z.object({ driverIds: z.array(z.string().uuid()).max(10), primaryDriverId: z.string().uuid().nullable().optional() });

export const TireChangeBody = z.object({
  axle: z.enum(['front', 'rear', 'spare']),
  quantity: z.number().int(),
  reason: z.enum(['wear', 'road_damage', 'theft', 'rotation', 'other', 'unknown']),
  positions: z.array(z.string()).optional(),
  changedAt: z.coerce.date().optional(),
  odometer: z.number().int().min(0).nullable().optional(),
  tireSize: optStr,
  tireBrand: optStr,
  unitCost: z.number().min(0).nullable().optional(),
  supplier: optStr,
  notes: z.string().nullable().optional(),
  workOrderId: z.string().uuid().nullable().optional(),
});

export const DriverBody = z.object({
  fullName: z.string().trim().min(3),
  documentId: optStr,
  phone: optStr,
  email: z.string().email().nullable().optional(),
  licenseNumber: optStr,
  licenseCategory: optStr,
  licenseExpiry: optDate,
  siteCode: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  active: z.boolean().optional(),
});
