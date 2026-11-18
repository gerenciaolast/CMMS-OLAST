import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';
import { PrismaService } from '../../common/prisma.service';
import { AppError } from '../../common/errors';
import { APP_CONFIG, AppConfig } from '../../config';

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  mustChangePassword: boolean;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
  ) {}

  async login(email: string, password: string): Promise<TokenPair> {
    const user = await this.prisma.user.findFirst({
      where: { email: email.toLowerCase(), deletedAt: null },
    });
    const invalid = new AppError('INVALID_CREDENTIALS', 'Correo o contraseña incorrectos', 401);
    if (!user || !user.active) throw invalid;
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new AppError('ACCOUNT_LOCKED', 'Cuenta bloqueada temporalmente por intentos fallidos', 423);
    }
    if (!(await verify(user.passwordHash, password))) {
      const failed = user.failedLogins + 1;
      const lock = failed >= this.cfg.LOGIN_MAX_ATTEMPTS;
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedLogins: lock ? 0 : failed,
          lockedUntil: lock ? new Date(Date.now() + this.cfg.LOGIN_LOCK_MINUTES * 60_000) : null,
        },
      });
      await this.audit(user.organizationId, user.id, 'login_failed');
      throw invalid;
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() },
    });
    await this.audit(user.organizationId, user.id, 'login');
    return this.issue(user.id, user.mustChangePassword);
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    const row = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: sha256(refreshToken) },
      include: { user: true },
    });
    if (!row || row.revokedAt || row.expiresAt < new Date() || !row.user.active || row.user.deletedAt) {
      throw new AppError('INVALID_REFRESH', 'Sesión vencida, ingrese de nuevo', 401);
    }
    await this.prisma.refreshToken.update({ where: { id: row.id }, data: { revokedAt: new Date() } });
    return this.issue(row.userId, row.user.mustChangePassword);
  }

  async logout(refreshToken: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: sha256(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async changePassword(userId: string, current: string, next: string): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await verify(user.passwordHash, current))) {
      throw new AppError('INVALID_CREDENTIALS', 'La contraseña actual no es correcta', 400);
    }
    if (current === next) throw new AppError('SAME_PASSWORD', 'La nueva contraseña debe ser distinta', 400);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { passwordHash: await hash(next), mustChangePassword: false } }),
      this.prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    await this.audit(user.organizationId, userId, 'password_changed');
  }

  private async issue(userId: string, mustChangePassword: boolean): Promise<TokenPair> {
    const accessToken = await this.jwt.signAsync({ sub: userId }, { expiresIn: this.cfg.JWT_ACCESS_TTL_SECONDS });
    const refreshToken = randomBytes(48).toString('base64url');
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: sha256(refreshToken),
        expiresAt: new Date(Date.now() + this.cfg.REFRESH_TTL_DAYS * 86_400_000),
      },
    });
    return { accessToken, refreshToken, expiresIn: this.cfg.JWT_ACCESS_TTL_SECONDS, mustChangePassword };
  }

  private audit(organizationId: string, userId: string, action: string) {
    return this.prisma.auditLog.create({ data: { organizationId, userId, entity: 'auth', entityId: userId, action } });
  }
}
