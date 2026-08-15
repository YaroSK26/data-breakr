-- AlterTable
ALTER TABLE "municipalities" ADD COLUMN     "area_km2" DOUBLE PRECISION,
ADD COLUMN     "geometry" JSONB;

-- AlterTable
ALTER TABLE "regions" ADD COLUMN     "geometry" JSONB;
