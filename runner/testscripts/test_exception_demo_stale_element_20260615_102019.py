#!/usr/bin/env python3
# Selenium demo: a captured element reference goes STALE after navigation.
# Playwright cannot demonstrate this — its locators auto-re-resolve — so this
# script is Selenium (run it with framework=selenium), like test_exception_demo.py.
def run_test(driver):
    print("Test: Stale Element Reference")

    driver.get("https://example.com")

    # Capture a reference to an element in the CURRENT DOM
    heading = driver.find_element("tag name", "h1")

    # Navigate away so the captured DOM node is destroyed
    driver.get("https://www.iana.org")

    # INTENTIONAL FAILURE — element is no longer attached to the page document.
    # Raises selenium.common.exceptions.StaleElementReferenceException.
    heading.click()

    return True
