-- Agregáty zaniknutých a vzniknutých subjektov. Napĺňa
-- scripts/ingest/rpo/archive-defunct.ts pred zmazaním zaniknutých riadkov
-- z business_entities.

CREATE TABLE "zaniknute_agg" (
    "id" SERIAL NOT NULL,
    "okres_kod" TEXT,
    "nace_kod4" TEXT,
    "pravna_forma_kod" TEXT,
    "rok_zaniku" INTEGER NOT NULL,
    "pocet" INTEGER NOT NULL,

    CONSTRAINT "zaniknute_agg_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "zaniknute_agg_rok_zaniku_idx" ON "zaniknute_agg"("rok_zaniku");
CREATE INDEX "zaniknute_agg_okres_kod_idx" ON "zaniknute_agg"("okres_kod");

CREATE TABLE "prezitie_agg" (
    "rok_vzniku" INTEGER NOT NULL,
    "rok_zaniku" INTEGER NOT NULL,
    "pocet" INTEGER NOT NULL,

    CONSTRAINT "prezitie_agg_pkey" PRIMARY KEY ("rok_vzniku","rok_zaniku")
);

CREATE TABLE "vznik_agg" (
    "id" SERIAL NOT NULL,
    "okres_kod" TEXT,
    "rok_vzniku" INTEGER NOT NULL,
    "pocet" INTEGER NOT NULL,

    CONSTRAINT "vznik_agg_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "vznik_agg_rok_vzniku_idx" ON "vznik_agg"("rok_vzniku");

-- Rovnaký dôvod ako 20260818154900_enable_rls_public_tables: Supabase
-- vystavuje každú tabuľku v public cez PostgREST.
ALTER TABLE "public"."zaniknute_agg" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."prezitie_agg" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."vznik_agg" ENABLE ROW LEVEL SECURITY;
