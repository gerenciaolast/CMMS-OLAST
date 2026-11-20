import { Injectable } from '@nestjs/common';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { AppError } from './errors';

/**
 * Almacenamiento de archivos. Desarrollo: disco local (UPLOAD_DIR). Producción: reemplazar por S3/MinIO
 * implementando la misma interfaz (put/get) — doc 07.
 */
const IMAGE_SIGNATURES: [string, number[]][] = [
  ['image/jpeg', [0xff, 0xd8, 0xff]],
  ['image/png', [0x89, 0x50, 0x4e, 0x47]],
  ['image/webp', [0x52, 0x49, 0x46, 0x46]],
];
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export function detectImageType(buf: Buffer): string | null {
  for (const [mime, sig] of IMAGE_SIGNATURES) if (sig.every((b, i) => buf[i] === b)) return mime;
  return null;
}

@Injectable()
export class StorageService {
  private readonly root = resolve(process.env.UPLOAD_DIR ?? join(process.cwd(), 'uploads'));

  async putImage(buf: Buffer): Promise<{ key: string; mime: string; size: number }> {
    if (buf.length > MAX_IMAGE_BYTES) throw new AppError('FILE_TOO_LARGE', 'La foto supera 8 MB', 413);
    const mime = detectImageType(buf);
    if (!mime) throw new AppError('INVALID_FILE', 'Solo se aceptan fotos JPG, PNG o WEBP', 415);
    const now = new Date();
    const key = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${randomUUID()}`;
    await mkdir(join(this.root, key, '..'), { recursive: true });
    await writeFile(join(this.root, key), buf);
    return { key, mime, size: buf.length };
  }

  async get(key: string): Promise<Buffer> {
    const path = resolve(this.root, key);
    if (!path.startsWith(this.root)) throw new AppError('NOT_FOUND', 'Archivo no encontrado', 404);
    return readFile(path).catch(() => {
      throw new AppError('NOT_FOUND', 'Archivo no encontrado', 404);
    });
  }
}
