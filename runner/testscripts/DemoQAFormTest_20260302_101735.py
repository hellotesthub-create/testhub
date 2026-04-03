import time
import os
from playwright.sync_api import Page


# ── Helper utilities (equivalent to Java BaseTest helpers) ──
SCREENSHOTS_DIR = os.getenv("SCREENSHOTS_DIR", "/app/output/screenshots")

def small_pause():
    time.sleep(1)

def medium_pause():
    time.sleep(2)

def long_pause():
    time.sleep(3)

def capture_step(page: Page, step_name: str):
    """Take a screenshot at a named step"""
    os.makedirs(SCREENSHOTS_DIR, exist_ok=True)
    path = os.path.join(SCREENSHOTS_DIR, f"{step_name}.png")
    page.screenshot(path=path)
    print(f"   Screenshot: {step_name}")


# ── Main test function (this is what the runner calls) ──
def run_test(page: Page):

    try:
        print("Starting DemoQA Form Test...")

        # Step 1: Open Website
        print("Navigating to DemoQA form")
        page.goto("https://demoqa.com/automation-practice-form", wait_until="domcontentloaded", timeout=30000)

        # Wait for form to load
        page.wait_for_selector("#firstName", timeout=15000)

        # Remove ads/overlays that can block clicks on DemoQA
        page.evaluate("""() => {
            // Remove Google ad iframes and ad containers
            document.querySelectorAll('iframe, #adplus-anchor, #close-fixedban, .ad, [id*="google_ads"], [id*="advertisement"], #fixedban').forEach(el => el.remove());
            // Remove fixed footer ad
            const footer = document.querySelector('footer');
            if (footer) footer.remove();
        }""")

        small_pause()

        print("Form page loaded")
        capture_step(page, "form_page_loaded")

        # Step 2: Fill First Name
        print("Entering first name")
        page.fill("#firstName", "Inshal")
        capture_step(page, "first_name_entered")

        # Step 3: Fill Last Name
        print("Entering last name")
        page.fill("#lastName", "Khan")
        capture_step(page, "last_name_entered")

        # Step 4: Fill Email
        print("Entering email")
        page.fill("#userEmail", "inshal@test.com")
        capture_step(page, "email_entered")

        # Step 5: Select Gender (use label click which is more reliable)
        print("Selecting gender")
        page.locator("label[for='gender-radio-1']").click()
        small_pause()
        capture_step(page, "gender_selected")

        # Step 6: Fill Phone Number
        print("Entering phone number")
        page.fill("#userNumber", "03123456789")
        capture_step(page, "phone_entered")

        # Step 7: Scroll down to submit
        print("Scrolling to submit button")
        page.locator("#submit").scroll_into_view_if_needed()
        small_pause()
        capture_step(page, "form_filled_ready_to_submit")

        # Step 8: Click submit (force=True bypasses overlay issues)
        print("Clicking submit button")
        page.locator("#submit").click(force=True)

        # Step 9: Wait for confirmation modal
        page.wait_for_selector(".modal-content", timeout=10000)

        medium_pause()
        capture_step(page, "submission_confirmed")

        print("TEST PASSED: Form submitted successfully")
        return True

    except Exception as e:
        print("TEST FAILED:", str(e))
        return False
        return False