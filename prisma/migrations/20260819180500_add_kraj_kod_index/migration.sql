-- Supports the map's new kraj (region) filter added to /api/density and
-- /api/market-gap.
CREATE INDEX IF NOT EXISTS "business_entities_kraj_kod_datum_zaniku_idx" ON "public"."business_entities" ("kraj_kod", "datum_zaniku");
