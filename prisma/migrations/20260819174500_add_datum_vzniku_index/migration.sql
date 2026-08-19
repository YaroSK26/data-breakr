-- Supports the /statistiky "registrations by year" trend chart's
-- EXTRACT(YEAR FROM datum_vzniku) GROUP BY, which otherwise scans the
-- full 2M+ row table unfiltered by datum_zaniku.
CREATE INDEX IF NOT EXISTS "business_entities_datum_vzniku_idx" ON "public"."business_entities" ("datum_vzniku");
