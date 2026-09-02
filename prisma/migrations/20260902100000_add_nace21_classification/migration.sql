-- NACE Rev. 2.1 classification (the revision RPO publishes since 2025) and
-- the ŠÚ SR correspondence table from SK NACE Rev. 2, which is what RÚZ
-- still codes firms in.

CREATE TABLE "nace21_codes" (
    "kod" TEXT NOT NULL,
    "uroven" INTEGER NOT NULL,
    "parent_kod" TEXT,
    "nazov_sk" TEXT NOT NULL,
    "nazov_en" TEXT NOT NULL,
    "skratka_sk" TEXT,
    "platnost_od" TIMESTAMP(3),

    CONSTRAINT "nace21_codes_pkey" PRIMARY KEY ("kod")
);

CREATE INDEX "nace21_codes_uroven_idx" ON "nace21_codes"("uroven");
CREATE INDEX "nace21_codes_parent_kod_idx" ON "nace21_codes"("parent_kod");

CREATE TABLE "nace_rev2_to_rev21" (
    "rev2_kod5" TEXT NOT NULL,
    "rev21_kod4" TEXT NOT NULL,

    CONSTRAINT "nace_rev2_to_rev21_pkey" PRIMARY KEY ("rev2_kod5","rev21_kod4")
);

CREATE INDEX "nace_rev2_to_rev21_rev21_kod4_idx" ON "nace_rev2_to_rev21"("rev21_kod4");

-- Same reasoning as 20260818154900_enable_rls_public_tables: Supabase
-- auto-exposes every public table via PostgREST, so new tables are locked
-- down too. No policies, so direct API access is denied; the app connects
-- as postgres (BYPASSRLS) and is unaffected.
ALTER TABLE "public"."nace21_codes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."nace_rev2_to_rev21" ENABLE ROW LEVEL SECURITY;
