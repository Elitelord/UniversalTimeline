/**
 * One-off backfill: re-runs the server-side classifier over existing rows whose type
 * is a client fallback ('other' / 'application'), writing the original value into
 * metadata.original_activity_type so the change is auditable and reversible.
 *
 * Usage:
 *   DRY RUN (default): prints the before/after distribution, writes nothing
 *     npx ts-node src/sync/backfill-classify.ts
 *   APPLY:
 *     npx ts-node src/sync/backfill-classify.ts --apply
 *
 * Idempotent: rows already carrying original_activity_type are skipped, so re-running
 * is a no-op. Connects via DATABASE_URL, or the discrete DB_* / POSTGRES_* vars.
 */
import 'dotenv/config';
import { Client } from 'pg';
import { ClassifierService, ClassifiableEvent } from '../processing/classifier.service';

const APPLY = process.argv.includes('--apply');

function connectionConfig() {
  if (process.env.DATABASE_URL) {
    return { connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } };
  }
  const host = process.env.DB_HOST || 'localhost';
  return {
    host,
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    database: process.env.POSTGRES_DB || 'universal_timeline',
    ssl: host === 'localhost' ? undefined : { rejectUnauthorized: false },
  };
}

async function main() {
  const classifier = new ClassifierService();
  const client = new Client(connectionConfig());
  await client.connect();

  // Only rows the classifier is allowed to touch, and not already backfilled.
  const { rows } = await client.query(`
    SELECT id, activity_type, activity_name, metadata
    FROM activity_events
    WHERE activity_type IN ('other', 'application', '')
      AND NOT (metadata ? 'original_activity_type')
  `);

  const changes: { id: string; from: string; to: string }[] = [];
  for (const row of rows) {
    const next = classifier.classify(row as ClassifiableEvent);
    if (next !== row.activity_type) {
      changes.push({ id: row.id, from: row.activity_type, to: next });
    }
  }

  const tally = new Map<string, number>();
  for (const c of changes) {
    const key = `${c.from} -> ${c.to}`;
    tally.set(key, (tally.get(key) ?? 0) + 1);
  }

  console.log(`\nCandidates examined: ${rows.length}`);
  console.log(`Rows that would change: ${changes.length}\n`);
  console.log('Reclassification breakdown:');
  for (const [k, v] of [...tally.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(28)} ${v}`);
  }

  if (!APPLY) {
    console.log('\nDRY RUN — nothing written. Re-run with --apply to commit.');
    await client.end();
    return;
  }

  console.log('\nApplying...');
  await client.query('BEGIN');
  try {
    for (const c of changes) {
      // jsonb_set writes original_activity_type; activity_type is set alongside.
      await client.query(
        `UPDATE activity_events
         SET activity_type = $1,
             metadata = jsonb_set(coalesce(metadata, '{}'::jsonb),
                                  '{original_activity_type}', to_jsonb($2::text), true)
         WHERE id = $3`,
        [c.to, c.from, c.id],
      );
    }
    await client.query('COMMIT');
    console.log(`Committed ${changes.length} updates.`);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }

  await client.end();
}

main().catch((e) => {
  console.error('Backfill failed:', e.message);
  process.exit(1);
});
