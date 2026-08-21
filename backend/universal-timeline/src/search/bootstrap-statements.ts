/**
 * Schema objects that TypeORM cannot manage, applied idempotently at boot.
 *
 * WHY THIS FILE EXISTS AT ALL
 * ---------------------------
 * The app runs with `synchronize: true` (see app.module.ts) and has no migration
 * system. Three properties of typeorm@0.3.28 constrain everything here:
 *
 *   1. `dropRemovedColumns` deletes any DB column absent from entity metadata.
 *      => We must NOT add a generated tsvector column to activity_events; it would
 *         be dropped on the next boot.
 *   2. `dropOldIndices` deletes any *visible* index absent from entity metadata.
 *      => Hand-written plain-column indexes on activity_events get dropped too.
 *         B-trees must come from the @Index decorator on the entity instead.
 *   3. TypeORM's index introspection joins
 *         pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
 *      A *pure expression* index has indkey = 0, which matches no attnum, so the
 *      index never loads into table.indices and dropOldIndices cannot see it.
 *      => Expression indexes are the one kind that survives. That is why every
 *         index below is wrapped in an expression, and why the lower() call on the
 *         trigram index is load-bearing rather than stylistic: `activity_name
 *         gin_trgm_ops` on a bare column has a real indkey, is visible, and would
 *         be destroyed on the next restart.
 *
 * TypeORM also cannot emit `USING GIN` at all (it only knows GiST and b-tree), so
 * these are hand-written regardless.
 *
 * These statements are kept as TypeScript, not .sql files, because `nest build`
 * only emits src/ -> dist/. A runtime read of backend/sql/*.sql would work locally
 * and 404 inside the Render container.
 */

/**
 * Every piece of text an event carries, concatenated into one searchable blob.
 *
 * activity_name alone is not enough: for non-browser apps it is just the app's
 * display name ("Visual Studio Code"), and all the specific detail — the file you
 * had open, the page you were reading — lives in metadata.window_title.
 */
function searchableExpression(alias?: string): string {
  const c = (col: string) => (alias ? `${alias}.${col}` : col);
  return (
    `coalesce(${c('activity_name')},'') || ' ' || ` +
    `coalesce(${c('metadata')}->>'window_title','') || ' ' || ` +
    `coalesce(${c('metadata')}->>'process_name','') || ' ' || ` +
    `coalesce(${c('metadata')}->>'package_name','') || ' ' || ` +
    `coalesce(${c('activity_type')},'')`
  );
}

/**
 * The full-text expression, shared by the index DDL and every query that uses it.
 *
 * The query's expression must match the index's expression or the planner silently
 * falls back to a sequential scan, so both sides call this function. The alias
 * differs between the two call sites (none in DDL, `e` in the search query) but
 * Postgres matches on the resolved expression tree, not on the text, so that is fine.
 *
 * The two-argument form of to_tsvector is IMMUTABLE and therefore indexable; the
 * one-argument form is only STABLE and cannot be indexed.
 */
export function ftsExpression(alias?: string): string {
  return `to_tsvector('english', ${searchableExpression(alias)})`;
}

/**
 * The trigram expression — the substring-matching half of the query.
 *
 * This deliberately covers the SAME text as ftsExpression, not just activity_name.
 * Postgres's parser treats "merge.service.ts" as a single indivisible `file` token,
 * so full-text search matches a filename only on the exact complete filename —
 * searching "merge.service" or "fusion" against
 * "reciprocal-rank-fusion.spec.ts" returns nothing. Partial filenames are precisely
 * how people search their own history, so the LIKE arm has to be able to reach
 * inside window titles. Verified: with the trigram index scoped to activity_name,
 * a substring of a window title matched nothing at all.
 */
export function trigramExpression(alias?: string): string {
  return `lower(${searchableExpression(alias)})`;
}

/** Short, high-signal text used for similarity ranking (not filtering). */
export function rankNameExpression(alias?: string): string {
  return `lower(${alias ? `${alias}.activity_name` : 'activity_name'})`;
}

export interface BootstrapStatement {
  /** Short label used in logs when a statement fails. */
  name: string;
  sql: string;
  /** If true, a failure is expected on managed hosts without superuser and logged quietly. */
  optional?: boolean;
}

export const SEARCH_BOOTSTRAP_STATEMENTS: BootstrapStatement[] = [
  {
    name: 'pg_trgm extension',
    sql: 'CREATE EXTENSION IF NOT EXISTS pg_trgm',
    optional: true,
  },
  {
    // No CONCURRENTLY: Supabase's transaction pooler (port 6543) cannot run it
    // outside a transaction block. Plain CREATE INDEX works over pgbouncer and
    // blocks writes for a moment, once.
    name: 'activity_events full-text index',
    sql: `CREATE INDEX IF NOT EXISTS idx_events_fts ON activity_events USING GIN (${ftsExpression()})`,
  },
  {
    // The lower() wrapper is what keeps this index invisible to TypeORM's
    // dropOldIndices. Do not "simplify" it to a bare column with gin_trgm_ops.
    name: 'activity_events trigram index',
    sql: `CREATE INDEX IF NOT EXISTS idx_events_search_trgm ON activity_events USING GIN ((${trigramExpression()}) gin_trgm_ops)`,
    optional: true,
  },
  {
    // Superseded by idx_events_search_trgm, which covers window titles too.
    // Dropping it reclaims the space; harmless where it was never created.
    name: 'drop superseded activity_name trigram index',
    sql: 'DROP INDEX IF EXISTS idx_events_name_trgm',
    optional: true,
  },
];
