-- Precomputed /statistiky aggregates - see StatsCache model comment.
-- RLS enabled like every other public table (PostgREST is never the
-- access path; the app reads via Prisma with the postgres role).
CREATE TABLE IF NOT EXISTS "public"."stats_cache" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "computed_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "stats_cache_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "stats_cache_key_key" ON "public"."stats_cache"("key");
ALTER TABLE "public"."stats_cache" ENABLE ROW LEVEL SECURITY;
