import { Injectable } from '@nestjs/common';
import { findReworkOrigin, isNonWorkingDay, kpi, requiresTechnicalInspection, type ClosedRepair } from '@cmms/domain';
import { CORRECTIVE_WORK_ORDER_TYPES, PLANNED_WORK_ORDER_TYPES, UNAVAILABLE_FOR_AVAILABILITY, type VehicleStatus, type WorkOrderType } from '@cmms/shared';
import { PrismaService } from '../../common/prisma.service';
import { AuthUser, siteScope } from '../../common/auth.decorators';
import { localDayRange } from '../../common/time';

/**
 * Indicadores (doc 05). Todo se calcula en memoria sobre un conjunto de datos cargado una vez por consulta:
 * con la flota de OLAST (decenas de vehículos, miles de OT) es rápido y mantiene las fórmulas en `@cmms/domain`.
 *
 * Historial migrado del Excel (OT `isHistorical`): trae fecha, km, costo y componente, pero no tiempos de reparación,
 * prioridad ni programación. Por eso entra en costo, km, fallas, retrabajo y Pareto, y se excluye de los KPI de tiempos,
 * planificación y calidad de codificación (cada KPI lo declara en `scope`).
 */

export interface KpiQuery { from: Date; to: Date; site?: string; type?: string }
export type KpiCode =
  | 'availability' | 'pm_compliance' | 'planned' | 'mtbf' | 'mttr' | 'downtime' | 'cost_per_km'
  | 'backlog' | 'schedule' | 'rework' | 'inspection' | 'sla' | 'data_quality' | 'documents';

interface Def { n: number; name: string; unit: 'pct' | 'km' | 'h' | 'd' | 'cop_km' | 'weeks'; target: number | [number, number] | null; direction: kpi.KpiDirection; targetLabel: string; scope: string; trend: boolean; band?: number }

export const KPI_DEFS: Record<KpiCode, Def> = {
  availability: { n: 1, name: 'Disponibilidad de flota', unit: 'pct', target: 0.95, direction: 'higher', targetLabel: '≥ 95 %', trend: true, band: 0.03, scope: '' },
  pm_compliance: { n: 2, name: 'Cumplimiento de PM', unit: 'pct', target: 0.9, direction: 'higher', targetLabel: '≥ 90 %', trend: true, scope: 'PM hechos sin pasar el intervalo del plan + 10 %, comparando cada PM con el anterior del vehículo. Incluye historial.' },
  planned: { n: 3, name: '% mantenimiento planificado (costo)', unit: 'pct', target: 0.8, direction: 'higher', targetLabel: '≥ 80 %', trend: true, scope: 'OT registradas en el CMMS (el Excel no distingue emergencia de programado).' },
  mtbf: { n: 4, name: 'MTBF (km entre fallas)', unit: 'km', target: null, direction: 'higher', targetLabel: 'Creciente', trend: true, scope: 'Km de la flota / OT correctivas (sin accidentes). Incluye historial.' },
  mttr: { n: 5, name: 'MTTR (horas por reparación)', unit: 'h', target: 24, direction: 'lower', targetLabel: '≤ 24 h', trend: true, band: 0.5, scope: 'OT correctivas registradas en el CMMS con inicio y fin de ejecución.' },
  downtime: { n: 6, name: 'Días hábiles fuera de servicio por parada', unit: 'd', target: null, direction: 'lower', targetLabel: 'Decreciente', trend: true, scope: '' },
  cost_per_km: { n: 7, name: 'Costo de mantenimiento por km', unit: 'cop_km', target: null, direction: 'lower', targetLabel: 'Línea base', trend: true, scope: 'Mano de obra + repuestos + servicios externos / km. Sin siniestros. Incluye historial.' },
  backlog: { n: 8, name: 'Backlog', unit: 'weeks', target: [2, 4], direction: 'range', targetLabel: '2 – 4 semanas', trend: false, scope: 'Horas estimadas de OT abiertas / capacidad semanal de técnicos propios (40 h c/u). Foto de hoy.' },
  schedule: { n: 9, name: 'Cumplimiento del programa', unit: 'pct', target: 0.85, direction: 'higher', targetLabel: '≥ 85 %', trend: true, scope: 'OT con fecha programada, terminadas a tiempo.' },
  rework: { n: 10, name: 'Retrabajo', unit: 'pct', target: 0.03, direction: 'lower', targetLabel: '≤ 3 %', trend: true, band: 1, scope: 'OT correctivas que repiten el componente en 30 días / 3 000 km. Incluye historial.' },
  inspection: { n: 11, name: 'Cumplimiento de inspección diaria', unit: 'pct', target: 0.98, direction: 'higher', targetLabel: '≥ 98 %', trend: true, band: 0.05, scope: 'Días hábiles (lunes a sábado, sin festivos) en que cada vehículo operativo tuvo inspección, desde que se usa la inspección en la app.' },
  sla: { n: 12, name: 'Cumplimiento de tiempos por prioridad', unit: 'pct', target: 0.9, direction: 'higher', targetLabel: 'P1 ≥ 95 % · P2 ≥ 90 %', trend: true, scope: 'Desde el aviso hasta el fin de la reparación, frente al tiempo objetivo de su prioridad.' },
  data_quality: { n: 13, name: 'Calidad del dato (codificación)', unit: 'pct', target: 0.95, direction: 'higher', targetLabel: '≥ 95 %', trend: true, band: 0.05, scope: 'OT correctivas cerradas con componente, modo, causa y acción. Sin historial (se codificó automáticamente desde el texto).' },
  documents: { n: 14, name: 'Documentos vigentes', unit: 'pct', target: 1, direction: 'higher', targetLabel: '100 %', trend: false, band: 0.05, scope: 'Vehículos activos con SOAT y técnico-mecánica (si aplica) vigentes. Foto a la fecha final.' },
};

