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

# Check if docker-compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo "Error: docker-compose is not installed"
    exit 1
fi

echo "Stopping containers..."
docker-compose down

echo ""
echo "======================================"
echo "Database Microservice Stopped!"
echo "======================================"
echo ""
echo "Note: Data is preserved in Docker volumes"
echo ""
echo "To remove data volumes as well, run:"
echo "docker-compose down -v"
echo ""
