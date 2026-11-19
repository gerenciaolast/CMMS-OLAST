import { Module } from '@nestjs/common';
import { VehiclesController } from './vehicles.controller';
import { ImportsController } from './imports.controller';
import { VehiclesService } from './vehicles.service';

@Module({ controllers: [VehiclesController, ImportsController], providers: [VehiclesService], exports: [VehiclesService] })
export class VehiclesModule {}
