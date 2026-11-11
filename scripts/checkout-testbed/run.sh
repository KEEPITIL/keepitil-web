#!/bin/zsh
# run.sh - ONE COMMAND: load-gated, Postgres started and ALWAYS stopped, one node process hosting every listener (127.0.0.1 only).
#   scripts/checkout-testbed/run.sh            (env: KIL_OUT=<dir> for logs; default scripts/checkout-testbed/out)
# Gate: do not start unless 1-min load < 8; abort the run (and stop Postgres) if load > 10; samples load + free memory every 3 s.
HERE=${0:A:h}
PGBIN=${KIL_PG_BIN:-$HOME/work/pg-local/bin}
OUT=${KIL_OUT:-$HERE/out}; mkdir -p $OUT; export KIL_OUT=$OUT
load() { uptime | sed -E 's/.*load averages?: ([0-9.]+).*/\1/'; }
free() { memory_pressure 2>/dev/null | awk '/free percentage/ {gsub("%","",$NF); print $NF}'; }
L=$(load); echo "preflight: load1=$L free_mem_pct=$(free)"
if [ "$(echo "$L >= 8" | bc -l)" = "1" ]; then echo "ABORT: 1-min load $L >= 8 (shared Mac): wait and retry"; exit 9; fi
SAMPLES=$OUT/load-samples.txt; : > $SAMPLES
cleanup() { kill $SAMPLER $NODEPID 2>/dev/null; $PGBIN/pg-stop.sh >/dev/null 2>&1; echo "pg-status after stop:"; $PGBIN/pg-status.sh 2>&1 | head -2; }
trap cleanup EXIT INT TERM
$PGBIN/pg-start.sh >/dev/null 2>&1 || { echo "pg-start failed"; exit 8; }
( while true; do echo "$(date +%T) load=$(load) free_mem_pct=$(free)" >> $SAMPLES; sleep 3; done ) &
SAMPLER=$!
node --no-warnings $HERE/scenario.mjs > $OUT/run.log 2>&1 &
NODEPID=$!
while kill -0 $NODEPID 2>/dev/null; do
  if [ "$(echo "$(load) > 10" | bc -l)" = "1" ]; then echo "ABORT: load > 10 mid-run: stopping"; kill $NODEPID; break; fi
  sleep 2
done
wait $NODEPID; RC=$?
cat $OUT/run.log
awk '{split($2,a,"="); if (a[2]+0>m) m=a[2]+0; split($3,b,"="); if (mm==""||b[2]+0<mm) mm=b[2]+0} END {print "peak load1=" m " min free mem pct=" mm}' $SAMPLES | tee $OUT/peak.txt
exit $RC
