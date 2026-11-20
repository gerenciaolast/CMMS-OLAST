import { Module } from '@nestjs/common';
import { VehiclesModule } from '../vehicles/vehicles.module';
import { MaintenanceModule } from '../maintenance/maintenance.module';
import { InspectionsController } from './inspections.controller';
import { InspectionsService } from './inspections.service';

@Module({ imports: [VehiclesModule, MaintenanceModule], controllers: [InspectionsController], providers: [InspectionsService] })
export class InspectionsModule {}
