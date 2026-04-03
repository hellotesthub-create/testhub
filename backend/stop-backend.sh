#!/bin/bash

###############################################################################
# Backend API Stop Script
# 
# Purpose: Stop the backend API service
# Usage: ./stop-backend.sh
###############################################################################

set -e  # Exit on error

echo "======================================"
echo "Stopping Backend API"
echo "======================================"
echo ""

if docker compose version > /dev/null 2>&1; then
	COMPOSE_CMD=(docker compose)
elif command -v docker-compose > /dev/null 2>&1; then
	COMPOSE_CMD=(docker-compose)
else
	echo "Error: Docker Compose is not installed"
	exit 1
fi

echo "Stopping backend container..."
"${COMPOSE_CMD[@]}" down --remove-orphans

echo ""
echo "======================================"
echo "Backend API Stopped!"
echo "======================================"
echo ""
