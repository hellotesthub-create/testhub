#!/bin/bash

###############################################################################
# Backend API Logs Viewer
# 
# Purpose: View real-time logs from backend API
# Usage: ./logs-backend.sh
###############################################################################

echo "======================================"
echo "Backend API Logs"
echo "======================================"
echo ""
echo "Showing logs (press Ctrl+C to exit)..."
echo ""

if docker compose version > /dev/null 2>&1; then
	COMPOSE_CMD=(docker compose)
elif command -v docker-compose > /dev/null 2>&1; then
	COMPOSE_CMD=(docker-compose)
else
	echo "Error: Docker Compose is not installed"
	exit 1
fi

"${COMPOSE_CMD[@]}" logs -f
