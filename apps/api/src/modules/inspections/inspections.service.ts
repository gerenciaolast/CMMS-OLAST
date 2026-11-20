import { HttpStatus, Injectable } from '@nestjs/common';
import { inspectionOutcome, validateInspectionAnswers, InspectionRuleError, OPEN_WORK_ORDER_STATUSES, type AnswerInput } from '@cmms/domain';
import { PrismaService } from '../../common/prisma.service';
import { AppError } from '../../common/errors';
import { AuthUser, siteScope } from '../../common/auth.decorators';
import { localDayRange } from '../../common/time';
import { StorageService } from '../../common/storage';
import { VehiclesService } from '../vehicles/vehicles.service';
import { WorkRequestsService } from '../maintenance/work-requests.service';
import { NotificationsService } from '../notifications/notifications.service';

const RESULT_LABEL = { fit: 'APTO', fit_with_observations: 'APTO CON OBSERVACIONES', unfit: 'NO APTO' } as const;

@Injectable()
export class InspectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly vehicles: VehiclesService,
    private readonly requests: WorkRequestsService,
    private readonly storage: StorageService,
    private readonly notifications: NotificationsService,
  ) {}

  private async driverOf(user: AuthUser) {
    return this.prisma.driver.findFirst({ where: { userId: user.id, active: true } });
  }

  /** Vehículos que el usuario puede inspeccionar: el conductor, los que tiene asignados; supervisores, los de sus sedes. */
  async myVehicles(user: AuthUser) {
    const driver = user.role === 'driver' ? await this.driverOf(user) : null;
    if (user.role === 'driver' && !driver) return [];
    const { start, end } = localDayRange(await this.tz(user));
    return this.prisma.vehicle.findMany({
      where: {
        organizationId: user.organizationId,
        status: { not: 'retired' },
        ...siteScope(user),
        ...(driver ? { drivers: { some: { driverId: driver.id } } } : {}),
      },
      select: {
        id: true, plate: true, status: true, currentOdometer: true, site: { select: { name: true } },
        vehicleModel: { select: { model: true, vehicleType: { select: { code: true } } } },
        inspections: { where: { performedAt: { gte: start, lt: end } }, select: { id: true, result: true, performedAt: true }, orderBy: { performedAt: 'desc' }, take: 1 },
      },
      orderBy: { plate: 'asc' },
    });
  }

  private async tz(user: AuthUser) {
    return (await this.prisma.organization.findUniqueOrThrow({ where: { id: user.organizationId } })).timezone;
  }

  private async assertCanInspect(user: AuthUser, vehicleId: string) {
    const v = await this.vehicles.findScoped(user, vehicleId);
    if (v.status === 'retired') throw new AppError('RETIRED', 'El vehículo está dado de baja', HttpStatus.UNPROCESSABLE_ENTITY);
    let driverId: string | null = null;
    if (user.role === 'driver') {
      const d = await this.driverOf(user);
      if (!d || !(await this.prisma.vehicleDriver.findUnique({ where: { vehicleId_driverId: { vehicleId, driverId: d.id } } })))
        throw new AppError('NOT_ASSIGNED', 'Usted no está habilitado como conductor de este vehículo', HttpStatus.FORBIDDEN);
      driverId = d.id;
    }
    return { v, driverId };
  }

  /** Datos para iniciar la inspección: checklist del tipo de vehículo y defectos ya reportados (abiertos). */
  async start(user: AuthUser, vehicleId: string) {
    const { v } = await this.assertCanInspect(user, vehicleId);
    const template = await this.prisma.checklistTemplate.findFirst({
      where: { active: true, kind: 'pre_trip', vehicleType: { code: v.vehicleModel.vehicleType.code } },
      include: { items: { orderBy: { sequence: 'asc' } } },
      orderBy: { version: 'desc' },
    });
    if (!template) throw new AppError('NO_CHECKLIST', 'No hay checklist configurado para este tipo de vehículo');
    return { vehicle: { id: v.id, plate: v.plate, status: v.status, currentOdometer: v.currentOdometer, model: v.vehicleModel.model }, template, openDefects: await this.openDefects(vehicleId) };
  }

  /** Defectos de inspección con aviso abierto (nuevo, en revisión o con OT abierta), por ítem. */
  private async openDefects(vehicleId: string) {
    const results = await this.prisma.inspectionResult.findMany({
      where: {
        answer: 'defect',
        workRequest: {
          vehicleId,
          OR: [{ status: { in: ['new', 'in_review'] } }, { status: { in: ['approved', 'merged'] }, workOrder: { status: { in: OPEN_WORK_ORDER_STATUSES } } }],
        },
      },
      select: { itemId: true, comment: true, workRequest: { select: { id: true, number: true, status: true, workOrder: { select: { number: true } } } } },
      orderBy: { inspection: { performedAt: 'desc' } },
    });
    const byItem = new Map<string, (typeof results)[number]>();
    for (const r of results) if (!byItem.has(r.itemId)) byItem.set(r.itemId, r);
    return [...byItem.values()];
  }

  async submit(
    user: AuthUser,
    b: { vehicleId: string; odometer: number; signatureName: string; answers: AnswerInput[]; durationSeconds?: number; latitude?: number; longitude?: number },
    photosByItem: Map<string, Buffer[]>,
  ) {
    const { v, driverId } = await this.assertCanInspect(user, b.vehicleId);
    const { template } = await this.start(user, b.vehicleId);
    const answers = b.answers.map((a) => ({ ...a, photos: photosByItem.get(a.itemId)?.length ?? 0 }));
    try {
      validateInspectionAnswers(template.items, answers);
    } catch (e) {
      if (e instanceof InspectionRuleError) throw new AppError(e.code, e.message, HttpStatus.UNPROCESSABLE_ENTITY, e.details);
      throw e;
    }
    const result = inspectionOutcome(template.items, answers);

    // 1. Kilometraje (reglas de P2). Igual al vigente se acepta; menor se rechaza y no se guarda la inspección.
    if (v.currentOdometer == null || b.odometer !== v.currentOdometer) {
      await this.vehicles.recordReading(user, v.id, { value: b.odometer, meterType: 'odometer', source: 'inspection' });
    }

    // 2. Inspección y resultados.
    const inspection = await this.prisma.inspection.create({
      data: {
        organizationId: user.organizationId, vehicleId: v.id, templateId: template.id, driverId, userId: user.id, odometer: b.odometer, result,
        signatureName: b.signatureName, durationSeconds: b.durationSeconds ?? null, latitude: b.latitude ?? null, longitude: b.longitude ?? null,
        results: { create: answers.map((a) => ({ itemId: a.itemId, answer: a.answer, comment: a.comment?.trim() || null })) },
      },
      include: { results: true },
    });

    // 3. Cada defecto genera un aviso (o se liga al que ya está abierto para ese ítem).
    const open = new Map((await this.openDefects(v.id)).map((d) => [d.itemId, d]));
    const created: string[] = [];
    const linked: string[] = [];
    for (const r of inspection.results.filter((x) => x.answer === 'defect')) {
      const item = template.items.find((i) => i.id === r.itemId)!;
      const photos = photosByItem.get(r.itemId) ?? [];
      const existing = open.get(r.itemId);
      const stored = [];
      for (const p of photos) stored.push(await this.storage.putImage(p));
      if (existing?.workRequest) {
        await this.prisma.inspectionResult.update({ where: { id: r.id }, data: { workRequestId: existing.workRequest.id, alreadyReported: true } });
        linked.push(existing.workRequest.number);
      } else {
        const req = await this.requests.create(
          user,
          {
            vehicleId: v.id,
            description: `Inspección pre-operacional: ${item.text}${r.comment ? ` — ${r.comment}` : ''}`,
            systemCode: item.componentCode,
            canOperate: item.isCritical ? 'no' : 'yes',
            source: 'inspection',
          },
          photos,
        );
        await this.prisma.inspectionResult.update({ where: { id: r.id }, data: { workRequestId: req.id } });
        created.push(req.number);
        continue;
      }
      if (stored.length)
        await this.prisma.attachment.createMany({ data: stored.map((s, i) => ({ storageKey: s.key, mimeType: s.mime, size: s.size, filename: `foto-${i + 1}`, inspectionResultId: r.id, uploadedById: user.id })) });
    }

    // 4. Defecto crítico: aviso inmediato a supervisores y jefes de la sede.
    if (result === 'unfit') {
      const critical = template.items.filter((i) => i.isCritical && answers.find((a) => a.itemId === i.id)?.answer === 'defect').map((i) => i.text);
      await this.notifications
        .notify({
          organizationId: user.organizationId,
          kind: 'critical_defect',
          title: `${v.plate} NO APTO: defecto crítico en inspección`,
          body: `El vehículo ${v.plate} quedó FUERA DE SERVICIO. Defecto(s) crítico(s): ${critical.join('; ')}. Reportó: ${b.signatureName}.`,
          link: `/vehiculos/${v.id}`,
          permission: 'work_request.review',
          siteId: v.siteId,
        })
        .catch(() => 0);
    }
    return { id: inspection.id, result, resultLabel: RESULT_LABEL[result], createdRequests: created, linkedRequests: linked };
  }

  async get(user: AuthUser, id: string) {
    const i = await this.prisma.inspection.findFirst({
      where: { id, organizationId: user.organizationId, vehicle: siteScope(user) },
      include: {
        vehicle: { select: { id: true, plate: true } },
        driver: { select: { fullName: true } },
        results: { include: { item: true, photos: { select: { id: true } }, workRequest: { select: { id: true, number: true, status: true, photos: { select: { id: true } } } } }, orderBy: { item: { sequence: 'asc' } } },
      },
    });
    if (!i) throw new AppError('NOT_FOUND', 'Inspección no encontrada', HttpStatus.NOT_FOUND);
    return i;
  }

  /** Cumplimiento del día (KPI doc 05 #11): vehículos activos con y sin inspección. */
  async daily(user: AuthUser, q: { date?: string; site?: string }) {
    const tz = await this.tz(user);
    const { start, end, day } = localDayRange(tz, q.date ? new Date(`${q.date}T12:00:00Z`) : new Date());
    const vehicles = await this.prisma.vehicle.findMany({
      where: { organizationId: user.organizationId, status: { notIn: ['retired'] }, ...siteScope(user), ...(q.site ? { site: { code: q.site } } : {}) },
      select: {
        id: true, plate: true, status: true, site: { select: { name: true } },
        inspections: {
          where: { performedAt: { gte: start, lt: end } },
          select: { id: true, result: true, performedAt: true, signatureName: true, odometer: true, results: { where: { answer: 'defect' }, select: { id: true } } },
          orderBy: { performedAt: 'desc' },
        },
      },
      orderBy: [{ site: { name: 'asc' } }, { plate: 'asc' }],
    });
    const expected = vehicles.filter((v) => v.status === 'operational' || v.status === 'operational_restricted');
    const done = expected.filter((v) => v.inspections.length > 0).length;
    return { day, expected: expected.length, done, compliance: expected.length ? done / expected.length : null, vehicles };
  }

  history(user: AuthUser, vehicleId: string) {
    return this.prisma.inspection.findMany({
      where: { vehicleId, organizationId: user.organizationId, vehicle: siteScope(user) },
      select: { id: true, performedAt: true, result: true, odometer: true, signatureName: true, results: { where: { answer: 'defect' }, select: { item: { select: { text: true } } } } },
      orderBy: { performedAt: 'desc' },
      take: 30,
    });
  }
}
