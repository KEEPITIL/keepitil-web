#!/bin/zsh
# run-proof.sh - run the _job30 proofs on the local real PostgreSQL (socket only). Starts Postgres, ALWAYS stops it (trap), verifies it is stopped, samples load/memory.
# Refuses to start if 1-min load > 8 or free memory < 25%. Usage: proof/run-proof.sh [--only=<id prefix>]
HERE=${0:A:h}
PGBIN=/Users/josephtuitea/work/pg-local/bin
OUT=$HERE/out; mkdir -p $OUT
LOAD=$(uptime | sed -E 's/.*load averages?: ([0-9.]+).*/\1/')
FREE=$(memory_pressure 2>/dev/null | awk '/free percentage/ {gsub("%","",$NF); print $NF}')
echo "preflight: load1=$LOAD free_mem_pct=$FREE"
if [ "$(echo "$LOAD > 8" | bc -l)" = "1" ] || [ "${FREE:-100}" -lt 25 ]; then echo "ABORT: machine busy (load > 8 or free memory < 25%)"; exit 9; fi
SAMPLES=$OUT/load-samples.txt; : > $SAMPLES
stop_pg() { $PGBIN/pg-stop.sh >/dev/null 2>&1; }
cleanup() { kill $SAMPLER 2>/dev/null; stop_pg; echo "pg-status after stop:"; $PGBIN/pg-status.sh 2>&1 | head -2; }
trap cleanup EXIT INT TERM
$PGBIN/pg-start.sh >/dev/null 2>&1 || { echo "pg-start failed"; exit 8; }
( while true; do echo "$(date +%T) load=$(uptime | sed -E 's/.*load averages?: ([0-9.]+).*/\1/') free_mem_pct=$(memory_pressure 2>/dev/null | awk '/free percentage/ {gsub("%","",$NF); print $NF}')" >> $SAMPLES; sleep 3; done ) &
SAMPLER=$!
cd $HERE && node prove.mjs "$@" 2>&1 | tee $OUT/run.log
RC=${pipestatus[1]}
echo "prove exit code: $RC"
awk '{split($2,a,"="); if (a[2]+0>m) m=a[2]+0; split($3,b,"="); if (mm==""||b[2]+0<mm) mm=b[2]+0} END {print "peak load1=" m " min free mem pct=" mm}' $SAMPLES | tee $OUT/peak.txt
exit $RC
