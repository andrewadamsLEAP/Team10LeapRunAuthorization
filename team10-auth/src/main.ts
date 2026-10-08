import { NestFactory } from '@nestjs/core';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const envFilePath = resolve(process.cwd(), '.env');
if (existsSync(envFilePath)) {
  process.loadEnvFile(envFilePath);
}

const { AppModule } = await import('./app.module.js');

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
