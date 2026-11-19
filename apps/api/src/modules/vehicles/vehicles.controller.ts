import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { Audit, AuthUser, CurrentUser, RequirePermissions } from '../../common/auth.decorators';
import { ZodPipe } from '../../common/zod.pipe';
import { PrismaService } from '../../common/prisma.service';
import { AppError } from '../../common/errors';
import { VehiclesService } from './vehicles.service';
import * as S from './vehicles.schemas';

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

  private async siteIdOrNull(u: AuthUser, code?: string | null) {
    if (!code) return null;
    const site = await this.prisma.site.findUnique({ where: { organizationId_code: { organizationId: u.organizationId, code } } });
    if (!site) throw new AppError('UNKNOWN_SITE', `Sede no válida: ${code}`);
    return site.id;
  }
}
