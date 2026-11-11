#!/usr/bin/env bash
# Atlas 1, round 2: run.sh must NEVER stop (or adopt) a PostgreSQL it did not start. No real database: pg-start/pg-stop/pg-status are recording stubs.
set -u
HERE="$(cd "$(dirname "$0")/.." && pwd)"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
mkdir -p "$T/bin" "$T/run" "$T/out"
for s in start stop status; do printf '#!/bin/sh\necho %s >> "%s/calls"\n' "$s" "$T" > "$T/bin/pg-$s.sh"; chmod +x "$T/bin/pg-$s.sh"; done
fail=0
chk() { if [ "$2" = "$3" ]; then echo "PASS  $1"; else echo "FAIL  $1 (got '$2', want '$3')"; fail=1; fi; }
runit() { : > "$T/calls"; KIL_PG_BIN="$T/bin" KIL_PG_HOME="$T" KIL_PG_SOCKET_DIR="$T/run" KIL_PG_PORT=54399 KIL_OUT="$T/out" KIL_SCENARIO=tests/noop-scenario.mjs "$HERE/run.sh" > "$T/log" 2>&1; echo $?; }

# 1. a Postgres (here: its socket file) already exists -> refuse (7); nothing started, NOTHING STOPPED
touch "$T/run/.s.PGSQL.54399"
rc=$(runit); chk "existing instance: exit 7" "$rc" 7
chk "existing instance: pg-start never called" "$(grep -c start "$T/calls")" 0
chk "existing instance: pg-stop never called" "$(grep -c '^stop' "$T/calls")" 0
rm -f "$T/run/.s.PGSQL.54399"

# 2. no instance -> this run starts it, runs the scenario, stops exactly that instance once
rc=$(runit); chk "clean start: exit 0" "$rc" 0
chk "clean start: started once" "$(grep -c '^start' "$T/calls")" 1
chk "clean start: stopped once" "$(grep -c '^stop' "$T/calls")" 1

# 3. our pg-start fails -> exit 8 and we do NOT stop anything (we never owned it)
printf '#!/bin/sh\necho start >> "%s/calls"; exit 1\n' "$T" > "$T/bin/pg-start.sh"
rc=$(runit); chk "failed start: exit 8" "$rc" 8
chk "failed start: pg-stop never called" "$(grep -c '^stop' "$T/calls")" 0

# 4. run-settled.sh is only a scenario selector over the same launcher
chk "run-settled delegates to run.sh" "$(grep -c 'exec .*run.sh' "$HERE/run-settled.sh")" 1
exit $fail
