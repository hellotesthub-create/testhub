#!/usr/bin/env python3
"""
Swag Labs Login Test - Verifies login functionality
Uses humanized typing and step-by-step screenshots.
"""

from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
import time
import random
import os
from datetime import datetime


def human_type(element, text):
    """Type text character-by-character with random human-like delays."""
    for char in text:
        element.send_keys(char)
        time.sleep(random.uniform(0.05, 0.15))  # 50-150ms per keystroke
    time.sleep(random.uniform(0.2, 0.4))  # Small pause after finishing


def small_pause():
    """Small human-like pause (0.3–0.6s) — between clicks."""
    time.sleep(random.uniform(0.3, 0.6))


def medium_pause():
    """Medium human-like pause (0.8–1.5s) — after page action."""
    time.sleep(random.uniform(0.8, 1.5))


def long_pause():
    """Long human-like pause (1.5–2.5s) — after page load."""
    time.sleep(random.uniform(1.5, 2.5))


_step_counter = 0

def capture_step(driver, step_name):
    """Capture a screenshot for a specific test step."""
    global _step_counter
    _step_counter += 1
    screenshots_dir = os.environ.get("SCREENSHOTS_DIR", "/app/output/screenshots")
    os.makedirs(screenshots_dir, exist_ok=True)
    sanitized = step_name.replace(" ", "_").lower()
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"test_swagLabs_step{_step_counter:02d}_{sanitized}_{timestamp}.png"
    filepath = os.path.join(screenshots_dir, filename)
    try:
        driver.save_screenshot(filepath)
        print(f"📸 Step screenshot saved: {filename}")
    except Exception as e:
        print(f"⚠️ Failed to capture step screenshot: {e}")


def run_test(driver):
    """
    Test: Swag Labs Login Functionality
    This test verifies:
    - Website loads correctly
    - Login works with valid credentials
    - Inventory page loads successfully
    """
    global _step_counter
    _step_counter = 0

    try:
        print("🚀 Starting Swag Labs Login Test...")

        # Step 1: Open Website
        print("📍 Navigating to Swag Labs")
        driver.get("https://www.saucedemo.com/")

        # Wait for login page to load
        print("⏳ Waiting for login page...")
        WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.ID, "login-button"))
        )
        long_pause()

        # Verify page title
        title = driver.title
        print(f"📄 Page title: {title}")
        assert "Swag Labs" in title, "❌ Title does not contain 'Swag Labs'"
        print("✅ Login page loaded successfully")
        capture_step(driver, "login_page_loaded")

        # Step 2: Enter username
        print("✏️ Entering username")
        username_field = driver.find_element(By.ID, "user-name")
        human_type(username_field, "standard_user")
        capture_step(driver, "username_entered")

        # Step 3: Enter password
        print("✏️ Entering password")
        password_field = driver.find_element(By.ID, "password")
        human_type(password_field, "secret_sauce")
        capture_step(driver, "password_entered")

        # Step 4: Click login
        print("🔐 Clicking login button")
        small_pause()
        driver.find_element(By.ID, "login-button").click()

        # Step 5: Wait for inventory page
        print("⏳ Waiting for inventory page...")
        WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.CLASS_NAME, "inventory_list"))
        )
        medium_pause()

        # Validate URL
        current_url = driver.current_url
        print(f"🔗 Current URL: {current_url}")
        assert "inventory" in current_url, "❌ Did not navigate to inventory page"

        print("✅ Login successful - Inventory page loaded")
        capture_step(driver, "inventory_page_loaded")

        print("\n🎉 TEST PASSED: Swag Labs login test completed successfully!")
        return True

    except Exception as e:
        print(f"\n❌ TEST FAILED: {e}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    from selenium import webdriver

    print("🔧 Setting up WebDriver...")

    options = webdriver.ChromeOptions()
    options.add_argument("--start-maximized")

    driver = webdriver.Chrome(options=options)

    result = run_test(driver)

    print("\n🧹 Closing browser...")
    time.sleep(2)
    driver.quit()

    if result:
        print("✅ Script finished successfully.")
    else:
        print("❌ Script finished with errors.")