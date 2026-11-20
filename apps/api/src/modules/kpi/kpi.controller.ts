import { Controller, Get, Module, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { z } from 'zod';
import { AuthUser, CurrentUser, RequirePermissions } from '../../common/auth.decorators';
import { PrismaService } from '../../common/prisma.service';
import { ZodPipe } from '../../common/zod.pipe';
import { localDayRange } from '../../common/time';
import { KpiService, type BadActorMetric, type KpiQuery, type ParetoBy } from './kpi.service';
import { kpiWorkbook } from './kpi-export';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha AAAA-MM-DD');
const Filters = z.object({
  from: day.optional(),
  to: day.optional(),
  site: z.string().max(10).optional(),
  type: z.string().max(10).optional(),
  by: z.enum(['system', 'assembly', 'component', 'cause', 'mode']).default('system'),
  metric: z.string().optional(),
});
type F = z.infer<typeof Filters>;

@ApiTags('kpi')
@ApiBearerAuth()
@Controller('kpi')
export class KpiController {
  constructor(private readonly svc: KpiService, private readonly prisma: PrismaService) {}

  /** Periodo local [desde, hasta] (ambos inclusive). Por defecto, los últimos 12 meses calendario hasta hoy. */
  private async range(u: AuthUser, f: F): Promise<KpiQuery> {
    const tz = (await this.prisma.organization.findUniqueOrThrow({ where: { id: u.organizationId } })).timezone;
    const today = localDayRange(tz);
    const to = f.to ? localDayRange(tz, new Date(`${f.to}T12:00:00Z`)).end : today.end;
    let from: Date;
    if (f.from) from = localDayRange(tz, new Date(`${f.from}T12:00:00Z`)).start;
    else {
      const [y, m] = today.day.split('-').map(Number) as [number, number];
      from = localDayRange(tz, new Date(Date.UTC(y, m - 12, 1, 12))).start;
    }
    if (from >= to) from = new Date(to.getTime() - 86_400_000);
    return { from, to, site: f.site || undefined, type: f.type || undefined };
  }

  @RequirePermissions('kpi.view')
  @Get('dashboard')
  async dashboard(@CurrentUser() u: AuthUser, @Query(new ZodPipe(Filters)) f: F) {
    return this.svc.dashboard(u, await this.range(u, f));
  }

  @RequirePermissions('kpi.view')
  @Get('pareto')
  async pareto(@CurrentUser() u: AuthUser, @Query(new ZodPipe(Filters)) f: F) {
    return this.svc.pareto(u, { ...(await this.range(u, f)), by: f.by as ParetoBy, metric: f.metric === 'cost' ? 'cost' : 'count' });
  }

  @RequirePermissions('kpi.view')
  @Get('bad-actors')
  async badActors(@CurrentUser() u: AuthUser, @Query(new ZodPipe(Filters)) f: F) {
    const metric = (['cost', 'failures', 'costPerKm', 'availability'].includes(f.metric ?? '') ? f.metric : 'cost') as BadActorMetric;
    return this.svc.badActors(u, { ...(await this.range(u, f)), metric });
  }

  @RequirePermissions('kpi.view')
  @Get('export')
  async export(@CurrentUser() u: AuthUser, @Query(new ZodPipe(Filters)) f: F, @Res() res: Response) {
    const q = await this.range(u, f);
    const [dash, systems, components, actors, orders] = await Promise.all([
      this.svc.dashboard(u, q),
      this.svc.pareto(u, { ...q, by: 'system', metric: 'cost' }),
      this.svc.pareto(u, { ...q, by: 'component', metric: 'count' }),
      this.svc.badActors(u, { ...q, metric: 'cost' }),
      this.svc.ordersIn(u, q),
    ]);
    const buf = await kpiWorkbook({ dash, systems, components, actors, orders, filters: { site: q.site ?? 'Todas', type: q.type ?? 'Todos' } });
    const last = new Date(q.to.getTime() - 1).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
    const name = `Indicadores_OLAST_${q.from.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })}_${last}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    res.send(buf);
  }
}

@Module({ controllers: [KpiController], providers: [KpiService] })
export class KpiModule {}
