from playwright.sync_api import Page
import os

SCREENSHOTS_DIR = os.getenv("SCREENSHOTS_DIR", "/app/output/screenshots")

def capture_step(page: Page, step_name: str):
    os.makedirs(SCREENSHOTS_DIR, exist_ok=True)
    page.screenshot(path=f"{SCREENSHOTS_DIR}/{step_name}.png")

def run_test(page: Page):

    print("Test: iFrame Failure")

    page.goto("https://www.w3schools.com/html/html_iframe.asp")

    capture_step(page, "iframe_page_loaded")

    # Wrong context access
    page.locator("#iframeResult h1").click()

    return True
