#!/bin/bash
# 🛑 THEX Selenium Video Recording - Stop Script
# Run this script to cleanly stop all Selenium containers

set -e

echo "🛑 Stopping THEX Selenium Video Recording System..."
echo ""

cd /home/imran/Projects/THEX || { echo "❌ Project directory not found!"; exit 1; }

echo "📁 Current directory: $(pwd)"
echo ""

# Stop Selenium containers
echo "🛑 Stopping Selenium Grid containers..."
docker-compose stop selenium-chrome selenium-firefox

echo ""
echo "✅ Selenium Grid containers stopped"
echo ""
echo "📊 Current container status:"
docker ps -a | grep -E "CONTAINER|selenium" || echo "No Selenium containers running"
echo ""
echo "💡 To completely remove containers, run:"
echo "   docker-compose down selenium-chrome selenium-firefox"
