/**
 * One-off: re-merge historical events that should have been merged at ingest but
 * weren't, because the old `take: 100` merge-candidate window missed them.
 *
 * This is DESTRUCTIVE — merging N adjacent same-activity events into one deletes the
 * N-1 that get absorbed and extends the survivor's end_time. Always dry-run first,
 * and back up activity_events before running with --apply against prod.
 *
 * It reuses MergeService so the merge rule is identical to live ingest. Signal-type
 * events (notification / screen / idle) are point-in-time and are never merged —
 * collapsing two distinct notifications 30s apart would be wrong.
 *
 * Usage:
 *   npx ts-node src/sync/remerge-history.ts           # dry run
 *   npx ts-node src/sync/remerge-history.ts --apply    # commit
 */
import { Client } from 'pg';
import 'dotenv/config';
import { MergeService } from '../processing/merge.service';
import { Event } from '../events/event.entity';

const SIGNAL_TYPES = new Set(['notification', 'screen', 'idle']);

function connectionConfig() {
  if (process.env.DATABASE_URL) {
    return { connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } };
  }
  return {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    database: process.env.POSTGRES_DB,
  };
}

async function main() {
  const apply = process.argv.includes('--apply');
  const client = new Client(connectionConfig());
  await client.connect();

  const host = process.env.DATABASE_URL
    ? (process.env.DATABASE_URL.match(/@([^:/]+)/) || [])[1]
    : process.env.DB_HOST || 'localhost';
  console.log(`Target: ${host}  (${apply ? 'APPLY' : 'DRY RUN'})\n`);

  const { rows } = await client.query(
    `SELECT id, user_id, device_id, activity_type, activity_name,
            start_time, end_time, metadata, created_at, idempotency_hash
     FROM activity_events`,
  );

  // Hydrate to the shape MergeService expects (Date objects).
  const toEvent = (r: any): Event =>
    ({
      ...r,
      start_time: new Date(r.start_time),
      end_time: r.end_time ? new Date(r.end_time) : null,
    }) as Event;

  const durationEvents = rows.filter((r) => !SIGNAL_TYPES.has(r.activity_type)).map(toEvent);
  const originalIds = new Set<string>(durationEvents.map((e) => e.id));

  const merge = new MergeService();
  const merged = merge.mergeEvents(durationEvents);

  // Survivors keep the id of the first event in their run; absorbed events vanish.
  const survivingIds = new Set<string>(merged.map((e) => e.id));
  const deletedIds: string[] = [...originalIds].filter((id) => !survivingIds.has(id));

  // Survivors whose end_time (or metadata) the merge extended.
  const modified = merged.filter((e) => (e as any)._isModified);

  console.log(`Duration events examined: ${durationEvents.length}`);
  console.log(`Signal events left untouched: ${rows.length - durationEvents.length}`);
  console.log(`Sessions after re-merge: ${merged.length}`);
  console.log(`Rows to DELETE (absorbed): ${deletedIds.length}`);
  console.log(`Survivors to UPDATE (extended end_time): ${modified.length}\n`);

  if (deletedIds.length > 0) {
    console.log('Sample merges:');
    for (const s of modified.slice(0, 5)) {
      console.log(
        `  ${s.activity_name} @ ${s.start_time.toISOString()} -> end ${s.end_time?.toISOString()}`,
      );
    }
    console.log('');
  }

  if (!apply) {
    console.log('DRY RUN — nothing written. Re-run with --apply to commit.');
    await client.end();
    return;
  }

  if (deletedIds.length === 0 && modified.length === 0) {
    console.log('Nothing to do.');
    await client.end();
    return;
  }

  // Single transaction: extend survivors, then delete the absorbed rows.
  await client.query('BEGIN');
  try {
    for (const s of modified) {
      await client.query(
        `UPDATE activity_events SET end_time = $1, metadata = $2 WHERE id = $3`,
        [s.end_time, s.metadata ?? null, s.id],
      );
    }
    // Delete in chunks to keep parameter lists sane.
    const CHUNK = 500;
    for (let i = 0; i < deletedIds.length; i += CHUNK) {
      const slice = deletedIds.slice(i, i + CHUNK);
      await client.query(
        `DELETE FROM activity_events WHERE id = ANY($1::uuid[])`,
        [slice],
      );
    }
    await client.query('COMMIT');
    console.log(`Committed: ${modified.length} updated, ${deletedIds.length} deleted.`);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Rolled back:', (e as Error).message);
    process.exitCode = 1;
  }

  await client.end();
}

main().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
