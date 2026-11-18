import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Permission } from '@cmms/shared';

export const IS_PUBLIC = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const PERMISSIONS_KEY = 'permissions';
/** Exige TODOS los permisos indicados. */
export const RequirePermissions = (...p: Permission[]) => SetMetadata(PERMISSIONS_KEY, p);

export const AUDIT_ENTITY = 'auditEntity';
/** Marca el controlador/endpoint para registrar las escrituras en audit_log. */
export const Audit = (entity: string) => SetMetadata(AUDIT_ENTITY, entity);

export interface AuthUser {
  id: string;
  organizationId: string;
  email: string;
  role: string;
  permissions: Permission[];
  isGlobal: boolean;
  /** Sedes visibles; null = todas (rol global). */
  siteIds: string[] | null;
}

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser =>
  ctx.switchToHttp().getRequest().user);

/** Filtro Prisma por sede para consultas de entidades con site_id (doc 06 §2). */
export function siteScope(user: AuthUser, field = 'siteId'): Record<string, unknown> {
  return user.siteIds === null ? {} : { [field]: { in: user.siteIds } };
}
