#!/bin/bash

###############################################################################
# Database Microservice Status Check Script
# 
# Purpose: Check the status and health of database containers
# Usage: ./check-db.sh
###############################################################################

echo "======================================"
echo "Database Microservice Status"
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

# Check container status
echo "Container Status:"
"${COMPOSE_CMD[@]}" ps
echo ""

# Check if MongoDB is accessible
echo "Testing MongoDB Connection:"
if docker exec testops-mongo mongosh --eval "db.runCommand('ping')" --quiet > /dev/null 2>&1; then
    echo "MongoDB is running and accessible"
else
    echo "MongoDB is not accessible"
fi
echo ""

# Check if Mongo Express is accessible
echo "Testing Mongo Express:"
if curl -s http://localhost:8081 > /dev/null 2>&1; then
    echo "Mongo Express is running and accessible"
    echo "URL: http://localhost:8081"
else
    echo "Mongo Express is not accessible"
fi
echo ""

# Show recent logs
echo "Recent Logs (last 10 lines):"
echo ""
echo "--- MongoDB Logs ---"
"${COMPOSE_CMD[@]}" logs --tail=10 mongo
echo ""
echo "--- Mongo Express Logs ---"
"${COMPOSE_CMD[@]}" logs --tail=10 mongo-express
echo ""

# Check database collections
echo "Database Collections:"
docker exec testops-mongo mongosh testops --eval "db.getCollectionNames()" --quiet 2>/dev/null || echo "Could not retrieve collections"
echo ""

# Count users
echo "User Count:"
docker exec testops-mongo mongosh testops --eval "db.users.countDocuments()" --quiet 2>/dev/null || echo "Could not count users"
echo ""

echo "======================================"
echo "Status Check Complete"
echo "======================================"
