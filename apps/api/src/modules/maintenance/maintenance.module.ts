import { Module } from '@nestjs/common';
import { VehiclesModule } from '../vehicles/vehicles.module';
import { PmModule } from '../pm/pm.module';
import { StorageService } from '../../common/storage';
import { MaintenanceController } from './maintenance.controller';
import { WorkRequestsService } from './work-requests.service';
import { WorkOrdersService } from './work-orders.service';

@Module({
  imports: [VehiclesModule, PmModule],
  controllers: [MaintenanceController],
  providers: [WorkRequestsService, WorkOrdersService, StorageService],
  exports: [WorkOrdersService],
})
export class MaintenanceModule {}
