import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { AppConfig } from './config';

export async function createApp(cfg: AppConfig): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule.forRoot(cfg), { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.setGlobalPrefix('api/v1');
  app.enableCors({ origin: cfg.CORS_ORIGIN.split(','), credentials: true });
  app.enableShutdownHooks();
  const doc = new DocumentBuilder()
    .setTitle('CMMS-OLAST API')
    .setDescription('Gestión de mantenimiento y confiabilidad de flota OLAST')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, doc));
  return app;
}
