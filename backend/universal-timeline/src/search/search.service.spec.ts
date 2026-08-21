import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { SearchService } from './search.service';
import { SearchCapabilities } from './search-capabilities.service';
import { MergeService } from '../processing/merge.service';
import { Event } from '../events/event.entity';
import { ftsExpression, trigramExpression } from './bootstrap-statements';

function createEvent(overrides: Partial<Event> & { lex_rank?: number; trg_sim?: number }) {
  return {
    id: 'test-id',
    user_id: 'user1',
    device_id: 'device1',
    activity_type: 'coding',
    activity_name: 'VSCode',
    start_time: new Date('2026-06-10T08:00:00Z'),
    end_time: new Date('2026-06-10T09:00:00Z'),
    metadata: null,
    created_at: new Date(),
    lex_rank: 0.1,
    trg_sim: 0,
    ...overrides,
  } as any;
}

describe('SearchService', () => {
  let service: SearchService;
  let query: jest.Mock;
  let capabilities: SearchCapabilities;

  beforeEach(async () => {
    query = jest.fn().mockResolvedValue([]);
    capabilities = { trigram: true, vector: false } as SearchCapabilities;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchService,
        MergeService,
        { provide: getDataSourceToken(), useValue: { query } },
        { provide: SearchCapabilities, useValue: capabilities },
      ],
    }).compile();

    service = module.get<SearchService>(SearchService);
  });

  const run = (overrides: Partial<Parameters<SearchService['search']>[1]> = {}) =>
    service.search('user1', { q: 'vscode', limit: 25, offset: 0, ...overrides });

  describe('tenant and range isolation', () => {
    // This is the assertion that stops a future refactor from quietly turning the
    // user/range filter into a post-filter or dropping it altogether.
    it('always binds user_id and both range bounds', async () => {
      await run();
      const [sql, params] = query.mock.calls[0];

      expect(sql).toContain('e.user_id = $1');
      expect(sql).toContain('e.start_time >= $2');
      expect(sql).toContain('e.start_time < $3');
      expect(params[0]).toBe('user1');
      expect(params[1]).toBeTruthy();
      expect(params[2]).toBeTruthy();
    });

    it('defaults to a bounded lookback rather than an open range', async () => {
      await run();
      const [, params] = query.mock.calls[0];
      const from = new Date(params[1]).getTime();
      const to = new Date(params[2]).getTime();
      expect(to).toBeGreaterThan(from);
      expect(to - from).toBeLessThanOrEqual(366 * 86_400_000);
    });

    it('never interpolates the raw query text into the SQL', async () => {
      await run({ q: "'; DROP TABLE activity_events; --" });
      const [sql, params] = query.mock.calls[0];
      expect(sql).not.toContain('DROP TABLE');
      expect(params[3]).toBe("'; DROP TABLE activity_events; --");
    });
  });

  describe('query construction', () => {
    it('uses the same expressions the indexes were built with', async () => {
      await run();
      const [sql] = query.mock.calls[0];
      // A drift here silently downgrades the query to a sequential scan
      expect(sql).toContain(ftsExpression('e'));
      expect(sql).toContain(trigramExpression('e'));
    });

    it('escapes LIKE wildcards in the pattern parameter', async () => {
      await run({ q: '100%_' });
      const [, params] = query.mock.calls[0];
      expect(params[5]).toBe('%100\\%\\_%');
    });

    it('passes activity types as an array, or null when absent', async () => {
      await run({ activity_type: 'coding, browsing' });
      expect(query.mock.calls[0][1][6]).toEqual(['coding', 'browsing']);

      query.mockClear();
      await run();
      expect(query.mock.calls[0][1][6]).toBeNull();
    });

    it('drops the similarity term when pg_trgm is unavailable', async () => {
      (capabilities as any).trigram = false;
      await run();
      const [sql] = query.mock.calls[0];
      expect(sql).not.toContain('similarity(');
      // the LIKE arm must survive so the query still matches something
      expect(sql).toContain('LIKE $6');
    });
  });

  describe('result collapsing', () => {
    it('merges fragmented matches into one session', async () => {
      query.mockResolvedValue([
        createEvent({
          id: '1',
          start_time: new Date('2026-06-10T08:00:00Z'),
          end_time: new Date('2026-06-10T08:30:00Z'),
          lex_rank: 0.2,
        }),
        createEvent({
          id: '2',
          start_time: new Date('2026-06-10T08:30:00Z'),
          end_time: new Date('2026-06-10T09:00:00Z'),
          lex_rank: 0.5,
        }),
      ]);

      const { results } = await run();
      expect(results).toHaveLength(1);
      expect(results[0].end_time).toEqual(new Date('2026-06-10T09:00:00Z'));
    });

    it('ranks a session by the best score among its merged events', async () => {
      query.mockResolvedValue([
        createEvent({
          id: 'weak',
          activity_name: 'Chrome',
          start_time: new Date('2026-06-10T08:00:00Z'),
          end_time: new Date('2026-06-10T08:30:00Z'),
          lex_rank: 0.1,
        }),
        createEvent({
          id: 'strong-a',
          activity_name: 'VSCode',
          start_time: new Date('2026-06-10T10:00:00Z'),
          end_time: new Date('2026-06-10T10:30:00Z'),
          lex_rank: 0.2,
        }),
        createEvent({
          id: 'strong-b',
          activity_name: 'VSCode',
          start_time: new Date('2026-06-10T10:30:00Z'),
          end_time: new Date('2026-06-10T11:00:00Z'),
          lex_rank: 0.9,
        }),
      ]);

      const { results } = await run();
      // The VSCode session inherits 0.9 from its best constituent and outranks Chrome,
      // even though Chrome sorts earlier chronologically.
      expect(results[0].activity_name).toBe('VSCode');
      expect(results[0].score).toBeCloseTo(0.9);
      expect(results[1].activity_name).toBe('Chrome');
    });

    it('reports has_more only when results exceed the page', async () => {
      query.mockResolvedValue(
        Array.from({ length: 3 }, (_, i) =>
          createEvent({
            id: `e${i}`,
            activity_name: `App${i}`,
            start_time: new Date(Date.UTC(2026, 5, 10, 8 + i)),
            end_time: new Date(Date.UTC(2026, 5, 10, 8 + i, 30)),
          }),
        ),
      );

      expect((await run({ limit: 2 })).has_more).toBe(true);
      expect((await run({ limit: 5 })).has_more).toBe(false);
    });

    it('returns in-progress events, which have no end_time', async () => {
      query.mockResolvedValue([
        createEvent({ id: 'running', end_time: null, lex_rank: 0.5 }),
      ]);
      const { results } = await run();
      expect(results).toHaveLength(1);
      expect(results[0].end_time).toBeNull();
    });
  });
});
