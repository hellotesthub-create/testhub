#!/usr/bin/env bash
###############################################################################
# start.sh — bring up the ENTIRE TestHub stack with one command.
#
# Order matters (see README "Running Procedure"):
#   1. Start the database microservice  -> also creates the shared docker network
#   2. Prepare host output directories   -> so Selenium/ffmpeg can write artifacts
#   3. Build & start everything else      -> backend, frontend, runner,
#                                            diagnosis-service, visual-regression-service
#
# Usage:  ./start.sh            (build images if needed, then start)
#         ./start.sh --build    (force rebuild of all images)
###############################################################################
set -euo pipefail

# Always run from the repo root (the directory this script lives in).
cd "$(dirname "$0")"

# Pass --build through; default to --build on first run so images exist.
BUILD_FLAG="${1:---build}"

# --- Warn (don't fail) if the root .env the main stack reads is missing. ------
if [ ! -f .env ]; then
  echo "WARNING: root ./.env not found. The main stack reads it for Mongo"
  echo "         credentials, JWT_SECRET, SMTP, and AI API keys. Services that"
  echo "         depend on those (auth, email, AI diagnosis) may not work until"
  echo "         you create it. Continuing anyway..."
  echo
fi

echo "==> [1/3] Starting database microservice (creates shared network)..."
( cd database-microservice && ./start-db.sh )

echo "==> [2/3] Preparing host output directories..."
./prepare-dirs.sh

echo "==> [3/3] Building & starting the rest of the stack..."
docker compose up -d ${BUILD_FLAG}

echo
echo "All services are up. Useful URLs (default ports):"
echo "  Frontend          : http://localhost:3456"
echo "  Backend API       : http://localhost:8090/api"
echo "  Selenium Grid     : http://localhost:4444"
echo "  Diagnosis service : http://localhost:8001"
echo "  Visual Regression : http://localhost:8002"
echo
echo "Check status: docker compose ps"
echo "Tail logs   : docker compose logs -f"
echo "Stop all    : ./stop.sh"
