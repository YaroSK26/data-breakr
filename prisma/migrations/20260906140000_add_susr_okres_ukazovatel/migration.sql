-- Okresné ukazovatele zo ŠÚ SR DATAcube (mzdy, zamestnanci, podniky).
-- Napĺňa scripts/ingest/susr/run.ts.

CREATE TABLE "susr_okres_ukazovatel" (
    "id" SERIAL NOT NULL,
    "okres_kod" TEXT NOT NULL,
    "rok" INTEGER NOT NULL,
    "ukazovatel" TEXT NOT NULL,
    "sekcia" TEXT NOT NULL,
    "sekcia_nazov" TEXT,
    "hodnota" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "susr_okres_ukazovatel_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "susr_okres_ukazovatel_okres_kod_rok_ukazovatel_sekcia_key"
    ON "susr_okres_ukazovatel"("okres_kod", "rok", "ukazovatel", "sekcia");
CREATE INDEX "susr_okres_ukazovatel_ukazovatel_rok_idx"
    ON "susr_okres_ukazovatel"("ukazovatel", "rok");

ALTER TABLE "public"."susr_okres_ukazovatel" ENABLE ROW LEVEL SECURITY;
