-- Skutočný stav subjektu (viď lib/stavSubjektu.ts). Doteraz appka brala za
-- aktívne všetko bez dátumu zániku - teda aj firmy v likvidácii, v konkurze,
-- živnostníkov s pozastavenou živnosťou a spolky či SVB.
--
-- Konštantný DEFAULT je v Postgrese len zápis do katalógu, tabuľka sa
-- neprepisuje. To je tu dôležité: DB je nad limitom Supabase Free plánu a
-- UPDATE všetkých 1 M riadkov by ju na čas zdvojnásobil. Backfill
-- (scripts/ingest/rpo/backfill-stav.ts) potom mení len ~215 tis. riadkov,
-- ktoré aktívne nie sú.
ALTER TABLE "business_entities" ADD COLUMN "stav" TEXT NOT NULL DEFAULT 'aktivny';

-- Zaniknuté riadky sa z tabuľky mažú (prune-defunct-entities.ts), takže
-- datum_zaniku je v indexoch prázdny stĺpec. Filter je teraz stav.
DROP INDEX IF EXISTS "business_entities_okres_kod_datum_zaniku_idx";
DROP INDEX IF EXISTS "business_entities_nace_kod4_datum_zaniku_idx";
DROP INDEX IF EXISTS "business_entities_kraj_kod_datum_zaniku_idx";
DROP INDEX IF EXISTS "business_entities_pravna_forma_kod_datum_zaniku_idx";

CREATE INDEX IF NOT EXISTS "business_entities_okres_kod_stav_idx" ON "business_entities"("okres_kod", "stav");
CREATE INDEX IF NOT EXISTS "business_entities_nace_kod4_stav_idx" ON "business_entities"("nace_kod4", "stav");
CREATE INDEX IF NOT EXISTS "business_entities_kraj_kod_stav_idx" ON "business_entities"("kraj_kod", "stav");
CREATE INDEX IF NOT EXISTS "business_entities_pravna_forma_kod_stav_idx" ON "business_entities"("pravna_forma_kod", "stav");
