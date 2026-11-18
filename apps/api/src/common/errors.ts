import { HttpException, HttpStatus } from '@nestjs/common';

/** Error de dominio con formato uniforme { code, message, details } (doc 07 §3). */
export class AppError extends HttpException {
  constructor(code: string, message: string, status: HttpStatus = HttpStatus.BAD_REQUEST, details?: unknown) {
    super({ code, message, details }, status);
  }
}
