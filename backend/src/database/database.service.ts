import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, QueryResult, QueryResultRow } from 'pg';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private pool!: Pool;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    this.pool = new Pool({
      host: this.config.get<string>('PGHOST'),
      port: Number(this.config.get<string>('PGPORT') ?? 5432),
      database: this.config.get<string>('PGDATABASE'),
      user: this.config.get<string>('PGUSER'),
      password: this.config.get<string>('PGPASSWORD'),
    });
  }

  async query<T extends QueryResultRow>(
    text: string,
    params: unknown[] = [],
  ): Promise<QueryResult<T>> {
    return this.pool.query<T>(text, params);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
    }
  }
}
