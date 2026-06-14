from playwright.sync_api import Page
import os

SCREENSHOTS_DIR = os.getenv("SCREENSHOTS_DIR", "/app/output/screenshots")

def capture_step(page: Page, step_name: str):
    os.makedirs(SCREENSHOTS_DIR, exist_ok=True)
    page.screenshot(path=f"{SCREENSHOTS_DIR}/{step_name}.png")

def run_test(page: Page):
    print("Test: Timeout Failure")

    page.goto("https://demoqa.com/automation-practice-form")

    capture_step(page, "form_loaded")

    # INTENTIONAL FAILURE (no such element will appear)
    page.wait_for_selector("#fake-loading-element-xyz", timeout=3000)

    return True
