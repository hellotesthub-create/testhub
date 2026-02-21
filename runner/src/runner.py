#!/usr/bin/env python3
"""
Selenium Test Runner - Executes test scripts and reports results
"""
import os
import sys
import time
import importlib.util
import traceback
from datetime import datetime
from pathlib import Path
import json
import argparse

# Import our utilities
from browser_manager import BrowserManager
from screenshot import Screenshot
from video_recorder import VideoRecorder
from logger import setup_logger
from api_client import BackendAPIClient
from database_service import DatabaseService
from database_log_handler import DatabaseLogHandler

logger = setup_logger("runner")


class TestResult:
    """Store test execution results"""
    def __init__(self, test_name: str):
        self.test_name = test_name
        self.status = "PENDING"  # PENDING, RUNNING, PASSED, FAILED
        self.start_time = None
        self.end_time = None
        self.duration = 0
        self.error_message = None
        self.screenshot_path = None
    
    def to_dict(self):
        return {
            "test_name": self.test_name,
            "status": self.status,
            "start_time": str(self.start_time) if self.start_time else None,
            "end_time": str(self.end_time) if self.end_time else None,
            "duration_seconds": self.duration,
            "error_message": self.error_message,
            "screenshot_path": self.screenshot_path
        }


class TestRunner:
    """Main test runner class"""
    
    def __init__(self, email=None, test_id=None, backend_url="http://backend:8080/api", username=None, user_id=None, browser="chrome"):
        # Validate required parameters
        if not email or not username:
            logger.error("❌ email and username are required parameters!")
            raise ValueError("email and username are required parameters")
        
        # Browser selection (chrome or firefox)
        self.selected_browser = browser.lower() if browser else "chrome"
        
        # Determine directories - support both Docker (/app/) and local paths
        base_dir = Path(os.getenv("RUNNER_BASE_DIR", "/app"))
        self.test_dir = Path(os.getenv("TESTSCRIPTS_DIR", str(base_dir / "testscripts")))
        self.output_dir = Path(os.getenv("OUTPUT_DIR", str(base_dir / "output")))
        self.reports_dir = self.output_dir / "reports"
        self.screenshots_dir = self.output_dir / "screenshots"
        self.videos_dir = self.output_dir / "videos"
        
        # Create directories
        self.reports_dir.mkdir(parents=True, exist_ok=True)
        self.screenshots_dir.mkdir(parents=True, exist_ok=True)
        self.videos_dir.mkdir(parents=True, exist_ok=True)
        
        self.browser_manager = None
        self.screenshot_handler = Screenshot(str(self.screenshots_dir))
        self.video_recorder = VideoRecorder(str(self.videos_dir))
        self.results = []
        self.specific_file = None  # For running specific test file
        
        # User information (REQUIRED!)
        self.email = email
        self.username = username
        self.user_id = user_id
        
        # Database service for saving test results (passes user info)
        self.db_service = DatabaseService(
            username=self.username,
            email=self.email,
            user_id=self.user_id
        )
        
        # Test run tracking - use test_id if provided, otherwise generate new run_id
        if test_id:
            self.run_id_string = test_id
            logger.info(f"📋 Using provided run ID: {test_id}")
        else:
            self.run_id_string = datetime.now().strftime("%Y%m%d_%H%M%S")
            logger.info(f"🆔 Generated new run ID: {self.run_id_string}")
        
        # Legacy alias for compatibility
        self.suite_id = self.run_id_string
        
        # Add database log handler to save all logs to MongoDB
        self.db_log_handler = DatabaseLogHandler(self.db_service, self.run_id_string)
        self.db_log_handler.setFormatter(logger.handlers[0].formatter if logger.handlers else None)
        logger.addHandler(self.db_log_handler)
        
        # API client for submitting artifacts
        self.email = email
        self.test_id = self.run_id_string  # Legacy alias
        self.api_client = BackendAPIClient(backend_url) if email else None
        
        # Track current browser for artifacts
        self.current_browser = self.selected_browser
        
        logger.info("=" * 80)
        logger.info("SELENIUM TEST RUNNER INITIALIZED")
        logger.info("=" * 80)
        logger.info(f"👤 Username: {self.username}")
        logger.info(f"📧 Email: {self.email}")
        logger.info(f"🆔 Run ID: {self.run_id_string}")
        if self.user_id:
            logger.info(f"🔑 User ID: {self.user_id}")
        if self.api_client:
            logger.info(f"🌐 Backend URL: {backend_url}")
    
    def discover_tests(self):
        """Discover all test scripts in testscripts directory"""
        test_files = []
        
        if not self.test_dir.exists():
            logger.error(f"Test directory does not exist: {self.test_dir}")
            return test_files
        
        # If specific file is requested, only run that file
        if self.specific_file:
            specific_path = self.test_dir / self.specific_file
            if specific_path.exists():
                test_files.append(specific_path)
                logger.info(f"📋 Running specific test: {self.specific_file}")
            else:
                logger.error(f"❌ Test file not found: {self.specific_file}")
            return test_files
        
        # Otherwise discover all test files
        for file in self.test_dir.glob("*.py"):
            if file.name.startswith("test_") or file.name.endswith("_test.py"):
                test_files.append(file)
                logger.info(f"📋 Discovered test: {file.name}")
        
        return test_files
    
    def collect_test_screenshots(self, test_name: str, test_start_time: datetime):
        """
        Collect all screenshots created by the test during execution.
        This finds screenshots taken by the test script itself (not the runner's success/failure screenshots).
        
        Args:
            test_name: Name of the test (without extension)
            test_start_time: When the test started executing
        """
        if not self.db_service or not self.db_service.connected:
            return
        
        try:
            screenshots_found = 0
            
            # Scan the screenshots directory for files created during this test
            for screenshot_file in self.screenshots_dir.glob("*.png"):
                # Skip if it's the runner's success/failure screenshot (already saved)
                if "_success_" in screenshot_file.name or "_failure_" in screenshot_file.name:
                    continue
                
                # Check if file was created after test started
                file_mtime = datetime.fromtimestamp(screenshot_file.stat().st_mtime)
                if file_mtime < test_start_time:
                    continue
                
                # Extract step name from filename
                # Examples: "form_initial_load_20251211_054544.png" -> "initial load"
                #           "github_scroll_1.png" -> "scroll 1"
                filename_parts = screenshot_file.stem.split("_")
                
                # Remove timestamp-like patterns (8 digits followed by 6 digits)
                cleaned_parts = []
                i = 0
                while i < len(filename_parts):
                    part = filename_parts[i]
                    # Skip if looks like timestamp (YYYYMMDD_HHMMSS)
                    if len(part) == 8 and part.isdigit():
                        # Also skip next part if it looks like time
                        if i + 1 < len(filename_parts) and filename_parts[i + 1].isdigit():
                            i += 2
                            continue
                    cleaned_parts.append(part)
                    i += 1
                
                # Create descriptive step name
                step_name = " ".join(cleaned_parts).title() if cleaned_parts else screenshot_file.stem
                
                # Save screenshot to database
                screenshot_data = {
                    "run_id_string": self.run_id_string,
                    "test_name": test_name,
                    "filename": screenshot_file.name,
                    "name": screenshot_file.name,
                    "filepath": str(screenshot_file),
                    "step": step_name,
                    "browser": self.current_browser
                }
                
                if self.db_service.save_screenshot(screenshot_data):
                    screenshots_found += 1
            
            if screenshots_found > 0:
                logger.info(f"📸 Collected {screenshots_found} test screenshots")
        
        except Exception as e:
            logger.error(f"❌ Failed to collect test screenshots: {e}")
    
    def load_test_module(self, test_file: Path):
        """Dynamically load a test module"""
        try:
            spec = importlib.util.spec_from_file_location(test_file.stem, test_file)
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            return module
        except Exception as e:
            logger.error(f"Failed to load test module {test_file.name}: {e}")
            raise
    
    def execute_test(self, test_file: Path):
        """Execute a single test file"""
        result = TestResult(test_file.name)
        result.status = "RUNNING"
        result.start_time = datetime.now()
        video_path = None
        
        # Update database log handler with current test name
        if hasattr(self, 'db_log_handler'):
            self.db_log_handler.set_test_name(test_file.stem)
        
        logger.info("")
        logger.info("=" * 80)
        logger.info(f"🚀 RUNNING TEST: {test_file.name}")
        logger.info("=" * 80)
        
        try:
            # Initialize browser (use selected browser type)
            browser_type = self.selected_browser
            # Use headless=False for Grid so browser displays on Xvfb for video recording
            self.browser_manager = BrowserManager(browser_type=browser_type, headless=False)
            driver = self.browser_manager.get_driver()
            logger.info("✅ Browser initialized successfully")
            
            # Start video recording AFTER browser is initialized
            # Pass browser type to video recorder
            video_path = self.video_recorder.start_recording(test_file.stem, browser=browser_type)
            
            # Set current browser for artifacts
            self.current_browser = browser_type
            self.db_service.set_current_browser(browser_type)
            
            # Load and execute test module
            module = self.load_test_module(test_file)
            
            # Check if module has run_test function
            if hasattr(module, 'run_test'):
                logger.info(f"▶️  Executing test function...")
                
                test_passed = module.run_test(driver)
                
                if test_passed:
                    result.status = "PASSED"
                    logger.info("✅ TEST PASSED")
                    # Capture success screenshot
                    screenshot_path = self.screenshot_handler.capture_success(
                        driver, test_file.stem
                    )
                    result.screenshot_path = screenshot_path
                    
                    # Save screenshot to database
                    if screenshot_path:
                        from pathlib import Path
                        screenshot_file = Path(screenshot_path)
                        if screenshot_file.exists():
                            screenshot_data = {
                                "run_id_string": self.run_id_string,
                                "test_name": test_file.stem,
                                "filename": screenshot_file.name,
                                "name": screenshot_file.name,
                                "filepath": str(screenshot_path),
                                "step": f"Success - {test_file.stem}",
                                "browser": self.current_browser
                            }
                            self.db_service.save_screenshot(screenshot_data)
                else:
                    result.status = "FAILED"
                    logger.error("❌ TEST FAILED")
                    # Capture failure screenshot
                    screenshot_path = self.screenshot_handler.capture_failure(
                        driver, test_file.stem
                    )
                    result.screenshot_path = screenshot_path
                    result.error_message = "Test returned False"
                    
                    # Save screenshot to database
                    if screenshot_path:
                        from pathlib import Path
                        screenshot_file = Path(screenshot_path)
                        if screenshot_file.exists():
                            screenshot_data = {
                                "run_id_string": self.run_id_string,
                                "test_name": test_file.stem,
                                "filename": screenshot_file.name,
                                "name": screenshot_file.name,
                                "filepath": str(screenshot_path),
                                "step": f"Failure - {test_file.stem}",
                                "browser": self.current_browser
                            }
                            self.db_service.save_screenshot(screenshot_data)
            else:
                raise Exception("Test module does not have 'run_test' function")
                
        except Exception as e:
            result.status = "FAILED"
            result.error_message = str(e)
            logger.error(f"❌ TEST FAILED WITH ERROR: {e}")
            logger.error(traceback.format_exc())
            
            # Try to capture failure screenshot
            try:
                if self.browser_manager and self.browser_manager.driver:
                    screenshot_path = self.screenshot_handler.capture_failure(
                        self.browser_manager.driver, test_file.stem
                    )
                    result.screenshot_path = screenshot_path
            except:
                pass
        
        finally:
            # Collect all screenshots created during the test
            # This captures screenshots taken by the test script itself
            if hasattr(result, 'start_time') and result.start_time:
                self.collect_test_screenshots(test_file.stem, result.start_time)
            
            # Calculate duration FIRST before using it
            result.end_time = datetime.now()
            result.duration = (result.end_time - result.start_time).total_seconds()
            
            # Stop video recording
            if self.video_recorder.is_recording():
                stopped_video_path = self.video_recorder.stop_recording()
                if stopped_video_path:
                    # Save video to database (GridFS + metadata)
                    from pathlib import Path
                    video_file = Path(stopped_video_path)
                    if video_file.exists():
                        size_bytes = video_file.stat().st_size
                        video_data = {
                            "run_id_string": self.run_id_string,
                            "test_name": test_file.stem,
                            "filename": video_file.name,
                            "name": video_file.name,
                            "filepath": str(stopped_video_path),
                            "duration_seconds": result.duration,  # Now this has the correct value
                            "browser": self.current_browser
                        }
                        self.db_service.save_video(video_data)
            
            # Clean up browser
            if self.browser_manager:
                try:
                    self.browser_manager.quit()
                    logger.info("🔒 Browser closed")
                except:
                    pass
                self.browser_manager = None
            
            # Save individual test result to database
            test_result_data = {
                "run_id_string": self.run_id_string,
                "test_name": test_file.stem,
                "browser": self.current_browser,
                "status": result.status,
                "duration_seconds": result.duration,
                "start_time": result.start_time,
                "end_time": result.end_time,
                "error_message": result.error_message
            }
            self.db_service.save_test_result(test_result_data)
            
            # Save log entry to database
            log_data = {
                "run_id_string": self.run_id_string,
                "test_name": test_file.stem,
                "browser": self.current_browser,
                "message": f"Test {result.status}: {test_file.stem}",
                "level": "info" if result.status == "PASSED" else "error"
            }
            self.db_service.save_log(log_data)
            
            logger.info(f"⏱️  Duration: {result.duration:.2f} seconds")
            logger.info("=" * 80)
        
        return result
    
    def generate_report(self):
        """Generate test execution report (JSON only) and save to database"""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        report_file = self.reports_dir / f"test_report_{timestamp}.json"
        
        # Calculate summary
        total_tests = len(self.results)
        passed_tests = sum(1 for r in self.results if r.status == "PASSED")
        failed_tests = sum(1 for r in self.results if r.status == "FAILED")
        total_duration = sum(r.duration for r in self.results)
        success_rate = (passed_tests/total_tests*100) if total_tests > 0 else 0
        
        summary = {
            "timestamp": timestamp,
            "total_tests": total_tests,
            "passed": passed_tests,
            "failed": failed_tests,
            "success_rate": f"{success_rate:.1f}%",
            "total_duration_seconds": total_duration,
            "results": [r.to_dict() for r in self.results]
        }
        
        # Save JSON report to file (HTML removed - frontend displays results)
        with open(report_file, 'w') as f:
            json.dump(summary, f, indent=2)
        logger.info(f"📊 JSON Report saved: {report_file}")
        
        # Finalize test run with results (create_test_run already called in run())
        self.db_service.finalize_run(
            total_tests=total_tests,
            passed=passed_tests,
            failed=failed_tests,
            duration_seconds=total_duration,
            status="completed" if failed_tests == 0 else "failed"
        )
        
        return summary
    
    def run(self):
        """Main execution method"""
        logger.info("🔍 Discovering tests...")
        test_files = self.discover_tests()
        
        if not test_files:
            logger.warning("⚠️  No test files found!")
            logger.info("💡 Test files should start with 'test_' or end with '_test.py'")
            return
        
        logger.info(f"📝 Found {len(test_files)} test(s)")
        
        # Register/find the test run in DB BEFORE executing tests
        # so that current_run_id is set when save_test_result runs
        run_data = {
            "run_id": self.run_id_string,
            "suite_name": "Test Run",
            "browsers": [self.current_browser],
            "trigger_type": "manual"
        }
        self.db_service.create_test_run(run_data)
        
        # Execute all tests
        for test_file in test_files:
            result = self.execute_test(test_file)
            self.results.append(result)
        
        # Generate report
        logger.info("")
        logger.info("=" * 80)
        logger.info("📊 GENERATING REPORT")
        logger.info("=" * 80)
        summary = self.generate_report()
        
        # Print summary
        logger.info("")
        logger.info("=" * 80)
        logger.info("📈 TEST EXECUTION SUMMARY")
        logger.info("=" * 80)
        logger.info(f"Total Tests:   {summary['total_tests']}")
        logger.info(f"✅ Passed:     {summary['passed']}")
        logger.info(f"❌ Failed:     {summary['failed']}")
        logger.info(f"📊 Success Rate: {summary['success_rate']}")
        logger.info(f"⏱️  Total Time: {summary['total_duration_seconds']:.2f}s")
        logger.info("=" * 80)
        
        # Exit with appropriate code
        if summary['failed'] > 0:
            logger.info("❌ Some tests failed")
            sys.exit(1)
        else:
            logger.info("✅ All tests passed!")
            sys.exit(0)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Selenium Test Runner')
    parser.add_argument('--email', type=str, required=True, help='User email executing the tests (REQUIRED)')
    parser.add_argument('--username', type=str, required=True, help='Username executing the tests (REQUIRED)')
    parser.add_argument('--user-id', type=str, help='User ID (MongoDB ObjectID)')
    parser.add_argument('--test-id', type=str, help='Test execution ID')
    parser.add_argument('--backend-url', type=str, default='http://backend:8080/api', 
                        help='Backend API URL')
    parser.add_argument('--file', type=str, help='Specific test file to run (e.g., test_python.py)')
    parser.add_argument('--browser', type=str, default='chrome', choices=['chrome', 'firefox'],
                        help='Browser to use (chrome or firefox)')
    
    args = parser.parse_args()
    
    runner = TestRunner(
        email=args.email,
        username=args.username,
        user_id=args.user_id,
        test_id=args.test_id,
        backend_url=args.backend_url,
        browser=args.browser
    )
    
    # If specific file is provided, run only that file
    if args.file:
        runner.specific_file = args.file
    
    runner.run()

