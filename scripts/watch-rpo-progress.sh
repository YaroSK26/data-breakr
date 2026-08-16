#!/bin/bash
# Polls business_entities count every 3 minutes, reports progress or stall.
cd "D:\baroslav-jarabas\vscode\data-breakr" || exit 1

# Self-contained: writes its own check script each run rather than relying
# on an external scratch file, which has been accidentally deleted mid-run
# during cleanup more than once.
CHECK_FILE=".watch-rpo-count-check.ts"
cat > "$CHECK_FILE" <<'EOF'
import { prisma } from './lib/prisma'
prisma.businessEntity.count().then((c) => { console.log(c); process.exit(0) }).catch((e) => { console.error(e); process.exit(1) })
EOF

prev=""
stall_count=0
while true; do
  out=$(npx tsx "$CHECK_FILE" 2>/dev/null | tail -1)

  now=$(date -u +%H:%M:%S)

  if [ -z "$out" ] || ! [[ "$out" =~ ^[0-9]+$ ]]; then
    echo "[$now] CHECK FAILED (query error or process issue)"
    stall_count=$((stall_count + 1))
  elif [ "$out" == "$prev" ]; then
    stall_count=$((stall_count + 1))
    echo "[$now] STALLED at $out (no change, check #$stall_count)"
  else
    delta=$((out - ${prev:-0}))
    echo "[$now] $out (+$delta)"
    stall_count=0
  fi

  if [ "$stall_count" -ge 2 ]; then
    echo "[$now] WARNING: no progress for 2+ checks (6+ min) - process likely dead"
  fi

  prev=$out
  sleep 180
done
