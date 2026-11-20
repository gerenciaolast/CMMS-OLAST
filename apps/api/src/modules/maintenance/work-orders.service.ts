import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma, WorkOrderStatus } from '@prisma/client';
import {
  ACTIVE_WORK_ORDER_STATUSES,
  OPEN_WORK_ORDER_STATUSES,
  applyWorkOrderAction,
  availableActions,
  findReworkOrigin,
  isFailureCodingComplete,
  requiresFailureCoding,
  vehicleStatusForWorkOrderEvent,
  workOrderTotals,
  WorkOrderTransitionError,
  type WorkOrderAction,
} from '@cmms/domain';
import type { WorkOrderType } from '@cmms/shared';
import { PrismaService } from '../../common/prisma.service';
import { AppError } from '../../common/errors';
import { AuthUser, siteScope } from '../../common/auth.decorators';
import { nextDocumentNumber } from '../../common/counters';
import { setVehicleStatus } from '../../common/vehicle-status';
import { VehiclesService } from '../vehicles/vehicles.service';

const EDITABLE: WorkOrderStatus[] = ['planned', 'scheduled', 'in_progress', 'on_hold', 'completed'];
const ACTION_LABEL: Record<string, string> = {
  create: 'OT creada', schedule: 'Programada', start: 'Iniciada', hold: 'En espera', resume: 'Reanudada', complete: 'Terminada',
  reject_verification: 'Verificación rechazada (retrabajo)', close: 'Cerrada y verificada', cancel: 'Cancelada',
};

const LIST_SELECT = {
  id: true, number: true, type: true, priority: true, status: true, description: true, workshopType: true, isRework: true, isHistorical: true,
  plannedStart: true, actualStart: true, actualEnd: true, closedAt: true, createdAt: true, totalCost: true, estimatedHours: true, odometerIn: true,
  vehicle: { select: { id: true, plate: true, criticality: true, status: true, vehicleModel: { select: { model: true } } } },
  supplier: { select: { id: true, name: true } },
  _count: { select: { requests: true } },
} satisfies Prisma.WorkOrderSelect;

const DETAIL_INCLUDE = {
  vehicle: { select: { id: true, plate: true, criticality: true, status: true, currentOdometer: true, attributes: true, site: { select: { code: true, name: true } }, vehicleModel: { select: { make: true, model: true } } } },
  supplier: true,
  requests: { select: { id: true, number: true, description: true, canOperate: true, reportedAt: true, photos: { select: { id: true } } } },
  tasks: { orderBy: { sequence: 'asc' } },
  labor: { include: { technician: { select: { id: true, name: true } } }, orderBy: { workDate: 'asc' } },
  parts: true,
  externalServices: { include: { supplier: { select: { id: true, name: true } } } },
  holds: { orderBy: { startedAt: 'asc' } },
  failures: true,
  events: { orderBy: { createdAt: 'asc' } },
  tireChanges: true,
  reworkOf: { select: { id: true, number: true } },
} satisfies Prisma.WorkOrderInclude;

export interface CreateOrderInput {
  vehicleId: string;
  type: WorkOrderType;
  priority: string;
  description: string;
  workshopType: 'internal' | 'external';
  supplierId?: string | null;
  plannedStart?: Date;
  estimatedHours?: number;
  tasks: string[];
  origin?: 'request' | 'manual' | 'pm' | 'campaign';
  requestIds?: string[];
}

@Injectable()
export class WorkOrdersService {
  constructor(private readonly prisma: PrismaService, private readonly vehicles: VehiclesService) {}

  private async scoped(user: AuthUser, id: string) {
    const wo = await this.prisma.workOrder.findFirst({ where: { id, organizationId: user.organizationId, vehicle: siteScope(user) } });
    if (!wo) throw new AppError('NOT_FOUND', 'Orden de trabajo no encontrada', HttpStatus.NOT_FOUND);
    return wo;
  }

  private editable(wo: { status: WorkOrderStatus; number: string }) {
    if (!EDITABLE.includes(wo.status)) throw new AppError('LOCKED', `La OT ${wo.number} está ${wo.status === 'closed' ? 'cerrada' : 'cancelada'} y no se puede modificar`, HttpStatus.CONFLICT);
  }