const HOUR = 3_600_000;
const DONE = ['completed', 'closed'];
const OPEN = ['planned', 'scheduled', 'in_progress', 'on_hold'];
const AVAILABLE: VehicleStatus[] = ['operational', 'operational_restricted'];
const n = (d: unknown) => (d == null ? 0 : Number(d));

type Data = Awaited<ReturnType<KpiService['load']>>;
type Wo = Data['orders'][number];

@Injectable()
export class KpiService {
  constructor(private readonly prisma: PrismaService) {}

  async load(user: AuthUser, q: KpiQuery) {
    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: user.organizationId } });
    const vehicles = await this.prisma.vehicle.findMany({
      where: {
        organizationId: user.organizationId,
        ...siteScope(user),
        ...(q.site ? { site: { code: q.site } } : {}),
        ...(q.type ? { vehicleModel: { vehicleType: { code: q.type } } } : {}),
      },
      select: {
        id: true, plate: true, status: true, year: true, serviceType: true, createdAt: true,
        site: { select: { code: true, name: true } },
        vehicleModel: { select: { make: true, model: true, vehicleType: { select: { code: true, name: true } } } },
        statusLog: { select: { status: true, startedAt: true, endedAt: true, reason: true, workOrderId: true } },
        readings: { where: { meterType: 'odometer' }, select: { accumulatedValue: true, readAt: true } },
        documents: { select: { expiresAt: true, documentType: { select: { code: true, isBlocking: true } } } },
        maintenancePlan: { select: { code: true, routines: { select: { intervalDistance: true } } } },
      },
      orderBy: { plate: 'asc' },
    });
    const ids = vehicles.map((v) => v.id);
    const [orders, inspections, priorities, technicians, blockingTypes] = await Promise.all([
      this.prisma.workOrder.findMany({
        where: { vehicleId: { in: ids }, status: { not: 'cancelled' } },
        select: {
          id: true, number: true, vehicleId: true, type: true, priority: true, status: true, description: true, isHistorical: true, isRework: true,
          createdAt: true, plannedStart: true, plannedEnd: true, actualStart: true, actualEnd: true, closedAt: true, odometerIn: true, estimatedHours: true,
          laborCost: true, partsCost: true, externalCost: true, totalCost: true,
          failures: { select: { componentCode: true, failureMode: true, cause: true, action: true } },
          requests: { select: { reportedAt: true } },
        },
      }),
      this.prisma.inspection.findMany({ where: { vehicleId: { in: ids } }, select: { vehicleId: true, performedAt: true } }),
      this.prisma.priorityDef.findMany(),
      this.prisma.technician.count({ where: { organizationId: user.organizationId, active: true } }),
      this.prisma.documentType.findMany({ where: { active: true, isBlocking: true }, select: { code: true } }),
    ]);
    const plate = new Map(vehicles.map((v) => [v.id, v]));
    const ordersExt = orders.map((o) => ({
      ...o,
      plate: plate.get(o.vehicleId)!.plate,
      doneAt: DONE.includes(o.status) ? (o.actualEnd ?? o.closedAt) : null,
      cost: n(o.totalCost),
      accident: o.type === 'SIN' || o.failures.some((f) => f.cause === 'ACC'),
    }));
    markHistoricalRework(ordersExt);
    const woType = new Map(orders.map((o) => [o.id, o.type]));
    for (const v of vehicles) for (const l of v.statusLog) (l as typeof l & { woType?: string }).woType = l.workOrderId ? woType.get(l.workOrderId) : undefined;
    return { tz: org.timezone, policy: availabilityPolicy(org.settings), windows: new Map<string, kpi.TimeWindow[]>(), vehicles, orders: ordersExt, inspections, priorities, technicians, blockingTypes: blockingTypes.map((t) => t.code) };
  }

  /** Puntos (fecha, km) del vehículo: lecturas y OT con kilometraje. */
  private kmPoints(d: Data, vehicleId: string) {
    const v = d.vehicles.find((x) => x.id === vehicleId)!;
    return [
      ...v.readings.map((r) => ({ at: r.readAt, km: r.accumulatedValue })),
      ...d.orders.filter((o) => o.vehicleId === vehicleId && o.odometerIn != null && (o.doneAt ?? o.actualStart)).map((o) => ({ at: (o.doneAt ?? o.actualStart)!, km: o.odometerIn! })),
    ];
  }

  private fleetKm(d: Data, from: Date, to: Date) {
    return d.vehicles.reduce((s, v) => s + kpi.distanceInPeriod(this.kmPoints(d, v.id), from, to), 0);
  }

  private doneIn(d: Data, from: Date, to: Date, pred: (o: Wo) => boolean = () => true) {
    return d.orders.filter((o) => o.doneAt && o.doneAt >= from && o.doneAt < to && pred(o));
  }

  /** Valor de cada KPI en [from, to). `detail` explica el numerador/denominador. */
  compute(d: Data, from: Date, to: Date, now = new Date()): Record<KpiCode, { value: number | null; detail: string }> {
    const end = new Date(Math.min(to.getTime(), now.getTime()));
    const corrective = (o: Wo) => CORRECTIVE_WORK_ORDER_TYPES.includes(o.type as WorkOrderType);
    const out = {} as Record<KpiCode, { value: number | null; detail: string }>;

    // 1. Disponibilidad
    const intervals = d.vehicles.flatMap((v) => v.statusLog.map((l) => ({ vehicleId: v.id, ...l })));
    const days = this.workdays(d, from, end);
    const withPm = kpi.availabilityInWindows(intervals, days);
    const withoutPm = kpi.availabilityInWindows(intervals, days, isPreventiveStop);
    const p1 = (v: number | null) => (v == null ? '—' : `${(v * 100).toFixed(1).replace('.', ',')} %`);
    out.availability = d.policy.includePreventive
      ? { value: withPm, detail: `Sin preventivos: ${p1(withoutPm)} · ${days.length} días hábiles` }
      : { value: withoutPm, detail: `Con preventivos: ${p1(withPm)} · ${days.length} días hábiles` };

    // 2. Cumplimiento PM por intervalo real
    let pmOk = 0, pmAll = 0;
    for (const v of d.vehicles) {
      const interval = Math.min(...(v.maintenancePlan?.routines.map((r) => r.intervalDistance ?? Infinity) ?? [Infinity]));
      if (!Number.isFinite(interval)) continue;
      const pms = d.orders.filter((o) => o.vehicleId === v.id && o.type === 'PM' && o.doneAt && o.odometerIn != null).map((o) => ({ at: o.doneAt!, km: o.odometerIn! }));
      for (const r of kpi.pmIntervalResults(pms, interval)) if (r.at >= from && r.at < to) { pmAll++; if (r.onTime) pmOk++; }
    }
    out.pm_compliance = { value: kpi.percentage(pmOk, pmAll), detail: `${pmOk} de ${pmAll} PM a tiempo` };

    // 3. % planificado por costo (sin historial)
    const live = this.doneIn(d, from, to, (o) => !o.isHistorical && o.type !== 'SIN');
    const byCost = live.some((o) => o.cost > 0);
    out.planned = {
      value: kpi.plannedPercentage(live.map((o) => ({ type: o.type as WorkOrderType, weight: byCost ? o.cost : 1 }))),
      detail: `${live.filter((o) => PLANNED_WORK_ORDER_TYPES.includes(o.type as WorkOrderType)).length} de ${live.length} OT planificadas`,
    };

    // 4 y 7. MTBF y costo/km (con historial)
    const km = this.fleetKm(d, from, to);
    const failures = this.doneIn(d, from, to, (o) => corrective(o) && !o.accident);
    out.mtbf = { value: failures.length ? kpi.mtbf(km, failures.map(() => ({ cause: null }))) : null, detail: `${km.toLocaleString('es-CO')} km / ${failures.length} fallas` };
    const cost = this.doneIn(d, from, to, (o) => !o.accident).reduce((s, o) => s + o.cost, 0);
    out.cost_per_km = { value: kpi.costPerKm(cost, km), detail: `$${Math.round(cost).toLocaleString('es-CO')} / ${km.toLocaleString('es-CO')} km` };

    // 5. MTTR (sin historial)
    const repairs = this.doneIn(d, from, to, (o) => corrective(o) && !o.isHistorical && !!o.actualStart && !!o.actualEnd).map((o) => ({ actualStart: o.actualStart!, actualEnd: o.actualEnd! }));
    out.mttr = { value: kpi.mttrHours(repairs), detail: `${repairs.length} reparaciones` };

    // 6. Días fuera de servicio por parada (paradas que empezaron en el periodo, duración completa)
    const stops = intervals.filter((i) => UNAVAILABLE_FOR_AVAILABILITY.includes(i.status) && i.startedAt >= from && i.startedAt < to);
    // Duración en días hábiles (sin domingos ni festivos), igual que el cuadro de disponibilidad.
    const dur = (i: (typeof stops)[number]) => kpi.windowsCovered(i.startedAt, i.endedAt ?? now, this.workdays(d, i.startedAt, i.endedAt ?? now));
    const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
    const corrStops = stops.filter((i) => !isPreventiveStop(i)).map(dur), pmStops = stops.filter(isPreventiveStop).map(dur);
    const d1 = (v: number | null) => (v == null ? '—' : `${v.toFixed(1).replace('.', ',')} d`);
    out.downtime = { value: d.policy.includePreventive ? mean(stops.map(dur)) : mean(corrStops), detail: stops.length ? `${stops.length} paradas · correctiva ${d1(mean(corrStops))} (${corrStops.length}) · preventiva ${d1(mean(pmStops))} (${pmStops.length})` : '0 paradas' };

    // 8. Backlog (foto de hoy)
    const open = d.orders.filter((o) => OPEN.includes(o.status));
    const hours = open.reduce((s, o) => s + n(o.estimatedHours), 0);
    out.backlog = {
      value: kpi.backlogWeeks(hours, d.technicians * 40),
      detail: d.technicians ? `${open.length} OT abiertas · ${Math.round(hours)} h estimadas · ${d.technicians} técnico(s)` : `${open.length} OT abiertas · registre técnicos propios para medirlo en semanas`,
    };

    // 9. Cumplimiento del programa
    const scheduled = d.orders.filter((o) => !o.isHistorical && o.plannedStart && o.plannedStart >= from && o.plannedStart < end);
    const onSchedule = scheduled.filter((o) => o.doneAt && o.doneAt.getTime() <= (o.plannedEnd ?? new Date(o.plannedStart!.getTime() + 7 * 24 * HOUR)).getTime());
    out.schedule = { value: kpi.percentage(onSchedule.length, scheduled.length), detail: `${onSchedule.length} de ${scheduled.length} OT programadas` };

    // 10. Retrabajo
    const corr = this.doneIn(d, from, to, corrective);
    out.rework = { value: kpi.percentage(corr.filter((o) => o.isRework).length, corr.length), detail: `${corr.filter((o) => o.isRework).length} de ${corr.length} correctivas` };

    // 11. Inspección diaria (días-vehículo)
    out.inspection = this.inspectionCompliance(d, from, end);

    // 12. SLA por prioridad (sin historial)
    const target = new Map(d.priorities.map((p) => [p.code, p.targetResolutionHours]));
    const sla = this.doneIn(d, from, to, (o) => corrective(o) && !o.isHistorical && target.has(o.priority));
    const met = sla.filter((o) => kpi.withinSla(o.requests.reduce((m, r) => (r.reportedAt < m ? r.reportedAt : m), o.createdAt), o.doneAt!, target.get(o.priority)!));
    const byP = ['P1', 'P2'].map((p) => {
      const all = sla.filter((o) => o.priority === p);
      return all.length ? `${p}: ${met.filter((o) => o.priority === p).length}/${all.length}` : null;
    }).filter(Boolean);
    out.sla = { value: kpi.percentage(met.length, sla.length), detail: [`${met.length} de ${sla.length} a tiempo`, ...byP].join(' · ') };

    // 13. Calidad del dato (sin historial)
    const coded = this.doneIn(d, from, to, (o) => corrective(o) && !o.isHistorical);
    const complete = coded.filter((o) => o.failures.some((f) => f.componentCode.includes('.') && f.failureMode && f.cause && f.action));
    out.data_quality = { value: kpi.percentage(complete.length, coded.length), detail: `${complete.length} de ${coded.length} OT completas` };

    // 14. Documentos vigentes (a la fecha final)
    const active = d.vehicles.filter((v) => v.status !== 'retired');
    const valid = active.filter((v) =>
      d.blockingTypes.every((code) => {
        if (code === 'RTM' && !requiresTechnicalInspection({ year: v.year, serviceType: v.serviceType, vehicleTypeCode: v.vehicleModel.vehicleType.code }, end)) return true;
        const doc = v.documents.find((x) => x.documentType.code === code);
        return !!doc?.expiresAt && doc.expiresAt >= end;
      }),
    );
    out.documents = { value: kpi.percentage(valid.length, active.length), detail: `${valid.length} de ${active.length} vehículos` };
    return out;
  }

  private inspectionCompliance(d: Data, from: Date, end: Date) {
    const first = d.inspections.reduce<Date | null>((m, i) => (!m || i.performedAt < m ? i.performedAt : m), null);
    if (!first || end <= from) return { value: null, detail: 'Aún no hay inspecciones registradas' };
    const done = new Set(d.inspections.map((i) => `${i.vehicleId}|${localDayRange(d.tz, i.performedAt).day}`));
    let expected = 0, ok = 0;
    for (const w of this.workdays(d, new Date(Math.max(from.getTime(), localDayRange(d.tz, first).start.getTime())), end)) {
      const day = { day: localDayRange(d.tz, new Date(w.start.getTime() + 12 * HOUR)).day };
      const noon = new Date(w.start.getTime() + 12 * HOUR);
      for (const v of d.vehicles) {
        const st = v.statusLog.find((l) => l.startedAt <= noon && (!l.endedAt || l.endedAt > noon))?.status;
        if (!st || !AVAILABLE.includes(st)) continue;
        expected++;
        if (done.has(`${v.id}|${day.day}`)) ok++;
      }
    }
    return { value: kpi.percentage(ok, expected), detail: `${ok} de ${expected} días-vehículo` };
  }

  /** Días hábiles de la operación (lunes a sábado, sin festivos de Colombia) en [from, to), como ventanas locales. */
  private workdays(d: Data, from: Date, to: Date): kpi.TimeWindow[] {
    const key = `${from.getTime()}|${to.getTime()}`;
    const hit = d.windows.get(key);
    if (hit) return hit;
    const out: kpi.TimeWindow[] = [];
    let day = localDayRange(d.tz, from);
    for (let guard = 0; day.start < to && guard < 1200; guard++) {
      if (!isNonWorkingDay(day.day)) {
        const s = Math.max(day.start.getTime(), from.getTime()), e = Math.min(day.end.getTime(), to.getTime());
        if (e > s) out.push({ start: new Date(s), end: new Date(e) });
      }
      day = localDayRange(d.tz, new Date(day.end.getTime() + HOUR));
    }
    d.windows.set(key, out);
    return out;
  }

  /** Meses calendario locales [inicio, fin) que terminan en el mes de `to`. */
  months(tz: string, to: Date, count: number) {
    const last = new Date(to.getTime() - 1);
    const [y, m] = last.toLocaleDateString('en-CA', { timeZone: tz }).split('-').map(Number) as [number, number];
    const out: { label: string; from: Date; to: Date }[] = [];
    for (let i = count - 1; i >= 0; i--) {
      const yy = y + Math.floor((m - 1 - i) / 12), mm = (((m - 1 - i) % 12) + 12) % 12;
      const start = localDayRange(tz, new Date(Date.UTC(yy, mm, 1, 12))).start;
      const next = localDayRange(tz, new Date(Date.UTC(yy, mm + 1, 1, 12))).start;
      out.push({ label: `${yy}-${String(mm + 1).padStart(2, '0')}`, from: start, to: next });
    }
    return out;
  }

  async dashboard(user: AuthUser, q: KpiQuery) {
    const d = await this.load(user, q);
    const now = new Date();
    const main = this.compute(d, q.from, q.to, now);
    const trend = this.months(d.tz, q.to, 6).map((m) => ({ month: m.label, values: this.compute(d, m.from, m.to, now) }));
    const kpis = (Object.keys(KPI_DEFS) as KpiCode[]).map((code) => {
      const def = { ...KPI_DEFS[code], ...policyText(code, d.policy) };
      const value = main[code].value;
      return {
        code, ...def, value, detail: main[code].detail,
        light: kpiLight(value, def),
        trend: def.trend ? trend.map((t) => ({ month: t.month, value: t.values[code].value })) : [],
      };
    });

    // Costo por mes y tipo (incluye historial y siniestros, todo lo pagado).
    const span = Math.min(24, Math.max(1, Math.round((q.to.getTime() - q.from.getTime()) / (30.44 * 24 * HOUR))));
    const costByMonth = this.months(d.tz, q.to, span).map((m) => {
      const row: Record<string, number | string> = { month: m.label, total: 0 };
      for (const o of this.doneIn(d, m.from, m.to)) {
        row[o.type] = ((row[o.type] as number) ?? 0) + o.cost;
        row.total = (row.total as number) + o.cost;
      }
      return row;
    });
    const period = this.doneIn(d, q.from, q.to);
    const totalCost = period.reduce((s, o) => s + o.cost, 0);
    const preventive = period.filter((o) => PREVENTIVE.includes(o.type)).reduce((s, o) => s + o.cost, 0);
    return {
      period: { from: q.from.toISOString(), to: q.to.toISOString() },
      vehicles: d.vehicles.filter((v) => v.status !== 'retired').length,
      summary: { orders: period.length, totalCost, preventiveCost: preventive, correctiveCost: totalCost - preventive, km: this.fleetKm(d, q.from, q.to) },
      kpis,
      costByMonth,
    };
  }

  /** Pareto de fallas (OT correctivas, incluye historial). `by`: sistema, conjunto, componente, causa o modo. */
  async pareto(user: AuthUser, q: KpiQuery & { by: ParetoBy; metric: 'count' | 'cost' }) {
    const d = await this.load(user, q);
    const names = await this.names(q.by);
    const buckets = new Map<string, { value: number; orders: Map<string, { id: string; number: string; plate: string; date: string; cost: number; description: string }> }>();
    for (const o of this.doneIn(d, q.from, q.to, (x) => CORRECTIVE_WORK_ORDER_TYPES.includes(x.type as WorkOrderType))) {
      const keys = [...new Set(o.failures.map((f) => keyOf(q.by, f)))];
      if (!keys.length) keys.push('SIN_CODIFICAR');
      for (const k of keys) {
        const b = buckets.get(k) ?? { value: 0, orders: new Map() };
        b.value += q.metric === 'count' ? 1 : o.cost / keys.length;
        b.orders.set(o.id, { id: o.id, number: o.number, plate: o.plate, date: o.doneAt!.toISOString().slice(0, 10), cost: o.cost, description: o.description });
        buckets.set(k, b);
      }
    }
    return kpi.pareto([...buckets].map(([key, b]) => ({ key, value: b.value }))).map((r) => ({
      ...r,
      name: r.key === 'SIN_CODIFICAR' ? 'Sin codificar' : r.key === 'SIN_DATO' ? 'Sin dato' : (names.get(r.key) ?? r.key),
      orders: [...buckets.get(r.key)!.orders.values()].sort((a, b) => b.date.localeCompare(a.date)),
    }));
  }

  private async names(by: ParetoBy) {
    if (by === 'cause') return new Map((await this.prisma.failureCause.findMany()).map((c) => [c.code, c.name]));
    if (by === 'mode') return new Map((await this.prisma.failureMode.findMany()).map((c) => [c.code, c.name]));
    return new Map((await this.prisma.componentCode.findMany({ select: { code: true, name: true } })).map((c) => [c.code, c.name]));
  }

  /** Malos actores: indicadores por vehículo en el periodo, ordenados por la métrica pedida. */
  async badActors(user: AuthUser, q: KpiQuery & { metric: BadActorMetric }) {
    const d = await this.load(user, q);
    const end = new Date(Math.min(q.to.getTime(), Date.now()));
    const rows = d.vehicles.map((v) => {
      const orders = this.doneIn(d, q.from, q.to, (o) => o.vehicleId === v.id);
      const failures = orders.filter((o) => CORRECTIVE_WORK_ORDER_TYPES.includes(o.type as WorkOrderType) && !o.accident).length;
      const cost = orders.filter((o) => !o.accident).reduce((s, o) => s + o.cost, 0);
      const km = kpi.distanceInPeriod(this.kmPoints(d, v.id), q.from, q.to);
      return {
        id: v.id, plate: v.plate, site: v.site.name, model: `${v.vehicleModel.make} ${v.vehicleModel.model}`, type: v.vehicleModel.vehicleType.name, status: v.status,
        orders: orders.length, failures, cost, km,
        costPerKm: km >= 1000 ? cost / km : null,
        kmBetweenFailures: failures ? km / failures : null,
        availability: kpi.availabilityInWindows(v.statusLog.map((l) => ({ vehicleId: v.id, ...l })), this.workdays(d, q.from, end), d.policy.includePreventive ? () => false : isPreventiveStop),
      };
    });
    const key: Record<BadActorMetric, (r: (typeof rows)[number]) => number> = {
      cost: (r) => r.cost,
      failures: (r) => r.failures,
      costPerKm: (r) => r.costPerKm ?? -1,
      availability: (r) => (r.availability == null ? -1 : 1 - r.availability),
    };
    return rows.sort((a, b) => key[q.metric](b) - key[q.metric](a) || b.cost - a.cost);
  }

  /** OT terminadas en el periodo (para la exportación). */
  async ordersIn(user: AuthUser, q: KpiQuery) {
    const d = await this.load(user, q);
    const sites = new Map(d.vehicles.map((v) => [v.id, v.site.name]));
    return this.doneIn(d, q.from, q.to).sort((a, b) => a.doneAt!.getTime() - b.doneAt!.getTime()).map((o) => ({ ...o, site: sites.get(o.vehicleId)! }));
  }
}

