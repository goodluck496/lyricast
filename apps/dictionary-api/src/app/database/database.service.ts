import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { DRIZZLE, POSTGRES_CLIENT } from './database.providers';
import { type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { type Sql } from 'postgres';
import * as schema from '../../lib/db/schema';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  constructor(
    @Inject(POSTGRES_CLIENT) private readonly sql: Sql,
    @Inject(DRIZZLE) private readonly db: PostgresJsDatabase<typeof schema>,
  ) {}

  get client() {
    return this.db;
  }

  async onModuleInit() {
    // Проверочный запрос, чтобы рано увидеть проблемы с подключением
    await this.sql`select 1`;
  }

  async onModuleDestroy() {
    await this.sql.end({ timeout: 1 });
  }
}
