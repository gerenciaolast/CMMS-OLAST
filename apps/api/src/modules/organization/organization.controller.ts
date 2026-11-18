import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { hash } from '@node-rs/argon2';
import { Audit, AuthUser, CurrentUser, RequirePermissions } from '../../common/auth.decorators';
import { ZodPipe } from '../../common/zod.pipe';
import { PrismaService } from '../../common/prisma.service';
import { AppError } from '../../common/errors';

const CreateUser = z.object({
  email: z.string().email(),
  fullName: z.string().min(3),
  phone: z.string().optional(),
  roleCode: z.string(),
  siteCodes: z.array(z.string()).default([]),
});
const UpdateUser = z.object({
  fullName: z.string().min(3).optional(),
  phone: z.string().nullable().optional(),
  roleCode: z.string().optional(),
  siteCodes: z.array(z.string()).optional(),
  active: z.boolean().optional(),
});

const USER_SELECT = {
  id: true, email: true, fullName: true, phone: true, active: true, lastLoginAt: true,
  role: { select: { code: true, name: true } },
  sites: { select: { site: { select: { code: true, name: true } } } },
} as const;

@ApiTags('organization')
@ApiBearerAuth()
@Controller()
export class OrganizationController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('sites')
  sites(@CurrentUser() u: AuthUser) {
    return this.prisma.site.findMany({
      where: { organizationId: u.organizationId, active: true, deletedAt: null, ...(u.siteIds ? { id: { in: u.siteIds } } : {}) },
      orderBy: { name: 'asc' },
    });
  }

  @RequirePermissions('user.manage')
  @Get('roles')
  roles(@CurrentUser() u: AuthUser) {
    return this.prisma.role.findMany({ where: { organizationId: u.organizationId }, orderBy: { name: 'asc' } });
  }

  @RequirePermissions('user.manage')
  @Get('users')
  users(@CurrentUser() u: AuthUser) {
    return this.prisma.user.findMany({
      where: { organizationId: u.organizationId, deletedAt: null },
      select: USER_SELECT,
      orderBy: { fullName: 'asc' },
    });
  }

  /** Crea el usuario con una contraseña temporal que se muestra UNA vez y debe cambiarse al ingresar. */
  @RequirePermissions('user.manage')
  @Audit('user')
  @Post('users')
  async createUser(@CurrentUser() u: AuthUser, @Body(new ZodPipe(CreateUser)) b: z.infer<typeof CreateUser>) {
    const role = await this.findRole(u.organizationId, b.roleCode);
    const siteIds = await this.findSites(u.organizationId, b.siteCodes);
    const temporaryPassword = randomBytes(9).toString('base64url');
    const created = await this.prisma.user.create({
      data: {
        organizationId: u.organizationId,
        roleId: role.id,
        email: b.email.toLowerCase(),
        fullName: b.fullName,
        phone: b.phone,
        passwordHash: await hash(temporaryPassword),
        mustChangePassword: true,
        sites: { create: siteIds.map((siteId) => ({ siteId })) },
      },
      select: USER_SELECT,
    });
    return { ...created, temporaryPassword };
  }

  @RequirePermissions('user.manage')
  @Audit('user')
  @Patch('users/:id')
  async updateUser(
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(UpdateUser)) b: z.infer<typeof UpdateUser>,
  ) {
    await this.prisma.user.findFirstOrThrow({ where: { id, organizationId: u.organizationId, deletedAt: null } });
    if (id === u.id && b.active === false) throw new AppError('SELF_DEACTIVATE', 'No puede desactivar su propio usuario');
    const roleId = b.roleCode ? (await this.findRole(u.organizationId, b.roleCode)).id : undefined;
    const siteIds = b.siteCodes ? await this.findSites(u.organizationId, b.siteCodes) : undefined;
    return this.prisma.$transaction(async (tx) => {
      if (siteIds) {
        await tx.userSite.deleteMany({ where: { userId: id } });
        await tx.userSite.createMany({ data: siteIds.map((siteId) => ({ userId: id, siteId })) });
      }
      if (b.active === false) await tx.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      return tx.user.update({
        where: { id },
        data: { fullName: b.fullName, phone: b.phone, active: b.active, roleId },
        select: USER_SELECT,
      });
    });
  }

  private async findRole(organizationId: string, code: string) {
    const role = await this.prisma.role.findUnique({ where: { organizationId_code: { organizationId, code } } });
    if (!role) throw new AppError('UNKNOWN_ROLE', `Rol desconocido: ${code}`);
    return role;
  }

  private async findSites(organizationId: string, codes: string[]) {
    const sites = await this.prisma.site.findMany({ where: { organizationId, code: { in: codes } } });
    const missing = codes.filter((c) => !sites.some((s) => s.code === c));
    if (missing.length) throw new AppError('UNKNOWN_SITE', `Sede desconocida: ${missing.join(', ')}`);
    return sites.map((s) => s.id);
  }
}
