import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { Audit, AuthUser, CurrentUser, RequirePermissions } from '../../common/auth.decorators';
import { ZodPipe } from '../../common/zod.pipe';
import { PmService } from './pm.service';

const AssignPlan = z.object({ planId: z.string().uuid().nullable() });
const Baseline = z.object({ doneAt: z.coerce.date(), meter: z.number().int().min(0) });
const UpdateRoutine = z.object({
  name: z.string().trim().min(2).optional(),
  intervalDistance: z.number().int().min(100).max(500_000).nullable().optional(),
  intervalDays: z.number().int().min(7).max(1_825).nullable().optional(),
  estimatedHours: z.number().min(0).max(100).nullable().optional(),
});
const AddTask = z.object({ description: z.string().trim().min(3), componentCode: z.string().nullable().optional() });
const Forecast = z.object({ status: z.string().optional(), site: z.string().optional(), weeks: z.coerce.number().int().min(1).max(52).optional() });

@ApiTags('preventive')
@ApiBearerAuth()
@Controller()
export class PmController {
  constructor(private readonly pm: PmService) {}

  @RequirePermissions('work_order.view')
  @Get('pm/plans')
  plans(@CurrentUser() u: AuthUser) {
    return this.pm.plans(u);
  }

  @RequirePermissions('pm_plan.manage')
  @Audit('pm_routine')
  @Patch('pm/routines/:id')
  updateRoutine(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(UpdateRoutine)) b: z.infer<typeof UpdateRoutine>) {
    return this.pm.updateRoutine(u, id, b);
  }

  @RequirePermissions('pm_plan.manage')
  @Audit('pm_routine')
  @Post('pm/routines/:id/tasks')
  addTask(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(AddTask)) b: z.infer<typeof AddTask>) {
    return this.pm.addTask(u, id, b);
  }

  @RequirePermissions('pm_plan.manage')
  @Audit('pm_routine')
  @Delete('pm/tasks/:id')
  removeTask(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.pm.removeTask(u, id);
  }

  @RequirePermissions('work_order.view')
  @Get('pm/forecast')
  forecast(@CurrentUser() u: AuthUser, @Query(new ZodPipe(Forecast)) q: z.infer<typeof Forecast>) {
    return this.pm.forecast(u, q);
  }

  @RequirePermissions('pm_plan.manage')
  @Audit('vehicle_pm')
  @Post('pm/assign-suggested')
  assignSuggested(@CurrentUser() u: AuthUser) {
    return this.pm.assignSuggested(u);
  }

  @RequirePermissions('pm_plan.manage')
  @Post('pm/recompute')
  recompute() {
    return this.pm.recomputeAll();
  }

  @RequirePermissions('vehicle.view')
  @Get('vehicles/:id/pm')
  vehicle(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.pm.vehicleSchedules(u, id);
  }

  @RequirePermissions('pm_plan.manage')
  @Audit('vehicle_pm')
  @Put('vehicles/:id/pm-plan')
  assign(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(AssignPlan)) b: z.infer<typeof AssignPlan>) {
    return this.pm.assignPlan(u, id, b.planId);
  }

  @RequirePermissions('pm_plan.manage')
  @Audit('vehicle_pm')
  @Put('vehicles/:id/pm/:routineId/baseline')
  baseline(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Param('routineId', ParseUUIDPipe) routineId: string, @Body(new ZodPipe(Baseline)) b: z.infer<typeof Baseline>) {
    return this.pm.setBaseline(u, id, routineId, b);
  }
}
