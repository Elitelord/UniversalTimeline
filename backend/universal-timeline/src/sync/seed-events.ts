/**
 * Seeds test events for an authenticated Supabase user.
 * Usage: npx ts-node src/sync/seed-events.ts <email> <password>
 */

import { createClient } from '@supabase/supabase-js';
import * as crypto from 'crypto';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load env variables from backend .env
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const API_URL = 'http://localhost:3001/events/list';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ Error: SUPABASE_URL or SUPABASE_ANON_KEY is not defined in backend .env');
  process.exit(1);
}

const email = process.argv[2];
const password = process.argv[3];

if (!email || !password) {
  console.error('Usage: npx ts-node src/sync/seed-events.ts <email> <password>');
  process.exit(1);
}

async function seed() {
  // Authenticate with Supabase
  const supabase = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!);
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    console.error('❌ Login failed:', error.message);
    process.exit(1);
  }

  const token = data.session.access_token;
  const userId = data.user.id;
  console.log(`✅ Logged in as ${email} (user_id: ${userId})`);

  // Generate events for today
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const events = [
    { type: 'coding',        name: 'VSCode',   startHour: 9,    durationMin: 90  },
    { type: 'communication', name: 'Slack',    startHour: 10.5, durationMin: 20  },
    { type: 'coding',        name: 'VSCode',   startHour: 11,   durationMin: 60  },
    { type: 'browsing',      name: 'Chrome',   startHour: 12,   durationMin: 30  },
    { type: 'design',        name: 'Figma',    startHour: 13,   durationMin: 45  },
    { type: 'coding',        name: 'IntelliJ', startHour: 14,   durationMin: 120 },
    { type: 'communication', name: 'Discord',  startHour: 16,   durationMin: 15  },
    { type: 'productivity',  name: 'Notion',   startHour: 16.5, durationMin: 30  },
    { type: 'coding',        name: 'VSCode',   startHour: 17,   durationMin: 60  },
    { type: 'browsing',      name: 'Firefox',  startHour: 18,   durationMin: 25  },
  ];

  const payload = events.map((e) => {
    const start = new Date(today);
    start.setMinutes(start.getMinutes() + e.startHour * 60);
    const end = new Date(start);
    end.setMinutes(end.getMinutes() + e.durationMin);

    return {
      id: crypto.randomUUID(),
      user_id: userId,
      device_id: 'seed-laptop-01',
      activity_type: e.type,
      activity_name: e.name,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      metadata: { seeded: true },
    };
  });

  console.log(`📤 Posting ${payload.length} events...`);

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`❌ API error ${res.status}: ${text}`);
    process.exit(1);
  }

  const result = await res.json();
  console.log(`✅ Seeded ${result.length} events (after merge/dedup). Refresh your timeline!`);
}

seed().catch(console.error);
