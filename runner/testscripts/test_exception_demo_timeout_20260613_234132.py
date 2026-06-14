from playwright.sync_api import sync_playwright

def test_timeout_failure():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()

        page.goto("https://example.com")

        # Waiting for something that will never appear
        page.wait_for_selector("#fake-loading-element", timeout=3000)

        browser.close()

if __name__ == "__main__":
    test_timeout_failure()