export type ParetoBy = 'system' | 'assembly' | 'component' | 'cause' | 'mode';
export type BadActorMetric = 'cost' | 'failures' | 'costPerKm' | 'availability';
const PREVENTIVE = ['PM', 'INS', 'PDM'];

function keyOf(by: ParetoBy, f: { componentCode: string; cause: string | null; failureMode: string | null }) {
  const parts = f.componentCode.split('.');
  if (by === 'system') return parts[0]!;
  if (by === 'assembly') return parts.slice(0, 2).join('.');
  if (by === 'component') return f.componentCode;
  if (by === 'cause') return f.cause ?? 'SIN_DATO';
  return f.failureMode ?? 'SIN_DATO';
}

function kpiLight(value: number | null, def: Def): kpi.KpiLight | null {
  return kpi.kpiLight(value, def.target, def.direction, def.band);
}

/**
 * El historial del Excel no pasó por la regla de retrabajo al cerrarse: se aplica aquí la misma regla
 * (mismo vehículo y componente en 30 días / 3 000 km). Las filas del mismo día se toman como un mismo trabajo.
 */
function markHistoricalRework(orders: { id: string; vehicleId: string; type: string; isHistorical: boolean; isRework: boolean; doneAt: Date | null; odometerIn: number | null; failures: { componentCode: string }[] }[]) {
  const corrective = orders
    .filter((o) => CORRECTIVE_WORK_ORDER_TYPES.includes(o.type as WorkOrderType) && o.doneAt && o.odometerIn != null && o.failures.length)
    .sort((a, b) => a.doneAt!.getTime() - b.doneAt!.getTime());
  const history: (ClosedRepair & { day: string })[] = [];
  for (const o of corrective) {
    const day = o.doneAt!.toISOString().slice(0, 10);
    const codes = o.failures.map((f) => f.componentCode);
    if (o.isHistorical && !o.isRework)
      o.isRework = !!findReworkOrigin({ vehicleId: o.vehicleId, componentCodes: codes, openedAt: o.doneAt!, odometer: o.odometerIn! }, history.filter((h) => h.day < day));
    history.push({ workOrderId: o.id, vehicleId: o.vehicleId, componentCodes: codes, closedAt: o.doneAt!, odometerOut: o.odometerIn!, day });
  }
}

