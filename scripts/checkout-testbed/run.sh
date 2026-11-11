#!/bin/zsh
# run.sh - ONE COMMAND: load-gated, one node process hosting every listener (127.0.0.1 only). Postgres is started by THIS script and stopped ONLY if this script started it.
#   scripts/checkout-testbed/run.sh            (env: KIL_OUT=<dir> for logs; default scripts/checkout-testbed/out; KIL_SCENARIO=<file> picks the scenario)
# Gate: do not start unless 1-min load < 8; abort the run (and stop only OUR Postgres) if load > 10; samples load + free memory every 3 s.
# OWNERSHIP (Atlas 1, round 2): if a PostgreSQL is already listening on the testbed socket/port, or a stale socket is there, this script REFUSES TO RUN (exit 7). It never adopts, restarts or stops
# an instance it did not start: STARTED=1 is set only after OUR pg-start.sh succeeded, and cleanup() stops Postgres only when STARTED=1.
HERE=${0:A:h}
PGHOME=${KIL_PG_HOME:-$HOME/work/pg-local}
PGBIN=${KIL_PG_BIN:-$PGHOME/bin}
PGPORT_=${KIL_PG_PORT:-54329}
SOCK=${KIL_PG_SOCKET_DIR:-$PGHOME/run}/.s.PGSQL.$PGPORT_
OUT=${KIL_OUT:-$HERE/out}; mkdir -p $OUT; export KIL_OUT=$OUT
load() { uptime | sed -E 's/.*load averages?: ([0-9.]+).*/\1/'; }
free() { memory_pressure 2>/dev/null | awk '/free percentage/ {gsub("%","",$NF); print $NF}'; }
L=$(load); echo "preflight: load1=$L free_mem_pct=$(free)"
if [ "$(echo "$L >= 8" | bc -l)" = "1" ]; then echo "ABORT: 1-min load $L >= 8 (shared Mac): wait and retry"; exit 9; fi
# refuse anything already there: a live listener on the port (any interface), or a socket file (live or stale)
if [ -e "$SOCK" ] || lsof -nP -iTCP:$PGPORT_ -sTCP:LISTEN >/dev/null 2>&1; then
  echo "ABORT: a PostgreSQL (or a stale socket) already exists at $SOCK / port $PGPORT_. This launcher only runs against an instance it starts itself, and will not touch this one. Stop it yourself, or set KIL_PG_PORT / KIL_PG_SOCKET_DIR to a free pair."
  exit 7
fi
STARTED=0
SAMPLES=$OUT/load-samples.txt; : > $SAMPLES
cleanup() {
  kill $SAMPLER $NODEPID 2>/dev/null
  if [ "$STARTED" = "1" ]; then $PGBIN/pg-stop.sh >/dev/null 2>&1; echo "stopped the Postgres this run started"; echo "pg-status after stop:"; $PGBIN/pg-status.sh 2>&1 | head -2
  else echo "no Postgres was started by this run: none stopped"; fi
}
trap cleanup EXIT INT TERM
$PGBIN/pg-start.sh >/dev/null 2>&1 || { echo "pg-start failed (nothing stopped: this run does not own an instance)"; exit 8; }
STARTED=1
( while true; do echo "$(date +%T) load=$(load) free_mem_pct=$(free)" >> $SAMPLES; sleep 3; done ) &
SAMPLER=$!
node --no-warnings $HERE/${KIL_SCENARIO:-scenario.mjs} > $OUT/run.log 2>&1 &
NODEPID=$!
while kill -0 $NODEPID 2>/dev/null; do
  if [ "$(echo "$(load) > 10" | bc -l)" = "1" ]; then echo "ABORT: load > 10 mid-run: stopping"; kill $NODEPID; break; fi
  sleep 2
done
wait $NODEPID; RC=$?
cat $OUT/run.log
awk '{split($2,a,"="); if (a[2]+0>m) m=a[2]+0; split($3,b,"="); if (mm==""||b[2]+0<mm) mm=b[2]+0} END {print "peak load1=" m " min free mem pct=" mm}' $SAMPLES | tee $OUT/peak.txt
exit $RC
