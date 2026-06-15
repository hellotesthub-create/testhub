#!/usr/bin/env bash
###############################################################################
# stop.sh — tear down the ENTIRE TestHub stack with one command.
#
# Reverse order of start.sh:
#   1. Stop the main stack (backend, frontend, runner, diagnosis-service,
#      visual-regression-service, Selenium grid)
#   2. Stop the database microservice
#
# Usage:  ./stop.sh          (stop containers, keep DB data volumes)
#         ./stop.sh --clean  (also remove the main stack's named volumes)
###############################################################################
set -euo pipefail

cd "$(dirname "$0")"

EXTRA=""
if [ "${1:-}" = "--clean" ]; then
  EXTRA="-v"
  echo "==> --clean: main stack volumes will be removed."
fi

echo "==> [1/2] Stopping the main stack..."
docker compose down --remove-orphans ${EXTRA}

echo "==> [2/2] Stopping the database microservice..."
( cd database-microservice && ./stop-db.sh )

echo
echo "All services stopped."