  async create(user: AuthUser, b: CreateOrderInput) {
    const v = await this.vehicles.findScoped(user, b.vehicleId);
    if (v.status === 'retired') throw new AppError('RETIRED', 'El vehículo está dado de baja', HttpStatus.UNPROCESSABLE_ENTITY);
    if (b.workshopType === 'external' && b.supplierId) await this.prisma.supplier.findFirstOrThrow({ where: { id: b.supplierId, organizationId: user.organizationId } });
    return this.prisma.$transaction(async (tx) => {
      const number = await nextDocumentNumber(tx, user.organizationId, 'OT');
      const wo = await tx.workOrder.create({
        data: {
          organizationId: user.organizationId, number, vehicleId: v.id, siteId: v.siteId, type: b.type, priority: b.priority, description: b.description,
          workshopType: b.workshopType, supplierId: b.supplierId ?? null, plannedStart: b.plannedStart ?? null,
          estimatedHours: b.estimatedHours ?? null, origin: b.origin ?? 'manual', createdById: user.id,
          tasks: { create: b.tasks.map((description, i) => ({ description, sequence: (i + 1) * 10 })) },
          events: { create: { action: 'create', toStatus: 'planned', userId: user.id, comment: b.origin === 'request' ? 'Desde aviso' : null } },
        },
      });
      if (b.requestIds?.length) await tx.workRequest.updateMany({ where: { id: { in: b.requestIds } }, data: { workOrderId: wo.id } });
      return wo;
    });
  }

  async list(user: AuthUser, q: { status?: string; type?: string; priority?: string; site?: string; vehicleId?: string; q?: string; from?: Date; to?: Date; take: number }) {
    const statuses = !q.status || q.status === 'open' ? OPEN_WORK_ORDER_STATUSES : q.status === 'all' ? undefined : (q.status.split(',') as WorkOrderStatus[]);
    const term = q.q?.trim();
    return this.prisma.workOrder.findMany({
      where: {
        organizationId: user.organizationId,
        vehicle: { ...siteScope(user), ...(q.site ? { site: { code: q.site } } : {}) },
        ...(statuses ? { status: { in: statuses } } : {}),
        ...(q.type ? { type: { in: q.type.split(',') } } : {}),
        ...(q.priority ? { priority: { in: q.priority.split(',') } } : {}),
        ...(q.vehicleId ? { vehicleId: q.vehicleId } : {}),
        ...(q.from || q.to ? { createdAt: { gte: q.from, lte: q.to } } : {}),
        ...(term ? { OR: [{ number: { contains: term, mode: 'insensitive' } }, { description: { contains: term, mode: 'insensitive' } }, { vehicle: { plate: { contains: term.toUpperCase() } } }] } : {}),
      },
      select: LIST_SELECT,
      // Abiertas: por prioridad y antigüedad (backlog). Cerradas / todas: más recientes primero.
      orderBy: !q.status || q.status === 'open' ? [{ priority: 'asc' }, { createdAt: 'asc' }] : [{ closedAt: { sort: 'desc', nulls: 'first' } }, { createdAt: 'desc' }],
      take: q.take,
    });
  }

  async detail(user: AuthUser, id: string) {
    await this.scoped(user, id);
    const wo = await this.prisma.workOrder.findUniqueOrThrow({ where: { id }, include: DETAIL_INCLUDE });
    return {
      ...wo,
      actions: availableActions(wo.status),
      codingRequired: requiresFailureCoding(wo.type as WorkOrderType),
      codingComplete: isFailureCodingComplete(wo.failures),
      pendingTasks: wo.tasks.filter((t) => t.status === 'pending').length,
    };
  }

  async update(user: AuthUser, id: string, b: Partial<{ priority: string; description: string; workshopType: string; supplierId: string | null; estimatedHours: number | null }>) {
    const wo = await this.scoped(user, id);
    this.editable(wo);
    return this.prisma.workOrder.update({ where: { id }, data: b });
  }

