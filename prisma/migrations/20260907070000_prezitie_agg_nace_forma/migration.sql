-- Rekonštrukcia chýbajúcej migrácie.
--
-- Táto migrácia je v _prisma_migrations na produkcii zapísaná ako aplikovaná
-- (20260907070000_prezitie_agg_nace_forma), ale jej priečinok sa do repa
-- nikdy nedostal. Živá tabuľka teda vyzerala inak než schema.prisma aj než
-- migračná história - a `ON CONFLICT (rok_vzniku, rok_zaniku)` v
-- scripts/ingest/rpo/upsert-entity.ts na nej padal chybou 42P10, lebo taký
-- unikátny kľúč tam po tejto zmene už nie je.
--
-- Obsah je odvodený zo skutočného stavu produkčnej tabuľky, aby čerstvá DB
-- vybudovaná z migrácií skončila v rovnakom tvare ako produkcia. Na
-- produkcii sa už nič nevykoná - všetko je IF NOT EXISTS / IF EXISTS.

-- Rozpad prežitia aj podľa odvetvia a právnej formy (stĺpce zatiaľ ostávajú
-- prázdne - napĺňať ich bude až neskorší prepočet).
ALTER TABLE "prezitie_agg" ADD COLUMN IF NOT EXISTS "nace_kod4" TEXT;
ALTER TABLE "prezitie_agg" ADD COLUMN IF NOT EXISTS "pravna_forma_kod" TEXT;

-- Pôvodný PRIMARY KEY (rok_vzniku, rok_zaniku) prestal platiť: s rozpadom
-- podľa NACE a formy môže tá istá dvojica rokov mať viac riadkov.
ALTER TABLE "prezitie_agg" DROP CONSTRAINT IF EXISTS "prezitie_agg_pkey";
ALTER TABLE "prezitie_agg" ADD COLUMN IF NOT EXISTS "id" SERIAL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'prezitie_agg'::regclass AND contype = 'p'
  ) THEN
    ALTER TABLE "prezitie_agg" ADD CONSTRAINT "prezitie_agg_pkey" PRIMARY KEY ("id");
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "prezitie_agg_rok_vzniku_rok_zaniku_nace_kod4_pravna_forma__key"
  ON "prezitie_agg"("rok_vzniku", "rok_zaniku", "nace_kod4", "pravna_forma_kod");
CREATE INDEX IF NOT EXISTS "prezitie_agg_nace_kod4_idx" ON "prezitie_agg"("nace_kod4");
CREATE INDEX IF NOT EXISTS "prezitie_agg_pravna_forma_kod_idx" ON "prezitie_agg"("pravna_forma_kod");
