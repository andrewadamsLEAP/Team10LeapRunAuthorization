import {
  Inject,
  Injectable,
  Logger,
  Module,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { Pool } from 'pg';

export const DATABASE_POOL = Symbol('DATABASE_POOL');

function createDatabasePool() {
  const { DATABASE_HOST, DATABASE_USER, DATABASE_PASSWORD, DATABASE_NAME } =
    process.env;
  if (!DATABASE_HOST || !DATABASE_USER || !DATABASE_PASSWORD || !DATABASE_NAME) {
    throw new Error(
      'Set DATABASE_HOST, DATABASE_USER, DATABASE_PASSWORD, and DATABASE_NAME in .env.',
    );
  }

  const port = Number(process.env.DATABASE_PORT ?? 5432);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('DATABASE_PORT must be a valid TCP port.');
  }

  return new Pool({
    host: DATABASE_HOST,
    port,
    user: DATABASE_USER,
    password: DATABASE_PASSWORD,
    database: DATABASE_NAME,
    ssl: process.env.DATABASE_SSL === 'true' ? {} : undefined,
    max: 10,
    connectionTimeoutMillis: 5000,
  });
}

@Injectable()
class DatabasePoolLifecycle implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(DatabasePoolLifecycle.name);

  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async onModuleInit() {
    await this.pool.query('SELECT 1');
    this.logger.log('PostgreSQL connection established.');
  }

  async onApplicationShutdown() {
    await this.pool.end();
  }
}

@Module({
  providers: [
    { provide: DATABASE_POOL, useFactory: createDatabasePool },
    DatabasePoolLifecycle,
  ],
  exports: [DATABASE_POOL],
})
export class DatabaseModule {}