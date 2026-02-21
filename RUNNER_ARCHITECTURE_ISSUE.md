# 🚨 CRITICAL: Runner Architecture Issue

## ❌ **CURRENT PROBLEM**

Your runner is **auto-executing ALL tests** when you run `./start-runner.sh`. This is **NOT correct** behavior for a test automation platform.

---

## 🔍 **Why This Happens**

### **1. Runner Entry Point (runner/src/runner.py lines 442-462):**

```python
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Selenium Test Runner')
    # ... argument parsing ...
    
    runner = TestRunner(...)
    runner.run()  # ← IMMEDIATELY RUNS ALL TESTS!
```

### **2. The `run()` Method (lines 400-442):**

```python
def run(self):
    """Main execution method"""
    logger.info("🔍 Discovering tests...")
    test_files = self.discover_tests()  # ← Finds ALL test_*.py files
    
    # Execute all tests
    for test_file in test_files:  # ← Runs EVERY test found!
        result = self.execute_test(test_file)
        self.results.append(result)
    
    # ... generate report and exit ...
    sys.exit(0)  # ← EXITS after running all tests
```

### **3. Test Discovery (lines 92-117):**

```python
def discover_tests(self):
    """Discover all test scripts in testscripts directory"""
    # Otherwise discover all test files
    for file in self.test_dir.glob("*.py"):
        if file.name.startswith("test_"):  # ← Matches ALL test files!
            test_files.append(file)
    
    return test_files
```

### **4. Docker Compose Configuration (docker-compose.yml):**

```yaml
runner:
    build:
      context: ./runner
      dockerfile: Dockerfile
    container_name: testops-runner
    restart: "no"  # ← Runs ONCE and exits!
    # No command override, so Dockerfile CMD runs
```

---

## 📊 **Current Architecture (WRONG)**

```
User runs ./start-runner.sh
    ↓
Runner container starts
    ↓
runner.py executes __main__
    ↓
Discovers ALL test files:
  - test_python.py
  - test_github.py  
  - test_wikipedia.py
  - test_demoqa.py
  - test_example.py
  - test_fail_demo.py
    ↓
Runs ALL 6 tests immediately
    ↓
Exits with code 1 (tests failed)
    ↓
Container stops
```

