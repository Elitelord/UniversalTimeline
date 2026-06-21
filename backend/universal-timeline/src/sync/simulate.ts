/**
 * Sync Simulation Script
 *
 * Simulates a client that generates fake activity events and syncs them
 * to the backend using the SyncQueue. 
 *
 * Usage:
 *   npx ts-node src/sync/simulate.ts
 *
 * Test offline behavior:
 *   1. Start this script with the backend running
 *   2. Stop the backend (Ctrl+C on the server) — events will queue up
 *   3. Restart the backend — queued events will drain automatically
 *
 * NOTE: Auth is bypassed by sending directly to the API. For a real client,
 *       you'd authenticate with Supabase first and include the JWT.
 *       To run this simulation, temporarily remove @UseGuards from EventsController,
 *       or add a test-only endpoint.
 */

import { randomUUID } from 'crypto';

// --- Configuration ---
const API_URL = 'http://localhost:3000/events/list';
const GENERATE_INTERVAL_MS = 5_000; // Generate a new event every 5 seconds
const FLUSH_INTERVAL_MS = 15_000;   // Flush every 15 seconds (faster than 60s for demo)
const MAX_QUEUE_SIZE = 10_000;
const MAX_BATCH_SIZE = 50;

// --- Fake data pools ---
const APPS = [
  { type: 'coding', name: 'VSCode' },
  { type: 'coding', name: 'IntelliJ' },
  { type: 'browsing', name: 'Chrome' },
  { type: 'browsing', name: 'Firefox' },
  { type: 'communication', name: 'Slack' },
  { type: 'communication', name: 'Discord' },
  { type: 'design', name: 'Figma' },
  { type: 'productivity', name: 'Notion' },
];

// --- In-memory queue (mirrors SyncQueue logic) ---
let queue: any[] = [];
let retryAttempt = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

function generateEvent() {
  const app = APPS[Math.floor(Math.random() * APPS.length)];
  const now = new Date();
  const durationMs = (30 + Math.floor(Math.random() * 90)) * 1000; // 30-120 seconds

  return {
    id: randomUUID(),
    user_id: 'sim-user-001',
    device_id: 'sim-laptop-01',
    activity_type: app.type,
    activity_name: app.name,
    start_time: now.toISOString(),
    end_time: new Date(now.getTime() + durationMs).toISOString(),
    metadata: { simulated: true },
  };
}

function enqueue(event: any) {
  if (queue.length >= MAX_QUEUE_SIZE) {
    queue.shift();
    console.log('⚠️  Queue at max capacity — dropped oldest event');
  }
  queue.push(event);
}

async function flush() {
  if (queue.length === 0) {
    console.log('📭 Queue empty, nothing to flush');
    return;
  }

  const batchSize = Math.min(queue.length, MAX_BATCH_SIZE);
  const batch = queue.slice(0, batchSize);

  console.log(`📤 Flushing ${batchSize} events (queue: ${queue.length})...`);

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(batch),
    });

    if (!res.ok) {
      throw new Error(`Server responded ${res.status}: ${res.statusText}`);
    }

    const result = await res.json();
    queue = queue.slice(batchSize);
    retryAttempt = 0;
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }

    console.log(`✅ Synced! Server stored ${result.length} events (after merge/dedup). Queue remaining: ${queue.length}`);

    // If there are more events, flush again immediately
    if (queue.length > 0) {
      console.log(`📦 More events in queue, flushing next batch...`);
      await flush();
    }
  } catch (err: any) {
    console.error(`❌ Sync failed: ${err.message}`);
    scheduleRetry();
  }
}

function scheduleRetry() {
  if (retryTimer) return;

  const delay = Math.min(1000 * Math.pow(2, retryAttempt), 60_000) + Math.random() * 1000;
  console.log(`⏳ Retry scheduled in ${(delay / 1000).toFixed(1)}s (attempt ${retryAttempt + 1})`);

  retryTimer = setTimeout(() => {
    retryTimer = null;
    flush();
  }, delay);

  retryAttempt++;
}

// --- Main loop ---
console.log('🚀 Sync Simulation Started');
console.log(`   API: ${API_URL}`);
console.log(`   Generating events every ${GENERATE_INTERVAL_MS / 1000}s`);
console.log(`   Flushing every ${FLUSH_INTERVAL_MS / 1000}s`);
console.log(`   Press Ctrl+C to stop\n`);

// Generate a fake event every 5 seconds
const generateTimer = setInterval(() => {
  const event = generateEvent();
  enqueue(event);
  console.log(`➕ Generated: ${event.activity_name} (${event.activity_type}) | Queue: ${queue.length}`);
}, GENERATE_INTERVAL_MS);

// Flush the queue every 15 seconds
const flushTimer = setInterval(() => {
  flush();
}, FLUSH_INTERVAL_MS);

// Initial flush after 5 seconds
setTimeout(() => flush(), GENERATE_INTERVAL_MS);

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down simulation...');
  clearInterval(generateTimer);
  clearInterval(flushTimer);
  if (retryTimer) clearTimeout(retryTimer);
  console.log(`   ${queue.length} events left in queue (would be lost without persistence)`);
  process.exit(0);
});
