#!/bin/bash

# Quick Test - Parallel Execution (Hardcoded Credentials)
# Edit EMAIL and PASSWORD below, then run this script

# ⚠️ EDIT THESE WITH YOUR CREDENTIALS
EMAIL="your-email@example.com"
PASSWORD="your-password"

API_URL="http://localhost:8080"
TEST_FILE_1="/home/imran/Projects/THEX/runner/testscripts/test_github.py"
TEST_FILE_2="/home/imran/Projects/THEX/runner/testscripts/test_python.py"

echo "=============================================="
echo "🧪 Parallel Test: GitHub + Python"
echo "=============================================="
echo ""
echo "📁 Files:"
echo "  [0] test_github.py"
echo "  [1] test_python.py"
echo ""

if [ "$EMAIL" = "your-email@example.com" ]; then
    echo "⚠️  Please edit this script first:"
    echo "   nano /home/imran/Projects/THEX/backend/quick-test.sh"
    echo "   Update EMAIL and PASSWORD at the top"
    echo ""
    exit 1
fi

echo "🔑 Authenticating as: $EMAIL"

LOGIN_RESPONSE=$(curl -s -X POST "$API_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"$EMAIL\", \"password\": \"$PASSWORD\"}")

TOKEN=$(echo "$LOGIN_RESPONSE" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('token', ''))" 2>/dev/null)

if [ -z "$TOKEN" ]; then
    echo "❌ Login failed: $LOGIN_RESPONSE"
    exit 1
fi

echo "✅ Authenticated"
echo ""
echo "📤 Starting parallel execution..."

RUN_RESPONSE=$(curl -s -X POST "$API_URL/api/test-suites/run" \
  -H "Authorization: Bearer $TOKEN" \
  -F "suite_name=Quick Test - $(date +%H:%M:%S)" \
  -F "browsers=chrome" \
  -F "testFiles=@$TEST_FILE_1" \
  -F "testFiles=@$TEST_FILE_2")

SUITE_ID=$(echo "$RUN_RESPONSE" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('suite_id', ''))" 2>/dev/null)

if [ -z "$SUITE_ID" ]; then
    echo "❌ Failed: $RUN_RESPONSE"
    exit 1
fi

echo "✅ Execution started!"
echo "Suite ID: $SUITE_ID"
echo ""
echo "=============================================="
echo "📊 Backend Logs (Live)"
echo "=============================================="
echo ""

sleep 2
docker logs testops-backend-api -f --tail 80 | grep --line-buffered -E \
  "Launching|Container.*for file|Waiting|completed|Querying|Fetched|Test Results from Database|Processing file|Match found|File results|Updating test suite|TEST SUITE UPDATED|suite_id.*$SUITE_ID" \
  --color=always
