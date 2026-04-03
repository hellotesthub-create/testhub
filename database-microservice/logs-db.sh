#!/bin/bash

###############################################################################
# Database Microservice Logs Viewer
# 
# Purpose: View real-time logs from database containers
# Usage: ./logs-db.sh [service_name]
#        ./logs-db.sh         # View all logs
#        ./logs-db.sh mongo   # View MongoDB logs only
###############################################################################

SERVICE_NAME=${1:-}

if docker compose version > /dev/null 2>&1; then
    COMPOSE_CMD=(docker compose)
elif command -v docker-compose > /dev/null 2>&1; then
    COMPOSE_CMD=(docker-compose)
else
    echo "Error: Docker Compose is not installed"
    exit 1
fi

echo "======================================"
echo "Database Microservice Logs"
echo "======================================"
echo ""

if [ -z "$SERVICE_NAME" ]; then
    echo "Showing logs for all services (press Ctrl+C to exit)..."
    echo ""
    "${COMPOSE_CMD[@]}" logs -f
else
    echo "Showing logs for: $SERVICE_NAME (press Ctrl+C to exit)..."
    echo ""
    "${COMPOSE_CMD[@]}" logs -f "$SERVICE_NAME"
fi
