import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );

  const origin = config.get<string>('FRONTEND_ORIGIN') ?? 'http://localhost:3000';
  app.enableCors({ origin, methods: ['GET', 'POST'], credentials: false });

  const port = Number(config.get<string>('PORT') ?? 4000);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`DiNC backend listening on http://localhost:${port}/api`);
}

void bootstrap();
