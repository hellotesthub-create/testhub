#!/usr/bin/env python3
"""
GitHub Public Page Test - Full page scroll with screenshots
"""
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
import time
import os


def run_test(driver):
    """
    Test: GitHub Homepage
    Scrolls full page and captures screenshots at each step.
    """
    try:
        # Screenshot directory (framework handles this path)
        screenshot_dir = os.getenv("OUTPUT_DIR", "/app/output") + "/screenshots"
        
        print(" Starting GitHub Full Page Scroll Test...")

        # Open GitHub
        print(" Navigating to github.com")
        driver.get("https://github.com")

        # Wait for body load
        print("⏳ Waiting for page to load...")
        WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.TAG_NAME, "body"))
        )
        time.sleep(1)

        # Verify title
        title = driver.title
        print(f" Page title: {title}")
        assert "GitHub" in title, " GitHub title missing"
        print(" GitHub homepage loaded")

        print("\n Starting full page scrolling...")

        # Find page height
        last_height = driver.execute_script("return document.body.scrollHeight")
        scroll_count = 0

        while scroll_count < 10:  # Limit scrolls to avoid infinite loops
            # Capture screenshot at this scroll position
            screenshot_name = f"github_scroll_{scroll_count + 1}.png"
            screenshot_path = os.path.join(screenshot_dir, screenshot_name)
            driver.save_screenshot(screenshot_path)
            print(f" Saved screenshot: {screenshot_name}")
            
            # Scroll down by viewport height
            driver.execute_script("window.scrollBy(0, window.innerHeight);")
            time.sleep(1)
            scroll_count += 1
            print(f" Scroll step {scroll_count}...")

            # Calculate new height
            new_height = driver.execute_script("return window.pageYOffset + window.innerHeight")

            # If reached bottom OR footer visible → stop
            footer_visible = False
            try:
                footer = driver.find_element(By.TAG_NAME, "footer")
                footer_y = footer.location["y"]

                # Check if footer is currently visible in viewport
                if new_height >= footer_y:
                    footer_visible = True
                    print(" Footer reached")
            except:
                pass

            # Stop condition
            if footer_visible or new_height >= last_height:
                # Take final screenshot at bottom
                final_screenshot = os.path.join(screenshot_dir, "github_scroll_footer.png")
                driver.save_screenshot(final_screenshot)
                print(" Saved screenshot: github_scroll_footer.png")
                break

        # Scroll back to top
        driver.execute_script("window.scrollTo(0, 0);")
        time.sleep(1)
        
        print("\n TEST PASSED: Full GitHub page viewed successfully with screenshots")
        return True

    except Exception as e:
        print(f"\n TEST FAILED: {e}")
        import traceback
        traceback.print_exc()
        return False