/** Parada preventiva: ligada a una OT preventiva o marcada así en el cuadro de disponibilidad. */
function isPreventiveStop(i: { status: string; reason: string | null; woType?: string }) {
  return UNAVAILABLE_FOR_AVAILABILITY.includes(i.status as VehicleStatus) && (PREVENTIVE.includes(i.woType ?? '') || /parada preventiva/i.test(i.reason ?? ''));
}

export interface AvailabilityPolicy { includePreventive: boolean }

/** Política de OLAST 2026: días hábiles (lunes a sábado, sin festivos) y sin descontar preventivos, como el cuadro. */
export function availabilityPolicy(settings: unknown): AvailabilityPolicy {
  const a = (settings as { availability?: { includePreventive?: unknown } } | null)?.availability;
  return { includePreventive: a?.includePreventive === true };
}

const BASIS = 'Base: días hábiles de lunes a sábado, sin domingos ni festivos de Colombia.';
function policyText(code: KpiCode, p: AvailabilityPolicy): Partial<Def> {
  if (code === 'availability')
    return {
      name: p.includePreventive ? 'Disponibilidad de flota' : 'Disponibilidad de flota (sin preventivos)',
      scope: p.includePreventive
        ? `Tiempo disponible / tiempo requerido. Resta toda parada por mantenimiento (correctiva y preventiva) y espera de repuestos; siniestros aparte. ${BASIS} El detalle muestra la cifra sin preventivos.`
        : `Tiempo disponible / tiempo requerido, restando solo las paradas correctivas y la espera de repuestos (política OLAST 2026, igual que el cuadro de disponibilidad). ${BASIS} El detalle muestra la cifra con preventivos como referencia.`,
    };
  if (code === 'downtime')
    return {
      name: p.includePreventive ? 'Días hábiles fuera de servicio por parada' : 'Días hábiles fuera de servicio por parada correctiva',
      scope: `Duración promedio, en días hábiles, de las paradas que empezaron en el periodo${p.includePreventive ? '' : ' (el valor es de las correctivas; el detalle muestra también las preventivas)'}. Incluye la espera de taller y repuestos, no solo la reparación. ${BASIS}`,
    };
  return {};
}
