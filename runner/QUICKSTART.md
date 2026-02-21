# 🚀 SELENIUM RUNNER - QUICK START GUIDE

## ✨ What You Have Now

A fully functional **Selenium Test Automation Runner** that:
- ✅ Runs in Docker (isolated, reproducible)
- ✅ Uses headless Chrome browser
- ✅ Executes Python test scripts automatically
- ✅ Generates beautiful HTML reports
- ✅ Captures screenshots
- ✅ Shows pass/fail status clearly

## 📋 Prerequisites

- Docker installed and running
- docker-compose installed

## 🎯 First Time Setup & Demo

**Option 1: Automated Setup (Recommended)**
```bash
cd /home/imran/Projects/THEX/runner
./setup-and-test.sh
```

This will:
1. Check prerequisites
2. Build the Docker image
3. Run all demo tests
4. Show you the results

**Option 2: Manual Setup**
```bash
cd /home/imran/Projects/THEX
docker-compose build runner
docker-compose up runner
```

## 🎮 Daily Usage

### Run All Tests
```bash
cd /home/imran/Projects/THEX/runner
./start-runner.sh
```

### View Latest Report
```bash
cd /home/imran/Projects/THEX/runner
./view-report.sh
```

### Watch Logs
```bash
cd /home/imran/Projects/THEX/runner
./logs-runner.sh
```

### Stop Runner
```bash
cd /home/imran/Projects/THEX/runner
./stop-runner.sh
```

## 📂 Where to Find Results

After running tests, check these locations:

```
runner/
├── output/
│   ├── reports/              # 📊 HTML & JSON reports here
│   │   └── test_report_YYYYMMDD_HHMMSS.html
│   └── screenshots/          # 📸 Screenshots here
│       └── test_name_success_TIMESTAMP.png
└── logs/
    └── runner.log           # 📝 Detailed logs here
```

## 🧪 Demo Tests Included

You have 5 demo tests ready to run:

| Test | Website | Expected Result |
|------|---------|----------------|
| `test_example.py` | example.com | ✅ PASS |
| `test_github.py` | github.com | ✅ PASS |
| `test_wikipedia.py` | wikipedia.org | ✅ PASS |
| `sample_script.py` | google.com | ✅ PASS |
| `test_fail_demo.py` | example.com | ❌ FAIL (intentional) |

## ✍️ Adding Your Own Tests

### Step 1: Create Test File
Create a new file in `runner/testscripts/` directory:

```bash
cd /home/imran/Projects/THEX/runner/testscripts
nano test_mywebsite.py
```

### Step 2: Write Test Code
```python
#!/usr/bin/env python3
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

def run_test(driver):
    """Test your website"""
    try:
        # Navigate to your website
        driver.get("https://your-website.com")
        
        # Wait for an element to load
        WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.ID, "some-element"))
        )
        
        # Add your test logic
        assert "Expected Text" in driver.title
        
        print("✅ Test passed!")
        return True
        
    except Exception as e:
        print(f"❌ Test failed: {e}")
        return False
```

### Step 3: Run Your Test
```bash
cd /home/imran/Projects/THEX/runner
./start-runner.sh
```

Your test will be automatically discovered and executed!

## 🎨 Understanding the Output

### Console Output
```
🚀 RUNNING TEST: test_example.py
✅ Browser initialized successfully
▶️  Executing test function...
✅ TEST PASSED
⏱️  Duration: 3.45 seconds
```

### HTML Report
- **Green cards** = Tests passed ✅
- **Red cards** = Tests failed ❌
- Shows duration, error messages, screenshots

### Screenshots
- Automatically captured after each test
- Named with test name and timestamp
- Helps debug failures visually

## 🔍 Common Selenium Commands

```python
# Navigate
driver.get("https://website.com")

# Find elements
element = driver.find_element(By.ID, "element-id")
element = driver.find_element(By.NAME, "element-name")
element = driver.find_element(By.CLASS_NAME, "class-name")
element = driver.find_element(By.CSS_SELECTOR, ".my-class")
element = driver.find_element(By.XPATH, "//div[@id='myid']")

# Interact with elements
element.click()
element.send_keys("text to type")
element.submit()

# Wait for elements
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

WebDriverWait(driver, 10).until(
    EC.presence_of_element_located((By.ID, "element-id"))
)

# Get information
title = driver.title
url = driver.current_url
text = element.text

# Assertions
assert "Expected" in driver.title
assert element.is_displayed()
```

## 🛠️ Troubleshooting

### "Docker is not running"
```bash
sudo systemctl start docker
```

### "Tests not discovered"
Make sure your test file:
- Starts with `test_` OR ends with `_test.py`
- Has a `run_test(driver)` function
- Is in the `runner/testscripts/` directory

### "Chrome/ChromeDriver version mismatch"
Rebuild the Docker image:
```bash
cd /home/imran/Projects/THEX
docker-compose build runner --no-cache
```

### "Cannot find element"
Increase wait time:
```python
WebDriverWait(driver, 20).until(  # Wait 20 seconds instead of 10
    EC.presence_of_element_located((By.ID, "element-id"))
)
```

## 📊 Viewing Reports in Browser

### Method 1: Using the script
```bash
cd /home/imran/Projects/THEX/runner
./view-report.sh
```

### Method 2: Manual
```bash
# Find latest report
ls -lt runner/output/reports/*.html | head -1

# Open in Firefox
firefox runner/output/reports/test_report_*.html
```

### Method 3: Through Gateway (if running)
If your nginx gateway is running:
```
http://localhost/screenshots/
```

## 🎯 Next Steps

1. **Try the demo**: `./setup-and-test.sh`
2. **Review reports**: `./view-report.sh`
3. **Add your tests**: Edit files in `testscripts/`
4. **Run again**: `./start-runner.sh`

## 📚 More Information

- **Detailed docs**: `runner/README.md`
- **Implementation details**: `SELENIUM_RUNNER_IMPLEMENTATION.md`
- **Selenium docs**: https://selenium-python.readthedocs.io/

## 💡 Tips

- Tests run sequentially (one after another)
- Each test gets a fresh browser instance
- Screenshots are captured automatically
- Logs show detailed execution info
- Reports are timestamped (won't overwrite)

## ✅ Checklist for Success

- [ ] Docker is running
- [ ] In the runner directory
- [ ] Executed `./setup-and-test.sh` or `./start-runner.sh`
- [ ] Checked output/reports/ for HTML report
- [ ] Checked output/screenshots/ for images
- [ ] Read the README.md for more details

---

## 🎉 You're All Set!

The Selenium runner is ready to use. Start with the demo tests, then add your own!

**Quick command to get started:**
```bash
cd /home/imran/Projects/THEX/runner && ./setup-and-test.sh
```

Happy Testing! 🧪✨
