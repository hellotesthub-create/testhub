#!/bin/bash

###############################################################################
# Database Microservice Restart Script
# 
# Purpose: Restart MongoDB and Mongo Express containers
# Usage: ./restart-db.sh
###############################################################################

set -e  # Exit on error

# Resolve compose command (prefer Compose v2 plugin)
if docker compose version > /dev/null 2>&1; then
	COMPOSE_CMD=(docker compose)
elif command -v docker-compose > /dev/null 2>&1; then
	COMPOSE_CMD=(docker-compose)
else
	echo "Error: Docker Compose is not installed"
	exit 1
fi

echo "======================================"
echo "Restarting Database Microservice"
echo "======================================"
echo ""

# Stop the services
echo "Stopping containers..."
"${COMPOSE_CMD[@]}" down --remove-orphans

echo ""
echo "Waiting 3 seconds..."
sleep 3

# Start the services
echo ""
echo "Starting containers..."
"${COMPOSE_CMD[@]}" up -d --force-recreate --remove-orphans

echo ""
echo "Waiting for services to be ready..."
sleep 5

# Check status
echo ""
echo "Container Status:"
"${COMPOSE_CMD[@]}" ps

echo ""
echo "======================================"
echo "Database Microservice Restarted!"
echo "======================================"
echo ""
