import dns from 'node:dns';
// Force IPv4 DNS resolution — Render's free tier cannot reach Supabase over IPv6
dns.setDefaultResultOrder('ipv4first');

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { ConfigService } from '@nestjs/config';

import { json, urlencoded } from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  app.enableCors();
  app.useGlobalPipes(new ValidationPipe());
  app.useGlobalFilters(new AllExceptionsFilter());

  // Increase payload limit for large batched event syncs
  app.use(json({ limit: '50mb' }));
  app.use(urlencoded({ limit: '50mb', extended: true }));

  // Use PORT from .env, fallback to 3000
  const port = configService.get<number>('PORT', 3000);
  await app.listen(port);
  console.log(`Application running on http://localhost:${port}`);
}
bootstrap();
