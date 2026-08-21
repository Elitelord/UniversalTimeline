import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * What the database can actually do, detected once at boot.
 *
 * Managed Postgres hosts differ in which extensions are installed and whether the
 * app role may install them. Rather than assume, we look, and let the query builders
 * drop the parts that aren't available. Defaults are the pessimistic ones so that a
 * failed detection degrades instead of producing broken SQL.
 */
@Injectable()
export class SearchCapabilities {
  private readonly logger = new Logger(SearchCapabilities.name);

  /** pg_trgm — enables similarity() scoring and the trigram index. */
  trigram = false;
  /** pgvector — required by the Phase 1 semantic retrieval path. */
  vector = false;

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async detect(): Promise<void> {
    try {
      const rows: Array<{ extname: string }> = await this.dataSource.query(
        `SELECT extname FROM pg_extension WHERE extname = ANY($1)`,
        [['pg_trgm', 'vector']],
      );
      const names = new Set(rows.map((r) => r.extname));
      this.trigram = names.has('pg_trgm');
      this.vector = names.has('vector');
      this.logger.log(
        `Search capabilities: trigram=${this.trigram} vector=${this.vector}`,
      );
    } catch (err) {
      this.logger.warn(
        `Could not detect search capabilities, assuming none: ${(err as Error).message}`,
      );
    }
  }
}
