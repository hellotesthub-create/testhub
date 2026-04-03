#!/bin/bash

###############################################################################
# Backend API Startup Script
# 
# Purpose: Start the backend API service
# Usage: ./start-backend.sh
###############################################################################

set -e  # Exit on error

echo "======================================"
echo "Starting Backend API"
echo "======================================"
echo ""

if docker compose version > /dev/null 2>&1; then
    COMPOSE_CMD=(docker compose)
elif command -v docker-compose > /dev/null 2>&1; then
    COMPOSE_CMD=(docker-compose)
    echo "Warning: using legacy docker-compose v1; Compose v2 is recommended"
else
    echo "Error: Docker Compose is not installed"
    exit 1
fi

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "Error: Docker is not running"
    echo "Please start Docker and try again"
    exit 1
fi

# Check if database network exists
if ! docker network ls | grep -q "testops-db-network"; then
    echo "Error: Database network not found"
    echo "Please start the database microservice first:"
    echo "cd ../database-microservice"
    echo " ./start-db.sh"
    exit 1
fi

echo "Starting backend API..."

# Clean stale containers to avoid docker-compose v1 'ContainerConfig' recreate bug
"${COMPOSE_CMD[@]}" down --remove-orphans > /dev/null 2>&1 || true
docker rm -f testops-backend-api > /dev/null 2>&1 || true

"${COMPOSE_CMD[@]}" up -d --force-recreate --remove-orphans

echo ""
echo "Waiting for service to be ready..."
sleep 3

# Check if container is running
echo ""
echo "Container Status:"
"${COMPOSE_CMD[@]}" ps

echo ""
echo "======================================"
echo "Backend API Started!"
echo "======================================"
echo ""
echo "Access Points:"
echo "Backend API: http://localhost:8080"
echo "Health Check: http://localhost:8080/health"
echo "Signup API: http://localhost:8080/api/users/signup"
echo ""
echo "Useful Commands:"
echo "View logs: docker compose logs -f"
echo "Stop service: ./stop-backend.sh"
echo ""
