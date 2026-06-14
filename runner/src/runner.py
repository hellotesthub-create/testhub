#!/usr/bin/env python3
"""
Test Runner - Executes test scripts via Selenium Grid or Playwright and reports results.
Supports both frameworks: selenium (external Grid) and playwright (self-contained).
"""
import os
import sys
import importlib.util
import traceback
import subprocess
from datetime import datetime
from pathlib import Path
import json
import argparse
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed

# Import our utilities
from browser_manager import BrowserManager
from screenshot import Screenshot
from video_recorder import VideoRecorder
from logger import setup_logger
from api_client import BackendAPIClient
from database_service import DatabaseService
from database_log_handler import DatabaseLogHandler
from selenium_step_screenshot import create_step_screenshot_driver

# Playwright import (conditional — only used when framework=playwright)
try:
    from playwright_browser_manager import PlaywrightBrowserManager
    PLAYWRIGHT_AVAILABLE = True
except ImportError:
    PLAYWRIGHT_AVAILABLE = False

logger = setup_logger("runner")


class TestResult:
    """Store test execution results"""
    def __init__(self, test_name: str, browser: str = "chrome"):
        self.test_name = test_name
        self.browser = browser
        self.status = "PENDING"  # PENDING, RUNNING, PASSED, FAILED
        self.start_time = None
        self.end_time = None
        self.duration = 0
        self.error_message = None
        self.error_stack = None
        self.screenshot_path = None
    
    def to_dict(self):
        return {
            "test_name": self.test_name,
            "browser": self.browser,
            "status": self.status,
            "start_time": str(self.start_time) if self.start_time else None,
            "end_time": str(self.end_time) if self.end_time else None,
            "duration_seconds": self.duration,
            "error_message": self.error_message,
            "error_stack": self.error_stack,
            "screenshot_path": self.screenshot_path
        }


class PrintCapture:
    """
    Context manager that captures Python print() statements during test execution
    and forwards them to the logger so they appear in the database logs.
    Thread-safe — each thread gets its own capture via the log_prefix.
    """
    def __init__(self, log_prefix: str):
        self.log_prefix = log_prefix
        self._original_stdout = None

    def __enter__(self):
        self._original_stdout = sys.stdout
        sys.stdout = self._LogWriter(self.log_prefix, self._original_stdout)
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        sys.stdout = self._original_stdout
        return False

    class _LogWriter:
        """Replaces sys.stdout — sends each print() line to logger.info and also to original stdout."""
        def __init__(self, prefix, original):
            self.prefix = prefix
            self.original = original
            self.buffer = ""

        def write(self, text):
            # Also write to original stdout (terminal/console)
            if self.original:
                self.original.write(text)
            # Buffer until we get a complete line
            self.buffer += text
            while "\n" in self.buffer:
                line, self.buffer = self.buffer.split("\n", 1)
                line = line.strip()
                if line:  # Skip empty lines
                    logger.info(f"{self.prefix} [PRINT] {line}")

        def flush(self):
            # Flush any remaining buffered content
            if self.buffer.strip():
                logger.info(f"{self.prefix} [PRINT] {self.buffer.strip()}")
                self.buffer = ""
            if self.original:
                self.original.flush()


