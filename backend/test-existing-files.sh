#!/bin/bash

# Test Parallel Execution with Actual Project Test Files
# Uses: test_github.py and test_python.py

API_URL="http://localhost:8080"

# Test file paths
TEST_FILE_1="/home/imran/Projects/THEX/runner/testscripts/test_github.py"
TEST_FILE_2="/home/imran/Projects/THEX/runner/testscripts/test_python.py"

echo "=============================================="
echo "Parallel Execution Test"
echo "=============================================="
echo ""
echo "Test Files:"
echo "1. test_github.py"
echo "2. test_python.py"
echo ""

# Get credentials from user
read -p "Enter your email: " EMAIL
read -sp "Enter your password: " PASSWORD
echo ""
echo ""

echo "Authenticating..."
echo "--------------------------------------"

LOGIN_RESPONSE=$(curl -s -X POST "$API_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"$EMAIL\", \"password\": \"$PASSWORD\"}")

TOKEN=$(echo "$LOGIN_RESPONSE" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('token', ''))" 2>/dev/null)

if [ -z "$TOKEN" ]; then
    echo "Authentication failed"
    echo "Response: $LOGIN_RESPONSE"
    exit 1
fi

echo "Authenticated successfully"
echo ""

echo "Uploading and executing tests..."
echo "--------------------------------------"

RUN_RESPONSE=$(curl -s -X POST "$API_URL/api/test-suites/run" \
  -H "Authorization: Bearer $TOKEN" \
  -F "suite_name=Parallel Test - GitHub & Python" \
  -F "browsers=chrome" \
  -F "testFiles=@$TEST_FILE_1" \
  -F "testFiles=@$TEST_FILE_2")

echo "$RUN_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$RUN_RESPONSE"
echo ""

SUITE_ID=$(echo "$RUN_RESPONSE" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('suite_id', ''))" 2>/dev/null)

if [ -z "$SUITE_ID" ]; then
    echo "Failed to start test execution"
    exit 1
fi

echo "=============================================="
echo "Test Execution Started!"
echo "=============================================="
echo "Suite ID: $SUITE_ID"
echo ""
echo "Now watching backend logs..."
echo "Press Ctrl+C to stop"
echo ""
echo "Look for:"
echo " • Launching 2 parallel test containers"
echo " • [Container 0] test_github.py"
echo " • [Container 1] test_python.py"
echo " • All test containers completed"
echo " • Test results from database"
echo " • MongoDB update"
echo ""
sleep 3

docker logs testops-backend-api -f --tail 100
