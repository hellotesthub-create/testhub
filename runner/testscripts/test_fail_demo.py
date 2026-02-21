#!/usr/bin/env python3
"""
Intentional Failure Test - Demonstrates test failure handling
This test is designed to fail to show error handling and reporting
"""
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
import time


def run_test(driver):
    """
    Test: Intentional Failure Demo
    This test intentionally fails to demonstrate error handling
    NOTE: Comment out the assertion to make it pass
    """
    try:
        print("🚀 Starting Intentional Failure Test...")
        print("⚠️  This test is designed to fail for demonstration purposes")
        
        # Navigate to example.com
        print("📍 Navigating to example.com")
        driver.get("https://www.example.com")
        
        # Wait for page to load
        print("⏳ Waiting for page to load...")
        time.sleep(2)
        
        # Get page title
        title = driver.title
        print(f"📄 Page title: {title}")
        
        # This assertion will fail intentionally
        print("🔍 Checking for non-existent text in title...")
        assert "NonExistentText12345" in title, "This assertion is designed to fail!"
        
        # This line won't be reached
        print("✅ TEST PASSED")
        return True
        
    except AssertionError as e:
        print(f"❌ ASSERTION FAILED: {e}")
        return False
    except Exception as e:
        print(f"❌ TEST FAILED: {e}")
        import traceback
        traceback.print_exc()
        return False
