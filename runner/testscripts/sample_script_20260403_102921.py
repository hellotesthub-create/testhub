#!/usr/bin/env python3
"""
Sample Selenium test script - Google Search Test
"""
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
import time


def run_test(driver):
    """
    Test: Google Homepage Load
    This test verifies that Google homepage loads correctly
    """
    try:
        print(" Starting Google Homepage Test...")
        
        # Navigate to Google
        print(" Navigating to www.google.com")
        driver.get("https://www.google.com")
        
        # Wait for page to load
        print(" Waiting for page to load...")
        WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.NAME, "q"))
        )
        
        # Get page title
        title = driver.title
        print(f" Page title: {title}")
        
        # Assert title contains 'Google'
        assert "Google" in title, f"Expected 'Google' in title, got: {title}"
        print(" Title assertion passed")
        
        # Verify search box is present
        search_box = driver.find_element(By.NAME, "q")
        assert search_box.is_displayed(), "Search box is not visible"
        print(" Search box is visible")
        
        # Type in search box
        print("⌨  Typing 'Selenium automation' in search box")
        search_box.send_keys("Selenium automation")
        time.sleep(1)
        
        # Click search button or submit
        search_box.submit()
        print(" Search submitted")
        
        # Wait for results
        print("⏳ Waiting for search results...")
        WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.ID, "search"))
        )
        
        print(" Search results loaded successfully")
        time.sleep(2)
        
        print(" TEST PASSED: Google search test completed successfully")
        return True
        
    except Exception as e:
        print(f" TEST FAILED: {e}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    from selenium.webdriver.chrome.options import Options
    
    options = Options()
    options.add_argument("--headless")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    
    driver = webdriver.Chrome(options=options)
    
    try:
        success = run_test(driver)
        print("=" * 50)
        print("TEST PASSED!" if success else "TEST FAILED!")
        print("=" * 50)
    finally:
        driver.quit()

    finally:
        driver.quit()
