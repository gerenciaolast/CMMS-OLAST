import { Module } from '@nestjs/common';
import { PmModule } from '../pm/pm.module';
import { VehiclesController } from './vehicles.controller';
import { ImportsController } from './imports.controller';
import { VehiclesService } from './vehicles.service';

@Module({ imports: [PmModule], controllers: [VehiclesController, ImportsController], providers: [VehiclesService], exports: [VehiclesService] })
export class VehiclesModule {}
