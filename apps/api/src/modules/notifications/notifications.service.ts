import { Global, Injectable, Logger, Module, Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import nodemailer, { type Transporter } from 'nodemailer';
import { PrismaService } from '../../common/prisma.service';
import { AuthUser, CurrentUser } from '../../common/auth.decorators';
import type { Permission } from '@cmms/shared';

export interface NotifyInput {
  organizationId: string;
  kind: string;
  title: string;
  body: string;
  link?: string;
  /** Destinatarios: usuarios activos con este permiso que vean la sede (o globales). */
  permission: Permission;
  siteId?: string | null;
  /** Evita repetir la misma alerta (p. ej. "doc:<id>:urgent"). */
  dedupeKey?: string;
}

/**
 * Notificaciones (doc 06: correo en el MVP; WhatsApp/SMS en fase 2).
 * Envía por SMTP si está configurado (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM); si no, las registra
 * igual en la app para que se vean en «Notificaciones».
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger('Notificaciones');
  private readonly transport: Transporter | null;
  private readonly from = process.env.SMTP_FROM ?? 'CMMS OLAST <no-responder@olast.co>';
  private readonly appUrl = process.env.APP_URL ?? 'http://localhost:3000';

  constructor(private readonly prisma: PrismaService) {
    this.transport = process.env.SMTP_HOST
      ? nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port: Number(process.env.SMTP_PORT ?? 587),
          secure: Number(process.env.SMTP_PORT ?? 587) === 465,
          auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
        })
      : null;
  }

  async notify(n: NotifyInput): Promise<number> {
    const users = await this.prisma.user.findMany({
      where: {
        organizationId: n.organizationId,
        active: true,
        deletedAt: null,
        role: { permissions: { has: n.permission } },
        ...(n.siteId ? { OR: [{ role: { isGlobal: true } }, { sites: { some: { siteId: n.siteId } } }] } : {}),
      },
      select: { id: true, email: true },
    });
    let sent = 0;
    for (const u of users) {
      const dedupeKey = n.dedupeKey ? `${n.dedupeKey}:${u.id}` : null;
      if (dedupeKey && (await this.prisma.notification.findUnique({ where: { dedupeKey } }))) continue;
      let error: string | null = null;
      if (this.transport) {
        try {
          await this.transport.sendMail({
            from: this.from,
            to: u.email,
            subject: `[CMMS OLAST] ${n.title}`,
            text: `${n.body}${n.link ? `\n\nAbrir: ${this.appUrl}${n.link}` : ''}`,
          });
          sent++;
        } catch (e) {
          error = e instanceof Error ? e.message : String(e);
          this.logger.warn(`No se pudo enviar a ${u.email}: ${error}`);
        }
      } else {
        error = 'SMTP no configurado: visible solo en la app';
      }
      await this.prisma.notification.create({
        data: { organizationId: n.organizationId, userId: u.id, kind: n.kind, title: n.title, body: n.body, link: n.link ?? null, sentAt: error ? null : new Date(), error, dedupeKey },
      });
    }
    return sent;
  }
}

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  mine(@CurrentUser() u: AuthUser) {
    return this.prisma.notification.findMany({ where: { userId: u.id }, orderBy: { createdAt: 'desc' }, take: 50 });
  }
}

@Global()
@Module({ controllers: [NotificationsController], providers: [NotificationsService], exports: [NotificationsService] })
export class NotificationsModule {}
