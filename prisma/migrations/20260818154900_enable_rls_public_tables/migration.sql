-- Supabase auto-exposes every table in the `public` schema via PostgREST.
-- Without RLS, the anon/authenticated API keys could read (and, depending
-- on grants, write) these tables directly, bypassing the Next.js API
-- routes entirely. The app itself connects as the `postgres` role, which
-- has BYPASSRLS, so this has no effect on the app's own Prisma queries -
-- it only locks out direct PostgREST table access. No policies are added,
-- so PostgREST access is fully denied by default; data is only served
-- through our own API routes.

ALTER TABLE "public"."data_sources" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."regions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."districts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."municipalities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."nace_codes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."report_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."firms" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."financial_statements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."financial_facts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."firm_aggregates_nace_region_year" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."business_entities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."business_density_agg" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."_prisma_migrations" ENABLE ROW LEVEL SECURITY;
