#!/bin/bash

# Stop the runner container
echo "🛑 Stopping Selenium Test Runner..."

docker-compose stop runner
docker-compose rm -f runner

echo "✅ Runner stopped and removed"
