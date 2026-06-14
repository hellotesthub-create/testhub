#!/usr/bin/env python3
def run_test(driver):
    print("Navigating to example.com")
    driver.get("https://www.example.com")
    print("Looking for non-existent element to trigger an exception")
    # This will throw a NoSuchElementException
    non_existent_element = driver.find_element("id", "this-does-not-exist")
    non_existent_element.click()
    return True
