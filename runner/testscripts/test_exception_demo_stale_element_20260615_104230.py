from playwright.sync_api import Page
import os

SCREENSHOTS_DIR = os.getenv("SCREENSHOTS_DIR", "/app/output/screenshots")

def capture_step(page: Page, step_name: str):
    os.makedirs(SCREENSHOTS_DIR, exist_ok=True)
    page.screenshot(path=f"{SCREENSHOTS_DIR}/{step_name}.png")

def run_test(page: Page):
    print("Test: Stale Element (detached handle)")

    page.goto("https://example.com")

    # Capture an ElementHandle. Unlike a Locator, a handle does NOT re-resolve.
    handle = page.query_selector("h1")

    capture_step(page, "before_removal")

    # Remove the element from the DOM so the captured handle goes stale/detached.
    # (Deterministic — does not depend on navigation or network.)
    page.evaluate("document.querySelector('h1').remove()")

    # INTENTIONAL FAILURE — handle is no longer attached to the DOM.
    # Raises: Error: Element is not attached to the DOM
    handle.click()

    return True
