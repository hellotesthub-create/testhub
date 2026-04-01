#!/bin/bash

###############################################################################
# Database Microservice Restart Script
# 
# Purpose: Restart MongoDB and Mongo Express containers
# Usage: ./restart-db.sh
###############################################################################

set -e  # Exit on error

echo "======================================"
echo "Restarting Database Microservice"
echo "======================================"
echo ""

# Stop the services
echo "Stopping containers..."
docker-compose down

echo ""
echo "Waiting 3 seconds..."
sleep 3

# Start the services
echo ""
echo "Starting containers..."
docker-compose up -d

echo ""
echo "Waiting for services to be ready..."
sleep 5

# Check status
echo ""
echo "Container Status:"
docker-compose ps

echo ""
echo "======================================"
echo "Database Microservice Restarted!"
echo "======================================"
echo ""
