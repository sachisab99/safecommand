-- BR-28: Allow system-generated notifications (task assignment, escalation, incident)
-- to record delivery audit rows without requiring a parent communications row.
-- system notifications have no GM-authored parent; they originate from the scheduling
-- and escalation engines, identified via source_type + source_id.

ALTER TABLE comm_deliveries
  ALTER COLUMN communication_id DROP NOT NULL;

ALTER TABLE comm_deliveries
  ADD COLUMN source_type TEXT CHECK (source_type IN ('COMM', 'TASK_INSTANCE', 'ESCALATION', 'INCIDENT')),
  ADD COLUMN source_id   UUID;

-- Exactly one of communication_id or source_id must be present.
ALTER TABLE comm_deliveries
  ADD CONSTRAINT comm_deliveries_source_check
  CHECK (communication_id IS NOT NULL OR source_id IS NOT NULL);

-- Index for querying audit trail by source (e.g. "all deliveries for incident X")
CREATE INDEX idx_comm_deliveries_source ON comm_deliveries (source_type, source_id)
  WHERE source_id IS NOT NULL;
