-- Schema for daily check-in system (Supabase PostgreSQL)

-- Table: daily_plans
-- Stores the user's "tomorrow plan" for each date
CREATE TABLE IF NOT EXISTS daily_plans (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    plan_date   DATE NOT NULL UNIQUE,
    content     TEXT NOT NULL DEFAULT '',
    source      TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'carried_forward')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_plans_date ON daily_plans(plan_date DESC);

-- Table: checkin_logs
-- Records every check-in attempt (success or failure)
CREATE TABLE IF NOT EXISTS checkin_logs (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    checkin_date    DATE NOT NULL,
    pushups         INTEGER CHECK (pushups >= 0 AND pushups <= 30),
    sleep_time      TEXT, -- 'HH:MM'
    task_completion TEXT,
    tomorrow_plan   TEXT,
    status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed', 'retrying')),
    attempt_count   INTEGER NOT NULL DEFAULT 1,
    error_message   TEXT,
    error_step      TEXT,
    duration_ms     INTEGER,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Note: Duplicate check-ins allowed. No unique index on (checkin_date, success).
CREATE INDEX IF NOT EXISTS idx_checkin_date ON checkin_logs(checkin_date DESC);

-- Table: reminder_logs
-- Tracks whether the daily 21:00 reminder was sent
CREATE TABLE IF NOT EXISTS reminder_logs (
    id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    reminder_date DATE NOT NULL UNIQUE,
    sent_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    plan_was_set  BOOLEAN NOT NULL DEFAULT FALSE,
    responded     BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_reminder_date ON reminder_logs(reminder_date DESC);

-- Row Level Security
ALTER TABLE daily_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE checkin_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminder_logs ENABLE ROW LEVEL SECURITY;

-- Policies for anon key (used by clawbot)
CREATE POLICY "anon_select_plans" ON daily_plans FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert_plans" ON daily_plans FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_update_plans" ON daily_plans FOR UPDATE TO anon USING (true);

CREATE POLICY "anon_select_checkin" ON checkin_logs FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert_checkin" ON checkin_logs FOR INSERT TO anon WITH CHECK (true);

-- Table: bot_users
-- Tracks known WeChat users for proactive notifications
CREATE TABLE IF NOT EXISTS bot_users (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id     TEXT NOT NULL UNIQUE,
    last_seen   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bot_users_id ON bot_users(user_id);

-- Table: pending_notifications
-- Stores notifications to deliver on next user interaction
CREATE TABLE IF NOT EXISTS pending_notifications (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id     TEXT NOT NULL,
    content     TEXT NOT NULL,
    delivered   BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pending_user ON pending_notifications(user_id, delivered);

-- RLS
ALTER TABLE bot_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE pending_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_all_bot_users" ON bot_users FOR ALL TO anon USING (true);
CREATE POLICY "anon_all_pending" ON pending_notifications FOR ALL TO anon USING (true);

CREATE POLICY "anon_all_reminders" ON reminder_logs FOR ALL TO anon USING (true);
