#!/usr/bin/env python3
"""
Database Service - MongoDB integration for test results
Saves test runs, individual results, videos, screenshots, and logs

Schema:
- test_runs: Single execution of a test suite
- test_results: Individual test within a run
- screenshots/videos/logs: Artifacts linked to result_id and run_id
"""
import os
from datetime import datetime
from typing import Optional
from pymongo import MongoClient
from pymongo.errors import ConnectionFailure
from bson import ObjectId
import gridfs
from logger import setup_logger

logger = setup_logger("database_service")


class DatabaseService:
    """Handle all MongoDB operations for test results"""
    
    def __init__(self, username: str = None, email: str = None, user_id: str = None):
        """
        Initialize database connection
        
        Args:
            username: Username to associate with test results (REQUIRED)
            email: User's email address (REQUIRED)  
            user_id: User's MongoDB ObjectID (optional)
        """
        if not username or not email:
            logger.error("Username and email are required for DatabaseService!")
            raise ValueError("username and email are required parameters")
        
        self.username = username
        self.email = email
        self.user_id = user_id
        self.db = None
        self.client = None
        self.connected = False
        
        # Track current run for linking artifacts
        self.current_run_id: Optional[ObjectId] = None
        self.current_run_id_string: Optional[str] = None
        self.current_result_id: Optional[ObjectId] = None
        self.current_browser: str = "chrome"
        
        # Get MongoDB connection details from environment
        mongo_host = os.getenv("MONGO_HOST", "mongodb")
        mongo_port = int(os.getenv("MONGO_PORT", "27017"))
        mongo_db = os.getenv("MONGO_DATABASE", "testops")
        mongo_user = os.getenv("MONGO_USERNAME", "admin")
        mongo_password = os.getenv("MONGO_PASSWORD", "admin123")
        
        # Connection string with authentication
        self.connection_string = f"mongodb://{mongo_user}:{mongo_password}@{mongo_host}:{mongo_port}/"
        self.database_name = mongo_db
        
        # Connect to database
        self._connect()
    
    def _connect(self):
        """Establish MongoDB connection"""
        try:
            self.client = MongoClient(
                self.connection_string,
                serverSelectionTimeoutMS=5000,
                connectTimeoutMS=5000
            )
            
            # Test connection
            self.client.admin.command('ping')
            
            self.db = self.client[self.database_name]
            self.fs = gridfs.GridFS(self.db)  # Initialize GridFS for video storage
            self.connected = True
            logger.info(f"Connected to MongoDB: {self.database_name}")
            
        except ConnectionFailure as e:
            logger.error(f"Failed to connect to MongoDB: {e}")
            self.connected = False
        except Exception as e:
            logger.error(f"Database connection error: {e}")
            self.connected = False
    
    def set_current_browser(self, browser: str):
        """Set the browser being used for testing"""
        self.current_browser = browser
        logger.info(f"Current browser set to: {browser}")
    
    def create_test_run(self, run_data: dict) -> Optional[ObjectId]:
        """
        Create a new test run record
        
        Args:
            run_data: Dictionary with run information
                - run_id: Human-readable ID (e.g., 20260220_143052)
                - suite_id: Reference to test_suites._id (optional)
                - suite_name: Name of the suite being run
                - browsers: List of browsers
                - trigger_type: manual, github, scheduled
            
        Returns:
            ObjectId of created run, or None on failure
        """
        if not self.connected:
            logger.warning("Database not connected, skipping test run creation")
            return None
        
        try:
            now = datetime.now()
            
            # Build run document matching Go model
            run_doc = {
                "run_id": run_data.get("run_id", now.strftime("%Y%m%d_%H%M%S")),
                "suite_name": run_data.get("suite_name", "Test Run"),
                "triggered_by": self.email,
                "trigger_type": run_data.get("trigger_type", "manual"),
                "browsers": run_data.get("browsers", [self.current_browser]),
                "start_time": now,
                "status": "running",
                "total_tests": 0,  # Always start at 0 - finalize_run uses $inc
                "passed": 0,
                "failed": 0,
                "skipped": 0,
                "success_rate": 0.0,
                "duration_seconds": 0.0,
                "created_at": now,
                "updated_at": now
            }
            
            # Add suite reference if provided
            if run_data.get("suite_id"):
                try:
                    run_doc["suite_id"] = ObjectId(run_data["suite_id"])
                except:
                    pass
            
            # Check if run already exists (created by backend or another parallel runner)
            existing_run = self.db.test_runs.find_one({"run_id": run_doc["run_id"]})
            if existing_run:
                # Update existing run to "running" status (only if not already running/completed)
                # Also add this runner's browser to the browsers array if not already present
                self.db.test_runs.update_one(
                    {"_id": existing_run["_id"], "status": {"$nin": ["running", "completed"]}},
                    {"$set": {"status": "running", "start_time": now, "updated_at": now}}
                )
                # Add browser to list (avoid duplicates)
                self.db.test_runs.update_one(
                    {"_id": existing_run["_id"]},
                    {"$addToSet": {"browsers": self.current_browser}}
                )
                self.current_run_id = existing_run["_id"]
                self.current_run_id_string = run_doc["run_id"]
                logger.info(f"Found existing test run: {run_doc['run_id']} (ID: {existing_run['_id']}), updated to running")
                return existing_run["_id"]
            
            # Insert new run into database
            result = self.db.test_runs.insert_one(run_doc)
            
            # Store for linking artifacts
            self.current_run_id = result.inserted_id
            self.current_run_id_string = run_doc["run_id"]
            
            logger.info(f"Test run created: {run_doc['run_id']} (ID: {result.inserted_id})")
            return result.inserted_id
            
        except Exception as e:
            logger.error(f"Failed to create test run: {e}")
            return None
    
    def save_test_result(self, result_data: dict) -> Optional[ObjectId]:
        """
        Save individual test result
        
        Args:
            result_data: Dictionary with test result information
                - test_name: Name of the test
                - status: PASSED, FAILED, SKIPPED
                - duration_seconds: Execution time
                - error_message: Error details (if failed)
            
        Returns:
            ObjectId of created result, or None on failure
        """
        if not self.connected:
            logger.warning("Database not connected, skipping test result save")
            return None
        
        try:
            now = datetime.now()
            
            # Build result document matching Go model
            result_doc = {
                "run_id_string": self.current_run_id_string or result_data.get("run_id_string"),
                "test_name": result_data.get("test_name"),
                "browser": result_data.get("browser", self.current_browser),
                "status": result_data.get("status", "UNKNOWN"),
                "duration_seconds": result_data.get("duration_seconds", 0),
                "start_time": result_data.get("start_time", now),
                "end_time": result_data.get("end_time", now),
                "error_message": result_data.get("error_message"),
                "created_at": now
            }
            
            # Add run reference if available
            if self.current_run_id:
                result_doc["run_id"] = self.current_run_id
            
            # Check if a pending result already exists (created by backend)
            existing_result = None
            if self.current_run_id:
                existing_result = self.db.test_results.find_one({
                    "run_id": self.current_run_id,
                    "test_name": result_data.get("test_name"),
                    "browser": result_data.get("browser", self.current_browser)
                })
            
            if existing_result:
                # Update existing result
                self.db.test_results.update_one(
                    {"_id": existing_result["_id"]},
                    {"$set": {
                        "status": result_data.get("status", "UNKNOWN"),
                        "duration_seconds": result_data.get("duration_seconds", 0),
                        "start_time": result_data.get("start_time", now),
                        "end_time": result_data.get("end_time", now),
                        "error_message": result_data.get("error_message"),
                    }}
                )
                self.current_result_id = existing_result["_id"]
                logger.info(f"Test result updated: {result_data['test_name']} ({result_data.get('status')})")
                return existing_result["_id"]
            
            # Insert new result into database
            result = self.db.test_results.insert_one(result_doc)
            
            # Store for linking artifacts
            self.current_result_id = result.inserted_id
            
            logger.info(f"Test result saved: {result_data['test_name']} ({result_data.get('status')})")
            return result.inserted_id
            
        except Exception as e:
            logger.error(f"Failed to save test result: {e}")
            return None
    
    def save_video(self, video_data: dict) -> bool:
        """
        Save video to GridFS and metadata to videos collection
        
        Args:
            video_data: Dictionary with video information including filepath
            
        Returns:
            True if successful, False otherwise
        """
        if not self.connected:
            logger.warning("Database not connected, skipping video save")
            return False
        
        try:
            filepath = video_data.get('filepath')
            gridfs_id = None
            size_bytes = 0
            
            # Save video file to GridFS if it exists
            if filepath and os.path.exists(filepath):
                size_bytes = os.path.getsize(filepath)
                with open(filepath, 'rb') as video_file:
                    gridfs_id = self.fs.put(
                        video_file,
                        filename=video_data.get('filename', video_data.get('name')),
                        content_type='video/mp4',
                        run_id_string=self.current_run_id_string,
                        test_name=video_data.get('test_name')
                    )
                logger.info(f"Video uploaded to GridFS: {gridfs_id}")
            
            now = datetime.now()
            
            # Build video document matching Go model
            video_doc = {
                "run_id_string": self.current_run_id_string or video_data.get("run_id_string"),
                "test_name": video_data.get("test_name"),
                "browser": video_data.get("browser", self.current_browser),
                "name": video_data.get("name") or video_data.get("filename"),
                "content_type": "video/mp4",
                "duration_seconds": video_data.get("duration_seconds", 0),
                "size_bytes": size_bytes,
                "created_at": now
            }
            
            # Add ObjectID references if available
            if self.current_run_id:
                video_doc["run_id"] = self.current_run_id
            if self.current_result_id:
                video_doc["result_id"] = self.current_result_id
            if gridfs_id:
                video_doc["gridfs_id"] = str(gridfs_id)
            
            # Insert metadata into database
            self.db.videos.insert_one(video_doc)
            
            logger.info(f"Video saved: {video_doc.get('name')} ({size_bytes / (1024*1024):.2f} MB)")
            return True
            
        except Exception as e:
            logger.error(f"Failed to save video: {e}")
            return False
    
    def save_screenshot(self, screenshot_data: dict) -> bool:
        """
        Save screenshot with binary data to MongoDB
        
        Args:
            screenshot_data: Dictionary with screenshot information including filepath
            
        Returns:
            True if successful, False otherwise
        """
        if not self.connected:
            logger.warning("Database not connected, skipping screenshot save")
            return False
        
        try:
            # Read the screenshot file
            filepath = screenshot_data.get('filepath')
            file_data = None
            size_bytes = 0
            
            if filepath and os.path.exists(filepath):
                with open(filepath, 'rb') as image_file:
                    file_data = image_file.read()
                    size_bytes = len(file_data)
            
            now = datetime.now()
            
            # Build screenshot document matching Go model
            run_id_string = self.current_run_id_string or screenshot_data.get("run_id_string")
            test_name = screenshot_data.get("test_name")
            browser = screenshot_data.get("browser", self.current_browser)
            name = screenshot_data.get("name") or screenshot_data.get("filename")
            step = screenshot_data.get("step", "")

            screenshot_doc = {
                "run_id_string": run_id_string,
                "test_name": test_name,
                "browser": browser,
                "name": name,
                "step": step,
                "content_type": "image/png",
                "size_bytes": size_bytes,
                "created_at": now
            }
            
            # Add ObjectID references if available
            if self.current_run_id:
                screenshot_doc["run_id"] = self.current_run_id
            if self.current_result_id:
                screenshot_doc["result_id"] = self.current_result_id
            
            # Store binary data
            if file_data:
                screenshot_doc["file_data"] = file_data

            # Prevent duplicate inserts caused by repeated directory scans across parallel executions.
            # This upsert is atomic: same screenshot key will be inserted once and reused on retries.
            dedupe_filter = {
                "run_id_string": run_id_string,
                "test_name": test_name,
                "browser": browser,
                "name": name,
                "step": step,
            }
            if self.current_run_id:
                dedupe_filter["run_id"] = self.current_run_id

            result = self.db.screenshots.update_one(
                dedupe_filter,
                {"$setOnInsert": screenshot_doc},
                upsert=True,
            )

            if result.upserted_id is not None:
                logger.info(f"Screenshot saved: {screenshot_doc.get('name')}")
            else:
                logger.debug(f"Screenshot already exists, skipped duplicate: {screenshot_doc.get('name')}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to save screenshot: {e}")
            return False
    
    def save_log(self, log_data: dict) -> bool:
        """
        Save log entry
        
        Args:
            log_data: Dictionary with log information
            
        Returns:
            True if successful, False otherwise
        """
        if not self.connected:
            logger.warning("Database not connected, skipping log save")
            return False
        
        try:
            now = datetime.now()
            
            # Build log document matching Go model
            log_doc = {
                "run_id_string": self.current_run_id_string or log_data.get("run_id_string"),
                "test_name": log_data.get("test_name"),
                "browser": log_data.get("browser", self.current_browser),
                "level": log_data.get("level", "info").lower(),
                "message": log_data.get("message"),
                "created_at": now
            }
            
            # Add ObjectID references if available
            if self.current_run_id:
                log_doc["run_id"] = self.current_run_id
            if self.current_result_id:
                log_doc["result_id"] = self.current_result_id
            
            # Insert into database
            self.db.logs.insert_one(log_doc)
            
            return True
            
        except Exception as e:
            logger.error(f"Failed to save log: {e}")
            return False
    
    def update_test_run(self, run_id: ObjectId = None, update_data: dict = None) -> bool:
        """
        Update test run with final results
        
        Args:
            run_id: ObjectId of the test run (defaults to current)
            update_data: Dictionary with fields to update
            
        Returns:
            True if successful, False otherwise
        """
        if not self.connected:
            logger.warning("Database not connected, skipping test run update")
            return False
        
        try:
            target_id = run_id or self.current_run_id
            if not target_id:
                logger.warning("No run ID specified for update")
                return False
            
            update_data = update_data or {}
            update_data['updated_at'] = datetime.now()
            
            result = self.db.test_runs.update_one(
                {"_id": target_id},
                {"$set": update_data}
            )
            
            if result.modified_count > 0:
                logger.info(f"Test run updated: {target_id}")
                return True
            else:
                logger.warning(f"No test run found with ID: {target_id}")
                return False
                
        except Exception as e:
            logger.error(f"Failed to update test run: {e}")
            return False
    
    def finalize_run(self, total_tests: int, passed: int, failed: int, 
                     duration_seconds: float, status: str = "completed") -> bool:
        """
        Finalize test run with summary statistics.
        Uses atomic $inc operations so parallel runners can safely update 
        the same test_run document without overwriting each other's counts.
        
        Args:
            total_tests: Total number of tests executed by this runner
            passed: Number of passed tests by this runner
            failed: Number of failed tests by this runner
            duration_seconds: Execution time for this runner's tests
            status: Final status (completed, failed, cancelled)
            
        Returns:
            True if successful, False otherwise
        """
        if not self.connected:
            logger.warning("Database not connected, skipping test run finalize")
            return False
        
        try:
            target_id = self.current_run_id
            if not target_id:
                logger.warning("No run ID specified for finalize")
                return False
            
            now = datetime.now()
            
            # Atomically increment passed/failed/skipped counters (parallel-safe)
            # NOTE: total_tests is pre-set by the backend to the expected count (files × browsers),
            # so we do NOT $inc it here. We only $inc passed/failed/skipped.
            result = self.db.test_runs.update_one(
                {"_id": target_id},
                {
                    "$inc": {
                        "passed": passed,
                        "failed": failed,
                        "skipped": total_tests - passed - failed,
                    },
                    "$set": {
                        "updated_at": now,
                    },
                    "$max": {
                        "end_time": now,
                        "duration_seconds": duration_seconds,
                    }
                }
            )
            
            if result.modified_count > 0:
                # After incrementing, read back and check if ALL runners are done
                updated_run = self.db.test_runs.find_one({"_id": target_id})
                if updated_run:
                    expected_total = updated_run.get("total_tests", 0)
                    p = updated_run.get("passed", 0)
                    f = updated_run.get("failed", 0)
                    s = updated_run.get("skipped", 0)
                    completed_count = p + f + s
                    rate = (p / expected_total * 100) if expected_total > 0 else 0.0
                    
                    update_fields = {"success_rate": rate}
                    
                    # Only mark as completed/failed when ALL runners have reported
                    if completed_count >= expected_total:
                        final_status = "completed" if f == 0 else "failed"
                        update_fields["status"] = final_status
                        logger.info(f"All {expected_total} tests done ({p} passed, {f} failed) status={final_status}")
                    else:
                        # Still waiting for other runners — keep status as "running"
                        update_fields["status"] = "running"
                        logger.info(f" {completed_count}/{expected_total} tests done so far ({p} passed, {f} failed)")
                    
                    self.db.test_runs.update_one(
                        {"_id": target_id},
                        {"$set": update_fields}
                    )
                
                logger.info(f"Test run updated: {target_id}")
                return True
            else:
                logger.warning(f"No test run found with ID: {target_id}")
                return False
                
        except Exception as e:
            logger.error(f"Failed to finalize test run: {e}")
            return False
    
    # Legacy compatibility methods
    def create_test_suite(self, suite_data: dict) -> str:
        """
        Legacy: Create test run (for backward compatibility)
        """
        run_id = self.create_test_run({
            "run_id": suite_data.get("suite_id"),
            "suite_name": suite_data.get("suite_name", "Test Run"),
            "total_tests": suite_data.get("total_tests", 0),
            "trigger_type": "manual"
        })
        return suite_data.get("suite_id") if run_id else None
    
    def update_test_suite(self, suite_id: str, update_data: dict) -> bool:
        """
        Legacy: Update test run by string ID (for backward compatibility)
        """
        if not self.connected:
            return False
        
        try:
            update_data['updated_at'] = datetime.now()
            
            result = self.db.test_runs.update_one(
                {"run_id": suite_id},
                {"$set": update_data}
            )
            
            return result.modified_count > 0
            
        except Exception as e:
            logger.error(f"Failed to update test run: {e}")
            return False
    
    def get_user_test_runs(self, email: str = None, limit: int = 10):
        """
        Get test runs for a user
        
        Args:
            email: User email to filter by (default: self.email)
            limit: Maximum number of results
            
        Returns:
            List of test run documents
        """
        if not self.connected:
            logger.warning("Database not connected")
            return []
        
        try:
            user_email = email or self.email
            
            runs = list(
                self.db.test_runs
                .find({"triggered_by": user_email})
                .sort("created_at", -1)
                .limit(limit)
            )
            
            return runs
            
        except Exception as e:
            logger.error(f"Failed to fetch test runs: {e}")
            return []
    
    def close(self):
        """Close database connection"""
        if self.client:
            self.client.close()
            logger.info("Database connection closed")
