#!/bin/bash

# Test Parallel Execution - Backend API Test
# This script tests the parallel test execution feature directly via API

echo "======================================"
echo "Testing Parallel Test Execution"
echo "======================================"
echo ""

# Configuration
API_URL="http://localhost:8080"
USERNAME="test_user"
EMAIL="test@example.com"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}Step 1: Creating test files${NC}"
echo "--------------------------------------"

# Create test file 1
cat > /tmp/test_login.py << 'EOF'
from selenium import webdriver
from selenium.webdriver.common.by import By
import time

def test_login():
    """Test login functionality"""
    driver = webdriver.Chrome()
    try:
        driver.get("https://example.com")
        time.sleep(2)
        print("Login test passed")
        assert True
    finally:
        driver.quit()
EOF

# Create test file 2
cat > /tmp/test_search.py << 'EOF'
from selenium import webdriver
from selenium.webdriver.common.by import By
import time

def test_search():
    """Test search functionality"""
    driver = webdriver.Chrome()
    try:
        driver.get("https://google.com")
        time.sleep(2)
        print("Search test passed")
        assert True
    finally:
        driver.quit()
EOF

# Create test file 3
cat > /tmp/test_checkout.py << 'EOF'
from selenium import webdriver
from selenium.webdriver.common.by import By
import time

def test_checkout():
    """Test checkout functionality"""
    driver = webdriver.Chrome()
    try:
        driver.get("https://example.com/checkout")
        time.sleep(2)
        print("Checkout test passed")
        assert True
    finally:
        driver.quit()
EOF

echo "Created 3 test files:"
echo " - /tmp/test_login.py"
echo " - /tmp/test_search.py"
echo " - /tmp/test_checkout.py"
echo ""

echo -e "${BLUE}Step 2: Authenticating with backend${NC}"
echo "--------------------------------------"

# Try to signup first
SIGNUP_RESPONSE=$(curl -s -X POST "$API_URL/api/users/signup" \
  -H "Content-Type: application/json" \
  -d "{
    \"username\": \"$USERNAME\",
    \"email\": \"$EMAIL\",
    \"password\": \"test123456\"
  }")

# Extract token from signup
TOKEN=$(echo "$SIGNUP_RESPONSE" | grep -o '"token":"[^"]*"' | sed 's/"token":"//;s/"//')

# If signup failed (user exists), try login
if [ -z "$TOKEN" ]; then
    echo "User exists, trying login..."
    LOGIN_RESPONSE=$(curl -s -X POST "$API_URL/api/auth/login" \
      -H "Content-Type: application/json" \
      -d "{
        \"email\": \"$EMAIL\",
        \"password\": \"test123456\"
      }")
    
    TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"token":"[^"]*"' | sed 's/"token":"//;s/"//')
fi

if [ -z "$TOKEN" ]; then
    echo "Failed to authenticate"
    echo "Signup Response: $SIGNUP_RESPONSE"
    echo "Login Response: $LOGIN_RESPONSE"
    echo ""
    echo "You can manually create a user and update this script with valid credentials."
    exit 1
fi

echo "Authenticated successfully"
echo "Token: ${TOKEN:0:20}..."
echo ""

echo -e "${BLUE}Step 3: Uploading test files to backend${NC}"
echo "--------------------------------------"

# Run the test suite with multiple files
RUN_RESPONSE=$(curl -s -X POST "$API_URL/api/test-suites/run" \
  -H "Authorization: Bearer $TOKEN" \
  -F "suite_name=Parallel Test Demo" \
  -F "browsers=chrome" \
  -F "testFiles=@/tmp/test_login.py" \
  -F "testFiles=@/tmp/test_search.py" \
  -F "testFiles=@/tmp/test_checkout.py")

echo "$RUN_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$RUN_RESPONSE"
echo ""

# Extract suite_id
SUITE_ID=$(echo "$RUN_RESPONSE" | grep -o '"suite_id":"[^"]*"' | sed 's/"suite_id":"//;s/"//')

if [ -z "$SUITE_ID" ]; then
    echo "Failed to get suite_id from response"
    exit 1
fi

echo -e "${GREEN} Test execution started!${NC}"
echo "Suite ID: $SUITE_ID"
echo ""

echo -e "${YELLOW}======================================"
echo "Watching Backend Logs..."
echo "======================================${NC}"
echo ""
echo "Press Ctrl+C to stop watching logs"
echo ""

# Watch logs
docker logs testops-backend-api -f --tail 50
