-- Supports the new "právna forma" (legal form) filter added to
-- /api/density and /api/firms-in-district.
CREATE INDEX IF NOT EXISTS "business_entities_pravna_forma_kod_datum_zaniku_idx" ON "public"."business_entities" ("pravna_forma_kod", "datum_zaniku");
