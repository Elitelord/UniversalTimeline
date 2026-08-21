import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { SEARCH_BOOTSTRAP_STATEMENTS } from './bootstrap-statements';
import { SearchCapabilities } from './search-capabilities.service';

/**
 * Applies the search DDL that TypeORM cannot manage (see bootstrap-statements.ts).
 *
 * Nest calls onModuleInit after dataSource.initialize() has finished running
 * synchronize, so these statements always land on a settled schema.
 *
 * Every statement is independently guarded: a permissions failure on a managed host
 * degrades search quality but must never stop the app from booting. In production
 * the recommended path is to run the same SQL once by hand over the direct (non-pooler)
 * connection; this runner is the idempotent safety net for local dev and fresh
 * environments.
 */
@Injectable()
export class SearchBootstrapService implements OnModuleInit {
  private readonly logger = new Logger(SearchBootstrapService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    private readonly capabilities: SearchCapabilities,
  ) {}

  async onModuleInit(): Promise<void> {
    const enabled =
      this.config.get<string>('SEARCH_BOOTSTRAP_ENABLED', 'true') !== 'false';

    if (enabled) {
      for (const statement of SEARCH_BOOTSTRAP_STATEMENTS) {
        try {
          await this.dataSource.query(statement.sql);
        } catch (err) {
          const message = (err as Error).message;
          if (statement.optional) {
            this.logger.warn(`Skipped optional "${statement.name}": ${message}`);
          } else {
            this.logger.error(`Failed "${statement.name}": ${message}`);
          }
        }
      }
    } else {
      this.logger.log('SEARCH_BOOTSTRAP_ENABLED=false, skipping search DDL');
    }

    // Detect after the DDL runs so a freshly created extension is picked up.
    await this.capabilities.detect();
  }
}
