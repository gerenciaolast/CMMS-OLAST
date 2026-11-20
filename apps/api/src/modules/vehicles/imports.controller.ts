import { Controller, Get, HttpStatus, Post, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Audit, AuthUser, CurrentUser, RequirePermissions } from '../../common/auth.decorators';
import { AppError } from '../../common/errors';
import { PrismaService } from '../../common/prisma.service';
import { importFleetWorkbook } from './fleet-import';
import { buildFleetTemplate } from './fleet-template';
import { importMaintenanceHistory } from '../maintenance/history-import';
import { importAvailability } from './availability-import';
import { PmService } from '../pm/pm.service';

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

@ApiTags('imports')
@ApiBearerAuth()
@Controller('imports')
export class ImportsController {
  constructor(private readonly prisma: PrismaService, private readonly pm: PmService) {}

  /** Descarga la plantilla con los datos actuales (vehículos, conductores, documentos y pendientes). */
  @RequirePermissions('vehicle.edit')
  @Get('fleet-template')
  async template(@CurrentUser() u: AuthUser, @Res() res: Response) {
    const buf = await buildFleetTemplate(this.prisma, u.organizationId);
    res.setHeader('Content-Type', XLSX);
    res.setHeader('Content-Disposition', `attachment; filename="Plantilla_flota_OLAST_${new Date().toISOString().slice(0, 10)}.xlsx"`);
    res.send(buf);
  }

  /** Sube la plantilla completada. Idempotente: actualiza por placa / cédula. */
  @RequirePermissions('vehicle.edit')
  @Audit('fleet_import')
  @ApiConsumes('multipart/form-data')
  @Post('fleet')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024, files: 1 } }))
  async upload(@CurrentUser() u: AuthUser, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new AppError('FILE_REQUIRED', 'Adjunte la plantilla .xlsx');
    const isZip = file.buffer.subarray(0, 2).toString('latin1') === 'PK';
    if (!file.originalname.toLowerCase().endsWith('.xlsx') || !isZip)
      throw new AppError('INVALID_FILE', 'El archivo debe ser una plantilla de Excel (.xlsx)', HttpStatus.UNSUPPORTED_MEDIA_TYPE);
    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: u.organizationId } });
    try {
      return await importFleetWorkbook(this.prisma, file.buffer, org.name);
    } catch (e) {
      if (e instanceof AppError) throw e;
      throw new AppError('IMPORT_FAILED', e instanceof Error ? e.message : 'No fue posible leer la plantilla', HttpStatus.UNPROCESSABLE_ENTITY);
    }
  }

  /**
   * Sube el historial de mantenimiento en Excel. Con dryRun=true solo muestra los cambios.
   * Identifica cada intervención por su contenido: el mismo archivo actualizado se puede subir varias veces.
   */
  @RequirePermissions('work_order.plan')
  @Audit('history_import')
  @ApiConsumes('multipart/form-data')
  @Post('maintenance-history')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024, files: 1 } }))
  async history(@CurrentUser() u: AuthUser, @Query('dryRun') dryRun?: string, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new AppError('FILE_REQUIRED', 'Adjunte el historial .xlsx');
    if (!file.originalname.toLowerCase().endsWith('.xlsx') || file.buffer.subarray(0, 2).toString('latin1') !== 'PK')
      throw new AppError('INVALID_FILE', 'El archivo debe ser un Excel (.xlsx)', HttpStatus.UNSUPPORTED_MEDIA_TYPE);
    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: u.organizationId } });
    try {
      const report = await importMaintenanceHistory(this.prisma, file.buffer, { organizationName: org.name, dryRun: dryRun === 'true' });
      const pm = dryRun === 'true' ? null : await this.pm.refreshFromHistory(org.id);
      return { ...report, pm };
    } catch (e) {
      if (e instanceof AppError) throw e;
      throw new AppError('IMPORT_FAILED', e instanceof Error ? e.message : 'No fue posible leer el historial', HttpStatus.UNPROCESSABLE_ENTITY);
    }
  }

  /**
   * Cuadro de disponibilidad de flota (una hoja por mes, «FDS» por día): reconstruye los estados históricos
   * del vehículo para disponibilidad y tiempo fuera de servicio. dryRun=true solo muestra lo que haría.
   */
  @RequirePermissions('vehicle.change_status')
  @Audit('availability_import')
  @ApiConsumes('multipart/form-data')
  @Post('availability')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024, files: 1 } }))
  async availability(@CurrentUser() u: AuthUser, @Query('dryRun') dryRun?: string, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new AppError('FILE_REQUIRED', 'Adjunte el cuadro de disponibilidad .xlsx');
    if (!file.originalname.toLowerCase().endsWith('.xlsx') || file.buffer.subarray(0, 2).toString('latin1') !== 'PK')
      throw new AppError('INVALID_FILE', 'El archivo debe ser un Excel (.xlsx)', HttpStatus.UNSUPPORTED_MEDIA_TYPE);
    try {
      return await importAvailability(this.prisma, file.buffer, { organizationId: u.organizationId, dryRun: dryRun === 'true' });
    } catch (e) {
      if (e instanceof AppError) throw e;
      throw new AppError('IMPORT_FAILED', e instanceof Error ? e.message : 'No fue posible leer el cuadro', HttpStatus.UNPROCESSABLE_ENTITY);
    }
  }
}
