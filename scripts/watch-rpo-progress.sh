#!/bin/bash
# Polls business_entities every 3 minutes. Tracks BOTH total count (new
# inserts) and rows touched in the last window (updates + inserts) - a
# municipality full of already-known entities produces only updates, which
# a count-only check misreads as a stall even while the process is healthy.
cd "D:\baroslav-jarabas\vscode\data-breakr" || exit 1

CHECK_FILE=".watch-rpo-count-check.ts"
cat > "$CHECK_FILE" <<'EOF'
import { prisma } from './lib/prisma'
async function main() {
  const total = await prisma.businessEntity.count()
  const touched = await prisma.businessEntity.count({
    where: { lastSyncedAt: { gte: new Date(Date.now() - 3.5 * 60 * 1000) } },
  })
  console.log(`${total} ${touched}`)
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
EOF

prev_total=""
stall_count=0
while true; do
  out=$(npx tsx "$CHECK_FILE" 2>/dev/null | tail -1)
  now=$(date -u +%H:%M:%S)

  total=$(echo "$out" | awk '{print $1}')
  touched=$(echo "$out" | awk '{print $2}')

  if [ -z "$total" ] || ! [[ "$total" =~ ^[0-9]+$ ]]; then
    echo "[$now] CHECK FAILED (query error or process issue)"
    stall_count=$((stall_count + 1))
  elif [ "$touched" == "0" ]; then
    stall_count=$((stall_count + 1))
    echo "[$now] total=$total, 0 rows touched recently (check #$stall_count) - genuinely idle"
  else
    delta=$((total - ${prev_total:-$total}))
    echo "[$now] total=$total (+$delta new), $touched rows touched recently - active"
    stall_count=0
  fi

  if [ "$stall_count" -ge 2 ]; then
    echo "[$now] WARNING: zero DB activity for 2+ checks (6+ min) - process likely dead"
  fi

  prev_total=$total
  sleep 180
done
