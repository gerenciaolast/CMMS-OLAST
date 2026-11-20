import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, Res, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { z } from 'zod';
import { Audit, AuthUser, CurrentUser, RequirePermissions } from '../../common/auth.decorators';
import { ZodPipe } from '../../common/zod.pipe';
import { PrismaService } from '../../common/prisma.service';
import { AppError } from '../../common/errors';
import { MAX_IMAGE_BYTES } from '../../common/storage';
import { WorkRequestsService } from './work-requests.service';
import { WorkOrdersService } from './work-orders.service';
import * as S from './maintenance.schemas';

const LINE_KINDS = { tasks: 'task', labor: 'labor', parts: 'part', external: 'external', failures: 'failure' } as const;
type LineRoute = keyof typeof LINE_KINDS;
const LINE_SCHEMAS = { tasks: S.AddTask, labor: S.AddLabor, parts: S.AddPart, external: S.AddExternal, failures: S.AddFailure };

@ApiTags('maintenance')
@ApiBearerAuth()
@Controller()
export class MaintenanceController {
  constructor(private readonly requests: WorkRequestsService, private readonly orders: WorkOrdersService, private readonly prisma: PrismaService) {}

  // ───── Avisos (doc 02 P4) ─────

  @RequirePermissions('work_request.create')
  @Audit('work_request')
  @ApiConsumes('multipart/form-data')
  @Post('work-requests')
  @UseInterceptors(FilesInterceptor('photos', 3, { limits: { fileSize: MAX_IMAGE_BYTES, files: 3 } }))
  create(@CurrentUser() u: AuthUser, @Body() raw: unknown, @UploadedFiles() files: Express.Multer.File[] = []) {
    const b = new ZodPipe(S.CreateRequest).transform(raw) as z.infer<typeof S.CreateRequest>;
    return this.requests.create(u, b, files.map((f) => f.buffer));
  }

  @RequirePermissions('work_order.view')
  @Get('work-requests')
  list(@CurrentUser() u: AuthUser, @Query('status') status?: string, @Query('vehicleId') vehicleId?: string) {
    return this.requests.list(u, { status, vehicleId });
  }

  @RequirePermissions('work_request.create')
  @Get('work-requests/:id')
  get(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.requests.get(u, id);
  }

