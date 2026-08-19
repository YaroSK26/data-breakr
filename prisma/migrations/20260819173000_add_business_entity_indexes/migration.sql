-- Density aggregation (GROUP BY okres_kod, optionally filtered by
-- nace_kod4) and the district drill-down list both filter on
-- datum_zaniku IS NULL alongside these columns. Confirmed live:
-- /api/density took 17s+ without these indexes on the full national
-- dataset (2M+ rows).

CREATE INDEX IF NOT EXISTS "business_entities_okres_kod_datum_zaniku_idx" ON "public"."business_entities" ("okres_kod", "datum_zaniku");
CREATE INDEX IF NOT EXISTS "business_entities_nace_kod4_datum_zaniku_idx" ON "public"."business_entities" ("nace_kod4", "datum_zaniku");
CREATE INDEX IF NOT EXISTS "business_entities_ico_idx" ON "public"."business_entities" ("ico");
