import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Permission } from '@cmms/shared';
import { AppError } from './errors';
import { AuthUser, IS_PUBLIC, PERMISSIONS_KEY } from './auth.decorators';
import { PrismaService } from './prisma.service';

/** Guard global: valida el JWT, carga permisos actuales del rol y verifica @RequirePermissions. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const req = ctx.switchToHttp().getRequest();
    const header: string | undefined = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new AppError('UNAUTHENTICATED', 'Sesión requerida', 401);
    let payload: { sub: string };
    try {
      payload = await this.jwt.verifyAsync(header.slice(7));
    } catch {
      throw new AppError('UNAUTHENTICATED', 'Sesión inválida o vencida', 401);
    }
    const u = await this.prisma.user.findFirst({
      where: { id: payload.sub, active: true, deletedAt: null },
      include: { role: true, sites: true },
    });
    if (!u) throw new AppError('UNAUTHENTICATED', 'Usuario inactivo', 401);

    const user: AuthUser = {
      id: u.id,
      organizationId: u.organizationId,
      email: u.email,
      role: u.role.code,
      permissions: u.role.permissions as Permission[],
      isGlobal: u.role.isGlobal,
      siteIds: u.role.isGlobal ? null : u.sites.map((s) => s.siteId),
    };
    req.user = user;

    const required = this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS_KEY, targets) ?? [];
    const missing = required.filter((p) => !user.permissions.includes(p));
    if (missing.length) throw new AppError('FORBIDDEN', 'No tiene permiso para esta acción', 403, { missing });
    return true;
  }
}