  @RequirePermissions('work_request.review')
  @Audit('work_request')
  @Post('work-requests/:id/review')
  review(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(S.ReviewRequest)) b: z.infer<typeof S.ReviewRequest>) {
    return this.requests.review(u, id, b);
  }

  @RequirePermissions('vehicle.view')
  @Get('attachments/:id')
  async attachment(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const f = await this.requests.photo(u, id);
    res.setHeader('Content-Type', f.meta.mimeType);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(f.data);
  }

  // ───── Órdenes de trabajo (doc 02 P7) ─────

  @RequirePermissions('work_order.view')
  @Get('work-orders')
  orderList(@CurrentUser() u: AuthUser, @Query(new ZodPipe(S.OrderQuery)) q: z.infer<typeof S.OrderQuery>) {
    return this.orders.list(u, q);
  }

  @RequirePermissions('work_order.view')
  @Get('work-orders/summary')
  summary(@CurrentUser() u: AuthUser) {
    return this.orders.summary(u);
  }

  @RequirePermissions('work_order.view')
  @Get('work-orders/:id')
  orderDetail(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.orders.detail(u, id);
  }

  @RequirePermissions('work_order.plan')
  @Audit('work_order')
  @Post('work-orders')
  createOrder(@CurrentUser() u: AuthUser, @Body(new ZodPipe(S.CreateOrder)) b: z.infer<typeof S.CreateOrder>) {
    return this.orders.create(u, { ...b, origin: 'manual' });
  }

  @RequirePermissions('work_order.plan')
  @Audit('work_order')
  @Patch('work-orders/:id')
  updateOrder(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(S.UpdateOrder)) b: z.infer<typeof S.UpdateOrder>) {
    return this.orders.update(u, id, b);
  }

  @RequirePermissions('work_order.plan')
  @Audit('work_order')
  @Post('work-orders/:id/schedule')
  schedule(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(S.Schedule)) b: z.infer<typeof S.Schedule>) {
    return this.orders.transition(u, id, 'schedule', b);
  }

  @RequirePermissions('work_order.plan')
  @Audit('work_order')
  @Post('work-orders/:id/cancel')
  cancel(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(S.Reason)) b: z.infer<typeof S.Reason>) {
    return this.orders.transition(u, id, 'cancel', b);
  }

  @RequirePermissions('work_order.execute')
  @Audit('work_order')
  @Post('work-orders/:id/start')
  start(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(S.Start)) b: z.infer<typeof S.Start>) {
    return this.orders.transition(u, id, 'start', b);
  }

  @RequirePermissions('work_order.execute')
  @Audit('work_order')
  @Post('work-orders/:id/hold')
  hold(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(S.Hold)) b: z.infer<typeof S.Hold>) {
    return this.orders.transition(u, id, 'hold', b);
  }

  @RequirePermissions('work_order.execute')
  @Audit('work_order')
  @Post('work-orders/:id/resume')
  resume(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.orders.transition(u, id, 'resume');
  }

  @RequirePermissions('work_order.execute')
  @Audit('work_order')
  @Post('work-orders/:id/complete')
  complete(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(S.Complete)) b: z.infer<typeof S.Complete>) {
    return this.orders.transition(u, id, 'complete', b);
  }

  @RequirePermissions('work_order.close')
  @Audit('work_order')
  @Post('work-orders/:id/reject-verification')
  rejectVerification(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(S.Reason)) b: z.infer<typeof S.Reason>) {
    return this.orders.transition(u, id, 'reject_verification', b);
  }

  @RequirePermissions('work_order.close')
  @Audit('work_order')
  @Post('work-orders/:id/close')
  close(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.orders.transition(u, id, 'close');
  }

  @RequirePermissions('work_order.execute')
  @Audit('work_order')
  @Post('work-orders/:id/lines/:line')
  addLine(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Param('line') line: LineRoute, @Body() raw: unknown) {
    const schema = LINE_SCHEMAS[line];
    if (!schema) throw new AppError('NOT_FOUND', 'Recurso no encontrado', 404);
    return this.orders.addLine(u, id, LINE_KINDS[line], new ZodPipe(schema as z.ZodTypeAny).transform(raw) as Record<string, unknown>);
  }

  @RequirePermissions('work_order.execute')
  @Audit('work_order')
  @Delete('work-orders/:id/lines/:line/:lineId')
  removeLine(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Param('line') line: LineRoute, @Param('lineId', ParseUUIDPipe) lineId: string) {
    if (!LINE_KINDS[line]) throw new AppError('NOT_FOUND', 'Recurso no encontrado', 404);
    return this.orders.removeLine(u, id, LINE_KINDS[line], lineId);
  }

  @RequirePermissions('work_order.execute')
  @Audit('work_order')
  @Patch('work-orders/:id/tasks/:taskId')
  updateTask(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Param('taskId', ParseUUIDPipe) taskId: string, @Body(new ZodPipe(S.UpdateTask)) b: z.infer<typeof S.UpdateTask>) {
    return this.orders.updateTask(u, id, taskId, b);
  }

  // ───── Proveedores, técnicos y repuestos ─────

  @RequirePermissions('work_order.view')
  @Get('suppliers')
  suppliers(@CurrentUser() u: AuthUser) {
    return this.prisma.supplier.findMany({ where: { organizationId: u.organizationId, active: true }, orderBy: { name: 'asc' } });
  }

  @RequirePermissions('work_order.plan')
  @Audit('supplier')
  @Post('suppliers')
  createSupplier(@CurrentUser() u: AuthUser, @Body(new ZodPipe(S.SupplierBody)) b: z.infer<typeof S.SupplierBody>) {
    return this.prisma.supplier.create({ data: { ...b, organizationId: u.organizationId } });
  }

  @RequirePermissions('work_order.view')
  @Get('technicians')
  technicians(@CurrentUser() u: AuthUser) {
    return this.prisma.technician.findMany({ where: { organizationId: u.organizationId, active: true }, orderBy: { name: 'asc' } });
  }

  @RequirePermissions('work_order.plan')
  @Audit('technician')
  @Post('technicians')
  async createTechnician(@CurrentUser() u: AuthUser, @Body(new ZodPipe(S.TechnicianBody)) b: z.infer<typeof S.TechnicianBody>) {
    const site = b.siteCode ? await this.prisma.site.findUnique({ where: { organizationId_code: { organizationId: u.organizationId, code: b.siteCode } } }) : null;
    return this.prisma.technician.create({ data: { organizationId: u.organizationId, name: b.name, level: b.level, hourlyCost: b.hourlyCost, siteId: site?.id ?? null } });
  }

  @RequirePermissions('work_order.view')
  @Get('parts')
  parts(@CurrentUser() u: AuthUser, @Query('q') q?: string) {
    return this.prisma.part.findMany({
      where: { organizationId: u.organizationId, active: true, ...(q ? { OR: [{ code: { contains: q, mode: 'insensitive' } }, { description: { contains: q, mode: 'insensitive' } }] } : {}) },
      orderBy: { description: 'asc' },
      take: 50,
    });
  }

  @RequirePermissions('work_order.plan')
  @Audit('part')
  @Post('parts')
  createPart(@CurrentUser() u: AuthUser, @Body(new ZodPipe(S.PartBody)) b: z.infer<typeof S.PartBody>) {
    return this.prisma.part.create({ data: { ...b, code: b.code.toUpperCase(), organizationId: u.organizationId } });
  }
}
