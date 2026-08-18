#!/bin/bash
# Polls business_entities every 3 minutes. Tracks total count, rows touched
# (updates+inserts) in the last window, AND verifies the actual ingest
# process is alive - a dead process with no error is exactly what happened
# on 2026-08-17 (silent death, no log survived to explain why).
cd "D:\baroslav-jarabas\vscode\data-breakr" || exit 1

CHECK_FILE=".watch-rpo-count-check.ts"
cat > "$CHECK_FILE" <<'INNEREOF'
import { prisma } from './lib/prisma'
async function main() {
  const total = await prisma.businessEntity.count()
  const touched = await prisma.businessEntity.count({
    where: { lastSyncedAt: { gte: new Date(Date.now() - 3.5 * 60 * 1000) } },
  })
  console.log(`${total} ${touched}`)
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
INNEREOF

prev_total=""
stall_count=0
i=0
# Checks every 3 min internally (fast death detection), but only prints
# (= notifies) on a problem or a ~30min heartbeat - constant "still fine"
# pings on a multi-day run are noise, per explicit user feedback.
HEARTBEAT_EVERY=10
while true; do
  out=$(npx tsx "$CHECK_FILE" 2>/dev/null | tail -1)
  now=$(date -u +%H:%M:%S)
  i=$((i + 1))

  # Real process-alive check, not just a DB-activity proxy.
  proc_alive=$(powershell -NoProfile -Command "if (Get-CimInstance Win32_Process -Filter \"name='node.exe' or name='node'\" | Where-Object { \$_.CommandLine -like '*rpo*run.ts*' -or (\$_.CommandLine -like '*tsx*' -and \$_.CommandLine -like '*run.ts*') }) { 'ALIVE' } else { 'DEAD' }" 2>/dev/null | tr -d '\r')

  total=$(echo "$out" | awk '{print $1}')
  touched=$(echo "$out" | awk '{print $2}')

  if [ "$proc_alive" == "DEAD" ]; then
    echo "[$now] PROCESS DEAD - no node process running run.ts. total=$total"
    stall_count=$((stall_count + 10))
  elif [ -z "$total" ] || ! [[ "$total" =~ ^[0-9]+$ ]]; then
    echo "[$now] CHECK FAILED (query error or process issue)"
    stall_count=$((stall_count + 1))
  elif [ "$touched" == "0" ]; then
    stall_count=$((stall_count + 1))
    echo "[$now] total=$total, 0 rows touched recently (check #$stall_count) - process alive but idle"
  else
    stall_count=0
    if [ "$((i % HEARTBEAT_EVERY))" -eq 0 ]; then
      delta=$((total - ${prev_total:-$total}))
      echo "[$now] heartbeat: total=$total (+$delta since last heartbeat), active"
      prev_total=$total
    fi
  fi

  if [ "$stall_count" -ge 2 ]; then
    echo "[$now] WARNING: process dead or zero DB activity for 2+ checks - needs attention"
  fi

  sleep 180
done
