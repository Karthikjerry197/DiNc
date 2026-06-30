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

  const origins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://192.168.31.44:3000',
];

app.enableCors({
  origin: origins,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false,
});

  const port = Number(config.get<string>('PORT') ?? 4000);
  await app.listen(port, '0.0.0.0');
  // eslint-disable-next-line no-console
  console.log(`DiNC backend listening on:
  Local:   http://localhost:${port}/api
  Network: http://192.168.31.44:${port}/api`);
}

void bootstrap();
