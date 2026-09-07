// scripts/outreach/supabase-client.ts
//
// The scheduled cloud routine runs the outreach scripts from a sandbox
// whose egress proxy only tunnels HTTPS - a raw Postgres TCP connection
// (what Prisma/lib/prisma.ts uses) times out there every time, confirmed
// live (ETIMEDOUT on both the pooler and direct connection ports). The
// Supabase REST API (PostgREST) is plain HTTPS, so these scripts use the
// Supabase JS client instead of Prisma. service_role bypasses RLS - fine
// here since this only ever runs server-side with a secret key, never
// exposed to a browser.
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceRoleKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set')
}

export const supabase = createClient(url, serviceRoleKey, {
  auth: { persistSession: false },
})
