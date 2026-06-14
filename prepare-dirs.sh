#!/usr/bin/env bash
###############################################################################
# Prepare host output directories for TestHub.
#
# Why this exists:
#   The Selenium node containers run as a non-root user (seluser) and write
#   test recordings into the bind-mounted ./runner/output/videos directory via
#   ffmpeg. If that directory is missing — or exists but isn't writable by the
#   container user — ffmpeg silently fails and NO video is recorded.
#
#   This script ensures every output directory exists and is writable. It is
#   idempotent: it only creates a directory if it doesn't already exist, and
#   safe to run before every `docker compose up`.
###############################################################################
set -e

# Resolve repo root so the script works from anywhere.
cd "$(dirname "$0")"

DIRS=(
  "runner/output/videos"
  "runner/output/screenshots"
  "runner/output/reports"
  "runner/logs"
)

echo "Preparing TestHub output directories..."
for d in "${DIRS[@]}"; do
  if [ -d "$d" ]; then
    echo "  exists:  $d"
  else
    echo "  creating: $d"
    mkdir -p "$d"
  fi
  # Make writable by container users (Selenium nodes run as non-root).
  chmod 777 "$d"
done

echo "Output directories are ready."
