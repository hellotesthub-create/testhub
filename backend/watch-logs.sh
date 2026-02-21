#!/bin/bash

# Watch Backend Logs - Shows parallel execution details

echo "======================================"
echo "📊 Watching Backend Logs"
echo "======================================"
echo ""
echo "This will show you:"
echo "  • Container launches"
echo "  • Parallel execution"
echo "  • Database queries"
echo "  • Test results"
echo "  • Final updates"
echo ""
echo "Press Ctrl+C to stop"
echo ""
sleep 2

# Follow logs with color highlighting
docker logs testops-backend-api -f --tail 50 | grep --line-buffered -E \
  "Launching|Container|Waiting|completed|Database|test results|Processing|Match found|Updating|TEST SUITE UPDATED|Failed|Error|suite.*for file" \
  --color=always
