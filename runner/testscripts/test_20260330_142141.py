from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.common.desired_capabilities import DesiredCapabilities
import time

# -------------------------
# Selenium Grid Hub URL
# -------------------------
hub_url = "http://localhost:4444/wd/hub"

# -------------------------
# Choose browser capabilities
# -------------------------
# For Chrome
capabilities = DesiredCapabilities.CHROME.copy()

# For Firefox, uncomment this:
# capabilities = DesiredCapabilities.FIREFOX.copy()

# -------------------------
# Create Remote WebDriver
# -------------------------
driver = webdriver.Remote(
    command_executor=hub_url,
    desired_capabilities=capabilities
)

try:
    # Open the test page
    driver.get("https://www.example.com")

    print("Title of page:", driver.title)

    # Example: locate the <h1> element
    h1 = driver.find_element(By.TAG_NAME, "h1")
    print("H1 text:", h1.text)

    # Wait a bit so you can see the page in the browser node
    time.sleep(5)

finally:
    driver.quit()