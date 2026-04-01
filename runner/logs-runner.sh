#!/bin/bash

# View runner logs
echo "Showing Selenium Test Runner logs..."
echo "========================================"
echo ""

# Check if log file exists
if [ -f "./logs/runner.log" ]; then
    tail -f ./logs/runner.log
else
    echo "No log file found at ./logs/runner.log"
    echo ""
    echo "Running docker logs instead..."
    docker logs -f testops-runner 2>/dev/null || echo "Container not running"
fi
