#!/bin/bash
# 🚀 THEX Selenium Video Recording - Quick Start Script
# Run this script after system restart or project closure

set -e  # Exit on error

echo "🎬 Starting THEX Selenium Video Recording System..."
echo ""

# Navigate to project directory
cd /home/imran/Projects/THEX || { echo "❌ Project directory not found!"; exit 1; }

echo "📁 Current directory: $(pwd)"
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running! Please start Docker first."
    exit 1
fi

echo "✅ Docker is running"
echo ""

# Stop any existing containers
echo "🛑 Stopping existing containers..."
docker-compose stop selenium-chrome selenium-firefox 2>/dev/null || true

# Start Selenium Grid containers
echo "🚀 Starting Selenium Grid containers..."
docker-compose up -d selenium-chrome selenium-firefox

echo "⏳ Waiting 10 seconds for Selenium Grid to initialize..."
sleep 10

# Check Grid status
echo "🔍 Checking Selenium Grid status..."
if curl -s http://localhost:4444/status | grep -q "ready.*true"; then
    echo "✅ Selenium Grid is READY!"
else
    echo "⚠️  Selenium Grid might not be ready yet. Waiting 5 more seconds..."
    sleep 5
    if curl -s http://localhost:4444/status | grep -q "ready.*true"; then
        echo "✅ Selenium Grid is READY!"
    else
        echo "❌ Selenium Grid failed to start properly"
        echo "📋 Check logs with: docker logs selenium-chrome"
        exit 1
    fi
fi

echo ""

# Check permissions
echo "🔐 Checking permissions..."
if docker exec selenium-chrome touch /videos/permission_test.txt 2>/dev/null; then
    echo "✅ Video directory permissions OK"
    docker exec selenium-chrome rm /videos/permission_test.txt
else
    echo "⚠️  Fixing video directory permissions..."
    sudo chmod -R 777 runner/output/videos/
    echo "✅ Permissions fixed!"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎉 SYSTEM READY FOR TESTING!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📝 Available Commands:"
echo ""
echo "  # Run specific test:"
echo "  docker-compose run --rm runner python src/runner.py --file test_python.py"
echo ""
echo "  # Run GitHub scroll test (impressive for demo):"
echo "  docker-compose run --rm runner python src/runner.py --file test_github.py"
echo ""
echo "  # Run all tests:"
echo "  docker-compose run --rm runner python src/runner.py"
echo ""
echo "  # View latest video:"
echo "  vlc runner/output/videos/\$(ls -t runner/output/videos/*.mp4 | head -1)"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
