-- Add start_time, timezone, and secondary_escalation_chain to schedule_templates
-- start_time: 24h HH:MM string (e.g. "08:00"), null = continuous / no fixed start
-- timezone: IANA tz (e.g. "Asia/Kolkata"), defaults to IST
-- secondary_escalation_chain: optional alternate escalation path

ALTER TABLE schedule_templates
  ADD COLUMN start_time TEXT,
  ADD COLUMN timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  ADD COLUMN secondary_escalation_chain staff_role_enum[] NOT NULL DEFAULT '{}';
