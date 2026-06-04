#!/usr/bin/env bash
# Polls the local Overpass API every 60s. The moment it answers a real query
# with a sensible count, kicks off `node scripts/onboard.mjs` against it and
# leaves output in onboard.log next to this script.
#
# Probe query: count amenity=cafe within 500m of a known point in Newport.
# Picking a small query avoids hammering the server during its first seconds
# of life. Expecting JSON containing `"count":` (any value, even 0) means the
# dispatcher is serving real data, not just a startup placeholder.
set -u
HERE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd -- "$HERE/.." && pwd)"
URL="http://localhost:12345/api/interpreter"
LOG="$HERE/onboard.log"
PROBE='[out:json][timeout:25];node[amenity=cafe](around:500,41.4886,-71.3127);out%20count;'

echo "$(date '+%F %T')  waiter started, polling $URL" >> "$LOG"

while true; do
  body=$(curl -s --max-time 10 "$URL?data=$PROBE" 2>/dev/null || true)
  if echo "$body" | grep -q '"count":'; then
    echo "$(date '+%F %T')  Overpass is serving — launching onboard.mjs" >> "$LOG"
    cd "$ROOT" || { echo "cd $ROOT failed" >> "$LOG"; exit 1; }
    OVERPASS_URL="$URL" node scripts/onboard.mjs >> "$LOG" 2>&1
    echo "$(date '+%F %T')  onboard.mjs exited $?" >> "$LOG"
    exit 0
  fi
  sleep 60
done
