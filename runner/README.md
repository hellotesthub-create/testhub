# 🧪 Selenium Test Runner

A Docker-based Selenium test automation runner that executes Python test scripts and generates detailed reports.

## 📋 Overview

This runner executes Selenium WebDriver tests in a containerized Chrome browser environment. It automatically discovers test scripts, executes them, captures screenshots, and generates HTML/JSON reports.

## 🚀 Quick Start

### Run Tests

```bash
cd runner
./start-runner.sh
```

This will:
1. Build the Docker image with Chrome and ChromeDriver
2. Execute all test scripts in `testscripts/` folder
3. Generate reports and screenshots
4. Display results in console

### View Results

```bash
# View the latest HTML report
./view-report.sh

# View logs
./logs-runner.sh

# Stop runner (if needed)
./stop-runner.sh
```

## 📁 Project Structure

```
runner/
├── Dockerfile                  # Docker image with Chrome + Selenium
├── requirements.txt            # Python dependencies
├── src/
│   ├── runner.py              # Main test execution engine
│   ├── browser_manager.py     # Browser initialization
│   ├── screenshot.py          # Screenshot capture utilities
│   └── logger.py              # Logging configuration
├── testscripts/               # Test scripts directory
│   ├── test_example.py        # Example test (PASSES)
│   ├── test_wikipedia.py      # Wikipedia search test (PASSES)
│   ├── test_github.py         # GitHub navigation test (PASSES)
│   ├── test_fail_demo.py      # Intentional failure demo (FAILS)
│   └── sample_script.py       # Google search test (PASSES)
├── output/
│   ├── reports/               # HTML & JSON test reports
│   └── screenshots/           # Test screenshots
├── logs/
│   └── runner.log             # Execution logs
└── *.sh                       # Helper scripts
```

## ✍️ Writing Test Scripts

Test scripts should:
1. Have filename starting with `test_` or ending with `_test.py`
2. Implement a `run_test(driver)` function
3. Return `True` for pass, `False` for fail

### Example Test Script

```python
#!/usr/bin/env python3
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

def run_test(driver):
    """
    Test: Example Website
    """
    try:
        # Navigate to website
        driver.get("https://www.example.com")
        
        # Wait for element
        WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.TAG_NAME, "h1"))
        )
        
        # Assertions
        assert "Example" in driver.title
        
        print("✅ Test passed!")
        return True
        
    except Exception as e:
        print(f"❌ Test failed: {e}")
        return False
```

## 📊 Output & Reports

### HTML Report
- Located in: `output/reports/test_report_YYYYMMDD_HHMMSS.html`
- Contains: Test summary, pass/fail status, duration, error messages
- Features: Color-coded results, responsive design

### JSON Report
- Located in: `output/reports/test_report_YYYYMMDD_HHMMSS.json`
- Contains: Machine-readable test results
- Useful for: CI/CD integration, further processing

### Screenshots
- Location: `output/screenshots/`
- Captured: On test completion (both pass and fail)
- Naming: `{test_name}_{success|failure}_{timestamp}.png`

### Logs
- Location: `logs/runner.log`
- Contains: Detailed execution logs with timestamps
- Rotation: 10MB max per file, 5 backup files

## 🐳 Docker Configuration

The runner uses a custom Docker image with:
- **Base**: Python 3.11 slim
- **Browser**: Google Chrome Stable
- **Driver**: ChromeDriver (matching Chrome version)
- **Display**: Xvfb virtual display (:99)
- **Resources**: 2GB shared memory for Chrome

### Environment Variables

```yaml
PYTHONUNBUFFERED=1    # Real-time Python output
DISPLAY=:99           # Virtual display for Chrome
```

## 🔧 Manual Usage

### Run specific test

```bash
docker-compose run --rm runner python src/runner.py
```

### Run with custom test directory

```bash
docker-compose run --rm -v ./my-tests:/app/testscripts runner
```

### Interactive shell in container

```bash
docker-compose run --rm runner /bin/bash
```

## 📝 Available Test Scripts

| Script | Description | Expected Result |
|--------|-------------|-----------------|
| `test_example.py` | Basic page load test | ✅ PASS |
| `test_wikipedia.py` | Search and navigation | ✅ PASS |
| `test_github.py` | GitHub homepage test | ✅ PASS |
| `sample_script.py` | Google search test | ✅ PASS |
| `test_fail_demo.py` | Intentional failure | ❌ FAIL |

## 🛠️ Utilities

### Browser Manager (`browser_manager.py`)
- Initializes Chrome with headless mode
- Configures browser options (no-sandbox, disable-dev-shm-usage)
- Manages browser lifecycle

### Screenshot Handler (`screenshot.py`)
- Captures screenshots at key moments
- Organizes screenshots by test name and timestamp
- Supports success/failure/step screenshots

### Logger (`logger.py`)
- Configures rotating file logger
- Console and file output
- Timestamps and log levels

## 🔍 Troubleshooting

### Tests not discovered
- Ensure test files start with `test_` or end with `_test.py`
- Check that files are in the `testscripts/` directory
- Verify files have `run_test(driver)` function

### Chrome/ChromeDriver issues
- Rebuild the Docker image: `docker-compose build runner`
- Check Chrome version: `docker-compose run runner google-chrome --version`
- Check ChromeDriver: `docker-compose run runner chromedriver --version`

### Display errors
- Xvfb automatically starts in the container
- Uses virtual display :99
- No changes needed for headless operation

### Memory issues
- Increase shared memory: Edit `docker-compose.yml` -> `shm_size: '4gb'`
- Reduce parallel test execution

## 📚 Additional Resources

- [Selenium Documentation](https://www.selenium.dev/documentation/)
- [Chrome DevTools Protocol](https://chromedevtools.github.io/devtools-protocol/)
- [WebDriver W3C Specification](https://www.w3.org/TR/webdriver/)

## 🎯 Next Steps

1. **Add More Tests**: Create test scripts for your application
2. **CI/CD Integration**: Use JSON reports in your pipeline
3. **Parallel Execution**: Implement pytest-xdist for parallel runs
4. **Backend Integration**: Connect to backend API (currently standalone)
5. **Video Recording**: Add video capture for failed tests

## 📄 License

Part of the THEX project - Test Automation Platform

---

**Happy Testing! 🧪✨**
