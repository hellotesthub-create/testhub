from playwright.sync_api import Page
import os

SCREENSHOTS_DIR = os.getenv("SCREENSHOTS_DIR", "/app/output/screenshots")

def capture_step(page: Page, step_name: str):
    os.makedirs(SCREENSHOTS_DIR, exist_ok=True)
    page.screenshot(path=f"{SCREENSHOTS_DIR}/{step_name}.png")

def run_test(page: Page):
    print("Test: Assertion Failure")

    page.goto("https://example.com")

    capture_step(page, "page_loaded")

    title = page.title()

    # INTENTIONAL FAILURE
    assert title == "This Will Never Match Reality"

    return True
