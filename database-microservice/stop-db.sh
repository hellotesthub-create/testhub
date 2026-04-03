#!/bin/bash

###############################################################################
# Database Microservice Stop Script
# 
# Purpose: Stop MongoDB and Mongo Express containers
# Usage: ./stop-db.sh
###############################################################################

set -e  # Exit on error

echo "======================================"
echo "Stopping Database Microservice"
echo "======================================"
echo ""

# Resolve compose command (prefer Compose v2 plugin)
if docker compose version > /dev/null 2>&1; then
    COMPOSE_CMD=(docker compose)
elif command -v docker-compose > /dev/null 2>&1; then
    COMPOSE_CMD=(docker-compose)
else
    echo "Error: Docker Compose is not installed"
    exit 1
fi

echo "Stopping containers..."
"${COMPOSE_CMD[@]}" down --remove-orphans

echo ""
echo "======================================"
echo "Database Microservice Stopped!"
echo "======================================"
echo ""
echo "Note: Data is preserved in Docker volumes"
echo ""
echo "To remove data volumes as well, run:"
echo "docker compose down -v"
echo ""