  /** Ejecuta una transición de la máquina de estados (doc 02 P7) con sus efectos en el vehículo. */
  async transition(
    user: AuthUser,
    id: string,
    action: WorkOrderAction,
    b: { plannedStart?: Date; plannedEnd?: Date; estimatedHours?: number; odometerIn?: number; odometerOut?: number; reason?: string; comment?: string | null; completionNotes?: string | null } = {},
  ) {
    const wo = await this.prisma.workOrder.findUniqueOrThrow({ where: { id: (await this.scoped(user, id)).id }, include: { failures: true, tasks: true, vehicle: true } });
    let next: WorkOrderStatus;
    try {
      next = applyWorkOrderAction(
        { type: wo.type as WorkOrderType, status: wo.status, hasCompleteFailureCoding: isFailureCodingComplete(wo.failures), pendingTasks: wo.tasks.filter((t) => t.status === 'pending').length },
        action,
        { holdReason: action === 'hold' ? b.reason : undefined, cancelReason: action === 'cancel' ? b.reason : undefined },
      ) as WorkOrderStatus;
    } catch (e) {
      if (e instanceof WorkOrderTransitionError) throw new AppError(e.code, e.message, HttpStatus.UNPROCESSABLE_ENTITY);
      throw e;
    }
    if (action === 'schedule' && !b.plannedStart) throw new AppError('PLANNED_START_REQUIRED', 'Indique la fecha programada');

    // Lecturas de odómetro al ingreso / salida (validadas por P2; si no se aceptan no bloquean la OT).
    const odo = action === 'start' ? b.odometerIn : action === 'complete' ? b.odometerOut : undefined;
    if (odo != null && (wo.vehicle.currentOdometer == null || odo > wo.vehicle.currentOdometer)) {
      await this.vehicles.recordReading(user, wo.vehicleId, { value: odo, meterType: 'odometer', source: 'work_order' }).catch(() => null);
    }

    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const data: Prisma.WorkOrderUpdateInput = { status: next };
      if (action === 'schedule') Object.assign(data, { plannedStart: b.plannedStart, plannedEnd: b.plannedEnd ?? null, estimatedHours: b.estimatedHours ?? wo.estimatedHours });
      if (action === 'start') Object.assign(data, { actualStart: wo.actualStart ?? now, odometerIn: b.odometerIn ?? wo.odometerIn ?? wo.vehicle.currentOdometer });
      if (action === 'complete') {
        Object.assign(data, { actualEnd: now, odometerOut: b.odometerOut ?? wo.odometerOut ?? wo.vehicle.currentOdometer, completionNotes: b.completionNotes ?? wo.completionNotes });
        // Retrabajo: mismo vehículo + mismo componente dentro de 30 días o 3.000 km (doc 02 P7).
        const codes = wo.failures.map((f) => f.componentCode);
        if (codes.length) {
          const history = await tx.workOrder.findMany({
            where: { vehicleId: wo.vehicleId, status: 'closed', id: { not: wo.id }, failures: { some: { componentCode: { in: codes } } } },
            select: { id: true, closedAt: true, odometerOut: true, failures: { select: { componentCode: true } } },
          });
          const origin = findReworkOrigin(
            { vehicleId: wo.vehicleId, componentCodes: codes, openedAt: wo.createdAt, odometer: wo.odometerIn ?? wo.vehicle.currentOdometer ?? 0 },
            history.filter((h) => h.closedAt).map((h) => ({ workOrderId: h.id, vehicleId: wo.vehicleId, componentCodes: h.failures.map((f) => f.componentCode), closedAt: h.closedAt!, odometerOut: h.odometerOut ?? Number.MAX_SAFE_INTEGER })),
          );
          Object.assign(data, { isRework: !!origin, reworkOfId: origin });
        }
      }
      if (action === 'close') Object.assign(data, { closedAt: now, closedById: user.id });
      if (action === 'cancel') Object.assign(data, { cancelReason: b.reason });

      if (action === 'hold') await tx.workOrderHold.create({ data: { workOrderId: id, reason: b.reason!, comment: b.comment ?? null, startedAt: now } });
      if (action === 'resume') await tx.workOrderHold.updateMany({ where: { workOrderId: id, endedAt: null }, data: { endedAt: now } });

      const updated = await tx.workOrder.update({ where: { id }, data, select: { id: true, number: true, status: true, isRework: true, reworkOfId: true } });
      await tx.workOrderEvent.create({ data: { workOrderId: id, action, fromStatus: wo.status, toStatus: next, comment: b.reason ?? b.comment ?? null, userId: user.id } });

      // Efecto en el estado del vehículo (doc 02 P8).
      const kind = action === 'start' ? 'start' : action === 'hold' ? 'hold' : action === 'resume' ? 'resume' : action === 'close' ? 'close' : action === 'cancel' ? 'cancel' : null;
      if (kind) {
        const others = await tx.workOrder.count({ where: { vehicleId: wo.vehicleId, id: { not: id }, status: { in: ACTIVE_WORK_ORDER_STATUSES } } });
        const vehicle = await tx.vehicle.findUniqueOrThrow({ where: { id: wo.vehicleId } });
        const nextStatus = vehicleStatusForWorkOrderEvent(vehicle.status, kind, { holdReason: b.reason, otherActiveOrders: others });
        if (nextStatus) await setVehicleStatus(tx, wo.vehicleId, nextStatus, { reason: `${wo.number}: ${ACTION_LABEL[action]}`, userId: user.id, workOrderId: id, at: now });
      }
      return updated;
    });
  }

  private async recompute(tx: Prisma.TransactionClient, id: string) {
    const [labor, parts, external] = await Promise.all([
      tx.workOrderLabor.findMany({ where: { workOrderId: id } }),
      tx.workOrderPart.findMany({ where: { workOrderId: id } }),
      tx.workOrderExternalService.findMany({ where: { workOrderId: id } }),
    ]);
    const t = workOrderTotals({
      labor: labor.map((l) => ({ hours: Number(l.hours), hourlyCost: Number(l.hourlyCost) })),
      parts: parts.map((p) => ({ quantity: Number(p.quantity), unitCost: Number(p.unitCost) })),
      external: external.map((e) => ({ amount: Number(e.amount) })),
    });
    await tx.workOrder.update({ where: { id }, data: t });
    return t;
  }

  /** Agrega una línea (tarea, mano de obra, repuesto, servicio externo o codificación) y recalcula totales. */
  async addLine(user: AuthUser, id: string, kind: 'task' | 'labor' | 'part' | 'external' | 'failure', b: Record<string, unknown>) {
    const wo = await this.scoped(user, id);
    this.editable(wo);
    return this.prisma.$transaction(async (tx) => {
      let line: unknown;
      if (kind === 'task') {
        const max = await tx.workOrderTask.aggregate({ where: { workOrderId: id }, _max: { sequence: true } });
        line = await tx.workOrderTask.create({ data: { workOrderId: id, description: String(b.description), sequence: (max._max.sequence ?? 0) + 10 } });
      } else if (kind === 'labor') {
        const tech = await tx.technician.findFirst({ where: { id: String(b.technicianId), organizationId: user.organizationId, active: true } });
        if (!tech) throw new AppError('UNKNOWN_TECHNICIAN', 'Técnico no encontrado');
        const hours = Number(b.hours);
        line = await tx.workOrderLabor.create({
          data: { workOrderId: id, technicianId: tech.id, hours, hourlyCost: tech.hourlyCost, cost: Math.round(hours * Number(tech.hourlyCost) * 100) / 100, workDate: (b.workDate as Date) ?? new Date(), comment: (b.comment as string) ?? null },
        });
      } else if (kind === 'part') {
        const q = Number(b.quantity);
        const u = Number(b.unitCost);
        line = await tx.workOrderPart.create({
          data: { workOrderId: id, partId: (b.partId as string) ?? null, description: String(b.description), quantity: q, unitCost: u, totalCost: Math.round(q * u * 100) / 100, source: String(b.source ?? 'direct_purchase') },
        });
      } else if (kind === 'external') {
        line = await tx.workOrderExternalService.create({
          data: { workOrderId: id, supplierId: (b.supplierId as string) ?? wo.supplierId, description: String(b.description), invoiceNumber: (b.invoiceNumber as string) ?? null, amount: Number(b.amount) },
        });
      } else {
        const code = String(b.componentCode);
        const exists = await tx.componentCode.findUnique({ where: { code } });
        if (!exists) throw new AppError('UNKNOWN_COMPONENT', `Componente desconocido: ${code}`);
        for (const [field, model] of [['failureMode', 'failureMode'], ['cause', 'failureCause'], ['action', 'repairAction']] as const) {
          const v = b[field] as string | undefined;
          if (v && !(await (tx[model] as unknown as { findUnique: (a: object) => Promise<unknown> }).findUnique({ where: { code: v } })))
            throw new AppError('UNKNOWN_CODE', `Código no válido en ${field}: ${v}`);
        }
        line = await tx.failureRecord.create({
          data: { workOrderId: id, componentCode: code, failureMode: (b.failureMode as string) ?? null, cause: (b.cause as string) ?? null, action: (b.action as string) ?? null, comment: (b.comment as string) ?? null },
        });
      }
      const totals = ['labor', 'part', 'external'].includes(kind) ? await this.recompute(tx, id) : null;
      return { line, totals };
    });
  }

  async removeLine(user: AuthUser, id: string, kind: 'task' | 'labor' | 'part' | 'external' | 'failure', lineId: string) {
    const wo = await this.scoped(user, id);
    this.editable(wo);
    const model = { task: 'workOrderTask', labor: 'workOrderLabor', part: 'workOrderPart', external: 'workOrderExternalService', failure: 'failureRecord' }[kind];
    return this.prisma.$transaction(async (tx) => {
      const del = await (tx[model as 'workOrderTask'] as unknown as { deleteMany: (a: object) => Promise<{ count: number }> }).deleteMany({ where: { id: lineId, workOrderId: id } });
      if (!del.count) throw new AppError('NOT_FOUND', 'Línea no encontrada', HttpStatus.NOT_FOUND);
      return { totals: ['labor', 'part', 'external'].includes(kind) ? await this.recompute(tx, id) : null };
    });
  }

  async updateTask(user: AuthUser, id: string, taskId: string, b: { status: string; notDoneReason?: string | null; comment?: string | null }) {
    const wo = await this.scoped(user, id);
    this.editable(wo);
    if (b.status === 'not_done' && !b.notDoneReason) throw new AppError('REASON_REQUIRED', 'Indique por qué no se hizo la tarea');
    const r = await this.prisma.workOrderTask.updateMany({ where: { id: taskId, workOrderId: id }, data: { status: b.status, notDoneReason: b.notDoneReason ?? null, comment: b.comment ?? null } });
    if (!r.count) throw new AppError('NOT_FOUND', 'Tarea no encontrada', HttpStatus.NOT_FOUND);
    return this.prisma.workOrderTask.findUniqueOrThrow({ where: { id: taskId } });
  }

  /** Resumen del backlog para el tablero del planificador. */
  async summary(user: AuthUser) {
    const where = { organizationId: user.organizationId, vehicle: siteScope(user) };
    const [byStatus, byPriority, pendingRequests] = await Promise.all([
      this.prisma.workOrder.groupBy({ by: ['status'], where: { ...where, status: { in: OPEN_WORK_ORDER_STATUSES } }, _count: true, _sum: { estimatedHours: true } }),
      this.prisma.workOrder.groupBy({ by: ['priority'], where: { ...where, status: { in: OPEN_WORK_ORDER_STATUSES } }, _count: true }),
      this.prisma.workRequest.count({ where: { organizationId: user.organizationId, status: { in: ['new', 'in_review'] }, vehicle: siteScope(user) } }),
    ]);
    return {
      byStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count])),
      byPriority: Object.fromEntries(byPriority.map((p) => [p.priority, p._count])),
      backlogHours: byStatus.reduce((a, s) => a + Number(s._sum.estimatedHours ?? 0), 0),
      pendingRequests,
    };
  }
}
