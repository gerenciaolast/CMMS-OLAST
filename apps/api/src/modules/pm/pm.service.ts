import { HttpStatus, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { averageDailyUsage, computePmSchedule, resolveRoutinesToExecute, routinesResetByCompletion, OPEN_WORK_ORDER_STATUSES } from '@cmms/domain';
import { PrismaService } from '../../common/prisma.service';
import { AppError } from '../../common/errors';
import { AuthUser, siteScope } from '../../common/auth.decorators';
import { nextDocumentNumber } from '../../common/counters';
import { suggestPlanCode } from './plan-suggestion';

const DAY = 86_400_000;
const RECOMPUTE_EVERY_MS = 6 * 3_600_000;

type Tx = Prisma.TransactionClient;

/**
 * Motor de mantenimiento preventivo (doc 02 P5).
 * Recalcula vencimientos al registrar lecturas, al cerrar OT PM y cada 6 horas (vencimientos por tiempo).
 */
@Injectable()
export class PmService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Preventivo');
  private timer?: NodeJS.Timeout;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    const run = () => this.recomputeAll().catch((e) => this.logger.error(e));
    setTimeout(run, 10_000).unref();
    this.timer = setInterval(run, RECOMPUTE_EVERY_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Uso diario promedio de los últimos 180 días con lecturas y kilometrajes de OT. */
  private async dailyUsage(tx: Tx, vehicleId: string, asOf: Date) {
    const from = new Date(asOf.getTime() - 180 * DAY);
    const [readings, orders] = await Promise.all([
      tx.meterReading.findMany({ where: { vehicleId, meterType: 'odometer', isFlagged: false, readAt: { gte: from } }, select: { accumulatedValue: true, readAt: true } }),
      tx.workOrder.findMany({ where: { vehicleId, closedAt: { gte: from }, odometerOut: { not: null } }, select: { odometerOut: true, closedAt: true } }),
    ]);
    const points = [
      ...readings.map((r) => ({ value: r.accumulatedValue, readAt: r.readAt })),
      ...orders.map((o) => ({ value: o.odometerOut!, readAt: o.closedAt! })),
    ];
    return averageDailyUsage(points, asOf, 180);
  }

  /** Recalcula los vencimientos de un vehículo y genera las OT preventivas que correspondan. */
  async recomputeVehicle(vehicleId: string, asOf = new Date()) {
    return this.prisma.$transaction(async (tx) => {
      const v = await tx.vehicle.findUnique({
        where: { id: vehicleId },
        include: { pmSchedules: { include: { routine: { include: { tasks: { orderBy: { sequence: 'asc' } }, plan: true } } } } },
      });
      if (!v || v.status === 'retired' || !v.pmSchedules.length) return { generated: [] as string[] };
      const usage = await this.dailyUsage(tx, vehicleId, asOf);
      const meter = v.currentOdometer != null ? v.currentOdometer + v.odometerOffset : null;
      const openOrders = await tx.workOrder.findMany({
        where: { vehicleId, pmRoutineId: { not: null }, status: { in: OPEN_WORK_ORDER_STATUSES } },
        select: { id: true, pmRoutineId: true },
      });
      const openByRoutine = new Map(openOrders.map((o) => [o.pmRoutineId!, o.id]));

      const due: { id: string; code: string; overdue: boolean }[] = [];
      for (const s of v.pmSchedules) {
        const r = s.routine;
        const res = computePmSchedule(
          { intervalDistance: r.intervalDistance, intervalDays: r.intervalDays, tolerancePct: Number(r.tolerancePct), generateAtPct: Number(r.generateAtPct) },
          { lastDoneAt: s.lastDoneAt, lastDoneMeter: s.lastDoneMeter },
          { asOf, meter: meter ?? s.lastDoneMeter, avgDailyUsage: usage },
        );
        await tx.vehiclePmSchedule.update({
          where: { id: s.id },
          data: {
            nextDueMeter: res.nextDueMeter, nextDueDate: res.nextDueDate, projectedDueDate: res.projectedDueDate, pctConsumed: res.pctConsumed,
            drivingDimension: res.drivingDimension, status: res.status, openWorkOrderId: openByRoutine.get(r.id) ?? null, computedAt: asOf,
          },
        });
        if ((res.status === 'due' || res.status === 'overdue') && !openByRoutine.has(r.id)) due.push({ id: r.id, code: r.code, overdue: res.status === 'overdue' });
      }

      // Rutinas anidadas: si vencen A, B y C se genera solo C; y no se genera A si ya hay una OT abierta de C.
      const routines = v.pmSchedules.map((s) => s.routine);
      const byCode = new Map(routines.map((r) => [r.code, r]));
      const nested = routines.map((r) => ({ id: r.code, includes: r.includes }));
      const covered = new Set(openOrders.flatMap((o) => {
        const r = routines.find((x) => x.id === o.pmRoutineId);
        return r ? routinesResetByCompletion(r.code, nested) : [];
      }));
      const toGenerate = resolveRoutinesToExecute(due.map((d) => d.code).filter((c) => !covered.has(c)), nested);

      const generated: string[] = [];
      for (const code of toGenerate) {
        const r = byCode.get(code)!;
        const all = routinesResetByCompletion(code, nested).map((c) => byCode.get(c)!).sort((a, b) => a.sequence - b.sequence);
        const seen = new Set<string>();
        const tasks = all.flatMap((x) => x.tasks).filter((t) => (seen.has(t.description) ? false : (seen.add(t.description), true)));
        // Prioridad alta si la rutina o alguna de las que incluye ya superó la tolerancia.
        const overdue = all.some((x) => due.find((d) => d.code === x.code)?.overdue);
        const number = await nextDocumentNumber(tx, v.organizationId, 'OT', asOf);
        const wo = await tx.workOrder.create({
          data: {
            organizationId: v.organizationId, number, vehicleId, siteId: v.siteId, type: 'PM', priority: overdue ? 'P2' : 'P3', origin: 'pm',
            pmRoutineId: r.id, description: `${r.name} · ${r.plan.name}`, workshopType: 'external', estimatedHours: r.estimatedHours,
            tasks: { create: tasks.map((t, i) => ({ sequence: (i + 1) * 10, description: t.description })) },
            events: { create: { action: 'create', toStatus: 'planned', comment: overdue ? 'Generada automáticamente: rutina VENCIDA' : 'Generada automáticamente al 90 % del intervalo' } },
          },
        });
        await tx.vehiclePmSchedule.updateMany({ where: { vehicleId, routineId: r.id }, data: { openWorkOrderId: wo.id } });
        generated.push(wo.number);
      }
      return { generated };
    });
  }

  async recomputeAll() {
    const vehicles = await this.prisma.vehicle.findMany({ where: { status: { not: 'retired' }, maintenancePlanId: { not: null } }, select: { id: true } });
    const out: string[] = [];
    for (const v of vehicles) out.push(...(await this.recomputeVehicle(v.id)).generated);
    if (out.length) this.logger.log(`OT preventivas generadas: ${out.join(', ')}`);
    return { vehicles: vehicles.length, generated: out };
  }

  /** Al cerrar una OT preventiva: reinicia la rutina ejecutada y las que incluye (doc 02 P5). */
  async onWorkOrderClosed(tx: Tx, workOrderId: string) {
    const wo = await tx.workOrder.findUniqueOrThrow({ where: { id: workOrderId }, include: { pmRoutine: { include: { plan: { include: { routines: true } } } } } });
    if (!wo.pmRoutine) return;
    const nested = wo.pmRoutine.plan.routines.map((r) => ({ id: r.code, includes: r.includes }));
    const codes = routinesResetByCompletion(wo.pmRoutine.code, nested);
    const ids = wo.pmRoutine.plan.routines.filter((r) => codes.includes(r.code)).map((r) => r.id);
    const meter = wo.odometerOut ?? wo.odometerIn;
    await tx.vehiclePmSchedule.updateMany({
      where: { vehicleId: wo.vehicleId, routineId: { in: ids } },
      data: { lastDoneAt: wo.actualEnd ?? wo.closedAt ?? new Date(), ...(meter != null ? { lastDoneMeter: meter } : {}), baselineEstimated: false, openWorkOrderId: null },
    });
  }

  /**
   * Tras importar historial: actualiza las líneas base estimadas con el preventivo más reciente y cancela las OT
   * preventivas automáticas que el historial ya resolvió (solo si no se han iniciado ni tienen costos).
   */
  async refreshFromHistory(organizationId: string) {
    const vehicles = await this.prisma.vehicle.findMany({ where: { organizationId, status: { not: 'retired' }, maintenancePlanId: { not: null } }, select: { id: true, plate: true, currentOdometer: true } });
    const baselines: { plate: string; routine: string; from: number; to: number }[] = [];
    const cancelled: { plate: string; number: string; reason: string }[] = [];
    for (const v of vehicles) {
      const base = await this.estimatedBaseline(v.id, v.currentOdometer);
      const schedules = await this.prisma.vehiclePmSchedule.findMany({ where: { vehicleId: v.id, baselineEstimated: true }, include: { routine: true } });
      for (const s of schedules) {
        if (base.meter > s.lastDoneMeter) {
          await this.prisma.vehiclePmSchedule.update({ where: { id: s.id }, data: { lastDoneAt: base.at, lastDoneMeter: base.meter } });
          baselines.push({ plate: v.plate, routine: s.routine.code, from: s.lastDoneMeter, to: base.meter });
        }
      }
      await this.recomputeVehicle(v.id);
      const stale = await this.prisma.workOrder.findMany({
        where: { vehicleId: v.id, origin: 'pm', status: { in: ['planned', 'scheduled'] }, labor: { none: {} }, parts: { none: {} }, externalServices: { none: {} } },
        include: { pmRoutine: { include: { schedules: { where: { vehicleId: v.id } } } } },
      });
      for (const wo of stale) {
        const sch = wo.pmRoutine?.schedules[0];
        if (!sch || sch.status === 'due' || sch.status === 'overdue') continue;
        const reason = `Preventivo ya ejecutado según el historial (${sch.lastDoneAt.toISOString().slice(0, 10)}, ${sch.lastDoneMeter.toLocaleString('es-CO')} km)`;
        await this.prisma.$transaction([
          this.prisma.workOrder.update({ where: { id: wo.id }, data: { status: 'cancelled', cancelReason: reason } }),
          this.prisma.workOrderEvent.create({ data: { workOrderId: wo.id, action: 'cancel', fromStatus: wo.status, toStatus: 'cancelled', comment: reason } }),
          this.prisma.vehiclePmSchedule.updateMany({ where: { openWorkOrderId: wo.id }, data: { openWorkOrderId: null } }),
        ]);
        cancelled.push({ plate: v.plate, number: wo.number, reason });
      }
      if (stale.length) await this.recomputeVehicle(v.id);
    }
    return { baselines, cancelled };
  }

  // ───── Asignación y consultas ─────

  private async scopedVehicle(user: AuthUser, id: string) {
    const v = await this.prisma.vehicle.findFirst({ where: { id, organizationId: user.organizationId, ...siteScope(user) } });
    if (!v) throw new AppError('NOT_FOUND', 'Vehículo no encontrado', HttpStatus.NOT_FOUND);
    return v;
  }

  /**
   * Línea base estimada: el preventivo cerrado con mayor kilometraje (más confiable que la fecha, que en el
   * historial en Excel tiene errores de digitación), o el kilometraje y la fecha actuales.
   */
  private async estimatedBaseline(vehicleId: string, fallbackMeter: number | null) {
    const last = await this.prisma.workOrder.findFirst({
      where: { vehicleId, type: 'PM', status: 'closed', odometerOut: { not: null } },
      orderBy: [{ odometerOut: 'desc' }, { closedAt: 'desc' }],
      select: { closedAt: true, odometerOut: true },
    });
    if (last) return { at: last.closedAt!, meter: last.odometerOut! };
    return { at: new Date(), meter: fallbackMeter ?? 0 };
  }

  async assignPlan(user: AuthUser, vehicleId: string, planId: string | null) {
    const v = await this.scopedVehicle(user, vehicleId);
    if (!planId) {
      await this.prisma.$transaction([
        this.prisma.vehiclePmSchedule.deleteMany({ where: { vehicleId } }),
        this.prisma.vehicle.update({ where: { id: vehicleId }, data: { maintenancePlanId: null } }),
      ]);
      return { plan: null };
    }
    const plan = await this.prisma.maintenancePlan.findFirst({ where: { id: planId, organizationId: user.organizationId, active: true }, include: { routines: true } });
    if (!plan) throw new AppError('UNKNOWN_PLAN', 'Plan no encontrado');
    const base = await this.estimatedBaseline(vehicleId, v.currentOdometer);
    await this.prisma.$transaction(async (tx) => {
      await tx.vehiclePmSchedule.deleteMany({ where: { vehicleId, routineId: { notIn: plan.routines.map((r) => r.id) } } });
      for (const r of plan.routines) {
        await tx.vehiclePmSchedule.upsert({
          where: { vehicleId_routineId: { vehicleId, routineId: r.id } },
          create: { vehicleId, routineId: r.id, lastDoneAt: base.at, lastDoneMeter: base.meter, baselineEstimated: true },
          update: {},
        });
      }
      await tx.vehicle.update({ where: { id: vehicleId }, data: { maintenancePlanId: plan.id } });
    });
    const r = await this.recomputeVehicle(vehicleId);
    return { plan: { id: plan.id, code: plan.code, name: plan.name }, baseline: base, generated: r.generated };
  }

  /** Registrar la última ejecución real de una rutina (corrige la línea base estimada). */
  async setBaseline(user: AuthUser, vehicleId: string, routineId: string, b: { doneAt: Date; meter: number }) {
    const v = await this.scopedVehicle(user, vehicleId);
    if (b.doneAt.getTime() > Date.now()) throw new AppError('FUTURE_DATE', 'La fecha no puede ser futura');
    const current = v.currentOdometer != null ? v.currentOdometer + v.odometerOffset : null;
    if (current != null && b.meter > current) throw new AppError('METER_ABOVE_CURRENT', `El kilometraje no puede superar el vigente (${current})`);
    const s = await this.prisma.vehiclePmSchedule.findUnique({ where: { vehicleId_routineId: { vehicleId, routineId } }, include: { routine: { include: { plan: { include: { routines: true } } } } } });
    if (!s) throw new AppError('NOT_FOUND', 'La rutina no está asignada a este vehículo', HttpStatus.NOT_FOUND);
    const nested = s.routine.plan.routines.map((r) => ({ id: r.code, includes: r.includes }));
    const ids = s.routine.plan.routines.filter((r) => routinesResetByCompletion(s.routine.code, nested).includes(r.code)).map((r) => r.id);
    // Solo mueve las rutinas incluidas si la nueva fecha es más reciente que su base actual.
    await this.prisma.$transaction(async (tx) => {
      for (const sch of await tx.vehiclePmSchedule.findMany({ where: { vehicleId, routineId: { in: ids } } })) {
        if (sch.routineId === routineId || sch.lastDoneAt < b.doneAt)
          await tx.vehiclePmSchedule.update({ where: { id: sch.id }, data: { lastDoneAt: b.doneAt, lastDoneMeter: b.meter, baselineEstimated: false } });
      }
    });
    return this.recomputeVehicle(vehicleId);
  }

  /** Asigna el plan sugerido a los vehículos activos que aún no tienen plan. */
  async assignSuggested(user: AuthUser) {
    const [vehicles, plans] = await Promise.all([
      this.prisma.vehicle.findMany({
        where: { organizationId: user.organizationId, status: { not: 'retired' }, maintenancePlanId: null, ...siteScope(user) },
        include: { vehicleModel: { include: { vehicleType: true } } },
      }),
      this.prisma.maintenancePlan.findMany({ where: { organizationId: user.organizationId, active: true } }),
    ]);
    const assigned: { plate: string; plan: string; generated: string[] }[] = [];
    const skipped: string[] = [];
    for (const v of vehicles) {
      const code = suggestPlanCode({ typeCode: v.vehicleModel.vehicleType.code, model: v.vehicleModel.model, year: v.year });
      const plan = plans.find((p) => p.code === code);
      if (!plan) { skipped.push(v.plate); continue; }
      const r = await this.assignPlan(user, v.id, plan.id);
      assigned.push({ plate: v.plate, plan: plan.code, generated: r.generated ?? [] });
    }
    return { assigned, skipped };
  }

  plans(user: AuthUser) {
    return this.prisma.maintenancePlan.findMany({
      where: { organizationId: user.organizationId },
      include: { routines: { orderBy: { sequence: 'asc' }, include: { tasks: { orderBy: { sequence: 'asc' } } } }, _count: { select: { vehicles: true } } },
      orderBy: { code: 'asc' },
    });
  }

  async updateRoutine(user: AuthUser, routineId: string, b: { intervalDistance?: number | null; intervalDays?: number | null; estimatedHours?: number | null; name?: string }) {
    const r = await this.prisma.pmRoutine.findFirst({ where: { id: routineId, plan: { organizationId: user.organizationId } } });
    if (!r) throw new AppError('NOT_FOUND', 'Rutina no encontrada', HttpStatus.NOT_FOUND);
    if (b.intervalDistance === null && b.intervalDays === null) throw new AppError('INTERVAL_REQUIRED', 'La rutina necesita al menos un intervalo');
    const updated = await this.prisma.pmRoutine.update({ where: { id: routineId }, data: b });
    const vehicles = await this.prisma.vehiclePmSchedule.findMany({ where: { routineId }, select: { vehicleId: true } });
    for (const v of vehicles) await this.recomputeVehicle(v.vehicleId);
    return updated;
  }

  async addTask(user: AuthUser, routineId: string, b: { description: string; componentCode?: string | null }) {
    const r = await this.prisma.pmRoutine.findFirst({ where: { id: routineId, plan: { organizationId: user.organizationId } }, include: { tasks: true } });
    if (!r) throw new AppError('NOT_FOUND', 'Rutina no encontrada', HttpStatus.NOT_FOUND);
    return this.prisma.pmRoutineTask.create({ data: { routineId, description: b.description, componentCode: b.componentCode ?? null, sequence: (Math.max(0, ...r.tasks.map((t) => t.sequence)) + 10) } });
  }

  async removeTask(user: AuthUser, taskId: string) {
    const del = await this.prisma.pmRoutineTask.deleteMany({ where: { id: taskId, routine: { plan: { organizationId: user.organizationId } } } });
    if (!del.count) throw new AppError('NOT_FOUND', 'Tarea no encontrada', HttpStatus.NOT_FOUND);
    return { ok: true };
  }

  /** Pronóstico: vencimientos ordenados por % consumido (doc 02 P5, tablero de previsión). */
  forecast(user: AuthUser, q: { status?: string; site?: string; weeks?: number }) {
    const until = q.weeks ? new Date(Date.now() + q.weeks * 7 * DAY) : null;
    return this.prisma.vehiclePmSchedule.findMany({
      where: {
        vehicle: { organizationId: user.organizationId, status: { not: 'retired' }, ...siteScope(user), ...(q.site ? { site: { code: q.site } } : {}) },
        ...(q.status ? { status: { in: q.status.split(',') } } : {}),
        ...(until ? { OR: [{ projectedDueDate: { lte: until } }, { status: { in: ['due', 'overdue'] } }] } : {}),
      },
      include: {
        vehicle: { select: { id: true, plate: true, currentOdometer: true, lastReadingAt: true, criticality: true, site: { select: { code: true, name: true } }, vehicleModel: { select: { model: true } } } },
        routine: { select: { id: true, code: true, name: true, intervalDistance: true, intervalDays: true, plan: { select: { code: true, name: true } } } },
      },
      orderBy: [{ pctConsumed: 'desc' }],
    });
  }

  async vehicleSchedules(user: AuthUser, vehicleId: string) {
    const v = await this.scopedVehicle(user, vehicleId);
    const [plan, schedules] = await Promise.all([
      v.maintenancePlanId ? this.prisma.maintenancePlan.findUnique({ where: { id: v.maintenancePlanId }, select: { id: true, code: true, name: true } }) : null,
      this.prisma.vehiclePmSchedule.findMany({ where: { vehicleId }, include: { routine: { select: { id: true, code: true, name: true, intervalDistance: true, intervalDays: true, sequence: true } } }, orderBy: { routine: { sequence: 'asc' } } }),
    ]);
    return { plan, schedules };
  }
}
