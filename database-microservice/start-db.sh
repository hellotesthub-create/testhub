#!/bin/bash

###############################################################################
# Database Microservice Startup Script
# 
# Purpose: Start MongoDB and Mongo Express containers
# Usage: ./start-db.sh
###############################################################################

set -e  # Exit on error

echo "======================================"
echo "Starting Database Microservice"
echo "======================================"
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "Error: Docker is not running"
    echo "Please start Docker and try again"
    exit 1
fi

# Check if docker-compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo "Error: docker-compose is not installed"
    exit 1
fi

# Check if .env file exists
if [ ! -f .env ]; then
    echo "Error: .env file not found"
    echo "Please create .env file first"
    exit 1
fi

echo "Starting containers..."
docker-compose up -d

echo ""
echo "Waiting for services to be ready..."
sleep 5

# Check if containers are running
echo ""
echo "Container Status:"
docker-compose ps

echo ""
echo "======================================"
echo "Database Microservice Started!"
echo "======================================"
echo ""
echo "Access Points:"
echo "MongoDB: mongodb://localhost:27017"
echo "Mongo Express: http://localhost:8081"
echo ""
echo "Mongo Express Login:"
echo "Username: admin"
echo "Password: pass"
echo ""
echo "Database Details:"
echo "Database Name: testops"
echo "Collections: users"
echo ""
echo "Useful Commands:"
echo "View logs: docker-compose logs -f"
echo "Stop service: ./stop-db.sh"
echo "Check status: ./check-db.sh"
echo ""
