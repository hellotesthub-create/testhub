#!/usr/bin/env python3
"""
Playwright Browser Manager - Launches Chromium/Firefox directly inside the container.
No external Grid needed — Playwright bundles its own browser binaries.

Key difference from Selenium BrowserManager:
  - Selenium: connects to an external Grid Hub which routes to node containers
  - Playwright: launches browsers locally inside this container (self-contained)
"""
import logging
import os
from playwright.sync_api import sync_playwright, Browser, BrowserContext, Page

logger = logging.getLogger(__name__)


class PlaywrightBrowserManager:
    """Manages Playwright browser lifecycle for test execution"""

    def __init__(self, browser_type: str = "chrome", headless: bool = True):
        # Map "chrome" to "chromium" for Playwright (Playwright uses "chromium", not "chrome")
        if browser_type.lower() in ("chrome", "chromium"):
            self.browser_type = "chromium"
        elif browser_type.lower() == "firefox":
            self.browser_type = "firefox"
        else:
            raise ValueError(f"Unsupported browser type: {browser_type}. Use 'chrome' or 'firefox'.")

        self.headless = headless
        self.playwright = None
        self.browser: Browser = None
        self.context: BrowserContext = None
        self.page: Page = None

        # Video/screenshot output dirs
        self.videos_dir = os.getenv("OUTPUT_DIR", "/app/output") + "/videos"
        self.screenshots_dir = os.getenv("OUTPUT_DIR", "/app/output") + "/screenshots"

    def launch(self, record_video: bool = True, test_name: str = "test") -> Page:
        """
        Launch the browser and return a Playwright Page object.

        Args:
            record_video: Whether to enable Playwright's built-in video recording
            test_name: Used for naming video files

        Returns:
            playwright.sync_api.Page — the page object for test scripts to use
        """
        self.playwright = sync_playwright().start()

        # Select browser engine
        if self.browser_type == "chromium":
            browser_engine = self.playwright.chromium
        elif self.browser_type == "firefox":
            browser_engine = self.playwright.firefox
        else:
            raise ValueError(f"Unsupported: {self.browser_type}")

        # Launch browser
        self.browser = browser_engine.launch(headless=self.headless)
        logger.info(f"Playwright {self.browser_type} launched (headless={self.headless})")

        # Create context with optional video recording
        context_options = {
            "viewport": {"width": 1920, "height": 1080},
        }
        if record_video:
            os.makedirs(self.videos_dir, exist_ok=True)
            context_options["record_video_dir"] = self.videos_dir
            context_options["record_video_size"] = {"width": 1920, "height": 1080}

        self.context = self.browser.new_context(**context_options)
        self.page = self.context.new_page()

        logger.info(f"Playwright page created (viewport: 1920x1080)")
        return self.page

    def get_video_path(self) -> str:
        """Get the path to the recorded video after closing the context"""
        if self.page and self.page.video:
            try:
                return self.page.video.path()
            except Exception as e:
                logger.warning(f"Could not get video path: {e}")
        return None

    def screenshot(self, path: str = None, full_page: bool = False) -> str:
        """Capture a screenshot of the current page"""
        if not self.page:
            logger.warning("No page available for screenshot")
            return None

        if path is None:
            os.makedirs(self.screenshots_dir, exist_ok=True)
            path = os.path.join(self.screenshots_dir, "screenshot.png")

        self.page.screenshot(path=path, full_page=full_page)
        logger.info(f"Screenshot saved: {path}")
        return path

    def close(self):
        """Close browser and clean up Playwright resources"""
        try:
            if self.context:
                self.context.close()
                logger.info("Playwright context closed")
        except Exception as e:
            logger.error(f"Error closing context: {e}")

        try:
            if self.browser:
                self.browser.close()
                logger.info("Playwright browser closed")
        except Exception as e:
            logger.error(f"Error closing browser: {e}")

        try:
            if self.playwright:
                self.playwright.stop()
                logger.info("Playwright stopped")
        except Exception as e:
            logger.error(f"Error stopping playwright: {e}")

        self.page = None
        self.context = None
        self.browser = None
        self.playwright = None
