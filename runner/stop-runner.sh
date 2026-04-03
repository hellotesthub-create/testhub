#!/bin/bash

# Stop the runner container
echo "Stopping Selenium Test Runner..."

if docker compose version > /dev/null 2>&1; then
	COMPOSE_CMD=(docker compose)
elif command -v docker-compose > /dev/null 2>&1; then
	COMPOSE_CMD=(docker-compose)
else
	echo "Error: Docker Compose is not installed"
	exit 1
fi

"${COMPOSE_CMD[@]}" stop runner
"${COMPOSE_CMD[@]}" rm -f runner

echo "Runner stopped and removed"
