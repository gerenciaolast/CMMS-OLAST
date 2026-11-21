import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { hash } from '@node-rs/argon2';
import { Audit, AuthUser, CurrentUser, RequirePermissions } from '../../common/auth.decorators';
import { ZodPipe } from '../../common/zod.pipe';
import { PrismaService } from '../../common/prisma.service';
import { AppError } from '../../common/errors';
import { VehiclesService } from './vehicles.service';
import * as S from './vehicles.schemas';
import { siteScope } from '../../common/auth.decorators';
import { Registration, applyRegistration, type RegistrationInput } from './registration';
import { loadSheetHistory, renderVehicleSheets, sheetInclude } from './vehicle-sheet';

@ApiTags('vehicles')
@ApiBearerAuth()
@Audit('vehicle')
@Controller()
export class VehiclesController {
  constructor(private readonly svc: VehiclesService, private readonly prisma: PrismaService) {}

  @RequirePermissions('vehicle.view')
  @Get('vehicles')
  list(@CurrentUser() u: AuthUser, @Query(new ZodPipe(S.ListQuery)) q: z.infer<typeof S.ListQuery>) {
    return this.svc.list(u, q);
  }

  @RequirePermissions('vehicle.view')
  @Get('vehicles/:id')
  detail(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.detail(u, id);
  }

  @RequirePermissions('vehicle.edit')
  @Post('vehicles')
  create(@CurrentUser() u: AuthUser, @Body(new ZodPipe(S.CreateVehicle)) b: S.CreateVehicle) {
    return this.svc.create(u, b);
  }

