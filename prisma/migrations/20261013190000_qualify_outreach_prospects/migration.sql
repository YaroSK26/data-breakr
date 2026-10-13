-- Rozlišuje skutočný prospect (kontakt + business profil + bez webu)
-- od firmy, ktorá už web má alebo ju nevieme spoľahlivo identifikovať.
ALTER TABLE "outreach_firm"
  ADD COLUMN "kontakt_email" TEXT,
  ADD COLUMN "kontakt_telefon" TEXT,
  ADD COLUMN "profil_url" TEXT,
  ADD COLUMN "web_url" TEXT,
  ADD COLUMN "google_place_id" TEXT,
  ADD COLUMN "overenie_poznamka" TEXT;

-- Staré ma_info sa nemenia hromadne: checker ich postupne znova overí.
-- Report stav ma_info nečíta, takže neurčité historické dáta sa neodošlú.
