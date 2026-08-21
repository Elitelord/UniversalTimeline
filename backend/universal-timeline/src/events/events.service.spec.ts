import { Test, TestingModule } from '@nestjs/testing';
import { EventsService } from './events.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Event } from './event.entity';
import { MergeService } from '../processing/merge.service';
import { ClassifierService } from '../processing/classifier.service';

describe('EventsService', () => {
  let service: EventsService;
  let repo: { save: jest.Mock; find: jest.Mock; create: jest.Mock; createQueryBuilder: jest.Mock };

  beforeEach(async () => {
    repo = {
      save: jest.fn((x) => x),
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn((x) => ({ ...x })),
      createQueryBuilder: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventsService,
        { provide: getRepositoryToken(Event), useValue: repo },
        {
          provide: MergeService,
          useValue: { mergeEvents: jest.fn((events) => events) },
        },
        // Real classifier — it's a pure function and the point of these tests is
        // that ingest actually normalises types.
        ClassifierService,
      ],
    }).compile();

    service = module.get<EventsService>(EventsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  const dto = (overrides: any = {}) => ({
    id: '11111111-1111-1111-1111-111111111111',
    user_id: 'user1',
    device_id: 'VIVOS',
    activity_type: 'other',
    activity_name: 'Cursor',
    start_time: '2026-08-18T10:00:00.000Z',
    end_time: '2026-08-18T10:05:00.000Z',
    metadata: { process_name: 'Cursor' },
    ...overrides,
  });

  it('reclassifies fallback types on ingest', async () => {
    await service.create([dto() as any]);
    const saved = repo.save.mock.calls[0][0];
    expect(saved[0].activity_type).toBe('coding');
    expect(saved[0].metadata.original_activity_type).toBe('other');
  });

  it('selects merge candidates by time window, not a fixed row count', async () => {
    await service.create([dto() as any]);

    // Second find() call is the merge-candidate query; the first is the dedup lookup.
    const candidateQuery = repo.find.mock.calls[1][0];
    expect(candidateQuery.where.start_time).toBeDefined();
    expect(candidateQuery.take).toBeGreaterThan(100);
  });

  it('defaults an empty activity_name from metadata rather than rejecting', async () => {
    // Windows sends the raw window title; an untitled window yields "".
    await service.create([
      dto({ activity_name: '', metadata: { process_name: 'chrome' } }) as any,
    ]);
    expect(repo.save.mock.calls[0][0][0].activity_name).toBe('chrome');
  });

  it('caps an over-long activity_name (a verbose browser tab title)', async () => {
    const longTitle = 'A'.repeat(1500);
    await service.create([dto({ activity_name: longTitle }) as any]);
    expect(repo.save.mock.calls[0][0][0].activity_name.length).toBe(1000);
  });

  it('saves a lone new event that merges with nothing (regression: dbfc4dc)', async () => {
    // The old `!e.id || _isModified` filter dropped any new event that didn't merge,
    // because clients always supply an id. This is the exact case that regressed.
    repo.find.mockResolvedValue([]); // no existing rows, nothing to merge into
    await service.create([dto({ activity_name: 'Hevy', metadata: { package_name: 'com.hevy' } }) as any]);
    const saved = repo.save.mock.calls[0][0];
    expect(saved).toHaveLength(1);
    expect(saved[0].activity_name).toBe('Hevy');
  });

  it('does not re-save an unchanged pre-existing row', async () => {
    const existing = {
      id: 'db-1', user_id: 'user1', device_id: 'VIVOS',
      activity_type: 'coding', activity_name: 'Solo',
      start_time: new Date('2026-08-18T09:00:00Z'),
      end_time: new Date('2026-08-18T09:05:00Z'),
      metadata: null,
    };
    // First find() = dedup lookup (empty), second = merge candidates (the existing row)
    repo.find.mockResolvedValueOnce([]).mockResolvedValueOnce([existing]);
    // New event far from the existing one, so no merge occurs
    await service.create([dto({ activity_name: 'Different', start_time: '2026-08-18T15:00:00.000Z', end_time: '2026-08-18T15:05:00.000Z' }) as any]);
    const saved = repo.save.mock.calls[0][0];
    expect(saved.map((e: any) => e.activity_name)).not.toContain('Solo');
  });

  it('does not let reclassification change the idempotency hash', async () => {
    // The hash is device_id + activity_name + start_time — deliberately excluding
    // activity_type, so re-running the classifier can never orphan an existing row.
    await service.create([dto() as any]);
    const first = repo.save.mock.calls[0][0][0].idempotency_hash;

    repo.save.mockClear();
    await service.create([dto({ activity_type: 'coding' }) as any]);
    const second = repo.save.mock.calls[0][0][0].idempotency_hash;

    expect(first).toBe(second);
  });
});
