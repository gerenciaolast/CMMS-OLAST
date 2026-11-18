import { PipeTransform } from '@nestjs/common';
import type { ZodSchema } from 'zod';
import { AppError } from './errors';

export class ZodPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodSchema<T>) {}
  transform(value: unknown): T {
    const r = this.schema.safeParse(value);
    if (!r.success) {
      throw new AppError('VALIDATION_ERROR', 'Datos inválidos', 400,
        r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
    }
    return r.data;
  }
}
