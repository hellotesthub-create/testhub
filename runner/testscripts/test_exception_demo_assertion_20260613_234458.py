from playwright.sync_api import sync_playwright

def test_assertion_failure():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()

        page.goto("https://example.com")

        title = page.title()

        # Wrong expected value
        assert title == "This Title Will Never Match"

        browser.close()

if __name__ == "__main__":
    test_assertion_failure()
