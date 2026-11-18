import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/auth.decorators';
import { PrismaService } from '../../common/prisma.service';
import { AppError } from '../../common/errors';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  async check() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new AppError('DB_UNAVAILABLE', 'Base de datos no disponible', 503);
    }
    return { status: 'ok', db: 'ok', time: new Date().toISOString() };
  }
}
