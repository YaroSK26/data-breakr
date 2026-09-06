-- Finančná správa SR: platitelia DPH (join key = ICO) a agregát daňových
-- dlžníkov po okrese (mená sa neukladajú, len súhrn - ochrana súkromia).
-- Napĺňa scripts/ingest/fs/run.ts.

CREATE TABLE "fs_platca_dph" (
    "ico" TEXT NOT NULL,
    "ic_dph" TEXT,
    "druh_registracie" TEXT,
    "datum_registracie" TIMESTAMP(3),
    "plat_dph_od" TIMESTAMP(3),

    CONSTRAINT "fs_platca_dph_pkey" PRIMARY KEY ("ico")
);

CREATE TABLE "fs_danovy_dlznik_okres" (
    "okres_kod" TEXT NOT NULL,
    "pocet_dlznikov" INTEGER NOT NULL,
    "suma_dlhu" DOUBLE PRECISION NOT NULL,
    "aktualizovane" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fs_danovy_dlznik_okres_pkey" PRIMARY KEY ("okres_kod")
);

ALTER TABLE "public"."fs_platca_dph" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."fs_danovy_dlznik_okres" ENABLE ROW LEVEL SECURITY;
