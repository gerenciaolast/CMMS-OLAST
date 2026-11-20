import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { Audit, AuthUser, CurrentUser, RequirePermissions } from '../../common/auth.decorators';
import { ZodPipe } from '../../common/zod.pipe';
import { AppError } from '../../common/errors';
import { MAX_IMAGE_BYTES } from '../../common/storage';
import { InspectionsService } from './inspections.service';

const Submit = z.object({
  vehicleId: z.string().uuid(),
  odometer: z.number().int().min(0),
  signatureName: z.string().trim().min(3, 'Escriba su nombre como firma'),
  answers: z.array(z.object({ itemId: z.string().uuid(), answer: z.enum(['ok', 'defect', 'na']), comment: z.string().max(500).nullable().optional() })).min(1).max(80),
  durationSeconds: z.number().int().min(0).max(86_400).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
});

@ApiTags('inspections')
@ApiBearerAuth()
@Controller()
export class InspectionsController {
  constructor(private readonly svc: InspectionsService) {}

  @RequirePermissions('inspection.perform')
  @Get('inspections/my-vehicles')
  myVehicles(@CurrentUser() u: AuthUser) {
    return this.svc.myVehicles(u);
  }

  @RequirePermissions('inspection.perform')
  @Get('inspections/start/:vehicleId')
  start(@CurrentUser() u: AuthUser, @Param('vehicleId', ParseUUIDPipe) vehicleId: string) {
    return this.svc.start(u, vehicleId);
  }

  /**
   * Multipart: campo "data" (JSON de la inspección) y fotos con nombre de campo "photo:<itemId>".
   */
  @RequirePermissions('inspection.perform')
  @Audit('inspection')
  @ApiConsumes('multipart/form-data')
  @Post('inspections')
  @UseInterceptors(AnyFilesInterceptor({ limits: { fileSize: MAX_IMAGE_BYTES, files: 20 } }))
  submit(@CurrentUser() u: AuthUser, @Body('data') data: string, @UploadedFiles() files: Express.Multer.File[] = []) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(data ?? '');
    } catch {
      throw new AppError('VALIDATION_ERROR', 'Datos de la inspección inválidos');
    }
    const b = new ZodPipe(Submit).transform(parsed) as z.infer<typeof Submit>;
    const photos = new Map<string, Buffer[]>();
    for (const f of files) {
      const itemId = f.fieldname.startsWith('photo:') ? f.fieldname.slice(6) : null;
      if (!itemId) continue;
      photos.set(itemId, [...(photos.get(itemId) ?? []), f.buffer]);
    }
    return this.svc.submit(u, b, photos);
  }

  @RequirePermissions('work_order.view')
  @Get('inspections/daily')
  daily(@CurrentUser() u: AuthUser, @Query('date') date?: string, @Query('site') site?: string) {
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new AppError('VALIDATION_ERROR', 'Fecha inválida (AAAA-MM-DD)');
    return this.svc.daily(u, { date, site });
  }

  @RequirePermissions('vehicle.view')
  @Get('inspections/:id')
  get(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.get(u, id);
  }

  @RequirePermissions('vehicle.view')
  @Get('vehicles/:id/inspections')
  history(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.history(u, id);
  }
}
