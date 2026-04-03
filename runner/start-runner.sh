#!/bin/bash

# Start the Selenium test runner
echo "Starting Selenium Test Runner..."
echo "=================================="

if docker compose version > /dev/null 2>&1; then
	COMPOSE_CMD=(docker compose)
elif command -v docker-compose > /dev/null 2>&1; then
	COMPOSE_CMD=(docker-compose)
else
	echo "Error: Docker Compose is not installed"
	exit 1
fi

# Build the runner image
echo "Building Docker image..."
"${COMPOSE_CMD[@]}" build runner

# Run the tests
echo ""
echo "Running Selenium tests..."
"${COMPOSE_CMD[@]}" up runner

echo ""
echo "=================================="
echo "Test execution completed!"
echo ""
echo "View reports at: ./runner/output/reports/"
echo "View screenshots at: ./runner/output/screenshots/"
echo "View logs at: ./runner/logs/"
