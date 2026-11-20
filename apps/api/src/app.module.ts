import { DynamicModule, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { LoggerModule } from 'nestjs-pino';
import { APP_CONFIG, AppConfig } from './config';
import { PrismaModule } from './common/prisma.service';
import { AuthGuard } from './common/auth.guard';
import { AuditInterceptor } from './common/audit.interceptor';
import { AllExceptionsFilter } from './common/http-exception.filter';
import { HealthController } from './modules/health/health.controller';
import { AuthModule } from './modules/auth/auth.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { OrganizationModule } from './modules/organization/organization.module';
import { VehiclesModule } from './modules/vehicles/vehicles.module';
import { MaintenanceModule } from './modules/maintenance/maintenance.module';
import { PmModule } from './modules/pm/pm.module';
import { InspectionsModule } from './modules/inspections/inspections.module';
import { ComplianceModule } from './modules/compliance/compliance.service';
import { NotificationsModule } from './modules/notifications/notifications.service';

@Module({})
export class AppModule {
  static forRoot(cfg: AppConfig): DynamicModule {
    return {
      module: AppModule,
      global: true,
      imports: [
        LoggerModule.forRoot({
          pinoHttp: {
            level: cfg.NODE_ENV === 'test' ? 'silent' : 'info',
            transport: cfg.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
            redact: ['req.headers.authorization', 'req.headers.cookie'],
          },
        }),
        JwtModule.register({ global: true, secret: cfg.JWT_SECRET }),
        PrismaModule,
        AuthModule,
        CatalogModule,
        OrganizationModule,
        VehiclesModule,
        MaintenanceModule,
        PmModule,
        NotificationsModule,
        ComplianceModule,
        InspectionsModule,
      ],
      controllers: [HealthController],
      providers: [
        { provide: APP_CONFIG, useValue: cfg },
        { provide: APP_GUARD, useClass: AuthGuard },
        { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
        { provide: APP_FILTER, useClass: AllExceptionsFilter },
      ],
      exports: [APP_CONFIG],
    };
  }
}
