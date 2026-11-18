import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, tap } from 'rxjs';
import { AUDIT_ENTITY, AuthUser } from './auth.decorators';
import { PrismaService } from './prisma.service';

const WRITE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const SECRET_KEYS = /password|token|secret/i;

function redact(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(redact);
  if (v && typeof v === 'object')
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, SECRET_KEYS.test(k) ? '***' : redact(x)]));
  return v;
}

/** Registra en audit_log toda escritura exitosa de endpoints marcados con @Audit (doc 06 DoD #6). */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger('Audit');
  constructor(private readonly reflector: Reflector, private readonly prisma: PrismaService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest();
    const entity = this.reflector.getAllAndOverride<string>(AUDIT_ENTITY, [ctx.getHandler(), ctx.getClass()]);
    if (!entity || !WRITE.has(req.method)) return next.handle();
    const user: AuthUser | undefined = req.user;
    return next.handle().pipe(
      tap((result) => {
        const entityId = (result as { id?: string } | undefined)?.id ?? req.params?.id ?? null;
        this.prisma.auditLog
          .create({
            data: {
              organizationId: user?.organizationId,
              userId: user?.id,
              entity,
              entityId,
              action: `${req.method} ${req.route?.path ?? req.path}`,
              diff: redact({ params: req.params, body: req.body }) as object,
              ip: req.ip,
            },
          })
          .catch((e) => this.logger.error(e));
      }),
    );
  }
}
