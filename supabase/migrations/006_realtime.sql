-- Migration 006: Enable Supabase Realtime on high-frequency tables
-- NFR-10: Zone board refresh ≤30s; instant for command roles
-- BR-18: Zone Status Board — real-time colour-coded updates
-- BR-11: One-tap Incident Declaration — dashboards reflect instantly

-- Supabase Realtime uses the supabase_realtime publication.
-- Tables must be added to it and RLS must be ON (already enforced by migration 003).

ALTER PUBLICATION supabase_realtime ADD TABLE zones;
ALTER PUBLICATION supabase_realtime ADD TABLE incidents;

-- Also add zone_status_log so dashboards get history stream
ALTER PUBLICATION supabase_realtime ADD TABLE zone_status_log;

-- And incident_timeline for live evacuation board updates (BR-11 safe confirmations)
ALTER PUBLICATION supabase_realtime ADD TABLE incident_timeline;
