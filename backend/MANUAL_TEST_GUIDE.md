# Manual Testing Guide - Parallel Execution

## Quick Automated Test

Run the automated test script:

```bash
cd /home/imran/Projects/THEX/backend
./test-parallel-execution.sh
```

This will:
1. Create 3 test files (test_login.py, test_search.py, test_checkout.py)
2. Authenticate with the backend
3. Upload and execute all files in parallel
4. Show backend logs in real-time

---

## Manual Step-by-Step Testing

If you want to test manually:

### 1. Create Test Files

```bash
# Create test file 1
cat > /tmp/test_file1.py << 'EOF'
from selenium import webdriver
import time

def test_example_1():
    driver = webdriver.Chrome()
    try:
        driver.get("https://example.com")
        time.sleep(2)
        assert True
    finally:
        driver.quit()
EOF

# Create test file 2
cat > /tmp/test_file2.py << 'EOF'
from selenium import webdriver
import time

def test_example_2():
    driver = webdriver.Chrome()
    try:
        driver.get("https://google.com")
        time.sleep(2)
        assert True
    finally:
        driver.quit()
EOF
```

### 2. Authenticate

```bash
# Login (replace email/password with your credentials)
curl -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "test123456"
  }' | python3 -m json.tool
```

Copy the token from the response.

### 3. Upload and Execute Tests

```bash
# Replace YOUR_TOKEN_HERE with the actual token
curl -X POST http://localhost:8080/api/test-suites/run \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -F "suite_name=My Parallel Test" \
  -F "browsers=chrome" \
  -F "testFiles=@/tmp/test_file1.py" \
  -F "testFiles=@/tmp/test_file2.py" | python3 -m json.tool
```

### 4. Watch Backend Logs

In a separate terminal:

```bash
docker logs testops-backend-api -f
```

Or to see just the parallel execution section:

```bash
docker logs testops-backend-api -f | grep -E "Container|Launching|Waiting|Database|Test suite updated"
```

### 5. Check Results

After ~30-60 seconds, check the database:

```bash
docker exec -it testops-mongo mongosh -u admin -p admin123 --authenticationDatabase admin testops --eval '
db.test_suites.find().sort({_id:-1}).limit(1).pretty()
'
```

---

## What to Look For in Logs

### ✅ Expected Output:

```
============================================
🚀 Launching 2 parallel test containers...
============================================
  [0] test_file1.py
  [1] test_file2.py
============================================

📋 Initialized 2 test file result trackers

[Container 0] Starting: runner_20260219_XXXXXX_0 for file: test_file1.py
[Container 1] Starting: runner_20260219_XXXXXX_1 for file: test_file2.py

============================================
⏳ Waiting for 2 test containers to complete...
============================================

[Container 0] ✅ Execution completed
[Container 1] ✅ Execution completed

============================================
✅ All test containers completed
============================================

🔍 Querying test_results collection for suite_id: 20260219_XXXXXX
📊 Fetched X test results from database

📋 Test Results from Database:
  [1] Test: test_example_1, Status: PASSED
  [2] Test: test_example_2, Status: PASSED

🔄 Processing per-file results...
  📁 Processing file [0]: test_file1.py
    ✓ Match found: test_example_1 (Status: PASSED)
    📊 File results: Passed=1, Failed=0
    Status: completed → passed

💾 Updating test suite in MongoDB...
  Suite ID: 20260219_XXXXXX
  Status: completed
  Total Tests: 2
  Passed: 2
  Failed: 0

============================================
✅ TEST SUITE UPDATED SUCCESSFULLY
   Suite ID: 20260219_XXXXXX
   Status: completed
   Tests: 2 | Passed: 2 | Failed: 0
============================================
```

### ❌ If Something Goes Wrong:

Look for these error patterns:
- `❌ Failed to fetch test results` - Database query failed
- `📊 Fetched 0 test results` - Python runner didn't insert results
- `Processing file [X]` with no matches - Test name mismatch
- `Failed to update test suite` - MongoDB update failed

---

## Quick Debug Commands

```bash
# Check running containers
docker ps -a | grep runner_

# Check latest test suite in database
docker exec -it testops-mongo mongosh -u admin -p admin123 --authenticationDatabase admin testops --eval 'db.test_suites.find().sort({_id:-1}).limit(1).pretty()'

# Check if test results were inserted
docker exec -it testops-mongo mongosh -u admin -p admin123 --authenticationDatabase admin testops --eval 'db.test_results.find().sort({_id:-1}).limit(5).pretty()'

# View backend logs (last 100 lines)
docker logs testops-backend-api --tail 100

# Follow backend logs live
docker logs testops-backend-api -f
```
