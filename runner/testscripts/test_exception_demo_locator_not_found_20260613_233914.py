from playwright.sync_api import sync_playwright

def test_locator_not_found():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()

        page.goto("https://example.com")

        # This will ALWAYS fail
        page.locator("#this-does-not-exist").click()

        browser.close()

if __name__ == "__main__":
    test_locator_not_found()
