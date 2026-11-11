#!/bin/zsh
# run-settled.sh - the payment-settled scenario. Same launcher (and the same Postgres-ownership rule) as run.sh: this file only selects the scenario, so the two can never drift apart.
KIL_SCENARIO=scenario-settled.mjs exec ${0:A:h}/run.sh "$@"
