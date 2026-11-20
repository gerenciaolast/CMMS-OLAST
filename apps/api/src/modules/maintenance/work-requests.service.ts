import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { suggestPriority, vehicleStatusForRequest, OPEN_WORK_ORDER_STATUSES } from '@cmms/domain';
import type { Criticality, FailureConsequence, Priority } from '@cmms/shared';
import { PrismaService } from '../../common/prisma.service';
import { AppError } from '../../common/errors';
import { AuthUser, siteScope } from '../../common/auth.decorators';
import { nextDocumentNumber } from '../../common/counters';
import { setVehicleStatus } from '../../common/vehicle-status';
import { StorageService } from '../../common/storage';
import { VehiclesService } from '../vehicles/vehicles.service';
import { WorkOrdersService } from './work-orders.service';
import type { z } from 'zod';
import type { CreateRequest, ReviewRequest } from './maintenance.schemas';

const CONSEQUENCE_FROM_OPERATION: Record<'yes' | 'restricted' | 'no', FailureConsequence> = { no: 'stops_operation', restricted: 'degraded', yes: 'no_impact' };

export const REQUEST_INCLUDE = {
  vehicle: { select: { id: true, plate: true, criticality: true, status: true, site: { select: { code: true, name: true } }, vehicleModel: { select: { make: true, model: true } } } },
  photos: { select: { id: true, filename: true, mimeType: true } },
  workOrder: { select: { id: true, number: true, status: true } },
} satisfies Prisma.WorkRequestInclude;

