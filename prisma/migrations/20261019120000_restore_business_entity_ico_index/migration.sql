-- Outreach looks up each firm by ICO. Without this index, each lookup scans
-- the full table and Supabase cancels the query when its statement times out.
CREATE INDEX IF NOT EXISTS "business_entities_ico_idx"
  ON "business_entities"("ico");
