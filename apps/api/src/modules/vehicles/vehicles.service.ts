import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma, VehicleStatus } from '@prisma/client';
import {
  canonicalPlate,
  computeCriticality,
  plateFormatIssue,
  TireRuleError,
  validateTireChange,
  type TireChangeInput,
  missingVehicleFields,
  requiresTechnicalInspection,
  normalizePlate,
  validateReading,
  validateStatusChange,
  vehicleCompleteness,
  VehicleRuleError,
  type CriticalityCriteria,
} from '@cmms/domain';
import type { Criticality } from '@cmms/shared';
import { PrismaService } from '../../common/prisma.service';
import { PmService } from '../pm/pm.service';
import { AppError } from '../../common/errors';
import { AuthUser, siteScope } from '../../common/auth.decorators';
import type { CreateVehicle, UpdateVehicle } from './vehicles.schemas';

const READING_REJECTION: Record<string, string> = {
  decreasing: 'La lectura es menor que la anterior. Si se cambió el odómetro, registre el cambio de odómetro.',
  negative: 'La lectura no es válida',
  before_previous: 'La fecha es anterior a la última lectura registrada',
};

const SUMMARY_INCLUDE = {
  site: { select: { code: true, name: true } },
  vehicleModel: { select: { id: true, make: true, model: true, vehicleType: { select: { code: true, name: true, primaryMeter: true } } } },
  drivers: { select: { isPrimary: true, driver: { select: { id: true, fullName: true, phone: true } } }, orderBy: [{ isPrimary: 'desc' }, { assignedAt: 'asc' }] },
  documents: { where: { expiresAt: { not: null } }, select: { expiresAt: true, documentType: { select: { code: true } } } },
} satisfies Prisma.VehicleInclude;

type VehicleWithSummary = Prisma.VehicleGetPayload<{ include: typeof SUMMARY_INCLUDE }>;

@Injectable()
export class VehiclesService {
  constructor(private readonly prisma: PrismaService, private readonly pm: PmService) {}

  /** Agrega completitud y pendientes calculados por el dominio. */
  private decorate(v: VehicleWithSummary) {
    const record = {
      plate: v.plate,
      vin: v.vin,
      year: v.year,
      serviceType: v.serviceType,
      vehicleTypeCode: v.vehicleModel.vehicleType.code,
      criticality: v.criticality as Criticality | null,
      currentOdometer: v.currentOdometer,
      currentHourmeter: v.currentHourmeter,
      primaryMeter: v.vehicleModel.vehicleType.primaryMeter as 'odometer' | 'hourmeter',
      loadCapacityKg: v.loadCapacityKg,
      documentsWithExpiry: v.documents.map((d) => d.documentType.code),
    };
    const missing = v.status === 'retired' ? [] : missingVehicleFields(record);
    const nextExpiry = v.documents
      .map((d) => ({ code: d.documentType.code, expiresAt: d.expiresAt! }))
      .sort((a, b) => a.expiresAt.getTime() - b.expiresAt.getTime())[0] ?? null;
    return {
      ...v,
      accumulatedOdometer: v.currentOdometer == null ? null : v.currentOdometer + v.odometerOffset,
      completeness: v.status === 'retired' ? null : vehicleCompleteness(record),
      missing,
      nextExpiry,
    };
  }

  async list(user: AuthUser, q: { site?: string; status?: VehicleStatus; type?: string; q?: string; incomplete?: string; includeRetired?: string }) {
    const term = q.q?.trim();
    const rows = await this.prisma.vehicle.findMany({
      where: {
        organizationId: user.organizationId,
        ...siteScope(user),
        ...(q.site ? { site: { code: q.site } } : {}),
        ...(q.status ? { status: q.status } : q.includeRetired === 'true' ? {} : { status: { not: 'retired' } }),
        ...(q.type ? { vehicleModel: { vehicleType: { code: q.type } } } : {}),
        ...(term
          ? {
              OR: [
                { plate: { contains: normalizePlate(term) || term, mode: 'insensitive' } },
                { internalCode: { contains: term, mode: 'insensitive' } },
                { vehicleModel: { model: { contains: term, mode: 'insensitive' } } },
              ],
            }
          : {}),
      },
      include: SUMMARY_INCLUDE,
      orderBy: [{ site: { name: 'asc' } }, { plate: 'asc' }],
    });
    const out = rows.map((r) => this.decorate(r));
    return q.incomplete === 'true' ? out.filter((r) => r.missing.length > 0) : out;
  }

