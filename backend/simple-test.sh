#!/bin/bash

# Simple Test Script - Parallel Execution
# Update EMAIL and PASSWORD with your actual credentials from the frontend

echo "======================================"
echo "Parallel Execution Test"
echo "======================================"
echo ""

#  UPDATE THESE WITH YOUR ACTUAL CREDENTIALS
EMAIL="your-email@example.com"
PASSWORD="your-password"

# You can change this if needed
API_URL="http://localhost:8080"

echo "Using credentials:"
echo "Email: $EMAIL"
echo "Password: ******"
echo ""

# Ask user to confirm or provide credentials
read -p "Update EMAIL and PASSWORD in this script first, then press Enter to continue (or Ctrl+C to exit)..."

echo ""
echo "Step 1: Creating test files..."
echo "--------------------------------------"

# Create 3 simple test files
cat > /tmp/test_file_1.py << 'EOF'
from selenium import webdriver
import time

def test_example_1():
    """Test file 1"""
    driver = webdriver.Chrome()
    try:
        driver.get("https://example.com")
        time.sleep(1)
        print("Test 1 completed")
        assert True
    finally:
        driver.quit()
EOF

cat > /tmp/test_file_2.py << 'EOF'
from selenium import webdriver
import time

def test_example_2():
    """Test file 2"""
    driver = webdriver.Chrome()
    try:
        driver.get("https://google.com")
        time.sleep(1)
        print("Test 2 completed")
        assert True
    finally:
        driver.quit()
EOF

cat > /tmp/test_file_3.py << 'EOF'
from selenium import webdriver
import time

def test_example_3():
    """Test file 3"""
    driver = webdriver.Chrome()
    try:
        driver.get("https://github.com")
        time.sleep(1)
        print("Test 3 completed")
        assert True
    finally:
        driver.quit()
EOF

echo "Created 3 test files in /tmp/"
echo ""

echo "Step 2: Authenticating..."
echo "--------------------------------------"

LOGIN_RESPONSE=$(curl -s -X POST "$API_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"$EMAIL\", \"password\": \"$PASSWORD\"}")

TOKEN=$(echo "$LOGIN_RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin).get('token', ''))" 2>/dev/null)

if [ -z "$TOKEN" ]; then
    echo "Authentication failed"
    echo "Response: $LOGIN_RESPONSE"
    echo ""
    echo "Please update EMAIL and PASSWORD in this script with your actual credentials."
    echo "You can find your credentials from the frontend login."
    exit 1
fi

echo "Authenticated"
echo ""

echo "Step 3: Uploading and executing tests..."
echo "--------------------------------------"

RUN_RESPONSE=$(curl -s -X POST "$API_URL/api/test-suites/run" \
  -H "Authorization: Bearer $TOKEN" \
  -F "suite_name=Terminal Test - 3 Files" \
  -F "browsers=chrome" \
  -F "testFiles=@/tmp/test_file_1.py" \
  -F "testFiles=@/tmp/test_file_2.py" \
  -F "testFiles=@/tmp/test_file_3.py")

echo "$RUN_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$RUN_RESPONSE"
echo ""

SUITE_ID=$(echo "$RUN_RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin).get('suite_id', ''))" 2>/dev/null)

if [ -z "$SUITE_ID" ]; then
    echo "Failed to start test execution"
    exit 1
fi

echo "======================================"
echo "Test Execution Started!"
echo "======================================"
echo "Suite ID: $SUITE_ID"
echo ""
echo "Now watching backend logs..."
echo "Press Ctrl+C to stop"
echo ""
sleep 2

docker logs testops-backend-api -f --tail 100
