CREATE TABLE IF NOT EXISTS activity_events (
    id UUID PRIMARY KEY,
    user_id VARCHAR,
    device_id VARCHAR,
    activity_type VARCHAR,
    activity_name VARCHAR,
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW() 
);
SELECT create_hypertable('activity_events', 'start_time');
CREATE INDEX idx_events_user_time ON activity_events (user_id, start_time DESC);