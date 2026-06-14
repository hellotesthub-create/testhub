from playwright.sync_api import Page
import os

SCREENSHOTS_DIR = os.getenv("SCREENSHOTS_DIR", "/app/output/screenshots")

def capture_step(page: Page, step_name: str):
    os.makedirs(SCREENSHOTS_DIR, exist_ok=True)
    page.screenshot(path=f"{SCREENSHOTS_DIR}/{step_name}.png")

def run_test(page: Page):
    print("Test: Stale Element")

    page.goto("https://example.com")

    element = page.locator("h1")

    capture_step(page, "before_navigation")

    # Navigate away → element becomes invalid context
    page.goto("https://www.iana.org")

    # ❌ INTENTIONAL FAILURE
    element.click()

    return True