  async findScoped(user: AuthUser, id: string) {
    const v = await this.prisma.vehicle.findFirst({
      where: { id, organizationId: user.organizationId, ...siteScope(user) },
      include: SUMMARY_INCLUDE,
    });
    if (!v) throw new AppError('NOT_FOUND', 'Vehículo no encontrado', HttpStatus.NOT_FOUND);
    return v;
  }

  /** Hoja de vida (E1-H3). */
  async detail(user: AuthUser, id: string) {
    const v = this.decorate(await this.findScoped(user, id));
    const [readings, statusLog, documents, siteHistory, tireChanges] = await Promise.all([
      this.prisma.meterReading.findMany({ where: { vehicleId: id }, orderBy: { readAt: 'desc' }, take: 20 }),
      this.prisma.vehicleStatusLog.findMany({ where: { vehicleId: id }, orderBy: { startedAt: 'desc' }, take: 30 }),
      this.prisma.vehicleDocument.findMany({ where: { vehicleId: id }, include: { documentType: true }, orderBy: { expiresAt: 'asc' } }),
      this.prisma.vehicleSiteLog.findMany({ where: { vehicleId: id }, include: { site: { select: { code: true, name: true } } }, orderBy: { startedAt: 'desc' } }),
      this.prisma.tireChange.findMany({ where: { vehicleId: id }, orderBy: { changedAt: 'desc' }, take: 50 }),
    ]);
    const rtmRequired = requiresTechnicalInspection({ year: v.year, serviceType: v.serviceType, vehicleTypeCode: v.vehicleModel.vehicleType.code }, new Date());
    return { ...v, readings, statusLog, documents, rtmRequired, siteHistory, tireChanges };
  }

  private async siteId(user: AuthUser, code: string) {
    const site = await this.prisma.site.findUnique({ where: { organizationId_code: { organizationId: user.organizationId, code } } });
    if (!site || (user.siteIds && !user.siteIds.includes(site.id))) throw new AppError('UNKNOWN_SITE', `Sede no válida: ${code}`);
    return site.id;
  }

  private tiresAttr(t: CreateVehicle['tires']) {
    return t ? { tires: t } : {};
  }

  async create(user: AuthUser, b: CreateVehicle) {
    // Doc 02 P1: un vehículo nuevo no queda operativo sin criticidad y lectura inicial.
    // Entra en "reserva" y pasa a operativo con POST /vehicles/:id/status, que valida ambas condiciones.
    const status = b.status ?? 'reserve';
    if (status === 'operational' || status === 'operational_restricted' || status === 'retired')
      throw new AppError('INVALID_INITIAL_STATUS', 'Un vehículo nuevo se crea en reserva; actívelo con el cambio de estado una vez tenga criticidad y kilometraje', HttpStatus.UNPROCESSABLE_ENTITY);
    const siteId = await this.siteId(user, b.siteCode);
    const model = await this.prisma.vehicleModel.findUnique({ where: { id: b.vehicleModelId }, include: { vehicleType: true } });
    if (!model) throw new AppError('UNKNOWN_MODEL', 'Modelo de vehículo no encontrado');
    const plate = canonicalPlate(b.plate, model.vehicleType.code);
    const plateWarning = plateFormatIssue(plate, model.vehicleType.code);
    const { siteCode: _s, tires, initialOdometer, status: _st, plate: _p, ...data } = b;
    return this.prisma.$transaction(async (tx) => {
      const v = await tx.vehicle.create({
        data: {
          ...data,
          plate,
          organizationId: user.organizationId,
          siteId,
          status,
          attributes: this.tiresAttr(tires),
          currentOdometer: initialOdometer ?? null,
          lastReadingAt: initialOdometer != null ? new Date() : null,
        },
      });
      await tx.vehicleStatusLog.create({ data: { vehicleId: v.id, status, reason: 'Alta del vehículo', startedAt: new Date(), userId: user.id } });
      await tx.vehicleSiteLog.create({ data: { vehicleId: v.id, siteId, startedAt: new Date(), reason: 'Alta del vehículo', userId: user.id } });
      if (initialOdometer != null)
        await tx.meterReading.create({
          data: { vehicleId: v.id, value: initialOdometer, accumulatedValue: initialOdometer, readAt: new Date(), source: 'manual', userId: user.id },
        });
      return { ...v, plateWarning };
    });
  }

