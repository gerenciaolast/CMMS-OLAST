import { Controller, Get, Injectable, Logger, Module, OnModuleDestroy, OnModuleInit, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { documentAlert, requiresTechnicalInspection, vehicleStatusForDocuments, type DocumentAlert } from '@cmms/domain';
import { PrismaService } from '../../common/prisma.service';
import { AuthUser, CurrentUser, RequirePermissions, siteScope } from '../../common/auth.decorators';
import { setVehicleStatus } from '../../common/vehicle-status';
import { NotificationsService } from '../notifications/notifications.service';

const LEVEL_LABEL: Record<Exclude<DocumentAlert, null>, string> = { expired: 'VENCIDO', urgent: 'vence en ≤ 7 días', soon: 'vence en ≤ 15 días', notice: 'vence en ≤ 30 días' };
const EVERY_MS = 6 * 3_600_000;
const LICENSE_ALERT_DAYS = [30, 15, 7];

/** Control de documentos y licencias (doc 02 P9): alertas, bloqueo administrativo automático y desbloqueo al renovar. */
@Injectable()
export class ComplianceService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Documentos');
  private timer?: NodeJS.Timeout;
  constructor(private readonly prisma: PrismaService, private readonly notifications: NotificationsService) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    const run = () => this.runAll().catch((e) => this.logger.error(e));
    setTimeout(run, 15_000).unref();
    this.timer = setInterval(run, EVERY_MS);
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Aplica el bloqueo/desbloqueo administrativo de un vehículo según sus documentos obligatorios vencidos. */
  async evaluateVehicle(vehicleId: string, today = new Date()) {
    const v = await this.prisma.vehicle.findUnique({ where: { id: vehicleId }, include: { documents: { include: { documentType: true } } } });
    if (!v) return null;
    const expired = v.documents.filter((d) => d.documentType.isBlocking && d.expiresAt && documentAlert(d.expiresAt, d.documentType.alertDays, today).level === 'expired');
    const next = vehicleStatusForDocuments(v.status, expired.length);
    if (!next) return null;
    const reason = next === 'out_of_service_administrative' ? `Documento vencido: ${expired.map((d) => d.documentType.name).join(', ')}` : 'Documentos obligatorios al día';
    await this.prisma.$transaction((tx) => setVehicleStatus(tx, vehicleId, next, { reason }));
    if (next === 'out_of_service_administrative')
      await this.notifications.notify({
        organizationId: v.organizationId, kind: 'document_block', title: `${v.plate} fuera de servicio por documento vencido`, body: `${reason}. El vehículo no debe operar hasta renovarlo.`,
        link: `/vehiculos/${v.id}`, permission: 'vehicle.change_status', siteId: v.siteId, dedupeKey: `block:${v.id}:${expired.map((d) => d.id + d.expiresAt!.toISOString().slice(0, 10)).join(',')}`,
      }).catch(() => 0);
    return next;
  }

  /** Revisión periódica: bloqueos y alertas de vencimiento (una vez por documento y nivel). */
  async runAll(today = new Date()) {
    const vehicles = await this.prisma.vehicle.findMany({ where: { status: { not: 'retired' } }, include: { documents: { include: { documentType: true } } } });
    let alerts = 0;
    for (const v of vehicles) {
      await this.evaluateVehicle(v.id, today);
      for (const d of v.documents) {
        if (!d.expiresAt) continue;
        const a = documentAlert(d.expiresAt, d.documentType.alertDays, today);
        if (!a.level || a.level === 'expired') continue;
        alerts += await this.notifications.notify({
          organizationId: v.organizationId, kind: 'document_expiry', title: `${v.plate}: ${d.documentType.name} ${LEVEL_LABEL[a.level]}`,
          body: `${d.documentType.name} del vehículo ${v.plate} vence el ${d.expiresAt.toISOString().slice(0, 10)} (faltan ${a.daysLeft} días).`,
          link: `/vehiculos/${v.id}`, permission: 'vehicle.edit', siteId: v.siteId, dedupeKey: `doc:${d.id}:${d.expiresAt.toISOString().slice(0, 10)}:${a.level}`,
        }).catch(() => 0);
      }
    }
    const drivers = await this.prisma.driver.findMany({ where: { active: true, licenseExpiry: { not: null } } });
    for (const d of drivers) {
      const a = documentAlert(d.licenseExpiry!, LICENSE_ALERT_DAYS, today);
      if (!a.level) continue;
      alerts += await this.notifications.notify({
        organizationId: d.organizationId, kind: 'license_expiry', title: `Licencia de ${d.fullName} ${LEVEL_LABEL[a.level]}`,
        body: `La licencia de conducción de ${d.fullName} vence el ${d.licenseExpiry!.toISOString().slice(0, 10)}.`, link: '/conductores',
        permission: 'vehicle.edit', siteId: d.siteId, dedupeKey: `lic:${d.id}:${d.licenseExpiry!.toISOString().slice(0, 10)}:${a.level}`,
      }).catch(() => 0);
    }
    return { vehicles: vehicles.length, alerts };
  }

  /** Tablero de documentos: vencidos, por vencer y obligatorios sin registrar, más licencias de conducción. */
  async overview(user: AuthUser, today = new Date()) {
    const [types, vehicles, drivers] = await Promise.all([
      this.prisma.documentType.findMany({ where: { active: true } }),
      this.prisma.vehicle.findMany({
        where: { organizationId: user.organizationId, status: { not: 'retired' }, ...siteScope(user) },
        include: { site: { select: { name: true } }, vehicleModel: { include: { vehicleType: true } }, documents: { include: { documentType: true } } },
        orderBy: { plate: 'asc' },
      }),
      this.prisma.driver.findMany({ where: { organizationId: user.organizationId, active: true, ...(user.siteIds ? { OR: [{ siteId: { in: user.siteIds } }, { siteId: null }] } : {}) }, orderBy: { fullName: 'asc' } }),
    ]);
    const rows: { vehicleId: string; plate: string; site: string; status: string; type: string; typeName: string; blocking: boolean; expiresAt: string | null; daysLeft: number | null; level: DocumentAlert | 'missing' }[] = [];
    for (const v of vehicles) {
      for (const t of types) {
        if (t.code === 'RTM' && !requiresTechnicalInspection({ year: v.year, serviceType: v.serviceType, vehicleTypeCode: v.vehicleModel.vehicleType.code }, today)) continue;
        const d = v.documents.find((x) => x.documentTypeId === t.id);
        const base = { vehicleId: v.id, plate: v.plate, site: v.site.name, status: v.status, type: t.code, typeName: t.name, blocking: t.isBlocking };
        if (!d?.expiresAt) {
          if (t.isBlocking && t.alertDays.length) rows.push({ ...base, expiresAt: null, daysLeft: null, level: 'missing' });
          continue;
        }
        const a = documentAlert(d.expiresAt, t.alertDays, today);
        rows.push({ ...base, expiresAt: d.expiresAt.toISOString().slice(0, 10), daysLeft: a.daysLeft, level: a.level });
      }
    }
    const licenses = drivers.map((d) => {
      const a = d.licenseExpiry ? documentAlert(d.licenseExpiry, LICENSE_ALERT_DAYS, today) : null;
      return { driverId: d.id, name: d.fullName, category: d.licenseCategory, expiresAt: d.licenseExpiry?.toISOString().slice(0, 10) ?? null, daysLeft: a?.daysLeft ?? null, level: a ? a.level : ('missing' as const) };
    });
    return { documents: rows, licenses };
  }
}

@ApiTags('documents')
@ApiBearerAuth()
@Controller('documents')
export class ComplianceController {
  constructor(private readonly svc: ComplianceService) {}

  @RequirePermissions('vehicle.view')
  @Get('overview')
  overview(@CurrentUser() u: AuthUser, @Query('date') date?: string) {
    return this.svc.overview(u, date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T12:00:00Z`) : new Date());
  }

  @RequirePermissions('vehicle.change_status')
  @Post('run')
  run() {
    return this.svc.runAll();
  }
}

@Module({ controllers: [ComplianceController], providers: [ComplianceService], exports: [ComplianceService] })
export class ComplianceModule {}
