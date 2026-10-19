import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const envFilePath = resolve(process.cwd(), '.env');
if (existsSync(envFilePath)) {
  process.loadEnvFile(envFilePath);
}

const { AppModule } = await import('./app.module.js');

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // CORS setup that only allows Angular port.
  app.enableCors({
    origin: [process.env.FE_PORT],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    // Allows auth header for bearer JWT and Content-Type (for the JSON)
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
    credentials: true,
  });

  // Swagger (OpenAPI) setup
  const config = new DocumentBuilder()
    .setTitle('CAD Auth API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  // In memory OpenAPI spec object (maps out middleware for our API)
  const document = SwaggerModule.createDocument(app, config);

  // Mount Swagger UI & JSON endpoints
  // Makes http://localhost:8800/v3/api-docs/swagger.json
  SwaggerModule.setup('v3/api-docs', app, document, {
    jsonDocumentUrl: 'v3/api-docs/swagger.json',
  });

  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();