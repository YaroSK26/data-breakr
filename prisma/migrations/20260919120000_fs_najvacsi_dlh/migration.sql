-- Dlh najväčšieho jednotlivého dlžníka v okrese (len suma, meno sa naďalej
-- neukladá). Stránka /statistiky podľa neho upozorní, keď súčet dlhu okresu
-- ťahá hore jeden subjekt. Napĺňa scripts/ingest/fs/run.ts.
ALTER TABLE "fs_danovy_dlznik_okres" ADD COLUMN "najvacsi_dlh" DOUBLE PRECISION NOT NULL DEFAULT 0;