**Problems:**
1. ❌ No user control over which tests run
2. ❌ No integration with frontend (user can't trigger tests)
3. ❌ No queue system (runs immediately on startup)
4. ❌ Runs ALL tests, not specific ones
5. ❌ Container exits after running (not a service)

---

## ✅ **Correct Architecture (WHAT YOU NEED)**

```
User creates test suite on Frontend
    ↓
Frontend → POST /api/test-suites
    Body: {
      "scripts": ["test_python.py"],
      "browsers": ["chrome"]
    }
    ↓
Backend saves suite to MongoDB (status="pending")
    ↓
Backend pushes job to Redis queue:
    {
      "suite_id": "12345",
      "script": "test_python.py",
      "browser": "chrome",
      "user": "user@example.com"
    }
    ↓
Runner (LONG-RUNNING SERVICE) polls Redis queue
    ↓
Runner picks up job from queue
    ↓
Runner executes ONLY test_python.py
    ↓
Runner uploads results to backend:
    - Screenshots → /api/artifacts/screenshots
    - Videos → /api/artifacts/videos
    - Logs → /api/artifacts/logs
    ↓
Backend updates MongoDB (status="completed")
    ↓
Frontend polls /api/test-suites/12345
    ↓
User sees results with screenshots/videos
```

---

## 🔧 **SOLUTION: Queue-Based Runner**

### **Option 1: Redis Queue (Recommended)**

#### **Step 1: Create new `queue_worker.py`**

```python
#!/usr/bin/env python3
"""
Queue-based test runner - Listens to Redis queue for test jobs
"""
import redis
import json
import time
from pathlib import Path
from runner import TestRunner
from logger import setup_logger

logger = setup_logger("queue_worker")

class QueueWorker:
    def __init__(self, redis_host="redis", redis_port=6379):
        self.redis_client = redis.Redis(
            host=redis_host, 
            port=redis_port, 
            decode_responses=True
        )
        logger.info("✅ Connected to Redis queue")
    
    def run(self):
        """Main worker loop - listens for jobs from Redis queue"""
        logger.info("🎧 Listening for test jobs...")
        
        while True:
            try:
                # Block and wait for job (BRPOP = Blocking Right Pop)
                result = self.redis_client.brpop("test_queue", timeout=5)
                
                if result:
                    queue_name, job_data = result
                    job = json.loads(job_data)
                    
                    logger.info(f"📥 Received job: {job}")
                    self.execute_job(job)
                    
            except Exception as e:
                logger.error(f"❌ Worker error: {e}")
                time.sleep(5)  # Wait before retrying
    
    def execute_job(self, job):
        """Execute a single test job"""
        suite_id = job.get("suite_id")
        script = job.get("script")
        email = job.get("email")
        browser = job.get("browser", "chrome")
        
        logger.info(f"🚀 Executing test: {script}")
        
        # Create runner instance for this job
        runner = TestRunner(
            email=email,
            test_id=suite_id,
            backend_url="http://backend:8080/api"
        )
        
        # Run ONLY the specific test file
        runner.specific_file = script
        runner.run()
        
        logger.info(f"✅ Job completed: {suite_id}")

if __name__ == "__main__":
    worker = QueueWorker()
    worker.run()
```

#### **Step 2: Update Dockerfile to run queue worker**

```dockerfile
# runner/Dockerfile
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY src/ ./src/
COPY testscripts/ ./testscripts/

# Create output directories
RUN mkdir -p /app/output/reports /app/output/screenshots /app/output/videos /app/logs

# Change CMD to run queue worker instead of runner.py
CMD ["python", "src/queue_worker.py"]
```

#### **Step 3: Update docker-compose.yml**

```yaml
runner:
    build:
      context: ./runner
      dockerfile: Dockerfile
    container_name: testops-runner
    environment:
      REDIS_HOST: "redis"
      REDIS_PORT: "6379"
    depends_on:
      - redis
      - selenium-chrome
    restart: unless-stopped  # ← Changed from "no" to keep running!
    networks:
      - testops-network
```

#### **Step 4: Add backend endpoint to enqueue jobs**

```go
// backend/internal/handlers/test_suite_handler.go

func (h *TestSuiteHandler) CreateTestSuite(w http.ResponseWriter, r *http.Request) {
    var suite models.TestSuite
    json.NewDecoder(r.Body).Decode(&suite)
    
    // Save to MongoDB
    suite.Status = "pending"
    suite.CreatedAt = time.Now()
    h.repo.Create(&suite)
    
    // Push job to Redis queue
    job := map[string]interface{}{
        "suite_id": suite.ID,
        "script":   suite.Script,
        "email":    suite.UserEmail,
        "browser":  suite.Browser,
    }
    
    jobJSON, _ := json.Marshal(job)
    h.redisClient.LPush(ctx, "test_queue", jobJSON)
    
    w.WriteHeader(http.StatusCreated)
    json.NewEncoder(w).Encode(suite)
}
```

---

### **Option 2: Backend Polling (Simpler, Less Scalable)**

Runner polls backend every 10 seconds for new jobs:

```python
# queue_worker.py (simpler version)
import requests
import time
from runner import TestRunner

def poll_for_jobs():
    while True:
        try:
            # Get pending test suites from backend
            response = requests.get("http://backend:8080/api/test-suites/pending")
            jobs = response.json()
            
            for job in jobs:
                execute_job(job)
                
            time.sleep(10)  # Poll every 10 seconds
            
        except Exception as e:
            print(f"Error: {e}")
            time.sleep(10)

def execute_job(job):
    runner = TestRunner(
        email=job["email"],
        test_id=job["suite_id"]
    )
    runner.specific_file = job["script"]
    runner.run()

if __name__ == "__main__":
    poll_for_jobs()
```

---

## 🎯 **Quick Fix for NOW (Temporary)**

If you want to **stop the auto-execution** right now:

### **Option A: Remove runner from docker-compose startup**

```bash
# Don't run ./start-runner.sh
# Only start database and backend:
cd database-microservice && ./start-db.sh
cd ../backend && ./start-backend.sh
cd ../Frontend && npm run dev
```

### **Option B: Comment out runner in docker-compose.yml**

```yaml
# runner:
#   build:
#     context: ./runner
#   ...
```

### **Option C: Run specific test manually**

```bash
cd runner
docker-compose run --rm runner python src/runner.py --file test_python.py
```

This runs ONLY `test_python.py`, not all tests.

---

## 📋 **Implementation Priority**

To fix this properly, implement in this order:

1. **✅ Stop auto-running tests** (use Option A above)
2. **🔧 Add Redis queue integration** (Option 1 from solutions)
3. **🔧 Create queue_worker.py** (listens for jobs)
4. **🔧 Add backend endpoint** to push jobs to queue
5. **🧪 Test end-to-end flow:**
   - User creates test suite → Backend enqueues job → Runner picks up → Results displayed

---

## 🎓 **Why You NEED This Architecture**

| Feature | Current (Bad) | With Queue (Good) |
|---------|--------------|-------------------|
| **User Control** | ❌ None | ✅ Full control |
| **Specific Tests** | ❌ Runs ALL | ✅ Runs selected |
| **Frontend Integration** | ❌ No integration | ✅ Full integration |
| **Scalability** | ❌ Can't scale | ✅ Multiple runners |
| **Job Tracking** | ❌ No tracking | ✅ Status tracking |
| **Long Running** | ❌ Exits after run | ✅ Always running |

---

## 🚨 **KEY TAKEAWAY**

Your runner is currently a **batch script** that runs all tests at once.  
It needs to be a **queue-based service** that runs tests on demand.

This is a **fundamental architecture change** required before the platform can work properly!