class TestRunner:
    """Main test runner class — supports both Selenium and Playwright frameworks"""
    
    def __init__(self, email=None, test_id=None, backend_url="http://localhost:8080/api", username=None, user_id=None, browser="chrome", browsers=None, parallel=1, language="python", framework="selenium"):
        # Validate required parameters
        if not email or not username:
            logger.error("email and username are required parameters!")
            raise ValueError("email and username are required parameters")
        
        # Language support — python, java, or both
        self.language = language.lower() if language else "python"
        
        # Framework support — selenium (external Grid) or playwright (self-contained)
        self.framework = framework.lower() if framework else "selenium"
        if self.framework == "playwright" and not PLAYWRIGHT_AVAILABLE:
            logger.error("Playwright framework requested but playwright_browser_manager not available!")
            raise ImportError("Playwright is not installed in this runner image")
        
        # Browser selection — supports multiple browsers for parallel cross-browser testing
        if browsers:
            self.browsers = [b.strip().lower() for b in browsers]
        else:
            self.browsers = [browser.lower() if browser else "chrome"]
        self.selected_browser = self.browsers[0]  # Default/first browser
        
        # Parallel execution config
        self.parallel = max(1, parallel)
        
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
        self.results = []
        self._results_lock = threading.Lock()  # Thread-safe result collection
        self.specific_files = []  # For running specific test file(s)
        
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
            logger.info(f"Using provided run ID: {test_id}")
        else:
            self.run_id_string = datetime.now().strftime("%Y%m%d_%H%M%S")
            logger.info(f"Generated new run ID: {self.run_id_string}")
        
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
        logger.info(f"{self.framework.upper()} TEST RUNNER INITIALIZED")
        logger.info("=" * 80)
        logger.info(f"Framework: {self.framework}")
        logger.info(f"Username: {self.username}")
        logger.info(f"Email: {self.email}")
        logger.info(f"Run ID: {self.run_id_string}")
        logger.info(f"Browsers: {', '.join(self.browsers)}")
        logger.info(f"Parallel workers: {self.parallel}")
        if self.user_id:
            logger.info(f"User ID: {self.user_id}")
        if self.api_client:
            logger.info(f"Backend URL: {backend_url}")
    
    def discover_tests(self):
        """Discover all test scripts in testscripts directory, filtered by language"""
        test_files = []
        
        if not self.test_dir.exists():
            logger.error(f"Test directory does not exist: {self.test_dir}")
            return test_files
        
        # If specific file(s) requested, only run those
        if self.specific_files:
            for fname in self.specific_files:
                specific_path = self.test_dir / fname
                if specific_path.exists():
                    # Skip empty (0-byte) files — these are invalid/placeholder files
                    if specific_path.stat().st_size == 0:
                        logger.warning(f"Skipping empty test file (0 bytes): {fname}")
                        continue
                    test_files.append(specific_path)
                    logger.info(f"Running specific test: {fname}")
                else:
                    logger.error(f"Test file not found: {fname}")
            return test_files
        
        # Otherwise discover all test files based on language
        if self.language in ("python", "both"):
            for file in self.test_dir.glob("*.py"):
                if file.name.startswith("test_") or file.name.endswith("_test.py"):
                    if file.stat().st_size == 0:
                        logger.warning(f"Skipping empty test file (0 bytes): {file.name}")
                        continue
                    test_files.append(file)
                    logger.info(f"Discovered Python test: {file.name}")
        
        if self.language in ("java", "both"):
            for file in self.test_dir.glob("*.java"):
                if file.name.startswith("test_") or file.name.startswith("Test") or file.name.endswith("Test.java"):
                    if file.stat().st_size == 0:
                        logger.warning(f"Skipping empty test file (0 bytes): {file.name}")
                        continue
                    test_files.append(file)
                    logger.info(f"Discovered Java test: {file.name}")
        
        return test_files
    
    def collect_test_screenshots(self, test_name: str, test_start_time: datetime, browser_type: str = None):
        """
        Collect all screenshots created by the test during execution.
        This finds screenshots taken by the test script itself (not the runner's success/failure screenshots).
        
        Args:
            test_name: Name of the test (without extension)
            test_start_time: When the test started executing
            browser_type: Browser type for this test execution
        """
        browser_type = browser_type or self.current_browser
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
                    "browser": browser_type
                }
                
                if self.db_service.save_screenshot(screenshot_data):
                    screenshots_found += 1
            
            if screenshots_found > 0:
                logger.info(f"Collected {screenshots_found} test screenshots")
        
        except Exception as e:
            logger.error(f"Failed to collect test screenshots: {e}")
    
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
    
    def execute_java_test(self, test_file: Path, browser_type: str = None):
        """
        Execute a single Java test file on a specific browser.
        Compiles the .java file, then runs it via com.thex.BaseTest helper.
        Thread-safe — creates per-execution compile directory.
        Includes video recording by capturing session_id from BaseTest stdout.
        
        Args:
            test_file: Path to the Java test script (.java)
            browser_type: Browser to run on ("chrome" or "firefox")
        """
        browser_type = browser_type or self.selected_browser
        log_prefix = f"[{test_file.stem}/{browser_type}]"
        
        result = TestResult(test_file.name, browser=browser_type)
        result.status = "RUNNING"
        result.start_time = datetime.now()
        
        # Create LOCAL video recorder for thread safety
        video_recorder = VideoRecorder(str(self.videos_dir))
        java_session_id = None
        
        logger.info("")
        logger.info("=" * 80)
        logger.info(f" {log_prefix} RUNNING JAVA TEST: {test_file.name} on {browser_type}")
        logger.info("=" * 80)
        
        # Java classpath — BaseTest classes + Selenium JARs + testscripts dir
        java_libs_dir = os.getenv("JAVA_LIBS_DIR", "/app/java-libs")
        selenium_hub_url = os.getenv("SELENIUM_HUB_URL", "http://selenium-hub:4444")
        
        # Per-test compile output directory (thread-safe)
        compile_dir = self.output_dir / "java-compile" / f"{test_file.stem}_{browser_type}"
        compile_dir.mkdir(parents=True, exist_ok=True)
        
        try:
            # Step 1: Validate source file is not empty
            source_code = test_file.read_text().strip()
            if not source_code:
                raise Exception(f"Java source file is empty (0 bytes): {test_file.name}")
            
            # Step 2: Extract the actual public class name from the source file
            # Java requires filename == public class name
            import re
            class_match = re.search(r'public\s+class\s+(\w+)', source_code)
            if not class_match:
                raise Exception(f"No 'public class' found in {test_file.name}. Java test files must contain a public class with a 'public boolean runTest(WebDriver driver)' method.")
            class_name = class_match.group(1)
            logger.info(f"{log_prefix} Detected public class: {class_name}")
            
            # Step 3: Copy source file to compile dir with correct filename
            # This ensures javac gets ClassName.java matching 'public class ClassName'
            correct_source = compile_dir / f"{class_name}.java"
            import shutil
            shutil.copy2(str(test_file), str(correct_source))
            
            # Step 4: Compile the correctly-named copy
            logger.info(f"{log_prefix} Compiling {class_name}.java...")
            compile_cp = f"/app/java-classes:{java_libs_dir}/*"
            compile_cmd = [
                "javac",
                "-cp", compile_cp,
                "-d", str(compile_dir),
                str(correct_source)
            ]
            compile_result = subprocess.run(
                compile_cmd,
                capture_output=True,
                text=True,
                timeout=60
            )
            
            if compile_result.returncode != 0:
                raise Exception(f"Java compilation failed:\n{compile_result.stderr}")
            
            # Step 5: Verify .class file was actually produced
            class_file = compile_dir / f"{class_name}.class"
            if not class_file.exists():
                raise Exception(f"Compilation produced no .class file for {class_name}. Check that the source contains a valid public class.")
            
            logger.info(f"{log_prefix} Compilation successful")
            
            # Step 4: Run the Java test via BaseTest helper using Popen for real-time output
            run_cp = f"{str(compile_dir)}:/app/java-classes:{java_libs_dir}/*"
            run_cmd = [
                "java",
                "-cp", run_cp,
                "com.thex.BaseTest",
                class_name,
                browser_type,
                selenium_hub_url,
                str(self.screenshots_dir)
            ]
            
            logger.info(f"{log_prefix} Executing Java test: {class_name}")
            
            # Use Popen to read stdout in real-time and capture session_id for video
            process = subprocess.Popen(
                run_cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                bufsize=1  # Line buffered
            )
            
            stdout_lines = []
            stderr_lines = []
            
            # Read stdout line by line to capture session_id for video recording
            
            # Read stderr in a background thread to prevent blocking
            def read_stderr():
                for line in process.stderr:
                    line = line.rstrip('\n')
                    stderr_lines.append(line)
                    logger.error(f"{log_prefix} [JAVA-ERR] {line}")
            
            stderr_thread = threading.Thread(target=read_stderr, daemon=True)
            stderr_thread.start()
            
            # Read stdout line by line
            for line in process.stdout:
                line = line.rstrip('\n')
                stdout_lines.append(line)
                logger.info(f"{log_prefix} [JAVA] {line}")
                
                # Capture session_id from BaseTest output
                if "[THEX] Browser initialized, session:" in line and not java_session_id:
                    java_session_id = line.split("session:")[-1].strip()
                    logger.info(f"{log_prefix} Captured Java session ID: {java_session_id}")
                    
                    # Start video recording now that we have the session_id
                    video_path = video_recorder.start_recording(
                        test_file.stem,
                        browser=browser_type,
                        session_id=java_session_id
                    )
                    if video_path:
                        logger.info(f"{log_prefix} Video recording started for Java test")
                    else:
                        logger.warning(f"{log_prefix} Could not start video recording")
            
            # Wait for process to complete
            process.wait(timeout=300)
            stderr_thread.join(timeout=5)
            
            if process.returncode == 0:
                result.status = "PASSED"
                logger.info(f"{log_prefix} JAVA TEST PASSED")
                
                # Check for screenshot saved by BaseTest
                success_screenshot = self.screenshots_dir / f"{class_name}_{browser_type}_success.png"
                if success_screenshot.exists():
                    result.screenshot_path = str(success_screenshot)
                    screenshot_data = {
                        "run_id_string": self.run_id_string,
                        "test_name": test_file.name,
                        "filename": success_screenshot.name,
                        "name": success_screenshot.name,
                        "filepath": str(success_screenshot),
                        "step": f"Success - {test_file.name}",
                        "browser": browser_type
                    }
                    self.db_service.save_screenshot(screenshot_data)
            else:
                result.status = "FAILED"
                stderr_output = '\n'.join(stderr_lines)
                result.error_message = stderr_output or f"Java test exited with code {process.returncode}"
                result.error_stack = '\n'.join(stderr_lines + stdout_lines)
                logger.error(f"{log_prefix} JAVA TEST FAILED")
                
                failure_screenshot = self.screenshots_dir / f"{class_name}_{browser_type}_failure.png"
                if failure_screenshot.exists():
                    result.screenshot_path = str(failure_screenshot)
                    screenshot_data = {
                        "run_id_string": self.run_id_string,
                        "test_name": test_file.name,
                        "filename": failure_screenshot.name,
                        "name": failure_screenshot.name,
                        "filepath": str(failure_screenshot),
                        "step": f"Failure - {test_file.name}",
                        "browser": browser_type
                    }
                    self.db_service.save_screenshot(screenshot_data)
                
        except subprocess.TimeoutExpired:
            result.status = "FAILED"
            result.error_message = "Java test execution timed out (5 minutes)"
            logger.error(f"{log_prefix} JAVA TEST TIMED OUT")
            # Kill the process if it's still running
            try:
                process.kill()
            except:
                pass
            
        except Exception as e:
            result.status = "FAILED"
            result.error_message = str(e)
            result.error_stack = traceback.format_exc()
            logger.error(f"{log_prefix} JAVA TEST FAILED WITH ERROR: {e}")
            logger.error(result.error_stack)
        
        finally:
            result.end_time = datetime.now()
            result.duration = (result.end_time - result.start_time).total_seconds()
            
            # Stop video recording (using LOCAL video_recorder)
            if video_recorder.is_recording():
                stopped_video_path = video_recorder.stop_recording()
                if stopped_video_path:
                    video_file_obj = Path(stopped_video_path)
                    if video_file_obj.exists():
                        video_data = {
                            "run_id_string": self.run_id_string,
                            "test_name": test_file.name,
                            "filename": video_file_obj.name,
                            "name": video_file_obj.name,
                            "filepath": str(stopped_video_path),
                            "duration_seconds": result.duration,
                            "browser": browser_type
                        }
                        self.db_service.save_video(video_data)
                        logger.info(f"{log_prefix} Video saved to database")
            
            # Collect any screenshots created during the test
            if hasattr(result, 'start_time') and result.start_time:
                self.collect_test_screenshots(test_file.name, result.start_time, browser_type)
            
            # Save test result to database
            test_result_data = {
                "run_id_string": self.run_id_string,
                "test_name": test_file.name,
                "browser": browser_type,
                "status": result.status,
                "duration_seconds": result.duration,
                "start_time": result.start_time,
                "end_time": result.end_time,
                "error_message": result.error_message,
                "error_stack": getattr(result, 'error_stack', None)
            }
            self.db_service.save_test_result(test_result_data)
            
            # Save log entry to database
            log_data = {
                "run_id_string": self.run_id_string,
                "test_name": test_file.name,
                "browser": browser_type,
                "message": f"Test {result.status}: {test_file.name} [{browser_type}]",
                "level": "info" if result.status == "PASSED" else "error"
            }
            self.db_service.save_log(log_data)
            
            logger.info(f"{log_prefix} Duration: {result.duration:.2f} seconds")
            logger.info("=" * 80)
        
        return result
    
    def execute_test(self, test_file: Path, browser_type: str = None):
        """
        Execute a single test file on a specific browser.
        Routes to Selenium or Playwright based on self.framework,
        and to Python or Java based on file extension.
        Thread-safe — creates LOCAL browser/video instances per execution.
        Can be called in parallel from ThreadPoolExecutor.
        
        Args:
            test_file: Path to the test script
            browser_type: Browser to run on ("chrome" or "firefox")
        """
        # Route based on framework
        if self.framework == "playwright":
            if test_file.suffix == '.java':
                return self.execute_playwright_java_test(test_file, browser_type)
            return self.execute_playwright_test(test_file, browser_type)
        
        # Selenium framework (default)
        # Route Java tests to dedicated method
        if test_file.suffix == '.java':
            return self.execute_java_test(test_file, browser_type)
        
        # Python test execution below
        browser_type = browser_type or self.selected_browser
        log_prefix = f"[{test_file.stem}/{browser_type}]"
        
        result = TestResult(test_file.name, browser=browser_type)
        result.status = "RUNNING"
        result.start_time = datetime.now()
        
        # Create LOCAL instances for thread safety — each test gets its own
        browser_manager = BrowserManager(browser_type=browser_type, headless=False)
        video_recorder = VideoRecorder(str(self.videos_dir))
        screenshot_handler = Screenshot(str(self.screenshots_dir))
        
        logger.info("")
        logger.info("=" * 80)
        logger.info(f" {log_prefix} RUNNING TEST: {test_file.name} on {browser_type}")
        logger.info("=" * 80)
        
        raw_driver = None

        try:
            # Initialize browser via Grid Hub
            raw_driver = browser_manager.get_driver()
            logger.info(f"{log_prefix} Browser initialized (session: {browser_manager.session_id})")

            # Wrap Selenium driver to auto-capture step-level screenshots
            driver = create_step_screenshot_driver(
                driver=raw_driver,
                screenshot_handler=screenshot_handler,
                test_id=test_file.stem,
                browser_type=browser_type,
            )
            
            # Start video recording AFTER browser is initialized
            # Pass session_id so video recorder can find the exact Grid node container
            video_recorder.start_recording(
                test_file.stem,
                browser=browser_type,
                session_id=browser_manager.session_id
            )
            
            # Load and execute test module
            module = self.load_test_module(test_file)
            
            # Check if module has run_test function
            if hasattr(module, 'run_test'):
                logger.info(f"{log_prefix} Executing test function...")
                
                # Capture Python print() statements from user's test script
                with PrintCapture(log_prefix):
                    test_passed = module.run_test(driver)
                
                if test_passed:
                    result.status = "PASSED"
                    logger.info(f"{log_prefix} TEST PASSED")
                    # Capture success screenshot (include browser in filename for uniqueness)
                    screenshot_path = screenshot_handler.capture_success(
                        raw_driver, f"{test_file.stem}_{browser_type}"
                    )
                    result.screenshot_path = screenshot_path
                    
                    # Save screenshot to database
                    if screenshot_path:
                        screenshot_file_obj = Path(screenshot_path)
                        if screenshot_file_obj.exists():
                            screenshot_data = {
                                "run_id_string": self.run_id_string,
                                "test_name": test_file.name,
                                "filename": screenshot_file_obj.name,
                                "name": screenshot_file_obj.name,
                                "filepath": str(screenshot_path),
                                "step": f"Success - {test_file.name}",
                                "browser": browser_type
                            }
                            self.db_service.save_screenshot(screenshot_data)
                else:
                    result.status = "FAILED"
                    logger.error(f"{log_prefix} TEST FAILED")
                    # Capture failure screenshot
                    screenshot_path = screenshot_handler.capture_failure(
                        raw_driver, f"{test_file.stem}_{browser_type}"
                    )
                    result.screenshot_path = screenshot_path
                    result.error_message = "Test returned False"
                    
                    # Save screenshot to database
                    if screenshot_path:
                        screenshot_file_obj = Path(screenshot_path)
                        if screenshot_file_obj.exists():
                            screenshot_data = {
                                "run_id_string": self.run_id_string,
                                "test_name": test_file.name,
                                "filename": screenshot_file_obj.name,
                                "name": screenshot_file_obj.name,
                                "filepath": str(screenshot_path),
                                "step": f"Failure - {test_file.name}",
                                "browser": browser_type
                            }
                            self.db_service.save_screenshot(screenshot_data)
            else:
                raise Exception("Test module does not have 'run_test' function")
                
        except Exception as e:
            result.status = "FAILED"
            result.error_message = str(e)
            result.error_stack = traceback.format_exc()
            logger.error(f"{log_prefix} TEST FAILED WITH ERROR: {e}")
            logger.error(result.error_stack)
            
            # Try to capture failure screenshot
            try:
                if raw_driver:
                    screenshot_path = screenshot_handler.capture_failure(
                        raw_driver, f"{test_file.stem}_{browser_type}"
                    )
                    result.screenshot_path = screenshot_path
            except:
                pass
        
        finally:
            # Collect all screenshots created during the test
            if hasattr(result, 'start_time') and result.start_time:
                self.collect_test_screenshots(test_file.name, result.start_time, browser_type)
            
            # Calculate duration FIRST before using it
            result.end_time = datetime.now()
            result.duration = (result.end_time - result.start_time).total_seconds()
            
            # Stop video recording (using LOCAL video_recorder)
            if video_recorder.is_recording():
                stopped_video_path = video_recorder.stop_recording()
                if stopped_video_path:
                    video_file_obj = Path(stopped_video_path)
                    if video_file_obj.exists():
                        video_data = {
                            "run_id_string": self.run_id_string,
                            "test_name": test_file.name,
                            "filename": video_file_obj.name,
                            "name": video_file_obj.name,
                            "filepath": str(stopped_video_path),
                            "duration_seconds": result.duration,
                            "browser": browser_type
                        }
                        self.db_service.save_video(video_data)
            
            # Clean up browser (LOCAL browser_manager)
            if browser_manager:
                try:
                    browser_manager.quit()
                    logger.info(f"{log_prefix} Browser closed")
                except:
                    pass
            
            # Save individual test result to database
            test_result_data = {
                "run_id_string": self.run_id_string,
                "test_name": test_file.name,
                "browser": browser_type,
                "status": result.status,
                "duration_seconds": result.duration,
                "start_time": result.start_time,
                "end_time": result.end_time,
                "error_message": result.error_message,
                "error_stack": getattr(result, 'error_stack', None)
            }
            self.db_service.save_test_result(test_result_data)
            
            # Save log entry to database
            log_data = {
                "run_id_string": self.run_id_string,
                "test_name": test_file.name,
                "browser": browser_type,
                "message": f"Test {result.status}: {test_file.name} [{browser_type}]",
                "level": "info" if result.status == "PASSED" else "error"
            }
            self.db_service.save_log(log_data)
            
            logger.info(f"{log_prefix} Duration: {result.duration:.2f} seconds")
            logger.info("=" * 80)
        
        return result
    
    # ======================== PLAYWRIGHT EXECUTION METHODS ========================
    
    def execute_playwright_test(self, test_file: Path, browser_type: str = None):
        """
        Execute a Python test file using Playwright (self-contained, no Grid needed).
        The test script's run_test() receives a Playwright Page instead of a Selenium driver.
        Thread-safe — creates a fresh PlaywrightBrowserManager per execution.
        """
        browser_type = browser_type or self.selected_browser
        log_prefix = f"[PW/{test_file.stem}/{browser_type}]"
        
        result = TestResult(test_file.name, browser=browser_type)
        result.status = "RUNNING"
        result.start_time = datetime.now()
        
        pw_manager = PlaywrightBrowserManager(browser_type=browser_type, headless=True)
        
        logger.info("")
        logger.info("=" * 80)
        logger.info(f" {log_prefix} RUNNING PLAYWRIGHT TEST: {test_file.name} on {browser_type}")
        logger.info("=" * 80)
        
        try:
            # Launch Playwright browser with built-in video recording
            page = pw_manager.launch(record_video=True, test_name=test_file.stem)
            logger.info(f"{log_prefix} Playwright {browser_type} browser launched")
            
            # Load and execute test module
            module = self.load_test_module(test_file)
            
            if hasattr(module, 'run_test'):
                logger.info(f"{log_prefix} Executing test function...")
                
                # Capture Python print() statements from user's test script
                with PrintCapture(log_prefix):
                    # Pass Playwright Page to the test (instead of Selenium driver)
                    test_passed = module.run_test(page)
                
                if test_passed:
                    result.status = "PASSED"
                    logger.info(f"{log_prefix} TEST PASSED")
                    # Capture success screenshot via Playwright
                    screenshot_path = str(self.screenshots_dir / f"{test_file.stem}_{browser_type}_success.png")
                    page.screenshot(path=screenshot_path)
                    result.screenshot_path = screenshot_path
                    
                    if Path(screenshot_path).exists():
                        screenshot_data = {
                            "run_id_string": self.run_id_string,
                            "test_name": test_file.name,
                            "filename": Path(screenshot_path).name,
                            "name": Path(screenshot_path).name,
                            "filepath": screenshot_path,
                            "step": f"Success - {test_file.name}",
                            "browser": browser_type
                        }
                        self.db_service.save_screenshot(screenshot_data)
                else:
                    result.status = "FAILED"
                    logger.error(f"{log_prefix} TEST FAILED")
                    screenshot_path = str(self.screenshots_dir / f"{test_file.stem}_{browser_type}_failure.png")
                    page.screenshot(path=screenshot_path)
                    result.screenshot_path = screenshot_path
                    result.error_message = "Test returned False"
                    
                    if Path(screenshot_path).exists():
                        screenshot_data = {
                            "run_id_string": self.run_id_string,
                            "test_name": test_file.name,
                            "filename": Path(screenshot_path).name,
                            "name": Path(screenshot_path).name,
                            "filepath": screenshot_path,
                            "step": f"Failure - {test_file.name}",
                            "browser": browser_type
                        }
                        self.db_service.save_screenshot(screenshot_data)
            else:
                raise Exception("Test module does not have 'run_test' function")
                
        except Exception as e:
            result.status = "FAILED"
            result.error_message = str(e)
            result.error_stack = traceback.format_exc()
            logger.error(f"{log_prefix} TEST FAILED WITH ERROR: {e}")
            logger.error(result.error_stack)
            
            # Try to capture failure screenshot
            try:
                if pw_manager and pw_manager.page:
                    screenshot_path = str(self.screenshots_dir / f"{test_file.stem}_{browser_type}_failure.png")
                    pw_manager.page.screenshot(path=screenshot_path)
                    result.screenshot_path = screenshot_path
            except:
                pass
        
        finally:
            # Get video path before closing
            video_file_path = pw_manager.get_video_path() if pw_manager else None
            
            # Close Playwright browser
            if pw_manager:
                try:
                    pw_manager.close()
                    logger.info(f"{log_prefix} Playwright browser closed")
                except:
                    pass
            
            # Calculate duration
            result.end_time = datetime.now()
            result.duration = (result.end_time - result.start_time).total_seconds()
            
            # Save video to database (Playwright auto-records to a file)
            if video_file_path:
                video_file_obj = Path(video_file_path)
                if video_file_obj.exists():
                    # Rename to a descriptive name
                    final_video_name = f"{test_file.stem}_{browser_type}_playwright.webm"
                    final_video_path = self.videos_dir / final_video_name
                    try:
                        import shutil
                        shutil.move(str(video_file_obj), str(final_video_path))
                        video_data = {
                            "run_id_string": self.run_id_string,
                            "test_name": test_file.name,
                            "filename": final_video_name,
                            "name": final_video_name,
                            "filepath": str(final_video_path),
                            "duration_seconds": result.duration,
                            "browser": browser_type
                        }
                        self.db_service.save_video(video_data)
                        logger.info(f"{log_prefix} Video saved to database")
                    except Exception as ve:
                        logger.warning(f"{log_prefix} Could not save video: {ve}")
            
            # Collect screenshots
            if hasattr(result, 'start_time') and result.start_time:
                self.collect_test_screenshots(test_file.name, result.start_time, browser_type)
            
            # Save test result to database
            test_result_data = {
                "run_id_string": self.run_id_string,
                "test_name": test_file.name,
                "browser": browser_type,
                "status": result.status,
                "duration_seconds": result.duration,
                "start_time": result.start_time,
                "end_time": result.end_time,
                "error_message": result.error_message,
                "error_stack": getattr(result, 'error_stack', None)
            }
            self.db_service.save_test_result(test_result_data)
            
            # Save log entry
            log_data = {
                "run_id_string": self.run_id_string,
                "test_name": test_file.name,
                "browser": browser_type,
                "message": f"Test {result.status}: {test_file.name} [{browser_type}] (Playwright)",
                "level": "info" if result.status == "PASSED" else "error"
            }
            self.db_service.save_log(log_data)
            
            logger.info(f"{log_prefix} Duration: {result.duration:.2f} seconds")
            logger.info("=" * 80)
        
        return result
    
    def execute_playwright_java_test(self, test_file: Path, browser_type: str = None):
        """
        Execute a Java test file using Playwright (via PlaywrightBaseTest helper).
        Similar to execute_java_test but uses com.thex.PlaywrightBaseTest instead of BaseTest.
        """
        browser_type = browser_type or self.selected_browser
        log_prefix = f"[PW/{test_file.stem}/{browser_type}]"
        
        result = TestResult(test_file.name, browser=browser_type)
        result.status = "RUNNING"
        result.start_time = datetime.now()
        
        logger.info("")
        logger.info("=" * 80)
        logger.info(f" {log_prefix} RUNNING PLAYWRIGHT JAVA TEST: {test_file.name} on {browser_type}")
        logger.info("=" * 80)
        
        java_libs_dir = os.getenv("JAVA_LIBS_DIR", "/app/java-libs")
        
        # Per-test compile output directory (thread-safe)
        compile_dir = self.output_dir / "java-compile" / f"{test_file.stem}_{browser_type}_pw"
        compile_dir.mkdir(parents=True, exist_ok=True)
        
        try:
            # Step 1: Validate source file is not empty
            source_code = test_file.read_text().strip()
            if not source_code:
                raise Exception(f"Java source file is empty (0 bytes): {test_file.name}")
            
            # Step 2: Extract class name
            import re
            class_match = re.search(r'public\s+class\s+(\w+)', source_code)
            if not class_match:
                raise Exception(f"No 'public class' found in {test_file.name}. Java test files must contain a public class with a 'public boolean runTest(Page page)' method.")
            class_name = class_match.group(1)
            logger.info(f"{log_prefix} Detected public class: {class_name}")
            
            # Step 3: Copy source to compile dir
            import shutil
            correct_source = compile_dir / f"{class_name}.java"
            shutil.copy2(str(test_file), str(correct_source))
            
            # Step 4: Compile
            logger.info(f"{log_prefix} Compiling {class_name}.java for Playwright...")
            compile_cp = f"/app/java-classes:{java_libs_dir}/*"
            compile_cmd = ["javac", "-cp", compile_cp, "-d", str(compile_dir), str(correct_source)]
            compile_result = subprocess.run(compile_cmd, capture_output=True, text=True, timeout=60)
            
            if compile_result.returncode != 0:
                raise Exception(f"Java compilation failed:\n{compile_result.stderr}")
            
            # Step 5: Verify .class file was actually produced
            class_file = compile_dir / f"{class_name}.class"
            if not class_file.exists():
                raise Exception(f"Compilation produced no .class file for {class_name}. Check that the source contains a valid public class.")
            
            logger.info(f"{log_prefix} Compilation successful")
            
            # Step 4: Run via PlaywrightBaseTest (no hub URL needed — browsers are local)
            run_cp = f"{str(compile_dir)}:/app/java-classes:{java_libs_dir}/*"
            run_cmd = [
                "java", "-cp", run_cp,
                "com.thex.PlaywrightBaseTest",
                class_name,
                browser_type,
                str(self.screenshots_dir),
                str(self.videos_dir)
            ]
            
            logger.info(f"{log_prefix} Executing Playwright Java test: {class_name}")
            
            # Set env vars so Java Playwright SDK uses pre-installed browsers
            # and does NOT try to download missing ones (e.g. WebKit) at runtime
            java_env = os.environ.copy()
            java_env["PLAYWRIGHT_BROWSERS_PATH"] = "/root/.cache/ms-playwright"
            java_env["PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD"] = "1"
            
            process = subprocess.Popen(run_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, bufsize=1, env=java_env)
            
            stdout_lines = []
            stderr_lines = []
            
            def read_stderr():
                for line in process.stderr:
                    line = line.rstrip('\n')
                    stderr_lines.append(line)
                    logger.error(f"{log_prefix} [JAVA-ERR] {line}")
            
            stderr_thread = threading.Thread(target=read_stderr, daemon=True)
            stderr_thread.start()
            
            for line in process.stdout:
                line = line.rstrip('\n')
                stdout_lines.append(line)
                logger.info(f"{log_prefix} [JAVA] {line}")
            
            process.wait(timeout=300)
            stderr_thread.join(timeout=5)
            
            if process.returncode == 0:
                result.status = "PASSED"
                logger.info(f"{log_prefix} PLAYWRIGHT JAVA TEST PASSED")
                success_screenshot = self.screenshots_dir / f"{class_name}_{browser_type}_success.png"
                if success_screenshot.exists():
                    result.screenshot_path = str(success_screenshot)
                    self.db_service.save_screenshot({
                        "run_id_string": self.run_id_string, "test_name": test_file.name,
                        "filename": success_screenshot.name, "name": success_screenshot.name,
                        "filepath": str(success_screenshot), "step": f"Success - {test_file.name}",
                        "browser": browser_type
                    })
            else:
                result.status = "FAILED"
                stderr_output = '\n'.join(stderr_lines)
                result.error_message = stderr_output or f"Java test exited with code {process.returncode}"
                result.error_stack = '\n'.join(stderr_lines + stdout_lines)
                logger.error(f"{log_prefix} PLAYWRIGHT JAVA TEST FAILED")
                failure_screenshot = self.screenshots_dir / f"{class_name}_{browser_type}_failure.png"
                if failure_screenshot.exists():
                    result.screenshot_path = str(failure_screenshot)
                    self.db_service.save_screenshot({
                        "run_id_string": self.run_id_string, "test_name": test_file.name,
                        "filename": failure_screenshot.name, "name": failure_screenshot.name,
                        "filepath": str(failure_screenshot), "step": f"Failure - {test_file.name}",
                        "browser": browser_type
                    })
                    
        except subprocess.TimeoutExpired:
            result.status = "FAILED"
            result.error_message = "Playwright Java test timed out (5 minutes)"
            logger.error(f"{log_prefix} PLAYWRIGHT JAVA TEST TIMED OUT")
            try: process.kill()
            except: pass
            
        except Exception as e:
            result.status = "FAILED"
            result.error_message = str(e)
            result.error_stack = traceback.format_exc()
            logger.error(f"{log_prefix} PLAYWRIGHT JAVA TEST FAILED: {e}")
            logger.error(result.error_stack)
        
        finally:
            result.end_time = datetime.now()
            result.duration = (result.end_time - result.start_time).total_seconds()
            
            # Check for Playwright video files (saved by PlaywrightBaseTest)
            # Playwright Java videos are saved to videos_dir by the context
            for vf in self.videos_dir.glob("*.webm"):
                if vf.stat().st_mtime >= result.start_time.timestamp():
                    video_data = {
                        "run_id_string": self.run_id_string, "test_name": test_file.name,
                        "filename": vf.name, "name": vf.name,
                        "filepath": str(vf), "duration_seconds": result.duration,
                        "browser": browser_type
                    }
                    self.db_service.save_video(video_data)
                    logger.info(f"{log_prefix} Video saved to database")
                    break
            
            if hasattr(result, 'start_time') and result.start_time:
                self.collect_test_screenshots(test_file.name, result.start_time, browser_type)
            
            self.db_service.save_test_result({
                "run_id_string": self.run_id_string, "test_name": test_file.name,
                "browser": browser_type, "status": result.status,
                "duration_seconds": result.duration, "start_time": result.start_time,
                "end_time": result.end_time, "error_message": result.error_message,
                "error_stack": getattr(result, 'error_stack', None)
            })
            self.db_service.save_log({
                "run_id_string": self.run_id_string, "test_name": test_file.name,
                "browser": browser_type,
                "message": f"Test {result.status}: {test_file.name} [{browser_type}] (Playwright Java)",
                "level": "info" if result.status == "PASSED" else "error"
            })
            
            logger.info(f"{log_prefix} Duration: {result.duration:.2f} seconds")
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
        logger.info(f"JSON Report saved: {report_file}")
        
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
        """Main execution method — supports parallel cross-browser execution"""
        logger.info(f"Discovering tests (language: {self.language})...")
        test_files = self.discover_tests()
        
        if not test_files:
            logger.warning("No test files found!")
            if self.language == "python":
                logger.info("Python test files should start with 'test_' or end with '_test.py'")
            elif self.language == "java":
                logger.info("Java test files should start with 'test_', 'Test', or end with 'Test.java'")
            else:
                logger.info("Test files should start with 'test_' (.py or .java)")
            return
        
        logger.info(f"Found {len(test_files)} test(s)")
        
        # Build test matrix: each test × each browser
        test_matrix = []
        for test_file in test_files:
            for browser in self.browsers:
                test_matrix.append((test_file, browser))
        
        total_executions = len(test_matrix)
        logger.info(f"Test matrix: {len(test_files)} test(s) × {len(self.browsers)} browser(s) = {total_executions} execution(s)")
        if self.parallel > 1:
            logger.info(f"Parallel execution with {self.parallel} workers")
        
        # Register/find the test run in DB BEFORE executing tests
        run_data = {
            "run_id": self.run_id_string,
            "suite_name": "Test Run",
            "browsers": self.browsers,
            "trigger_type": "manual"
        }
        self.db_service.create_test_run(run_data)
        
        # Execute tests — parallel or sequential
        if self.parallel > 1 and total_executions > 1:
            # ===== PARALLEL EXECUTION =====
            logger.info(f"Starting parallel execution ({self.parallel} workers)...")
            with ThreadPoolExecutor(max_workers=self.parallel) as executor:
                futures = {}
                for test_file, browser in test_matrix:
                    future = executor.submit(self.execute_test, test_file, browser)
                    futures[future] = (test_file.name, browser)
                
                for future in as_completed(futures):
                    test_info = futures[future]
                    try:
                        result = future.result()
                        with self._results_lock:
                            self.results.append(result)
                        logger.info(f"Completed: {test_info[0]} [{test_info[1]}] — {result.status}")
                    except Exception as e:
                        logger.error(f"Execution crashed: {test_info[0]} [{test_info[1]}] — {e}")
                        # Create a failed result for crashed executions
                        crash_result = TestResult(test_info[0], browser=test_info[1])
                        crash_result.status = "FAILED"
                        crash_result.error_message = f"Execution crashed: {str(e)}"
                        crash_result.start_time = datetime.now()
                        crash_result.end_time = datetime.now()
                        with self._results_lock:
                            self.results.append(crash_result)
        else:
            # ===== SEQUENTIAL EXECUTION (backward compatible) =====
            for test_file, browser in test_matrix:
                result = self.execute_test(test_file, browser)
                self.results.append(result)
        
        # Generate report
        logger.info("")
        logger.info("=" * 80)
        logger.info("GENERATING REPORT")
        logger.info("=" * 80)
        summary = self.generate_report()
        
        # Print summary
        logger.info("")
        logger.info("=" * 80)
        logger.info("TEST EXECUTION SUMMARY")
        logger.info("=" * 80)
        logger.info(f"Total Executions: {summary['total_tests']}")
        logger.info(f"Passed: {summary['passed']}")
        logger.info(f"Failed: {summary['failed']}")
        logger.info(f"Success Rate: {summary['success_rate']}")
        logger.info(f"Total Time: {summary['total_duration_seconds']:.2f}s")
        if self.parallel > 1:
            logger.info(f"Workers used: {self.parallel}")
        logger.info(f"Browsers: {', '.join(self.browsers)}")
        logger.info("=" * 80)
        
        # Exit with appropriate code
        if summary['failed'] > 0:
            logger.info("Some tests failed")
            sys.exit(1)
        else:
            logger.info("All tests passed!")
            sys.exit(0)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='THEX Test Runner (Selenium + Playwright)')
    parser.add_argument('--email', type=str, required=True, help='User email executing the tests (REQUIRED)')
    parser.add_argument('--username', type=str, required=True, help='Username executing the tests (REQUIRED)')
    parser.add_argument('--user-id', type=str, help='User ID (MongoDB ObjectID)')
    parser.add_argument('--test-id', type=str, help='Test execution ID')
    parser.add_argument('--backend-url', type=str, default='http://localhost:8080/api', 
                        help='Backend API URL')
    parser.add_argument('--file', type=str, help='Test file(s) to run, comma-separated (e.g., test_python.py,test_github.py)')
    parser.add_argument('--files', type=str, default=None,
                        help='Alias for --file. Comma-separated test files (e.g., test_python.py,test_github.py)')
    parser.add_argument('--browser', type=str, default='chrome', choices=['chrome', 'firefox'],
                        help='Browser to use when --browsers is not specified')
    parser.add_argument('--browsers', type=str, default=None,
                        help='Comma-separated list of browsers (e.g., chrome,firefox). Overrides --browser.')
    parser.add_argument('--parallel', type=int, default=1,
                        help='Number of parallel workers (default: 1 = sequential)')
    parser.add_argument('--language', type=str, default='python', choices=['python', 'java', 'both'],
                        help='Test script language: python, java, or both (default: python)')
    parser.add_argument('--framework', type=str, default='selenium', choices=['selenium', 'playwright'],
                        help='Test framework: selenium (Grid) or playwright (self-contained) (default: selenium)')
    
    args = parser.parse_args()
    
    # Parse browsers list
    browsers_list = None
    if args.browsers:
        browsers_list = [b.strip().lower() for b in args.browsers.split(',')]
        # Validate browser names
        valid_browsers = {'chrome', 'firefox'}
        for b in browsers_list:
            if b not in valid_browsers:
                parser.error(f"Invalid browser '{b}'. Choose from: {', '.join(valid_browsers)}")
    
    runner = TestRunner(
        email=args.email,
        username=args.username,
        user_id=args.user_id,
        test_id=args.test_id,
        backend_url=args.backend_url,
        browser=args.browser,
        browsers=browsers_list,
        parallel=args.parallel,
        language=args.language,
        framework=args.framework
    )
    
    # If specific file(s) provided, run only those (--files takes priority over --file)
    file_arg = args.files or args.file
    if file_arg:
        runner.specific_files = [f.strip() for f in file_arg.split(',') if f.strip()]
    
    runner.run()

