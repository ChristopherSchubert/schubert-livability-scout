#!/usr/bin/env bash
# Combined progress monitor for the Overpass init:
#  - tails the container's stdout for phase markers
#  - emits a heartbeat every 120s with disk usage + file sizes so the long
#    quiet phases (osmium convert, init_osm3s indexing) don't look stuck.
set -u
# Resolve DB path from this script's location so the monitor works regardless
# of the caller's cwd (the Monitor tool's working dir is not pinned to the
# project root).
DB="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/db"

phase=download
last_size=0
last_total=0
last_inpos=0
# Rolling average of input bytes per tick over the last N ticks — smooths the
# ETA when osmium hits a sparse / dense run.
RATE_WINDOW=5
rates=()
INTERVAL=600
PBF_TOTAL=11940000000   # ~11.94 GB Geofabrik us-latest, used for ETA
INDEX_HOURS_GUESS=10    # rough indexer estimate added to total ETA in convert phase

(
  # Only signals we can interpret. The per-batch "Reading XML file ... elapsed
  # node N" lines from init_osm3s are intentionally dropped — that counter
  # doesn't map cleanly to a meaningful percentage.
  docker logs -f overpass-us 2>&1 \
    | grep -E --line-buffered "Database created|Now updating|Update finished|Update done|Server started|dispatcher|Apache|ERROR|FATAL|Killed|out of memory|Permission denied|disk full|No space|init_done"
) &
LOG_PID=$!

