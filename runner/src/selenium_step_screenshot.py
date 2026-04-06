#!/usr/bin/env python3
"""
Automatic Selenium step screenshot wrappers.

Wraps WebDriver and WebElement so common navigation and interaction actions
capture screenshots automatically, producing richer step-by-step artifacts.
"""
import os
import re
import logging
from typing import Any, List

logger = logging.getLogger(__name__)


def _sanitize(value: str) -> str:
    return re.sub(r"[^a-zA-Z0-9_-]", "_", value)[:80]


class StepScreenshotWebElement:
    """WebElement proxy that captures screenshots after key interactions."""

    def __init__(self, element: Any, recorder: "StepScreenshotRecorder", label: str = "element"):
        self._element = element
        self._recorder = recorder
        self._label = _sanitize(label)

    def click(self):
        result = self._element.click()
        self._recorder.capture(f"click_{self._label}")
        return result

    def send_keys(self, *value):
        result = self._element.send_keys(*value)
        self._recorder.capture(f"send_keys_{self._label}")
        return result

    def clear(self):
        result = self._element.clear()
        self._recorder.capture(f"clear_{self._label}")
        return result

    def submit(self):
        result = self._element.submit()
        self._recorder.capture(f"submit_{self._label}")
        return result

    def find_element(self, by="id", value=None):
        child = self._element.find_element(by, value)
        locator = f"{by}_{value}" if value is not None else str(by)
        return StepScreenshotWebElement(child, self._recorder, f"child_{locator}")

    def find_elements(self, by="id", value=None):
        children = self._element.find_elements(by, value)
        locator = f"{by}_{value}" if value is not None else str(by)
        return [
            StepScreenshotWebElement(child, self._recorder, f"child_{locator}_{index}")
            for index, child in enumerate(children)
        ]

    def __getattr__(self, attr: str):
        return getattr(self._element, attr)


class StepScreenshotRecorder:
    """Captures numbered step screenshots using existing Screenshot helper."""

    def __init__(self, screenshot_handler: Any, driver: Any, test_id: str, browser_type: str, enabled: bool, max_steps: int):
        self._screenshot_handler = screenshot_handler
        self._driver = driver
        self._test_id = test_id
        self._browser_type = browser_type
        self._enabled = enabled
        self._max_steps = max(1, max_steps)
        self._step_count = 0

    def capture(self, step_name: str):
        if not self._enabled:
            return None
        if self._step_count >= self._max_steps:
            return None

        self._step_count += 1
        safe_name = _sanitize(step_name)
        numbered_name = f"{self._step_count:03d}_{safe_name}"
        try:
            return self._screenshot_handler.capture_step(
                self._driver,
                f"{self._test_id}_{self._browser_type}",
                numbered_name,
            )
        except Exception as error:
            logger.debug(f"Step screenshot capture skipped ({numbered_name}): {error}")
            return None


class StepScreenshotWebDriver:
    """WebDriver proxy that captures screenshots for common browser actions."""

    def __init__(self, driver: Any, recorder: StepScreenshotRecorder):
        self._driver = driver
        self._recorder = recorder

    def get(self, url: str):
        result = self._driver.get(url)
        self._recorder.capture("navigate")
        return result

    def back(self):
        result = self._driver.back()
        self._recorder.capture("back")
        return result

    def forward(self):
        result = self._driver.forward()
        self._recorder.capture("forward")
        return result

    def refresh(self):
        result = self._driver.refresh()
        self._recorder.capture("refresh")
        return result

    def execute_script(self, script: str, *args):
        result = self._driver.execute_script(script, *args)
        self._recorder.capture("execute_script")
        return result

    def execute_async_script(self, script: str, *args):
        result = self._driver.execute_async_script(script, *args)
        self._recorder.capture("execute_async_script")
        return result

    def find_element(self, by="id", value=None):
        element = self._driver.find_element(by, value)
        locator = f"{by}_{value}" if value is not None else str(by)
        return StepScreenshotWebElement(element, self._recorder, locator)

    def find_elements(self, by="id", value=None) -> List[StepScreenshotWebElement]:
        elements = self._driver.find_elements(by, value)
        locator = f"{by}_{value}" if value is not None else str(by)
        return [
            StepScreenshotWebElement(element, self._recorder, f"{locator}_{index}")
            for index, element in enumerate(elements)
        ]

    def __getattr__(self, attr: str):
        return getattr(self._driver, attr)


def create_step_screenshot_driver(driver: Any, screenshot_handler: Any, test_id: str, browser_type: str) -> Any:
    """
    Create a wrapped Selenium driver that auto-captures step screenshots.

    Controls:
      - SELENIUM_AUTO_STEP_SCREENSHOTS=true|false (default: true)
      - SELENIUM_AUTO_STEP_SCREENSHOTS_MAX=<int> (default: 300)
    """
    enabled = os.getenv("SELENIUM_AUTO_STEP_SCREENSHOTS", "true").lower() in ("1", "true", "yes", "on")
    max_steps_env = os.getenv("SELENIUM_AUTO_STEP_SCREENSHOTS_MAX", "300")
    try:
        max_steps = int(max_steps_env)
    except ValueError:
        max_steps = 300

    recorder = StepScreenshotRecorder(
        screenshot_handler=screenshot_handler,
        driver=driver,
        test_id=test_id,
        browser_type=browser_type,
        enabled=enabled,
        max_steps=max_steps,
    )

    if enabled:
        logger.info(f"Selenium auto step screenshots enabled (max={max_steps})")
    else:
        logger.info("Selenium auto step screenshots disabled by env")

    return StepScreenshotWebDriver(driver, recorder)
