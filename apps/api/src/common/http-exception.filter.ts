import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { Prisma } from '@prisma/client';

interface ErrorBody { code: string; message: string; details?: unknown }

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Errors');

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const { status, body } = this.toBody(exception);
    if (status >= 500) this.logger.error(exception);
    res.status(status).json(body);
  }

  private toBody(e: unknown): { status: number; body: ErrorBody } {
    if (e instanceof HttpException) {
      const status = e.getStatus();
      const r = e.getResponse();
      if (typeof r === 'object' && r && 'code' in r) return { status, body: r as ErrorBody };
      const message = typeof r === 'string' ? r : ((r as { message?: string | string[] }).message ?? e.message);
      return { status, body: { code: HttpStatus[status] ?? 'ERROR', message: Array.isArray(message) ? message.join('; ') : message } };
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === 'P2002') return { status: 409, body: { code: 'DUPLICATE', message: 'El registro ya existe', details: e.meta } };
      if (e.code === 'P2025') return { status: 404, body: { code: 'NOT_FOUND', message: 'Registro no encontrado' } };
    }
    return { status: 500, body: { code: 'INTERNAL_ERROR', message: 'Error interno del servidor' } };
  }
}
