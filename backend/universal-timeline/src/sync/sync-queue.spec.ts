import { SyncQueue } from './sync-queue';
import { Event } from '../events/event.entity';

// Helper to create a minimal test event
function createEvent(overrides: Partial<Event> = {}): Event {
  return {
    id: `test-${Math.random().toString(36).slice(2, 10)}`,
    user_id: 'user1',
    device_id: 'device1',
    activity_type: 'coding',
    activity_name: 'VSCode',
    start_time: new Date(),
    end_time: new Date(),
    metadata: null,
    created_at: new Date(),
    idempotency_hash: '',
    ...overrides,
  } as Event;
}

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('SyncQueue', () => {
  let queue: SyncQueue;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(Math, 'random').mockReturnValue(0); // Remove jitter for predictable timing
    mockFetch.mockReset();
    queue = new SyncQueue('http://localhost:3000/events/list');
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  // --- Basic operations ---

  it('should enqueue events to the queue', () => {
    queue.enqueue(createEvent());
    queue.enqueue(createEvent());
    queue.enqueue(createEvent());
    expect(queue.getQueueSize()).toBe(3);
  });

  it('should cap the queue at 10,000 events and drop oldest', () => {
    // Fill queue to the max
    for (let i = 0; i < 10_000; i++) {
      queue.enqueue(createEvent({ id: `event-${i}` }));
    }
    expect(queue.getQueueSize()).toBe(10_000);

    // Adding one more should drop the oldest and keep size at 10,000
    queue.enqueue(createEvent({ id: 'newest' }));
    expect(queue.getQueueSize()).toBe(10_000);
  });

  // --- Successful flush ---

  it('should flush events and remove them from the queue on success', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });

    queue.enqueue(createEvent());
    queue.enqueue(createEvent());
    expect(queue.getQueueSize()).toBe(2);

    await queue.flush();

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3000/events/list',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(queue.getQueueSize()).toBe(0);
  });

  // --- Failed flush ---

  it('should retain events in the queue on network failure', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    queue.enqueue(createEvent());
    queue.enqueue(createEvent());

    await queue.flush();

    // Events should still be in the queue
    expect(queue.getQueueSize()).toBe(2);
  });

  // --- Exponential backoff ---

  it('should increase backoff delay after each failure', async () => {
    // First failure
    mockFetch.mockRejectedValueOnce(new Error('fail'));
    await queue.flush();

    // First retry should be scheduled at 1s (baseDelay * 2^0 = 1000ms, jitter mocked to 0)
    expect(jest.getTimerCount()).toBe(1);

    // Advance past first retry — fail again
    mockFetch.mockRejectedValueOnce(new Error('fail'));
    jest.advanceTimersByTime(1000);
    await Promise.resolve(); // Let the flush() promise settle

    // Second retry should be scheduled at 2s (baseDelay * 2^1 = 2000ms)
    expect(jest.getTimerCount()).toBe(1);

    // Advance only 1s — shouldn't have fired yet
    mockFetch.mockRejectedValueOnce(new Error('fail'));
    jest.advanceTimersByTime(1000);
    expect(mockFetch).toHaveBeenCalledTimes(2); // Still only 2 calls

    // Advance another 1s (total 2s) — now it fires
    jest.advanceTimersByTime(1000);
    await Promise.resolve();
    expect(mockFetch).toHaveBeenCalledTimes(3); // Third call
  });

  it('should reset backoff after a successful flush', async () => {
    queue.enqueue(createEvent());

    // Fail twice to build up retryAttempt
    mockFetch.mockRejectedValueOnce(new Error('fail'));
    await queue.flush();

    mockFetch.mockRejectedValueOnce(new Error('fail'));
    jest.advanceTimersByTime(1000);
    await Promise.resolve();

    // Now succeed
    mockFetch.mockResolvedValueOnce({ ok: true });
    jest.advanceTimersByTime(2000);
    await Promise.resolve();

    expect(queue.getQueueSize()).toBe(0);

    // Enqueue again and fail — backoff should start from 1s, not continue from where it was
    queue.enqueue(createEvent());
    mockFetch.mockRejectedValueOnce(new Error('fail'));
    await queue.flush();

    // If backoff was reset, timer count should be 1 (new retry at 1s)
    expect(jest.getTimerCount()).toBe(1);
  });

  // --- Batch size ---

  it('should flush at most 50 events per batch', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });

    // Enqueue 75 events
    for (let i = 0; i < 75; i++) {
      queue.enqueue(createEvent());
    }

    await queue.flush();

    // Should have sent 50 and kept 25
    const sentBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(sentBody).toHaveLength(50);
    expect(queue.getQueueSize()).toBe(25);
  });

  // --- clearQueue ---

  it('should clear the queue and cancel pending retries', async () => {
    queue.enqueue(createEvent());

    mockFetch.mockRejectedValueOnce(new Error('fail'));
    await queue.flush();

    expect(jest.getTimerCount()).toBe(1); // Retry timer pending

    queue.clearQueue();

    expect(queue.getQueueSize()).toBe(0);
    expect(jest.getTimerCount()).toBe(0); // Timer cancelled
  });
});