@Injectable()
export class WorkRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly vehicles: VehiclesService,
    private readonly orders: WorkOrdersService,
    private readonly storage: StorageService,
  ) {}

  /** Prioridad sugerida por la matriz (doc 03 §3); sin criticidad se asume B. */
  suggest(canOperate: 'yes' | 'restricted' | 'no', criticality: string | null, consequence?: FailureConsequence) {
    const c = consequence ?? CONSEQUENCE_FROM_OPERATION[canOperate];
    return { consequence: c, priority: suggestPriority(c, (criticality ?? 'B') as Criticality) };
  }

  async create(user: AuthUser, b: z.infer<typeof CreateRequest>, photos: Buffer[] = []) {
    const v = await this.vehicles.findScoped(user, b.vehicleId);
    if (v.status === 'retired') throw new AppError('RETIRED', 'El vehículo está dado de baja', HttpStatus.UNPROCESSABLE_ENTITY);
    if (photos.length > 3) throw new AppError('TOO_MANY_FILES', 'Máximo 3 fotos por aviso');
    const stored: { key: string; mime: string; size: number }[] = [];
    for (const p of photos) stored.push(await this.storage.putImage(p));
    const { consequence, priority } = this.suggest(b.canOperate, v.criticality);

    const request = await this.prisma.$transaction(async (tx) => {
      const number = await nextDocumentNumber(tx, user.organizationId, 'AV');
      const r = await tx.workRequest.create({
        data: {
          organizationId: user.organizationId, number, vehicleId: v.id, source: b.source, description: b.description,
          systemCode: b.systemCode ?? null, canOperate: b.canOperate, consequence, priority, odometer: b.odometer ?? null, reportedById: user.id,
          photos: { create: stored.map((s, i) => ({ storageKey: s.key, mimeType: s.mime, size: s.size, filename: `foto-${i + 1}`, uploadedById: user.id })) },
        },
        include: REQUEST_INCLUDE,
      });
      const next = vehicleStatusForRequest(b.canOperate, v.status);
      if (next) await setVehicleStatus(tx, v.id, next, { reason: `Aviso ${number}: ${b.description.slice(0, 80)}`, userId: user.id });
      return r;
    });
    if (b.odometer != null && (v.currentOdometer == null || b.odometer > v.currentOdometer)) {
      await this.vehicles.recordReading(user, v.id, { value: b.odometer, meterType: 'odometer', source: b.source === 'inspection' ? 'inspection' : 'manual' }).catch(() => null);
    }
    return request;
  }

  list(user: AuthUser, q: { status?: string; vehicleId?: string }) {
    const statuses = (q.status ?? 'new,in_review').split(',').filter(Boolean) as Prisma.EnumWorkRequestStatusFilter['in'];
    return this.prisma.workRequest.findMany({
      where: {
        organizationId: user.organizationId,
        ...(q.status === 'all' ? {} : { status: { in: statuses } }),
        ...(q.vehicleId ? { vehicleId: q.vehicleId } : {}),
        vehicle: siteScope(user),
      },
      include: REQUEST_INCLUDE,
      orderBy: [{ priority: 'asc' }, { reportedAt: 'asc' }],
      take: 300,
    });
  }

  async get(user: AuthUser, id: string) {
    const r = await this.prisma.workRequest.findFirst({ where: { id, organizationId: user.organizationId, vehicle: siteScope(user) }, include: REQUEST_INCLUDE });
    if (!r) throw new AppError('NOT_FOUND', 'Aviso no encontrado', HttpStatus.NOT_FOUND);
    const openOrders = await this.prisma.workOrder.findMany({
      where: { vehicleId: r.vehicleId, status: { in: OPEN_WORK_ORDER_STATUSES } },
      select: { id: true, number: true, type: true, status: true, description: true },
    });
    return { ...r, suggestion: this.suggest(r.canOperate, r.vehicle.criticality), openOrders };
  }

  /** Aprobar (crea OT), agrupar en una OT abierta del mismo vehículo, o rechazar con motivo (doc 02 P4). */
  async review(user: AuthUser, id: string, b: z.infer<typeof ReviewRequest>) {
    const r = await this.get(user, id);
    if (r.status !== 'new' && r.status !== 'in_review') throw new AppError('ALREADY_REVIEWED', 'El aviso ya fue gestionado', HttpStatus.CONFLICT);
    const reviewed = { reviewedById: user.id, reviewedAt: new Date() };
    if (b.decision === 'reject') {
      return this.prisma.workRequest.update({ where: { id }, data: { status: 'rejected', rejectionReason: b.reason, ...reviewed }, include: REQUEST_INCLUDE });
    }
    if (b.decision === 'merge') {
      const wo = await this.prisma.workOrder.findFirst({ where: { id: b.workOrderId, vehicleId: r.vehicleId, status: { in: OPEN_WORK_ORDER_STATUSES } } });
      if (!wo) throw new AppError('INVALID_MERGE', 'Solo se puede agrupar en una OT abierta del mismo vehículo');
      await this.prisma.$transaction([
        this.prisma.workRequest.update({ where: { id }, data: { status: 'merged', workOrderId: wo.id, ...reviewed } }),
        this.prisma.workOrderTask.create({ data: { workOrderId: wo.id, sequence: 900, description: `Aviso ${r.number}: ${r.description}` } }),
        this.prisma.workOrderEvent.create({ data: { workOrderId: wo.id, action: 'merge_request', comment: r.number, userId: user.id } }),
      ]);
      return this.get(user, id);
    }
    const priority: Priority = b.priority ?? suggestPriority(b.consequence, (r.vehicle.criticality ?? 'B') as Criticality);
    const wo = await this.orders.create(user, {
      vehicleId: r.vehicleId, type: b.type, priority, description: b.description ?? r.description, workshopType: b.workshopType,
      supplierId: b.supplierId ?? null, tasks: [], origin: 'request', requestIds: [r.id],
    });
    await this.prisma.workRequest.update({ where: { id }, data: { status: 'approved', consequence: b.consequence, priority, workOrderId: wo.id, ...reviewed } });
    return this.get(user, id);
  }

  async photo(user: AuthUser, attachmentId: string) {
    const a = await this.prisma.attachment.findFirst({
      where: {
        id: attachmentId,
        OR: [
          { workRequest: { organizationId: user.organizationId, vehicle: siteScope(user) } },
          { workOrder: { organizationId: user.organizationId, vehicle: siteScope(user) } },
        ],
      },
    });
    if (!a) throw new AppError('NOT_FOUND', 'Archivo no encontrado', HttpStatus.NOT_FOUND);
    return { meta: a, data: await this.storage.get(a.storageKey) };
  }
}
