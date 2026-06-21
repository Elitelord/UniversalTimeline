import { Event } from '../events/event.entity';

export class SyncQueue {
  private queue: Event[] = [];
  private readonly maxQueueSize = 10_000;
  private readonly maxBatchSize = 50;
  private readonly baseDelay = 1000;       // 1 second
  private readonly maxDelay = 60_000;      // 60 seconds
  private retryAttempt = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly apiUrl: string;

  constructor(apiUrl: string) {
    this.apiUrl = apiUrl;
  }

  enqueue(event: Event): void {
    if (this.queue.length >= this.maxQueueSize) {
        this.queue.shift();
    }
    this.queue.push(event);
  }

  async flush(): Promise<void> {
    const eventsToSend = Math.min(this.queue.length, this.maxBatchSize);
    const eventsToPush = this.queue.slice(0, eventsToSend);
    try {
        const res = await fetch(this.apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(eventsToPush),
        });

        if (!res.ok) {
            throw new Error(`Sync failed: ${res.statusText}`);
        }

        this.queue = this.queue.slice(eventsToSend);
        this.resetBackoff();
    }
    catch (e) {
        console.error(e);
        this.scheduleRetry();
        return;
    }
    
  }

  private scheduleRetry(): void {
    if (this.retryTimer) return;

    const delay = Math.min(this.baseDelay * Math.pow(2, this.retryAttempt), this.maxDelay) + Math.random() * this.baseDelay;
    this.retryTimer = setTimeout(() => { this.retryTimer = null; this.flush(); }, delay);

    this.retryAttempt++;
    
  }

  private resetBackoff(): void {
    this.retryAttempt = 0;
    if (this.retryTimer) {
        clearTimeout(this.retryTimer);
        this.retryTimer = null;
    }
  }

  getQueueSize(): number {
    return this.queue.length;
  }

  clearQueue(): void {
    this.queue = [];
    this.resetBackoff();
  }
}
