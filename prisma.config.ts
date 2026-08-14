// prisma.config.ts
//
// Prisma 7 no longer reads `url` / `directUrl` from the `datasource` block in
// schema.prisma (see prisma/schema.prisma) - connection info for the CLI
// (migrate, db push, studio) now lives here instead. The Next.js app itself
// uses `.env.local` (not `.env`), so we load it explicitly rather than
// relying on dotenv's default `.env` lookup.
import { config as loadEnv } from "dotenv";
import { defineConfig } from "prisma/config";

loadEnv({ path: ".env.local" });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Migrate needs a direct (non-pooled) connection; the pooled
    // DATABASE_URL is used by the application's PrismaClient at runtime.
    url: process.env["DIRECT_URL"],
  },
});
