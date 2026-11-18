import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../../common/prisma.service';

/** Catálogos de solo lectura para formularios (doc 03 y doc 09). Cualquier usuario autenticado. */
@ApiTags('catalog')
@ApiBearerAuth()
@Controller('catalog')
export class CatalogController {
  constructor(private readonly prisma: PrismaService) {}

  /** Árbol de componentes. ?parent=FRN para un nivel; ?level=1 para sistemas. */
  @Get('components')
  components(@Query('parent') parent?: string, @Query('level') level?: string) {
    return this.prisma.componentCode.findMany({
      where: {
        active: true,
        ...(level ? { level: Number(level) } : {}),
        ...(parent ? { parent: { code: parent } } : {}),
      },
      select: { code: true, name: true, level: true, vmrsCode: true, parent: { select: { code: true } } },
      orderBy: { code: 'asc' },
    });
  }

  @Get('failure-coding')
  async failureCoding() {
    const [modes, causes, actions] = await Promise.all([
      this.prisma.failureMode.findMany({ where: { active: true }, orderBy: { code: 'asc' } }),
      this.prisma.failureCause.findMany({ where: { active: true }, orderBy: { code: 'asc' } }),
      this.prisma.repairAction.findMany({ where: { active: true }, orderBy: { code: 'asc' } }),
    ]);
    return { modes, causes, actions };
  }

  @Get('work-order')
  async workOrder() {
    const [types, priorities, holdReasons] = await Promise.all([
      this.prisma.workOrderTypeDef.findMany(),
      this.prisma.priorityDef.findMany({ orderBy: { code: 'asc' } }),
      this.prisma.holdReason.findMany({ where: { active: true } }),
    ]);
    return { types, priorities, holdReasons };
  }

  @Get('vehicle-types')
  vehicleTypes() {
    return this.prisma.vehicleType.findMany({ where: { active: true }, orderBy: { code: 'asc' } });
  }

  @Get('document-types')
  documentTypes() {
    return this.prisma.documentType.findMany({ where: { active: true }, orderBy: { code: 'asc' } });
  }

  @Get('checklists')
  checklists() {
    return this.prisma.checklistTemplate.findMany({
      where: { active: true },
      include: { vehicleType: { select: { code: true, name: true } }, items: { orderBy: { sequence: 'asc' } } },
    });
  }
}