while sleep 600; do
  if ! docker inspect -f '{{.State.Running}}' overpass-us 2>/dev/null | grep -q true; then
    echo "HEARTBEAT container_not_running — stopping watcher"
    kill $LOG_PID 2>/dev/null
    exit 1
  fi
  pbf=$(stat -f%z "$DB/planet.osm.bz2" 2>/dev/null || echo 0)
  pbf_pbf=$(stat -f%z "$DB/planet.osm.pbf" 2>/dev/null || echo 0)
  total=$(du -sk "$DB" 2>/dev/null | awk '{print $1*1024}')

  # Phase inference: ask the container what process is running. More reliable
  # than disk-shape guessing (the image keeps extra copies and renames files
  # in ways that confused the earlier heuristic).
  procs=$(docker exec overpass-us sh -c 'for p in /proc/[0-9]*/comm; do cat $p 2>/dev/null; done' 2>/dev/null | sort -u)
  if echo "$procs" | grep -q '^osmium$'; then
    phase=osmium-convert
  elif echo "$procs" | grep -qE '^(init_osm3s|update_database)$'; then
    phase=indexing
  elif echo "$procs" | grep -q '^curl$'; then
    phase=download
  elif echo "$procs" | grep -qE '^(httpd|apache2|dispatcher)$'; then
    phase=serving
  else
    phase=between-steps
  fi

  # Indexer sub-phase: look at /db/db files. The indexer writes a family per
  # element type — nodes.*, ways.*, relations.* — and within each pass it
  # chunks output as 0a, 0b, ... 1a, 1b ...  We surface the current step,
  # latest chunk, and totals so each heartbeat is meaningful instead of
  # opaquely sitting on "indexing" for hours.
  sub=""
  if [ "$phase" = "indexing" ] || [ "$phase" = "between-steps" ]; then
    files=$(docker exec overpass-us ls /db/db 2>/dev/null)
    nodes_done="-"
    ways_state="-"
    rels_state="-"
    cur="?"
    if echo "$files" | grep -q '^nodes\.bin$'; then
      nbytes=$(docker exec overpass-us stat -c %s /db/db/nodes.bin 2>/dev/null || echo 0)
      nodes_done=$(awk -v a="$nbytes" 'BEGIN{printf "done(%.1fGB)", a/1e9}')
    fi
    # Latest ways chunk: highest-sorted ways.*.bin filename
    last_way=$(echo "$files" | grep -E '^ways\.[0-9a-z]+\.bin$' | sort | tail -1)
    if [ -n "$last_way" ]; then
      ways_chunks=$(echo "$files" | grep -cE '^ways\.[0-9a-z]+\.bin$')
      ways_bytes=$(docker exec overpass-us sh -c 'ls /db/db/ways.[0-9a-z]*.bin 2>/dev/null | xargs -r stat -c %s 2>/dev/null | awk "{s+=\$1} END {print s+0}"')
      ways_state=$(awk -v a="$ways_bytes" -v n="$ways_chunks" 'BEGIN{printf "%dch/%.1fGB", n, a/1e9}')
      cur=$(echo "$last_way" | sed -E 's/^ways\.([0-9a-z]+)\.bin$/ways(\1)/')
    elif echo "$files" | grep -q '^ways\.bin$'; then
      wbytes=$(docker exec overpass-us stat -c %s /db/db/ways.bin 2>/dev/null || echo 0)
      ways_state=$(awk -v a="$wbytes" 'BEGIN{printf "merged(%.1fGB)", a/1e9}')
    fi
    last_rel=$(echo "$files" | grep -E '^relations\.[0-9a-z]+\.bin$' | sort | tail -1)
    if [ -n "$last_rel" ]; then
      rel_chunks=$(echo "$files" | grep -cE '^relations\.[0-9a-z]+\.bin$')
      rel_bytes=$(docker exec overpass-us sh -c 'ls /db/db/relations.[0-9a-z]*.bin 2>/dev/null | xargs -r stat -c %s 2>/dev/null | awk "{s+=\$1} END {print s+0}"')
      rels_state=$(awk -v a="$rel_bytes" -v n="$rel_chunks" 'BEGIN{printf "%dch/%.1fGB", n, a/1e9}')
      cur=$(echo "$last_rel" | sed -E 's/^relations\.([0-9a-z]+)\.bin$/rels(\1)/')
    elif echo "$files" | grep -q '^relations\.bin$'; then
      rbytes=$(docker exec overpass-us stat -c %s /db/db/relations.bin 2>/dev/null || echo 0)
      rels_state=$(awk -v a="$rbytes" 'BEGIN{printf "merged(%.1fGB)", a/1e9}')
      cur="rels(done)"
    fi
    # How long the current step has been writing — earliest mtime of the
    # active chunk family, vs. now. Translates "step=ways(1b)" into a felt
    # number ("…been at this 22 min"). Reported as elapsed since the family
    # started writing, not total session elapsed.
    elapsed_step=""
    if [ -n "$last_rel" ]; then
      first_mt=$(docker exec overpass-us sh -c 'for f in /db/db/relations.[0-9a-z]*.bin; do stat -c %Y "$f" 2>/dev/null; done | sort -n | head -1')
    elif [ -n "$last_way" ]; then
      first_mt=$(docker exec overpass-us sh -c 'for f in /db/db/ways.[0-9a-z]*.bin; do stat -c %Y "$f" 2>/dev/null; done | sort -n | head -1')
    else
      first_mt=""
    fi
    if [ -n "$first_mt" ] && [ "$first_mt" -gt 0 ] 2>/dev/null; then
      now=$(date +%s)
      delta=$(( now - first_mt ))
      elapsed_step=$(printf " (%dh%02dm in step)" $(( delta / 3600 )) $(( (delta % 3600) / 60 )))
    fi
    sub=" step=$cur$elapsed_step nodes:$nodes_done ways:$ways_state rels:$rels_state"
  fi

  pct=""
  if [ "$phase" = "download" ] && [ "$pbf" -gt 0 ]; then
    pct=" $(awk -v a="$pbf" 'BEGIN{printf "%.1f%%", a/119e8*100}')"  # ~11.1 GB target
  fi
  if [ "$phase" = "osmium-convert" ]; then
    # osmium keeps the input PBF open even after it's unlinked; its read
    # position is the exact bytes-into-PBF. PBF is ~11.94 GB.
    posbytes=$(docker exec overpass-us sh -c '
      pid=$(for p in /proc/[0-9]*/comm; do [ "$(cat $p 2>/dev/null)" = "osmium" ] && echo $(basename $(dirname $p)) && break; done)
      [ -z "$pid" ] && exit 0
      for f in /proc/$pid/fdinfo/*; do
        link=$(readlink /proc/$pid/fd/$(basename $f) 2>/dev/null)
        case "$link" in *planet.osm.pbf*) grep -m1 "^pos:" $f | awk "{print \$2}"; exit 0 ;; esac
      done
    ' 2>/dev/null)
    if [ -n "$posbytes" ] && [ "$posbytes" -gt 0 ]; then
      pct=" $(awk -v a="$posbytes" 'BEGIN{printf "%.1f%% of PBF", a/11.94e9*100}')"
    fi
  fi

  delta_pbf=$(( pbf - last_size ))
  delta_total=$(( total - last_total ))
  last_size=$pbf
  last_total=$total

  # Projected completion: based on rolling-window input-byte rate. Only
  # meaningful in osmium-convert (where posbytes is real); reported as
  # convert-done ETA and overall-done ETA (= convert + INDEX_HOURS_GUESS h).
  eta_str=""
  if [ "$phase" = "osmium-convert" ] && [ -n "${posbytes:-}" ] && [ "$posbytes" -gt 0 ]; then
    delta_in=$(( posbytes - last_inpos ))
    if [ "$last_inpos" -gt 0 ] && [ "$delta_in" -gt 0 ]; then
      rates+=("$delta_in")
      [ ${#rates[@]} -gt "$RATE_WINDOW" ] && rates=("${rates[@]:1}")
      sum=0; for r in "${rates[@]}"; do sum=$(( sum + r )); done
      avg=$(( sum / ${#rates[@]} ))                # avg bytes per tick
      bps=$(( avg / INTERVAL ))                    # avg bytes/sec
      remain=$(( PBF_TOTAL - posbytes ))
      if [ "$bps" -gt 0 ]; then
        eta_sec=$(( remain / bps ))
        now=$(date +%s)
        cdone=$(date -r "$(( now + eta_sec ))" "+%a %H:%M")
        odone=$(date -r "$(( now + eta_sec + INDEX_HOURS_GUESS*3600 ))" "+%a %H:%M")
        eta_str=$(printf "  ETA convert→%s (%dh%02dm)  full→%s" \
          "$cdone" $(( eta_sec / 3600 )) $(( (eta_sec % 3600) / 60 )) "$odone")
      fi
    fi
    last_inpos="$posbytes"
  fi

  printf 'HEARTBEAT phase=%s%s%s db=%.1fGB Δdb/10m=%+dMB%s\n' \
    "$phase" "$pct" "$sub" \
    "$(awk -v a="$total" 'BEGIN{print a/1e9}')" \
    "$(( delta_total / 1048576 ))" \
    "$eta_str"
done