  @RequirePermissions('vehicle.edit')
  @Patch('vehicles/:id')
  update(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(S.UpdateVehicle)) b: S.UpdateVehicle) {
    return this.svc.update(u, id, b);
  }

  @RequirePermissions('vehicle.edit')
  @Put('vehicles/:id/criticality')
  criticality(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(S.SetCriticality)) b: z.infer<typeof S.SetCriticality>) {
    return this.svc.setCriticality(u, id, b);
  }

  @RequirePermissions('vehicle.change_status')
  @Post('vehicles/:id/status')
  status(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(S.ChangeStatus)) b: z.infer<typeof S.ChangeStatus>) {
    return this.svc.changeStatus(u, id, b.status, b.reason);
  }

  @RequirePermissions('meter.record')
  @Post('vehicles/:id/readings')
  reading(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(S.RecordReading)) b: z.infer<typeof S.RecordReading>) {
    return this.svc.recordReading(u, id, b);
  }

  @RequirePermissions('vehicle.change_status')
  @Post('vehicles/:id/readings/:readingId/validate')
  validateReading(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Param('readingId', ParseUUIDPipe) readingId: string) {
    return this.svc.validateFlaggedReading(u, id, readingId);
  }

  @RequirePermissions('vehicle.edit')
  @Post('vehicles/:id/meter-replacements')
  replaceMeter(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(S.MeterReplacementBody)) b: z.infer<typeof S.MeterReplacementBody>) {
    return this.svc.replaceMeter(u, id, b);
  }

  @RequirePermissions('vehicle.edit')
  @Put('vehicles/:id/documents/:typeCode')
  document(
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('typeCode') typeCode: string,
    @Body(new ZodPipe(S.UpsertDocument)) b: z.infer<typeof S.UpsertDocument>,
  ) {
    return this.svc.upsertDocument(u, id, typeCode, b);
  }

  @RequirePermissions('vehicle.view')
  @Get('vehicle-models')
  models() {
    return this.prisma.vehicleModel.findMany({ include: { vehicleType: { select: { code: true, name: true } } }, orderBy: [{ make: 'asc' }, { model: 'asc' }] });
  }

  @RequirePermissions('vehicle.edit')
  @Post('vehicle-models')
  async createModel(@Body(new ZodPipe(S.CreateModel)) b: z.infer<typeof S.CreateModel>) {
    const type = await this.prisma.vehicleType.findUnique({ where: { code: b.vehicleTypeCode } });
    if (!type) throw new AppError('UNKNOWN_VEHICLE_TYPE', `Tipo de vehículo desconocido: ${b.vehicleTypeCode}`);
    return this.prisma.vehicleModel.create({ data: { vehicleTypeId: type.id, make: b.make.toUpperCase(), model: b.model.toUpperCase(), fuelType: b.fuelType } });
  }

  @RequirePermissions('vehicle.change_status')
  @Post('vehicles/:id/transfer')
  transfer(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(S.Transfer)) b: z.infer<typeof S.Transfer>) {
    return this.svc.transfer(u, id, b);
  }

  @RequirePermissions('vehicle.edit')
  @Put('vehicles/:id/drivers')
  setDrivers(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(S.SetDrivers)) b: z.infer<typeof S.SetDrivers>) {
    return this.svc.setDrivers(u, id, b);
  }

  @RequirePermissions('vehicle.view')
  @Get('vehicles/:id/tire-changes')
  async tireChanges(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.svc.findScoped(u, id);
    return this.prisma.tireChange.findMany({ where: { vehicleId: id }, orderBy: { changedAt: 'desc' } });
  }

  @RequirePermissions('meter.record')
  @Post('vehicles/:id/tire-changes')
  tireChange(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(S.TireChangeBody)) b: z.infer<typeof S.TireChangeBody>) {
    return this.svc.recordTireChange(u, id, b);
  }

  // ───── Conductores ─────

  @RequirePermissions('vehicle.view')
  @Get('drivers')
  drivers(@CurrentUser() u: AuthUser, @Query('includeInactive') includeInactive?: string) {
    return this.prisma.driver.findMany({
      where: {
        organizationId: u.organizationId,
        ...(includeInactive === 'true' ? {} : { active: true }),
        ...(u.siteIds ? { OR: [{ siteId: { in: u.siteIds } }, { siteId: null }] } : {}),
      },
      include: {
        site: { select: { code: true, name: true } },
        vehicles: { select: { isPrimary: true, vehicle: { select: { id: true, plate: true } } } },
      },
      // userId indica si ya tiene acceso a la app
      orderBy: { fullName: 'asc' },
    });
  }

  @RequirePermissions('vehicle.edit')
  @Audit('driver')
  @Post('drivers')
  async createDriver(@CurrentUser() u: AuthUser, @Body(new ZodPipe(S.DriverBody)) b: z.infer<typeof S.DriverBody>) {
    const { siteCode, ...data } = b;
    return this.prisma.driver.create({
      data: { ...data, fullName: data.fullName.toUpperCase(), organizationId: u.organizationId, siteId: await this.siteIdOrNull(u, siteCode) },
    });
  }

  @RequirePermissions('vehicle.edit')
  @Audit('driver')
  @Patch('drivers/:id')
  async updateDriver(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(S.DriverBody.partial())) b: Partial<z.infer<typeof S.DriverBody>>) {
    await this.prisma.driver.findFirstOrThrow({ where: { id, organizationId: u.organizationId } });
    const { siteCode, ...data } = b;
    return this.prisma.driver.update({
      where: { id },
      data: { ...data, ...(data.fullName ? { fullName: data.fullName.toUpperCase() } : {}), ...(siteCode !== undefined ? { siteId: await this.siteIdOrNull(u, siteCode) } : {}) },
    });
  }

  /** Da acceso a la app a un conductor (rol Conductor, su sede) para que haga la inspección diaria. */
  @RequirePermissions('vehicle.edit')
  @Audit('driver')
  @Post('drivers/:id/access')
  async grantAccess(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(z.object({ email: z.string().email() }))) b: { email: string }) {
    const d = await this.prisma.driver.findFirstOrThrow({ where: { id, organizationId: u.organizationId } });
    if (d.userId) throw new AppError('ALREADY_HAS_ACCESS', 'El conductor ya tiene acceso a la app');
    if (!d.siteId) throw new AppError('SITE_REQUIRED', 'Asigne primero la sede del conductor');
    const role = await this.prisma.role.findUniqueOrThrow({ where: { organizationId_code: { organizationId: u.organizationId, code: 'driver' } } });
    const temporaryPassword = randomBytes(9).toString('base64url');
    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          organizationId: u.organizationId, roleId: role.id, email: b.email.toLowerCase(), fullName: d.fullName, phone: d.phone,
          passwordHash: await hash(temporaryPassword), mustChangePassword: true, sites: { create: [{ siteId: d.siteId! }] },
        },
      });
      await tx.driver.update({ where: { id }, data: { userId: created.id, email: d.email ?? b.email.toLowerCase() } });
      return created;
    });
    return { userId: user.id, email: user.email, temporaryPassword };
  }

  private async siteIdOrNull(u: AuthUser, code?: string | null) {
    if (!code) return null;
    const site = await this.prisma.site.findUnique({ where: { organizationId_code: { organizationId: u.organizationId, code } } });
    if (!site) throw new AppError('UNKNOWN_SITE', `Sede no válida: ${code}`);
    return site.id;
  }

  // ───── Licencia de tránsito y hoja de vida en PDF ─────

  /** Registra o corrige los datos de la licencia de tránsito (tarjeta de propiedad). */
  @RequirePermissions('vehicle.edit')
  @Audit('vehicle_registration')
  @Put('vehicles/:id/registration')
  async registration(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(Registration)) b: RegistrationInput) {
    await this.svc.findScoped(u, id);
    return applyRegistration(this.prisma, id, b);
  }

  /** Hoja de vida de un vehículo en PDF. */
  @RequirePermissions('vehicle.view')
  @Get('vehicles/:id/sheet')
  async sheet(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    await this.svc.findScoped(u, id);
    const v = await this.prisma.vehicle.findUniqueOrThrow({ where: { id }, include: sheetInclude });
    await this.sendSheets(u, res, [v], `Hoja_de_vida_${v.plate}.pdf`);
  }

  /** Hojas de vida de la flota en un solo PDF (filtros: sede, incluir dados de baja). */
  @RequirePermissions('vehicle.view')
  @Get('vehicle-sheets')
  async sheets(@CurrentUser() u: AuthUser, @Res() res: Response, @Query('site') site?: string, @Query('includeRetired') includeRetired?: string) {
    const vs = await this.prisma.vehicle.findMany({
      where: { organizationId: u.organizationId, ...siteScope(u), ...(site ? { site: { code: site } } : {}), ...(includeRetired === 'true' ? {} : { status: { not: 'retired' } }) },
      include: sheetInclude,
      orderBy: [{ site: { name: 'asc' } }, { plate: 'asc' }],
    });
    if (!vs.length) throw new AppError('NOT_FOUND', 'No hay vehículos con ese filtro', 404);
    await this.sendSheets(u, res, vs, `Hojas_de_vida_flota${site ? `_${site}` : ''}_${new Date().toISOString().slice(0, 10)}.pdf`);
  }

  private async sendSheets(u: AuthUser, res: Response, vs: Parameters<typeof renderVehicleSheets>[0][number]['vehicle'][], filename: string) {
    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: u.organizationId } });
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: u.id }, select: { fullName: true } });
    const items = [];
    for (const v of vs) items.push({ vehicle: v, history: await loadSheetHistory(this.prisma, v.id) });
    const pdf = await renderVehicleSheets(items, { showCosts: u.permissions.includes('cost.view'), generatedBy: user.fullName, timeZone: org.timezone });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(pdf);
  }
}
