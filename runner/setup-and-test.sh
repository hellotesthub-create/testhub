#!/bin/bash

# Quick Setup and Test Script for Selenium Runner
echo ""
echo "SELENIUM TEST RUNNER - QUICK SETUP & DEMO "
echo ""
echo ""

# Check if Docker is running
echo "Checking prerequisites..."
if ! docker info > /dev/null 2>&1; then
    echo "Docker is not running!"
    echo "Please start Docker and try again."
    exit 1
fi
echo "Docker is running"

# Check if docker-compose is available
if ! command -v docker-compose &> /dev/null; then
    echo "docker-compose is not installed!"
    echo "Please install docker-compose and try again."
    exit 1
fi
echo "docker-compose is available"

echo ""
echo "Building Selenium Runner Docker image..."
echo " (This may take a few minutes on first run)"
echo ""

cd /home/imran/Projects/THEX
docker-compose build runner

if [ $? -ne 0 ]; then
    echo ""
    echo "Failed to build Docker image!"
    exit 1
fi

echo ""
echo "Docker image built successfully!"
echo ""
echo ""
echo "RUNNING DEMO TESTS"
echo ""
echo ""
echo "The runner will execute the following tests:"
echo "test_example.py - Basic page load"
echo "test_github.py - GitHub navigation"
echo "test_wikipedia.py - Wikipedia search"
echo "sample_script.py - Google search"
echo "test_fail_demo.py - Intentional failure (demo)"
echo ""
echo "Press Enter to start tests, or Ctrl+C to cancel..."
read

echo ""
echo "Starting test execution..."
echo ""

docker-compose up runner

echo ""
echo ""
echo "TEST EXECUTION COMPLETE!"
echo ""
echo ""
echo "Results are available at:"
echo "Reports: ./runner/output/reports/"
echo "Screenshots: ./runner/output/screenshots/"
echo "Logs: ./runner/logs/"
echo ""
echo "To view the HTML report, run:"
echo "cd runner && ./view-report.sh"
echo ""
echo "For more information, see:"
echo " ./runner/README.md"
echo ""
