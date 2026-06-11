import { MergeService } from './merge.service';
import { Event } from '../events/event.entity';

// Helper to create test events without boilerplate.
// Only requires the fields that matter for merging — everything else gets defaults.
function createEvent(overrides: Partial<Event>): Event {
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
    ...overrides,
  } as Event;
}

describe('MergeService', () => {
  let service: MergeService;

  beforeEach(() => {
    service = new MergeService();
  });

  // --- Edge Case Tests ---

  it('should return empty array for empty input', () => {
    const result = service.mergeEvents([]);
    expect(result).toEqual([]);
  });

  it('should return the same event for single event input', () => {
    const event = createEvent({ id: 'single' });
    const result = service.mergeEvents([event]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('single');
  });

  it('should filter out events with null end_time', () => {
    const events = [
      createEvent({ id: '1', end_time: null }),
      createEvent({ id: '2', end_time: null }),
    ];
    const result = service.mergeEvents(events);
    expect(result).toHaveLength(0);
  });

  // --- Core Merge Logic ---

  it('should merge two adjacent events with the same activity', () => {
    const events = [
      createEvent({
        id: '1',
        start_time: new Date('2026-06-10T08:00:00Z'),
        end_time: new Date('2026-06-10T09:00:00Z'),
      }),
      createEvent({
        id: '2',
        start_time: new Date('2026-06-10T09:00:00Z'),
        end_time: new Date('2026-06-10T10:00:00Z'),
      }),
    ];
    const result = service.mergeEvents(events);
    expect(result).toHaveLength(1);
    expect(result[0].start_time).toEqual(new Date('2026-06-10T08:00:00Z'));
    expect(result[0].end_time).toEqual(new Date('2026-06-10T10:00:00Z'));
  });

  it('should merge events within 60-second gap', () => {
    const events = [
      createEvent({
        id: '1',
        start_time: new Date('2026-06-10T08:00:00Z'),
        end_time: new Date('2026-06-10T09:00:00Z'),
      }),
      createEvent({
        id: '2',
        start_time: new Date('2026-06-10T09:00:30Z'), // 30-second gap
        end_time: new Date('2026-06-10T10:00:00Z'),
      }),
    ];
    const result = service.mergeEvents(events);
    expect(result).toHaveLength(1);
    expect(result[0].end_time).toEqual(new Date('2026-06-10T10:00:00Z'));
  });

  it('should NOT merge two events with gap > 60 seconds', () => {
    const events = [
      createEvent({
        id: '1',
        start_time: new Date('2026-06-10T08:00:00Z'),
        end_time: new Date('2026-06-10T09:00:00Z'),
      }),
      createEvent({
        id: '2',
        start_time: new Date('2026-06-10T09:05:00Z'), // 5-minute gap
        end_time: new Date('2026-06-10T10:00:00Z'),
      }),
    ];
    const result = service.mergeEvents(events);
    expect(result).toHaveLength(2);
  });

  it('should NOT merge overlapping events with different activity_name', () => {
    const events = [
      createEvent({
        id: '1',
        activity_name: 'VSCode',
        start_time: new Date('2026-06-10T08:00:00Z'),
        end_time: new Date('2026-06-10T09:30:00Z'),
      }),
      createEvent({
        id: '2',
        activity_name: 'Chrome',
        start_time: new Date('2026-06-10T09:00:00Z'),
        end_time: new Date('2026-06-10T10:00:00Z'),
      }),
    ];
    const result = service.mergeEvents(events);
    expect(result).toHaveLength(2);
  });

  it('should NOT merge overlapping events with different activity_type', () => {
    const events = [
      createEvent({
        id: '1',
        activity_type: 'coding',
        start_time: new Date('2026-06-10T08:00:00Z'),
        end_time: new Date('2026-06-10T09:30:00Z'),
      }),
      createEvent({
        id: '2',
        activity_type: 'browsing',
        start_time: new Date('2026-06-10T09:00:00Z'),
        end_time: new Date('2026-06-10T10:00:00Z'),
      }),
    ];
    const result = service.mergeEvents(events);
    expect(result).toHaveLength(2);
  });

  // --- Multi-event scenarios ---

  it('should merge first two but not third when third is distant', () => {
    const events = [
      createEvent({
        id: '1',
        start_time: new Date('2026-06-10T08:00:00Z'),
        end_time: new Date('2026-06-10T09:00:00Z'),
      }),
      createEvent({
        id: '2',
        start_time: new Date('2026-06-10T09:00:00Z'),
        end_time: new Date('2026-06-10T10:00:00Z'),
      }),
      createEvent({
        id: '3',
        start_time: new Date('2026-06-10T14:00:00Z'), // 4 hours later
        end_time: new Date('2026-06-10T15:00:00Z'),
      }),
    ];
    const result = service.mergeEvents(events);
    expect(result).toHaveLength(2);
    // First merged event spans 8:00 - 10:00
    expect(result[0].start_time).toEqual(new Date('2026-06-10T08:00:00Z'));
    expect(result[0].end_time).toEqual(new Date('2026-06-10T10:00:00Z'));
    // Third event stays separate
    expect(result[1].start_time).toEqual(new Date('2026-06-10T14:00:00Z'));
  });

  it('should handle events out of chronological order', () => {
    const events = [
      createEvent({
        id: '3',
        start_time: new Date('2026-06-10T14:00:00Z'),
        end_time: new Date('2026-06-10T15:00:00Z'),
      }),
      createEvent({
        id: '1',
        start_time: new Date('2026-06-10T08:00:00Z'),
        end_time: new Date('2026-06-10T09:00:00Z'),
      }),
      createEvent({
        id: '2',
        start_time: new Date('2026-06-10T09:00:00Z'),
        end_time: new Date('2026-06-10T10:00:00Z'),
      }),
    ];
    const result = service.mergeEvents(events);
    // Should sort first, then merge 1+2, keep 3 separate
    expect(result).toHaveLength(2);
    expect(result[0].start_time).toEqual(new Date('2026-06-10T08:00:00Z'));
    expect(result[0].end_time).toEqual(new Date('2026-06-10T10:00:00Z'));
    expect(result[1].start_time).toEqual(new Date('2026-06-10T14:00:00Z'));
  });

  it('should merge all events when all overlap with same activity', () => {
    const events = [
      createEvent({
        id: '1',
        start_time: new Date('2026-06-10T08:00:00Z'),
        end_time: new Date('2026-06-10T09:00:00Z'),
      }),
      createEvent({
        id: '2',
        start_time: new Date('2026-06-10T08:30:00Z'),
        end_time: new Date('2026-06-10T10:00:00Z'),
      }),
      createEvent({
        id: '3',
        start_time: new Date('2026-06-10T09:30:00Z'),
        end_time: new Date('2026-06-10T11:00:00Z'),
      }),
    ];
    const result = service.mergeEvents(events);
    expect(result).toHaveLength(1);
    expect(result[0].start_time).toEqual(new Date('2026-06-10T08:00:00Z'));
    expect(result[0].end_time).toEqual(new Date('2026-06-10T11:00:00Z'));
  });

  // --- Input immutability ---

  it('should not mutate the original events array', () => {
    const events = [
      createEvent({
        id: '2',
        start_time: new Date('2026-06-10T09:00:00Z'),
        end_time: new Date('2026-06-10T10:00:00Z'),
      }),
      createEvent({
        id: '1',
        start_time: new Date('2026-06-10T08:00:00Z'),
        end_time: new Date('2026-06-10T09:00:00Z'),
      }),
    ];
    // Capture original order
    const originalFirstId = events[0].id;
    service.mergeEvents(events);
    // If sort mutated the input, events[0].id would have changed
    expect(events[0].id).toBe(originalFirstId);
  });
});
