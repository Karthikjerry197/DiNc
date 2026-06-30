import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';

/** A scoped query runner (same signature as the pool) used inside a transaction. */
export interface TxClient {
  query<T extends QueryResultRow>(text: string, params?: unknown[]): Promise<QueryResult<T>>;
}

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly pool: Pool;

  constructor(private readonly config: ConfigService) {
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

  /**
   * Runs `fn` inside a single transaction on a dedicated connection: BEGIN →
   * fn(client) → COMMIT, rolling back on any error. Enables atomic, all-or-nothing
   * operations (e.g. patient registration) without changing the existing query API.
   */
  async withTransaction<T>(fn: (client: TxClient) => Promise<T>): Promise<T> {
    const client: PoolClient = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn({
        query: <R extends QueryResultRow>(text: string, params: unknown[] = []) =>
          client.query<R>(text, params),
      });
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
    }
  }
}
