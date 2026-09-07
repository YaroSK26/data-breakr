-- Fronta pre týždenný košický outreach brief (scripts/outreach/).
CREATE TABLE "outreach_firm" (
  "ico" TEXT NOT NULL,
  "nazov" TEXT,
  "okres_kod" TEXT,
  "kraj_kod" TEXT,
  "datum_vzniku" TIMESTAMP(3),
  "stav" TEXT NOT NULL DEFAULT 'nove',
  "najdena_info" TEXT,
  "pocet_kontrol" INTEGER NOT NULL DEFAULT 0,
  "prvy_check" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "posledne_check" TIMESTAMP(3),
  "poslane_v_briefe" TIMESTAMP(3),

  CONSTRAINT "outreach_firm_pkey" PRIMARY KEY ("ico")
);

CREATE INDEX "outreach_firm_kraj_kod_stav_idx" ON "outreach_firm"("kraj_kod", "stav");
