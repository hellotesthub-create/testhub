# 📂 Runner Folder - Complete Structure

```
runner/
│
├── 📄 Dockerfile                          # Docker image definition (Python + Chrome + ChromeDriver)
├── 📄 requirements.txt                    # Python dependencies (selenium, redis, requests)
├── 📄 README.md                          # Comprehensive documentation
├── 📄 QUICKSTART.md                      # Quick start guide
├── 📄 STRUCTURE.md                       # This file - structure overview
│
├── 🔧 Shell Scripts (Executable)
│   ├── setup-and-test.sh                # Complete setup + demo test run
│   ├── start-runner.sh                  # Build & run tests
│   ├── stop-runner.sh                   # Stop runner container
│   ├── logs-runner.sh                   # View execution logs
│   └── view-report.sh                   # Open latest HTML report
│
├── 📁 src/                               # Source code directory
│   ├── runner.py                        # Main test execution engine
│   │                                    # - Discovers tests
│   │                                    # - Executes run_test() functions
│   │                                    # - Generates reports
│   │                                    # - Captures screenshots
│   │
│   ├── browser_manager.py               # Browser initialization & management
│   │                                    # - Chrome/Firefox setup
│   │                                    # - Headless configuration
│   │                                    # - Browser lifecycle
│   │
│   ├── screenshot.py                    # Screenshot capture utilities
│   │                                    # - Success screenshots
│   │                                    # - Failure screenshots
│   │                                    # - Step screenshots
│   │
│   └── logger.py                        # Logging configuration
│                                        # - Rotating file handler
│                                        # - Console output
│                                        # - Timestamped logs
│
├── 📁 testscripts/                      # Test scripts directory
│   ├── test_example.py                  # ✅ Basic page load test (example.com)
│   ├── test_github.py                   # ✅ GitHub navigation test
│   ├── test_wikipedia.py                # ✅ Wikipedia search test
│   ├── sample_script.py                 # ✅ Google search test
│   └── test_fail_demo.py                # ❌ Intentional failure demo
│
├── 📁 output/                           # Test execution output
│   ├── 📁 reports/                      # Generated reports
│   │   ├── test_report_YYYYMMDD_HHMMSS.html  # HTML report
│   │   └── test_report_YYYYMMDD_HHMMSS.json  # JSON report
│   │
│   ├── 📁 screenshots/                  # Test screenshots
│   │   ├── test_name_success_TIMESTAMP.png   # Success screenshots
│   │   ├── test_name_failure_TIMESTAMP.png   # Failure screenshots
│   │   └── .gitkeep
│   │
│   └── 📁 videos/                       # (Reserved for future video recording)
│       └── .gitkeep
│
└── 📁 logs/                             # Execution logs
    ├── runner.log                       # Main execution log (rotating)
    └── .gitkeep

```

---

## 📋 File Descriptions

### 🐳 Docker Configuration

**`Dockerfile`**
- Base: `python:3.11-slim`
- Installs: Chrome, ChromeDriver, Xvfb
- Sets up: Virtual display, Python environment
- Purpose: Isolated, reproducible test environment

**`requirements.txt`**
```
selenium==4.16.0
redis==5.0.1
requests==2.31.0
python-dotenv==1.0.0
```

---

### 🔧 Shell Scripts

| Script | Purpose | Usage |
|--------|---------|-------|
| `setup-and-test.sh` | First-time setup + demo | `./setup-and-test.sh` |
| `start-runner.sh` | Run all tests | `./start-runner.sh` |
| `stop-runner.sh` | Stop container | `./stop-runner.sh` |
| `logs-runner.sh` | View logs | `./logs-runner.sh` |
| `view-report.sh` | Open HTML report | `./view-report.sh` |

---

### 📦 Source Code (`src/`)

#### **`runner.py`** (Main Engine)
- **Class**: `TestRunner`
- **Methods**:
  - `discover_tests()` - Find test files
  - `load_test_module()` - Import test dynamically
  - `execute_test()` - Run single test
  - `generate_report()` - Create HTML/JSON reports
  - `run()` - Main execution loop

- **Workflow**:
  ```
  1. Discover test files (test_*.py or *_test.py)
  2. For each test:
     a. Initialize browser
     b. Load test module
     c. Execute run_test(driver)
     d. Capture screenshot
     e. Record result
     f. Clean up browser
  3. Generate reports
  4. Exit with status code
  ```

