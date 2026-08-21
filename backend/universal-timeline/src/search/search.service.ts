import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Event } from '../events/event.entity';
import { MergeService } from '../processing/merge.service';
import { escapeLikePattern } from '../common/escape-like';
import {
  ftsExpression,
  trigramExpression,
  rankNameExpression,
} from './bootstrap-statements';
import { SearchCapabilities } from './search-capabilities.service';

/** How far back an unbounded search looks by default. */
const DEFAULT_LOOKBACK_DAYS = 365;

/**
 * How many ranked rows to pull before merging. Merging collapses fragmented
 * slivers into sessions, so we need more raw rows than the caller asked for.
 */
const CANDIDATE_MULTIPLIER = 4;
const CANDIDATE_CAP = 400;

export interface SearchHit extends Event {
  /** Best relevance score among the events merged into this session. */
  score: number;
}

export interface SearchResponse {
  results: SearchHit[];
  has_more: boolean;
}

interface CandidateRow extends Event {
  lex_rank: string | number;
  trg_sim: string | number;
}

@Injectable()
export class SearchService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly mergeService: MergeService,
    private readonly capabilities: SearchCapabilities,
  ) {}

  async search(
    user_id: string,
    opts: {
      q: string;
      from?: string;
      to?: string;
      activity_type?: string;
      limit: number;
      offset: number;
    },
  ): Promise<SearchResponse> {
    const to = opts.to ? new Date(opts.to) : new Date();
    const from = opts.from
      ? new Date(opts.from)
      : new Date(to.getTime() - DEFAULT_LOOKBACK_DAYS * 86_400_000);

    const types = opts.activity_type
      ? opts.activity_type.split(',').map((t) => t.trim()).filter(Boolean)
      : null;

    const candidateLimit = Math.min(
      (opts.offset + opts.limit) * CANDIDATE_MULTIPLIER,
      CANDIDATE_CAP,
    );

    const rows: CandidateRow[] = await this.dataSource.query(
      this.buildSql(),
      [
        user_id,                                   // $1
        from.toISOString(),                        // $2
        to.toISOString(),                          // $3
        opts.q,                                    // $4
        opts.q.toLowerCase(),                      // $5
        `%${escapeLikePattern(opts.q.toLowerCase())}%`, // $6
        types && types.length > 0 ? types : null,  // $7
        candidateLimit,                            // $8
      ],
    );

    return this.collapse(rows, opts.offset, opts.limit);
  }

  /**
   * The FTS and trigram expressions must be byte-identical to the ones the indexes
   * were built with, or the planner falls back to a sequential scan without saying
   * so. Both sides call the shared helpers in bootstrap-statements.ts.
   */
  private buildSql(): string {
    const fts = ftsExpression('e');
    const trgm = trigramExpression('e');
    const rankName = rankNameExpression('e');

    // similarity() only exists when pg_trgm is installed. Without it, fall back to a
    // constant so the ranking arithmetic stays valid and the LIKE arm still matches.
    //
    // Ranking uses activity_name rather than the full searchable blob: trigram
    // similarity is a ratio over the whole string, so measuring against a long
    // concatenation of window titles dilutes every score toward zero.
    const sim = this.capabilities.trigram ? `similarity(${rankName}, $5)` : `0.0`;

    // Recency divisor on a 30-day scale: a strong match from last year still ranks,
    // but today's work wins ties. 2592000 = seconds in 30 days.
    const score = `(2.0 * ts_rank_cd(${fts}, q.query, 32) + ${sim}) / (1.0 + EXTRACT(EPOCH FROM (now() - e.start_time)) / 2592000.0)`;

    return `
      WITH q AS (SELECT websearch_to_tsquery('english', $4) AS query)
      SELECT e.*,
             ts_rank_cd(${fts}, q.query, 32) AS lex_rank,
             ${sim} AS trg_sim
      FROM activity_events e, q
      WHERE e.user_id = $1
        AND e.start_time >= $2
        AND e.start_time < $3
        AND ($7::text[] IS NULL OR e.activity_type = ANY($7))
        AND (
          ${fts} @@ q.query
          -- websearch_to_tsquery returns an EMPTY query for stopword-only input
          -- like "the", which makes @@ false. The LIKE arm covers that case and
          -- substring matches FTS misses; Postgres BitmapOrs the two GIN indexes.
          OR ${trgm} LIKE $6 ESCAPE '\\'
        )
      ORDER BY ${score} DESC, e.start_time DESC
      LIMIT $8
    `;
  }

  /**
   * Merges fragmented matches into sessions, then re-ranks.
   *
   * MergeService sorts chronologically, which would throw away the relevance order
   * the SQL just computed. So we carry each candidate's score across the merge by
   * taking, for every resulting session, the best score among the candidates that
   * fall inside it.
   */
  private collapse(
    rows: CandidateRow[],
    offset: number,
    limit: number,
  ): SearchResponse {
    const scored = rows.map((row) => ({
      row,
      score: Number(row.lex_rank ?? 0) + Number(row.trg_sim ?? 0),
    }));

    const merged = this.mergeService.mergeEvents(rows as Event[]);

    const hits: SearchHit[] = merged.map((session) => {
      const startMs = session.start_time.getTime();
      const endMs = session.end_time ? session.end_time.getTime() : startMs;

      let best = 0;
      for (const { row, score } of scored) {
        if (
          row.activity_name === session.activity_name &&
          row.activity_type === session.activity_type &&
          row.start_time.getTime() >= startMs &&
          row.start_time.getTime() <= endMs &&
          score > best
        ) {
          best = score;
        }
      }
      return Object.assign(session, { score: best }) as SearchHit;
    });

    hits.sort((a, b) =>
      b.score !== a.score
        ? b.score - a.score
        : b.start_time.getTime() - a.start_time.getTime(),
    );

    return {
      results: hits.slice(offset, offset + limit),
      has_more: hits.length > offset + limit,
    };
  }
}
