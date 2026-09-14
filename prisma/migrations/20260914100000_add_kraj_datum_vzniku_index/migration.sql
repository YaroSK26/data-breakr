-- Index pre "čerstvo vzniknuté firmy v kraji" (scripts/outreach/sync-new.ts).
-- Bez datum_vzniku v indexe planner čítal celý kraj (~103 tis. riadkov) cez
-- bitmap heap scan a filtrom zahodil 101 788 z nich - za studena 8 s, čo je
-- strop statement_timeoutu na Supabase REST (chyba 57014).
CREATE INDEX IF NOT EXISTS "business_entities_kraj_kod_datum_vzniku_idx"
  ON "business_entities"("kraj_kod", "datum_vzniku");
