import { z } from 'zod';
import { FAILURE_CONSEQUENCES, HOLD_REASONS, PRIORITIES, WORK_ORDER_TYPES } from '@cmms/shared';

const optStr = z.string().trim().min(1).nullable().optional();
const money = z.number().min(0).max(1_000_000_000);

export const CreateRequest = z.object({
  vehicleId: z.string().uuid(),
  description: z.string().trim().min(5, 'Describa la falla (mínimo 5 caracteres)'),
  systemCode: optStr,
  canOperate: z.enum(['yes', 'restricted', 'no']).default('yes'),
  source: z.enum(['driver', 'inspection', 'technician', 'roadside', 'accident']).default('driver'),
  odometer: z.coerce.number().int().min(0).optional(),
});

export const ReviewRequest = z.discriminatedUnion('decision', [
  z.object({
    decision: z.literal('approve'),
    type: z.enum(WORK_ORDER_TYPES).default('CP'),
    consequence: z.enum(FAILURE_CONSEQUENCES),
    priority: z.enum(PRIORITIES).optional(),
    description: optStr,
    workshopType: z.enum(['internal', 'external']).default('external'),
    supplierId: z.string().uuid().nullable().optional(),
  }),
  z.object({ decision: z.literal('merge'), workOrderId: z.string().uuid() }),
  z.object({ decision: z.literal('reject'), reason: z.string().trim().min(5, 'Indique el motivo del rechazo') }),
]);

export const CreateOrder = z.object({
  vehicleId: z.string().uuid(),
  type: z.enum(WORK_ORDER_TYPES),
  priority: z.enum(PRIORITIES).default('P3'),
  description: z.string().trim().min(5),
  workshopType: z.enum(['internal', 'external']).default('external'),
  supplierId: z.string().uuid().nullable().optional(),
  plannedStart: z.coerce.date().optional(),
  estimatedHours: z.number().min(0).max(1000).optional(),
  tasks: z.array(z.string().trim().min(2)).max(60).default([]),
});

export const UpdateOrder = z
  .object({
    priority: z.enum(PRIORITIES),
    description: z.string().trim().min(5),
    workshopType: z.enum(['internal', 'external']),
    supplierId: z.string().uuid().nullable(),
    estimatedHours: z.number().min(0).max(1000).nullable(),
  })
  .partial();

export const Schedule = z.object({ plannedStart: z.coerce.date(), plannedEnd: z.coerce.date().optional(), estimatedHours: z.number().min(0).max(1000).optional() });
export const Start = z.object({ odometerIn: z.number().int().min(0).optional() });
export const Hold = z.object({ reason: z.enum(HOLD_REASONS), comment: optStr });
export const Complete = z.object({ odometerOut: z.number().int().min(0).optional(), completionNotes: optStr });
export const Reason = z.object({ reason: z.string().trim().min(5, 'Indique el motivo') });

export const AddTask = z.object({ description: z.string().trim().min(2) });
export const UpdateTask = z.object({ status: z.enum(['pending', 'done', 'not_done', 'finding']), notDoneReason: optStr, comment: optStr });
export const AddLabor = z.object({ technicianId: z.string().uuid(), hours: z.number().positive().max(24), workDate: z.coerce.date().optional(), comment: optStr });
export const AddPart = z.object({ partId: z.string().uuid().nullable().optional(), description: z.string().trim().min(2), quantity: z.number().positive().max(10_000), unitCost: money, source: z.enum(['stock', 'direct_purchase']).default('direct_purchase') });
export const AddExternal = z.object({ supplierId: z.string().uuid().nullable().optional(), description: z.string().trim().min(2), invoiceNumber: optStr, amount: money });
export const AddFailure = z.object({
  componentCode: z.string().regex(/^[A-Z]{3}(\.[A-Z0-9]{2,4}){0,2}$/, 'Código de componente no válido'),
  failureMode: optStr,
  cause: optStr,
  action: optStr,
  comment: optStr,
});

export const OrderQuery = z.object({
  status: z.string().optional(), // lista separada por coma o "open"
  type: z.string().optional(),
  priority: z.string().optional(),
  site: z.string().optional(),
  vehicleId: z.string().uuid().optional(),
  q: z.string().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  take: z.coerce.number().int().min(1).max(500).default(200),
});

export const SupplierBody = z.object({ name: z.string().trim().min(2), taxId: optStr, kind: z.enum(['workshop', 'parts', 'dealer', 'tires', 'other']).default('workshop'), city: optStr, contact: optStr, phone: optStr, email: z.string().email().nullable().optional() });
export const TechnicianBody = z.object({ name: z.string().trim().min(3), level: z.enum(['N2', 'N3', 'N4']).default('N2'), hourlyCost: money.default(0), siteCode: optStr });
export const PartBody = z.object({ code: z.string().trim().min(2), description: z.string().trim().min(2), unit: z.string().default('UND'), referenceCost: money.nullable().optional(), componentCode: optStr });