#### **`browser_manager.py`**
- **Class**: `BrowserManager`
- **Supports**: Chrome, Firefox
- **Configuration**:
  - Headless mode
  - No-sandbox (Docker)
  - Disable dev-shm-usage
  - Window size: 1920x1080

#### **`screenshot.py`**
- **Class**: `Screenshot`
- **Methods**:
  - `capture()` - Generic screenshot
  - `capture_success()` - Success screenshot
  - `capture_failure()` - Failure screenshot
  - `capture_step()` - Step screenshot
- **Format**: PNG
- **Naming**: `{test_id}_{type}_{timestamp}.png`

#### **`logger.py`**
- **Function**: `setup_logger()`
- **Features**:
  - Rotating file handler (10MB max, 5 backups)
  - Console + file output
  - Timestamped entries
  - Configurable log levels

---

### 🧪 Test Scripts (`testscripts/`)

#### Test Requirements:
1. **Filename**: Must start with `test_` or end with `_test.py`
2. **Function**: Must have `run_test(driver)` function
3. **Return**: `True` (pass) or `False` (fail)

#### Current Tests:

| Test File | Target | Actions | Expected |
|-----------|--------|---------|----------|
| `test_example.py` | example.com | Load, verify title, check elements | ✅ PASS |
| `test_github.py` | github.com | Load, navigate, scroll | ✅ PASS |
| `test_wikipedia.py` | wikipedia.org | Search, verify article | ✅ PASS |
| `sample_script.py` | google.com | Search, verify results | ✅ PASS |
| `test_fail_demo.py` | example.com | Intentional assertion failure | ❌ FAIL |

---

### 📊 Output (`output/`)

#### **Reports** (`output/reports/`)
- **HTML Report**:
  - Visual, color-coded results
  - Summary cards (total, passed, failed, success rate)
  - Individual test details
  - Error messages
  - Links to screenshots

- **JSON Report**:
  - Machine-readable format
  - CI/CD integration ready
  - Contains all test metadata

#### **Screenshots** (`output/screenshots/`)
- Captured automatically after each test
- Helps debug failures visually
- Named with test name and timestamp

#### **Videos** (`output/videos/`)
- Reserved for future implementation
- Will record test execution videos

---

### 📝 Logs (`logs/`)

**`runner.log`**
- Detailed execution logs
- Rotation: 10MB per file, 5 backups
- Format: `YYYY-MM-DD HH:MM:SS - LEVEL - Message`
- Contains:
  - Test discovery
  - Browser initialization
  - Test execution steps
  - Errors and stack traces
  - Screenshot captures
  - Report generation

---

## 🔄 Execution Flow

```
1. User runs: ./start-runner.sh
   ↓
2. Docker builds image (if needed)
   ↓
3. Container starts with Xvfb
   ↓
4. runner.py executes
   ↓
5. Discovers tests in testscripts/
   ↓
6. For each test:
   - Initialize Chrome browser
   - Run test_*.py → run_test(driver)
   - Capture screenshot
   - Log results
   - Close browser
   ↓
7. Generate HTML & JSON reports
   ↓
8. Save to output/reports/
   ↓
9. Container exits
   ↓
10. User views report: ./view-report.sh
```

---

## 🎯 Key Features

✅ **Automated Test Discovery** - No manual registration  
✅ **Beautiful Reports** - HTML with visual feedback  
✅ **Screenshot Capture** - Automatic on pass/fail  
✅ **Detailed Logging** - Full execution trace  
✅ **Docker Isolated** - Consistent environment  
✅ **Easy to Extend** - Just add test files  
✅ **No Backend Needed** - Runs standalone  

---

## 🔗 Integration Points

### Current: Standalone
- ✅ Tests run independently
- ✅ No external dependencies
- ✅ Self-contained reports

### Future Integration:
- 🔜 Backend API (upload results)
- 🔜 Redis Queue (job consumption)
- 🔜 Frontend Dashboard (view results)
- 🔜 Gateway (serve reports/screenshots)

---

## 📚 Related Files Outside Runner

- `/docker-compose.yml` - Runner service definition
- `/gateway/nginx.conf` - Has routes for `/screenshots/`, `/videos/`
- Backend - Not currently integrated
- Frontend - Not currently integrated

---

## ✅ Status

**✅ Fully Functional** - Ready to run tests  
**✅ Independent** - No backend/frontend needed  
**✅ Documented** - README + QUICKSTART guides  
**✅ Tested** - 5 demo tests included  

---

**Last Updated**: December 9, 2025  
**Version**: 1.0 - Standalone Selenium Runner
