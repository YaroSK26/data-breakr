-- CreateTable
CREATE TABLE "data_sources" (
    "id" SERIAL NOT NULL,
    "source_name" TEXT NOT NULL,
    "source_url" TEXT NOT NULL,
    "last_synced_at" TIMESTAMP(3),
    "records_count" INTEGER,
    "notes" TEXT,

    CONSTRAINT "data_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "regions" (
    "kod" TEXT NOT NULL,
    "nazov_sk" TEXT NOT NULL,
    "nazov_en" TEXT NOT NULL,

    CONSTRAINT "regions_pkey" PRIMARY KEY ("kod")
);

-- CreateTable
CREATE TABLE "districts" (
    "kod" TEXT NOT NULL,
    "nazov_sk" TEXT NOT NULL,
    "nazov_en" TEXT NOT NULL,
    "region_kod" TEXT NOT NULL,

    CONSTRAINT "districts_pkey" PRIMARY KEY ("kod")
);

-- CreateTable
CREATE TABLE "municipalities" (
    "kod" TEXT NOT NULL,
    "nazov" TEXT NOT NULL,
    "district_kod" TEXT NOT NULL,
    "population" INTEGER,
    "population_year" INTEGER,

    CONSTRAINT "municipalities_pkey" PRIMARY KEY ("kod")
);

-- CreateTable
CREATE TABLE "nace_codes" (
    "kod5" TEXT NOT NULL,
    "kod4" TEXT NOT NULL,
    "nazov_sk" TEXT NOT NULL,
    "nazov_en" TEXT NOT NULL,

    CONSTRAINT "nace_codes_pkey" PRIMARY KEY ("kod5")
);

-- CreateTable
CREATE TABLE "report_templates" (
    "id_sablony" INTEGER NOT NULL,
    "nazov" TEXT NOT NULL,
    "nariadenie_mf" TEXT,
    "platne_od" TIMESTAMP(3),
    "raw" JSONB NOT NULL,
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_templates_pkey" PRIMARY KEY ("id_sablony")
);

-- CreateTable
CREATE TABLE "firms" (
    "id" BIGINT NOT NULL,
    "ico" TEXT,
    "dic" TEXT,
    "nazov" TEXT,
    "ulica" TEXT,
    "mesto" TEXT,
    "psc" TEXT,
    "kraj_kod" TEXT,
    "okres_kod" TEXT,
    "nace_kod5" TEXT,
    "pravna_forma" TEXT,
    "velkost_organizacie" TEXT,
    "datum_zalozenia" TIMESTAMP(3),
    "datum_zrusenia" TIMESTAMP(3),
    "stav" TEXT,
    "zdroj_dat" TEXT,
    "last_synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "firms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_statements" (
    "id" BIGINT NOT NULL,
    "firm_id" BIGINT NOT NULL,
    "obdobie_od" TIMESTAMP(3),
    "obdobie_do" TIMESTAMP(3),
    "typ" TEXT,
    "datum_podania" TIMESTAMP(3),
    "datum_schvalenia" TIMESTAMP(3),
    "id_sablony" INTEGER,
    "raw_tabulky" JSONB,
    "pristupnost_dat" TEXT,
    "last_synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "financial_statements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_facts" (
    "statement_id" BIGINT NOT NULL,
    "trzby" DOUBLE PRECISION,
    "naklady" DOUBLE PRECISION,
    "vysledok_hospodarenia" DOUBLE PRECISION,
    "decoded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decode_confidence" TEXT NOT NULL,

    CONSTRAINT "financial_facts_pkey" PRIMARY KEY ("statement_id")
);

-- CreateTable
CREATE TABLE "firm_aggregates_nace_region_year" (
    "id" SERIAL NOT NULL,
    "nace_kod5" TEXT,
    "region_or_district_kod" TEXT NOT NULL,
    "granularity" TEXT NOT NULL,
    "rok" INTEGER NOT NULL,
    "firm_count" INTEGER NOT NULL,
    "median_trzby" DOUBLE PRECISION,
    "avg_trzby" DOUBLE PRECISION,
    "median_marza" DOUBLE PRECISION,
    "median_trzby_na_zamestnanca" DOUBLE PRECISION,
    "yoy_trend_pct" DOUBLE PRECISION,
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "firm_aggregates_nace_region_year_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_entities" (
    "id" BIGINT NOT NULL,
    "ico" TEXT,
    "nazov" TEXT,
    "ulica" TEXT,
    "mesto" TEXT,
    "psc" TEXT,
    "municipality_kod" TEXT,
    "okres_kod" TEXT,
    "kraj_kod" TEXT,
    "nace_kod4" TEXT,
    "pravna_forma_kod" TEXT,
    "datum_vzniku" TIMESTAMP(3),
    "datum_zaniku" TIMESTAMP(3),
    "zdroj_dat" TEXT,
    "last_synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "business_entities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_density_agg" (
    "id" SERIAL NOT NULL,
    "area_kod" TEXT NOT NULL,
    "granularity" TEXT NOT NULL,
    "nace_kod4" TEXT,
    "snapshot_date" TIMESTAMP(3) NOT NULL,
    "pocet_prevadzok" INTEGER NOT NULL,
    "pocet_na_1000_obyvatelov" DOUBLE PRECISION,
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "business_density_agg_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "data_sources_source_name_key" ON "data_sources"("source_name");

-- CreateIndex
CREATE UNIQUE INDEX "firm_aggregates_nace_region_year_nace_kod5_region_or_distri_key" ON "firm_aggregates_nace_region_year"("nace_kod5", "region_or_district_kod", "granularity", "rok");

-- CreateIndex
CREATE UNIQUE INDEX "business_density_agg_area_kod_granularity_nace_kod4_snapsho_key" ON "business_density_agg"("area_kod", "granularity", "nace_kod4", "snapshot_date");

-- AddForeignKey
ALTER TABLE "districts" ADD CONSTRAINT "districts_region_kod_fkey" FOREIGN KEY ("region_kod") REFERENCES "regions"("kod") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "municipalities" ADD CONSTRAINT "municipalities_district_kod_fkey" FOREIGN KEY ("district_kod") REFERENCES "districts"("kod") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_statements" ADD CONSTRAINT "financial_statements_firm_id_fkey" FOREIGN KEY ("firm_id") REFERENCES "firms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_statements" ADD CONSTRAINT "financial_statements_id_sablony_fkey" FOREIGN KEY ("id_sablony") REFERENCES "report_templates"("id_sablony") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_facts" ADD CONSTRAINT "financial_facts_statement_id_fkey" FOREIGN KEY ("statement_id") REFERENCES "financial_statements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
