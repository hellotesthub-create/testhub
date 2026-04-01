#!/bin/bash

# Start the Selenium test runner
echo "Starting Selenium Test Runner..."
echo "=================================="

# Build the runner image
echo "Building Docker image..."
docker-compose build runner

# Run the tests
echo ""
echo "Running Selenium tests..."
docker-compose up runner

echo ""
echo "=================================="
echo "Test execution completed!"
echo ""
echo "View reports at: ./runner/output/reports/"
echo "View screenshots at: ./runner/output/screenshots/"
echo "View logs at: ./runner/logs/"