  async update(user: AuthUser, id: string, b: UpdateVehicle) {
    const current = await this.findScoped(user, id);
    const { tires, ...data } = b;
    const attributes = tires ? { ...(current.attributes as object), tires: { ...((current.attributes as { tires?: object }).tires ?? {}), ...tires } } : undefined;
    return this.prisma.vehicle.update({ where: { id }, data: { ...data, attributes } });
  }

  async setCriticality(user: AuthUser, id: string, criteria: CriticalityCriteria) {
    await this.findScoped(user, id);
    const r = computeCriticality(criteria);
    return this.prisma.vehicle.update({
      where: { id },
      data: { criticality: r.category, criticalityScore: { ...criteria, score: r.score, assessedAt: new Date().toISOString(), assessedBy: user.id } },
      select: { id: true, criticality: true, criticalityScore: true },
    });
  }

  async changeStatus(user: AuthUser, id: string, next: VehicleStatus, reason: string) {
    const v = await this.findScoped(user, id);
    try {
      validateStatusChange(v.status, next, {
        reason,
        criticality: v.criticality as Criticality | null,
        hasReading: v.currentOdometer != null || v.currentHourmeter != null,
      });
    } catch (e) {
      if (e instanceof VehicleRuleError) throw new AppError(e.code, e.message, HttpStatus.UNPROCESSABLE_ENTITY);
      throw e;
    }
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      await tx.vehicleStatusLog.updateMany({ where: { vehicleId: id, endedAt: null }, data: { endedAt: now } });
      await tx.vehicleStatusLog.create({ data: { vehicleId: id, status: next, reason, startedAt: now, userId: user.id } });
      return tx.vehicle.update({
        where: { id },
        data: {
          status: next,
          statusReason: reason,
          ...(next === 'retired' ? { retiredAt: now, retirementReason: reason } : {}),
        },
        select: { id: true, status: true, statusReason: true },
      });
    });
  }

  /** E2-H1: registra lectura validada por el dominio (doc 02 P2). */
  async recordReading(
    user: AuthUser,
    id: string,
    b: { value: number; meterType: 'odometer' | 'hourmeter'; readAt?: Date; source: 'inspection' | 'work_order' | 'fuel' | 'gps' | 'manual' | 'import' },
  ) {
    const v = await this.findScoped(user, id);
    if (v.status === 'retired') throw new AppError('RETIRED', 'El vehículo está dado de baja', HttpStatus.UNPROCESSABLE_ENTITY);
    const readAt = b.readAt ?? new Date();
    if (readAt.getTime() > Date.now() + 5 * 60_000) throw new AppError('FUTURE_DATE', 'La fecha de la lectura no puede ser futura');
    const offset = b.meterType === 'odometer' ? v.odometerOffset : 0;
    const type = await this.prisma.vehicleType.findFirstOrThrow({ where: { models: { some: { id: v.vehicleModelId } } } });

    const result = await this.prisma.$transaction(async (tx) => {
      // Bloquea el vehículo para serializar lecturas concurrentes.
      await tx.$queryRaw`SELECT id FROM vehicles WHERE id = ${id}::uuid FOR UPDATE`;
      const prev = await tx.meterReading.findFirst({
        where: { vehicleId: id, meterType: b.meterType },
        orderBy: { readAt: 'desc' },
      });
      const accumulated = b.value + offset;
      const check = validateReading(
        accumulated,
        readAt,
        prev ? { value: prev.accumulatedValue, readAt: prev.readAt } : null,
        type.maxDailyUsage,
      );
      if (check.status === 'rejected')
        throw new AppError(`READING_${check.reason.toUpperCase()}`, READING_REJECTION[check.reason]!, HttpStatus.UNPROCESSABLE_ENTITY, {
          previous: prev ? { value: prev.value, readAt: prev.readAt } : null,
        });
      const flagged = check.status === 'flagged';
      const reading = await tx.meterReading.create({
        data: {
          vehicleId: id,
          meterType: b.meterType,
          value: b.value,
          accumulatedValue: accumulated,
          readAt,
          source: b.source,
          userId: user.id,
          isFlagged: flagged,
          flagReason: flagged ? `Uso implícito de ${Math.round(check.impliedDailyUsage)} por día supera el máximo del tipo (${type.maxDailyUsage})` : null,
        },
      });
      // Una lectura marcada "a validar" no mueve el kilometraje vigente (evita disparar alarmas PM falsas).
      if (!flagged) {
        await tx.vehicle.update({
          where: { id },
          data: { ...(b.meterType === 'odometer' ? { currentOdometer: b.value } : { currentHourmeter: b.value }), lastReadingAt: readAt },
        });
      }
      return { ...reading, status: check.status };
    });
    // Nueva lectura vigente → recalcular vencimientos y generar OT preventivas (doc 02 P2 → P5).
    const pm = result.status === 'accepted' ? await this.pm.recomputeVehicle(id).catch(() => ({ generated: [] as string[] })) : { generated: [] as string[] };
    return { ...result, pmGenerated: pm.generated };
  }

  /** Aprobar una lectura marcada: pasa a ser la vigente si es la más reciente. */
  async validateFlaggedReading(user: AuthUser, id: string, readingId: string) {
    await this.findScoped(user, id);
    const r = await this.prisma.meterReading.findFirst({ where: { id: readingId, vehicleId: id, isFlagged: true } });
    if (!r) throw new AppError('NOT_FOUND', 'Lectura marcada no encontrada', HttpStatus.NOT_FOUND);
    const newer = await this.prisma.meterReading.count({
      where: { vehicleId: id, meterType: r.meterType, readAt: { gt: r.readAt }, isFlagged: false },
    });
    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.meterReading.update({
        where: { id: readingId },
        data: { isFlagged: false, flagReason: `${r.flagReason ?? ''} · validada por usuario`.trim() },
      });
      if (newer === 0)
        await tx.vehicle.update({
          where: { id },
          data: { ...(r.meterType === 'odometer' ? { currentOdometer: r.value } : { currentHourmeter: r.value }), lastReadingAt: r.readAt },
        });
      return updated;
    });
    if (newer === 0) await this.pm.recomputeVehicle(id).catch(() => undefined);
    return result;
  }

  /** E2-H2: cambio de odómetro sin perder el kilometraje acumulado. */
  async replaceMeter(
    user: AuthUser,
    id: string,
    b: { meterType: 'odometer' | 'hourmeter'; oldFinalValue: number; newInitialValue: number; replacedAt?: Date; reason: string },
  ) {
    const v = await this.findScoped(user, id);
    const current = b.meterType === 'odometer' ? v.currentOdometer : v.currentHourmeter;
    if (current != null && b.oldFinalValue < current)
      throw new AppError('OLD_VALUE_TOO_LOW', `La lectura final del medidor anterior no puede ser menor que la vigente (${current})`);
    const replacedAt = b.replacedAt ?? new Date();
    const newOffset = (b.meterType === 'odometer' ? v.odometerOffset : 0) + (b.oldFinalValue - b.newInitialValue);
    return this.prisma.$transaction(async (tx) => {
      await tx.meterReplacement.create({ data: { vehicleId: id, ...b, replacedAt, userId: user.id } });
      await tx.meterReading.create({
        data: {
          vehicleId: id,
          meterType: b.meterType,
          value: b.newInitialValue,
          accumulatedValue: b.newInitialValue + newOffset,
          readAt: replacedAt,
          source: 'manual',
          userId: user.id,
          flagReason: 'Lectura inicial tras cambio de medidor',
        },
      });
      return tx.vehicle.update({
        where: { id },
        data:
          b.meterType === 'odometer'
            ? { odometerOffset: newOffset, currentOdometer: b.newInitialValue, lastReadingAt: replacedAt }
            : { currentHourmeter: b.newInitialValue, lastReadingAt: replacedAt },
        select: { id: true, currentOdometer: true, odometerOffset: true },
      });
    });
  }

  /** Reubicación entre sedes por necesidad de la operación: cierra la sede vigente y abre la nueva. */
  async transfer(user: AuthUser, id: string, b: { siteCode: string; reason: string; effectiveAt?: Date }) {
    const v = await this.findScoped(user, id);
    if (v.status === 'retired') throw new AppError('RETIRED', 'El vehículo está dado de baja', HttpStatus.UNPROCESSABLE_ENTITY);
    const siteId = await this.siteId(user, b.siteCode);
    if (siteId === v.siteId) throw new AppError('SAME_SITE', 'El vehículo ya está en esa sede', HttpStatus.UNPROCESSABLE_ENTITY);
    const at = b.effectiveAt ?? new Date();
    if (at.getTime() > Date.now() + 5 * 60_000) throw new AppError('FUTURE_DATE', 'La fecha del traslado no puede ser futura');
    const open = await this.prisma.vehicleSiteLog.findFirst({ where: { vehicleId: id, endedAt: null } });
    if (open && at < open.startedAt) throw new AppError('BEFORE_CURRENT', 'La fecha es anterior a la llegada a la sede actual');
    return this.prisma.$transaction(async (tx) => {
      await tx.vehicleSiteLog.updateMany({ where: { vehicleId: id, endedAt: null }, data: { endedAt: at } });
      await tx.vehicleSiteLog.create({ data: { vehicleId: id, siteId, startedAt: at, reason: b.reason, userId: user.id } });
      return tx.vehicle.update({ where: { id }, data: { siteId }, select: { id: true, site: { select: { code: true, name: true } } } });
    });
  }

  /** Conductores habilitados (uno o varios). Reemplaza la lista completa. */
  async setDrivers(user: AuthUser, id: string, b: { driverIds: string[]; primaryDriverId?: string | null }) {
    await this.findScoped(user, id);
    const ids = [...new Set(b.driverIds)];
    const found = await this.prisma.driver.count({ where: { id: { in: ids }, organizationId: user.organizationId, active: true } });
    if (found !== ids.length) throw new AppError('UNKNOWN_DRIVER', 'Algún conductor no existe o está inactivo');
    if (b.primaryDriverId && !ids.includes(b.primaryDriverId)) throw new AppError('PRIMARY_NOT_ASSIGNED', 'El conductor principal debe estar entre los asignados');
    const primary = b.primaryDriverId ?? ids[0] ?? null;
    await this.prisma.$transaction([
      this.prisma.vehicleDriver.deleteMany({ where: { vehicleId: id, driverId: { notIn: ids } } }),
      ...ids.map((driverId) =>
        this.prisma.vehicleDriver.upsert({
          where: { vehicleId_driverId: { vehicleId: id, driverId } },
          create: { vehicleId: id, driverId, isPrimary: driverId === primary },
          update: { isPrimary: driverId === primary },
        }),
      ),
    ]);
    return this.prisma.vehicleDriver.findMany({ where: { vehicleId: id }, include: { driver: { select: { id: true, fullName: true } } }, orderBy: { isPrimary: 'desc' } });
  }

  /** Cambio de llantas: desgaste, daño en la vía, robo, rotación. */
  async recordTireChange(
    user: AuthUser,
    id: string,
    b: TireChangeInput & { changedAt?: Date; odometer?: number | null; tireSize?: string | null; tireBrand?: string | null; unitCost?: number | null; supplier?: string | null; workOrderId?: string | null },
  ) {
    const v = await this.findScoped(user, id);
    if (v.status === 'retired') throw new AppError('RETIRED', 'El vehículo está dado de baja', HttpStatus.UNPROCESSABLE_ENTITY);
    const tires = ((v.attributes as { tires?: { frontQty?: number; rearQty?: number } }).tires) ?? {};
    try {
      validateTireChange(b, { frontQty: tires.frontQty, rearQty: tires.rearQty });
    } catch (e) {
      if (e instanceof TireRuleError) throw new AppError(e.code, e.message, HttpStatus.UNPROCESSABLE_ENTITY);
      throw e;
    }
    const changedAt = b.changedAt ?? new Date();
    if (changedAt.getTime() > Date.now() + 5 * 60_000) throw new AppError('FUTURE_DATE', 'La fecha no puede ser futura');
    const odometer = b.odometer ?? v.currentOdometer ?? null;
    const t = tires as { frontSize?: string; rearSize?: string; brand?: string };
    const change = await this.prisma.tireChange.create({
      data: {
        vehicleId: id,
        changedAt,
        odometer,
        axle: b.axle,
        quantity: b.quantity,
        positions: b.positions ?? [],
        reason: b.reason,
        tireSize: b.tireSize ?? (b.axle === 'front' ? t.frontSize : t.rearSize) ?? null,
        tireBrand: b.tireBrand ?? t.brand ?? null,
        unitCost: b.unitCost ?? null,
        totalCost: b.unitCost != null ? b.unitCost * b.quantity : null,
        supplier: b.supplier ?? null,
        notes: b.notes ?? null,
        workOrderId: b.workOrderId ? (await this.prisma.workOrder.findFirstOrThrow({ where: { id: b.workOrderId, vehicleId: id } })).id : null,
        userId: user.id,
      },
    });
    // Si trae un kilometraje mayor al vigente, también queda como lectura (validada por las reglas de P2).
    let reading: { status: string } | null = null;
    if (b.odometer != null && (v.currentOdometer == null || b.odometer > v.currentOdometer)) {
      reading = await this.recordReading(user, id, { value: b.odometer, meterType: 'odometer', readAt: changedAt, source: 'manual' }).catch(() => null);
    }
    return { ...change, readingStatus: reading?.status ?? null };
  }

  async upsertDocument(
    user: AuthUser,
    id: string,
    typeCode: string,
    b: { number?: string | null; issuer?: string | null; issuedAt?: Date | null; expiresAt?: Date | null; notes?: string | null },
  ) {
    await this.findScoped(user, id);
    const type = await this.prisma.documentType.findUnique({ where: { code: typeCode } });
    if (!type) throw new AppError('UNKNOWN_DOCUMENT_TYPE', `Tipo de documento desconocido: ${typeCode}`);
    if (b.issuedAt && b.expiresAt && b.expiresAt < b.issuedAt)
      throw new AppError('INVALID_DATES', 'El vencimiento no puede ser anterior a la expedición');
    return this.prisma.vehicleDocument.upsert({
      where: { vehicleId_documentTypeId: { vehicleId: id, documentTypeId: type.id } },
      create: { vehicleId: id, documentTypeId: type.id, ...b },
      update: b,
      include: { documentType: true },
    });
  }
}
