-- REFERENCE ONLY — nothing runs this file automatically.
--
-- The table is created at runtime by TypeORM (`synchronize: true` in
-- src/app.module.ts, driven by src/events/event.entity.ts). This file exists to
-- document the intended shape of the table and to bootstrap a database by hand,
-- e.g. the TimescaleDB container in docker-compose.yml. If you change the entity,
-- change this file too — nothing enforces that they agree.
--
-- Indexes are deliberately NOT declared here. See the note at the bottom.

CREATE TABLE IF NOT EXISTS activity_events (
    id UUID PRIMARY KEY,
    user_id VARCHAR,
    device_id VARCHAR,
    activity_type VARCHAR,
    activity_name VARCHAR,
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    -- SHA-256 of device_id + activity_name + start_time; makes event ingest idempotent
    -- so a client retrying a batch cannot create duplicates (see EventsService.create).
    idempotency_hash VARCHAR UNIQUE
);

-- LOCAL DEV ONLY: requires the TimescaleDB extension, which the docker-compose
-- image provides. Production runs on Supabase, where this is not available and the
-- table stays a plain Postgres table. Safe to skip.
-- SELECT create_hypertable('activity_events', 'start_time');

-- INDEXES ARE MANAGED ELSEWHERE. Do not add them here.
--
--   * The (user_id, start_time) b-tree is declared with @Index on the entity.
--     `synchronize: true` DROPS any plain-column index it does not know about, so
--     an index created by this file would silently disappear on the next boot.
--
--   * The full-text and trigram GIN indexes live in
--     src/search/bootstrap-statements.ts and are applied at startup. They survive
--     synchronize only because they are pure *expression* indexes, which TypeORM's
--     introspection cannot see. That file explains the mechanism in detail.
