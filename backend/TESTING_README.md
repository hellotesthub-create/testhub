# 🧪 Testing Parallel Execution via Terminal

This guide shows you how to test the parallel execution feature directly from the terminal, bypassing the frontend.

## 🚀 Quick Start

### Option 1: Use the Simple Test Script (Recommended)

1. **Edit the script** with your credentials:
   ```bash
   nano simple-test.sh
   # Update EMAIL and PASSWORD with your actual login credentials
   ```

2. **Run the script:**
   ```bash
   ./simple-test.sh
   ```

This will:
- Create 3 test files
- Authenticate with your credentials
- Upload and execute all 3 files in parallel
- Show backend logs in real-time

---

### Option 2: Manual curl Commands

#### Step 1: Login and Get Token

```bash
# Replace with your actual email and password
curl -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "your-email@example.com", "password": "your-password"}' \
  | python3 -m json.tool
```

**Copy the token** from the response (you'll need it for next step).

#### Step 2: Create Test Files

```bash
# Create test file 1
cat > /tmp/test_1.py << 'EOF'
from selenium import webdriver
import time

def test_one():
    driver = webdriver.Chrome()
    try:
        driver.get("https://example.com")
        time.sleep(1)
        assert True
    finally:
        driver.quit()
EOF

# Create test file 2
cat > /tmp/test_2.py << 'EOF'
from selenium import webdriver
import time

def test_two():
    driver = webdriver.Chrome()
    try:
        driver.get("https://google.com")
        time.sleep(1)
        assert True
    finally:
        driver.quit()
EOF
```

#### Step 3: Upload and Execute

```bash
# Replace YOUR_TOKEN_HERE with the token from step 1
curl -X POST http://localhost:8080/api/test-suites/run \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -F "suite_name=My Test Suite" \
  -F "browsers=chrome" \
  -F "testFiles=@/tmp/test_1.py" \
  -F "testFiles=@/tmp/test_2.py" \
  | python3 -m json.tool
```

**Copy the suite_id** from the response.

#### Step 4: Watch Logs

```bash
# Watch all logs
docker logs testops-backend-api -f

# OR use our filtered log viewer
./watch-logs.sh
```

---

## 📊 What to Look For in Logs

### ✅ Successful Parallel Execution:

```
============================================
🚀 Launching 2 parallel test containers...
============================================
  [0] test_1.py
  [1] test_2.py
============================================

📋 Initialized 2 test file result trackers

[Container 0] Starting: runner_20260219_XXXXXX_0 for file: test_1.py
[Container 0] Command: docker run --name runner_20260219_XXXXXX_0 ... --file test_1.py
[Container 1] Starting: runner_20260219_XXXXXX_1 for file: test_2.py
[Container 1] Command: docker run --name runner_20260219_XXXXXX_1 ... --file test_2.py

============================================
⏳ Waiting for 2 test containers to complete...
============================================

[Container 0] ✅ Execution completed
[Container 1] ✅ Execution completed

============================================
✅ All test containers completed
============================================

🔍 Querying test_results collection for suite_id: 20260219_XXXXXX
📊 Fetched 2 test results from database

📋 Test Results from Database:
  [1] Test: test_one, Status: PASSED
  [2] Test: test_two, Status: PASSED
📊 Total aggregation: Tests=2, Passed=2, Failed=0

🔄 Processing per-file results...

  📁 Processing file [0]: test_1.py
    Matching against: 'test_1.py' OR 'test_1'
    ✓ Match found: test_one (Status: PASSED)
    📊 File results: Passed=1, Failed=0
    Status: completed → passed

  📁 Processing file [1]: test_2.py
    Matching against: 'test_2.py' OR 'test_2'
    ✓ Match found: test_two (Status: PASSED)
    📊 File results: Passed=1, Failed=0
    Status: completed → passed

✅ Per-file processing complete

💾 Updating test suite in MongoDB...
  Suite ID: 20260219_XXXXXX
  Status: completed
  Total Tests: 2
  Passed: 2
  Failed: 0
  Success Rate: 100.00%
  Test File Results Count: 2

============================================
✅ TEST SUITE UPDATED SUCCESSFULLY
   Suite ID: 20260219_XXXXXX
   Status: completed
   Tests: 2 | Passed: 2 | Failed: 0
============================================
```

### ❌ Common Issues to Look For:

1. **No test results fetched:**
   ```
   📊 Fetched 0 test results from database
   ```
   → Python runner didn't insert results into database

2. **No matches found:**
   ```
   📁 Processing file [0]: test_1.py
   Matching against: 'test_1.py' OR 'test_1'
   📊 File results: Passed=0, Failed=0
   ```
   → Test name mismatch (Python test name doesn't match filename)

3. **Database update failed:**
   ```
   ❌ Failed to update test suite: <error>
   ```
   → MongoDB connection or permission issue

---

## 🔍 Debug Commands

### Check Running Containers
```bash
docker ps -a | grep runner_
```

### Check Latest Test Suite in Database
```bash
docker exec -it testops-mongo mongosh -u admin -p admin123 \
  --authenticationDatabase admin testops \
  --eval 'db.test_suites.find().sort({_id:-1}).limit(1).pretty()'
```

### Check Test Results
```bash
docker exec -it testops-mongo mongosh -u admin -p admin123 \
  --authenticationDatabase admin testops \
  --eval 'db.test_results.find().sort({_id:-1}).limit(5).pretty()'
```

### View Full Backend Logs
```bash
# Last 100 lines
docker logs testops-backend-api --tail 100

# Follow live
docker logs testops-backend-api -f

# Filtered for parallel execution
./watch-logs.sh
```

---

## 📝 Available Scripts

| Script | Purpose |
|--------|---------|
| `simple-test.sh` | Complete test with your credentials |
| `watch-logs.sh` | Watch filtered backend logs |
| `test-parallel-execution.sh` | Full automated test (may need config) |

---

## 🎯 Next Steps

Once you see this working correctly in the terminal:

1. **Verify the logs show:**
   - ✅ Multiple containers launching
   - ✅ Tests being fetched from database
   - ✅ Per-file results being calculated
   - ✅ Database being updated

2. **Then test from frontend:**
   - Upload multiple files via UI
   - Check if results appear correctly
   - Verify per-file cards show proper counts

3. **If terminal works but frontend doesn't:**
   - Issue is in frontend API calls or result display
   - Check Network tab in browser DevTools
   - Verify API response format matches frontend expectations
