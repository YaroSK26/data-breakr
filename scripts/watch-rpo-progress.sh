#!/bin/bash
# Polls business_entities count every 3 minutes, reports progress or stall.
cd "D:\baroslav-jarabas\vscode\data-breakr" || exit 1
prev=""
stall_count=0
while true; do
  out=$(npx tsx scratch-count-check.ts 2>/dev/null | tail -1)

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
