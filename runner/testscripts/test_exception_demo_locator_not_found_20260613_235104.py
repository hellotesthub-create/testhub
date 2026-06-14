from playwright.sync_api import Page
import os, time

SCREENSHOTS_DIR = os.getenv("SCREENSHOTS_DIR", "/app/output/screenshots")

def capture_step(page: Page, step_name: str):
    os.makedirs(SCREENSHOTS_DIR, exist_ok=True)
    page.screenshot(path=f"{SCREENSHOTS_DIR}/{step_name}.png")

def run_test(page: Page):
    print("Test: Locator Not Found")

    page.goto("https://demoqa.com/text-box")

    page.wait_for_selector("#userName")

    capture_step(page, "page_loaded")

    # ❌ INTENTIONAL FAILURE
    page.locator("#this-does-not-exist").click()

    return True
