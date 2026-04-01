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

echo "Stopping backend container..."
docker-compose down

echo ""
echo "======================================"
echo "Backend API Stopped!"
echo "======================================"
echo ""
