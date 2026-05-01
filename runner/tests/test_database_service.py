"""
Unit tests for DatabaseService.

These tests verify the core functionality of the database service module
which handles all MongoDB operations for test results, videos, screenshots, and logs.

Initial baseline tests — covering main paths but not all boundary conditions.
"""
import pytest
from unittest.mock import patch, MagicMock
from bson import ObjectId
from datetime import datetime


class TestDatabaseServiceInit:
    """Tests for DatabaseService initialization and validation."""

    def test_init_requires_username_and_email(self):
        """Verify that creating a DatabaseService without username/email raises ValueError."""
        from database_service import DatabaseService
        
        with patch('database_service.MongoClient'):
            with pytest.raises(ValueError, match="username and email are required"):
                DatabaseService(username=None, email="test@example.com")

    def test_init_with_valid_params(self, db_service):
        """Verify that DatabaseService initializes correctly with valid parameters."""
        assert db_service.username == "testuser"
        assert db_service.email == "test@example.com"
        assert db_service.connected is True

    def test_init_sets_default_browser(self, db_service):
        """Verify that default browser is set to chrome."""
        assert db_service.current_browser == "chrome"


class TestCreateTestRun:
    """Tests for creating test run records."""

    def test_create_test_run_returns_object_id(self, db_service, sample_run_data):
        """Verify that create_test_run returns a valid ObjectId."""
        result = db_service.create_test_run(sample_run_data)
        assert result is not None
        assert isinstance(result, ObjectId)

    def test_create_test_run_stores_correct_data(self, db_service, sample_run_data):
        """Verify that created run has correct fields in the database."""
        db_service.create_test_run(sample_run_data)
        
        run = db_service.db.test_runs.find_one({"run_id": "20260430_120000"})
        assert run is not None
        assert run["suite_name"] == "Smoke Tests"
        assert run["triggered_by"] == "test@example.com"
        assert run["status"] == "running"

    def test_create_test_run_when_disconnected(self, db_service_disconnected, sample_run_data):
        """Verify that create_test_run returns None when database is disconnected."""
        result = db_service_disconnected.create_test_run(sample_run_data)
        assert result is None

    def test_create_test_run_updates_existing_run(self, db_service, sample_run_data):
        """Verify that creating a run with same run_id updates existing instead of duplicate."""
        first_id = db_service.create_test_run(sample_run_data)
        second_id = db_service.create_test_run(sample_run_data)
        
        # Should return the existing run's ID
        assert first_id == second_id

    def test_create_test_run_sets_current_run_id(self, db_service, sample_run_data):
        """Verify that create_test_run sets the current_run_id for linking artifacts."""
        run_id = db_service.create_test_run(sample_run_data)
        assert db_service.current_run_id == run_id
        assert db_service.current_run_id_string == "20260430_120000"


class TestSaveTestResult:
    """Tests for saving individual test results."""

    def test_save_test_result_returns_object_id(self, db_service, sample_result_data):
        """Verify that save_test_result returns a valid ObjectId."""
        result = db_service.save_test_result(sample_result_data)
        assert result is not None
        assert isinstance(result, ObjectId)

    def test_save_test_result_stores_correct_status(self, db_service, sample_result_data):
        """Verify that test result status is stored correctly."""
        db_service.save_test_result(sample_result_data)
        
        saved = db_service.db.test_results.find_one({"test_name": "test_login.py"})
        assert saved["status"] == "PASSED"
        assert saved["duration_seconds"] == 5.2

    def test_save_test_result_when_disconnected(self, db_service_disconnected, sample_result_data):
        """Verify that save_test_result returns None when disconnected."""
        result = db_service_disconnected.save_test_result(sample_result_data)
        assert result is None

    def test_save_failed_test_result(self, db_service):
        """Verify that failed test results are stored with error messages."""
        result_data = {
            "test_name": "test_checkout.py",
            "browser": "firefox",
            "status": "FAILED",
            "duration_seconds": 3.1,
            "error_message": "Element not found"
        }
        db_service.save_test_result(result_data)
        
        saved = db_service.db.test_results.find_one({"test_name": "test_checkout.py"})
        assert saved["status"] == "FAILED"
        assert saved["error_message"] == "Element not found"


class TestSaveVideo:
    """Tests for saving video artifacts."""

    def test_save_video_returns_true(self, db_service, sample_video_data):
        """Verify that save_video returns True on success."""
        result = db_service.save_video(sample_video_data)
        assert result is True

    def test_save_video_stores_metadata(self, db_service, sample_video_data):
        """Verify that video metadata is stored correctly."""
        db_service.save_video(sample_video_data)
        
        saved = db_service.db.videos.find_one({"test_name": "test_login.py"})
        assert saved is not None
        assert saved["content_type"] == "video/mp4"
        assert saved["duration_seconds"] == 12.5

    def test_save_video_when_disconnected(self, db_service_disconnected, sample_video_data):
        """Verify that save_video returns False when disconnected."""
        result = db_service_disconnected.save_video(sample_video_data)
        assert result is False


class TestSaveScreenshot:
    """Tests for saving screenshot artifacts."""

    def test_save_screenshot_returns_true(self, db_service, sample_screenshot_data):
        """Verify that save_screenshot returns True on success."""
        result = db_service.save_screenshot(sample_screenshot_data)
        assert result is True

    def test_save_screenshot_stores_data(self, db_service, sample_screenshot_data):
        """Verify that screenshot data is stored in the database."""
        db_service.save_screenshot(sample_screenshot_data)
        
        saved = db_service.db.screenshots.find_one({"test_name": "test_login.py"})
        assert saved is not None
        assert saved["step"] == "Login Page"
        assert saved["content_type"] == "image/png"

    def test_save_screenshot_when_disconnected(self, db_service_disconnected, sample_screenshot_data):
        """Verify that save_screenshot returns False when disconnected."""
        result = db_service_disconnected.save_screenshot(sample_screenshot_data)
        assert result is False


class TestSaveLog:
    """Tests for saving log entries."""

    def test_save_log_returns_true(self, db_service):
        """Verify that save_log returns True on success."""
        log_data = {
            "test_name": "test_login.py",
            "browser": "chrome",
            "message": "Test started",
            "level": "info"
        }
        result = db_service.save_log(log_data)
        assert result is True

    def test_save_log_when_disconnected(self, db_service_disconnected):
        """Verify that save_log returns False when disconnected."""
        log_data = {"message": "test", "level": "info"}
        result = db_service_disconnected.save_log(log_data)
        assert result is False


class TestFinalizeRun:
    """Tests for finalizing test runs with summary statistics."""

    def test_finalize_run_updates_counts(self, db_service, sample_run_data):
        """Verify that finalize_run updates passed/failed counts."""
        db_service.create_test_run(sample_run_data)
        
        # Set total_tests in the run document (simulating backend behavior)
        db_service.db.test_runs.update_one(
            {"_id": db_service.current_run_id},
            {"$set": {"total_tests": 10}}
        )
        
        result = db_service.finalize_run(
            total_tests=10, passed=8, failed=2, duration_seconds=45.0
        )
        assert result is True

    def test_finalize_run_calculates_success_rate(self, db_service, sample_run_data):
        """Verify that success rate is calculated correctly."""
        db_service.create_test_run(sample_run_data)
        
        db_service.db.test_runs.update_one(
            {"_id": db_service.current_run_id},
            {"$set": {"total_tests": 10}}
        )
        
        db_service.finalize_run(
            total_tests=10, passed=8, failed=2, duration_seconds=45.0
        )
        
        run = db_service.db.test_runs.find_one({"_id": db_service.current_run_id})
        assert run["success_rate"] == 80.0

    def test_finalize_run_when_disconnected(self, db_service_disconnected):
        """Verify that finalize_run returns False when disconnected."""
        result = db_service_disconnected.finalize_run(
            total_tests=5, passed=3, failed=2, duration_seconds=20.0
        )
        assert result is False

    def test_finalize_run_marks_completed_when_all_pass(self, db_service, sample_run_data):
        """Verify that status is 'completed' when no tests fail."""
        db_service.create_test_run(sample_run_data)
        
        db_service.db.test_runs.update_one(
            {"_id": db_service.current_run_id},
            {"$set": {"total_tests": 5}}
        )
        
        db_service.finalize_run(
            total_tests=5, passed=5, failed=0, duration_seconds=30.0
        )
        
        run = db_service.db.test_runs.find_one({"_id": db_service.current_run_id})
        assert run["status"] == "completed"

    def test_finalize_run_marks_failed_when_tests_fail(self, db_service, sample_run_data):
        """Verify that status is 'failed' when some tests fail."""
        db_service.create_test_run(sample_run_data)
        
        db_service.db.test_runs.update_one(
            {"_id": db_service.current_run_id},
            {"$set": {"total_tests": 10}}
        )
        
        db_service.finalize_run(
            total_tests=10, passed=7, failed=3, duration_seconds=60.0
        )
        
        run = db_service.db.test_runs.find_one({"_id": db_service.current_run_id})
        assert run["status"] == "failed"


class TestUpdateTestRun:
    """Tests for updating test run records."""

    def test_update_test_run_modifies_fields(self, db_service, sample_run_data):
        """Verify that update_test_run modifies the specified fields."""
        db_service.create_test_run(sample_run_data)
        
        result = db_service.update_test_run(
            update_data={"status": "cancelled"}
        )
        assert result is True
        
        run = db_service.db.test_runs.find_one({"_id": db_service.current_run_id})
        assert run["status"] == "cancelled"

    def test_update_test_run_when_disconnected(self, db_service_disconnected):
        """Verify that update_test_run returns False when disconnected."""
        result = db_service_disconnected.update_test_run(update_data={"status": "done"})
        assert result is False


class TestGetUserTestRuns:
    """Tests for fetching user's test runs."""

    def test_get_user_test_runs_returns_list(self, db_service, sample_run_data):
        """Verify that get_user_test_runs returns a list of runs."""
        db_service.create_test_run(sample_run_data)
        
        runs = db_service.get_user_test_runs()
        assert isinstance(runs, list)
        assert len(runs) == 1

    def test_get_user_test_runs_when_disconnected(self, db_service_disconnected):
        """Verify that get_user_test_runs returns empty list when disconnected."""
        runs = db_service_disconnected.get_user_test_runs()
        assert runs == []


class TestSetCurrentBrowser:
    """Tests for setting current browser."""

    def test_set_current_browser(self, db_service):
        """Verify that set_current_browser updates the browser."""
        db_service.set_current_browser("firefox")
        assert db_service.current_browser == "firefox"


class TestClose:
    """Tests for closing database connection."""

    def test_close_closes_client(self, db_service):
        """Verify that close() closes the MongoDB client connection."""
        db_service.close()
        # Should not raise an error


# =========================================================================
# MUTANT-KILLING TESTS
# These tests target specific survived mutants found by mutmut.
# =========================================================================

class TestFinalizeRunBoundaryConditions:
    """
    Targeted tests to kill survived mutants in finalize_run().
    
    Mutant #391 (ROR): `expected_total > 0` → `expected_total >= 0`
        If expected_total is 0, the mutant would try to calculate (p / 0 * 100)
        instead of returning 0.0, causing a ZeroDivisionError.
    
    Mutant #392 (ROR): `expected_total > 0` → `expected_total > 1`
        If expected_total is 1, the mutant would return 0.0 instead of
        calculating the real rate (100%).
    
    Mutant #393 (AOR): `else 0.0` → `else 1.0`
        When expected_total is 0, the mutant returns 1.0 instead of 0.0,
        showing a false 1% success rate when no tests ran.
    """

    def test_finalize_run_zero_total_tests_returns_zero_rate(self, db_service, sample_run_data):
        """
        Kill Mutant #391: expected_total > 0 → >= 0
        When total_tests is 0, success_rate MUST be 0.0 (not cause division by zero).
        """
        db_service.create_test_run(sample_run_data)
        
        # Set total_tests to 0 — the boundary value
        db_service.db.test_runs.update_one(
            {"_id": db_service.current_run_id},
            {"$set": {"total_tests": 0}}
        )
        
        db_service.finalize_run(
            total_tests=0, passed=0, failed=0, duration_seconds=0.0
        )
        
        run = db_service.db.test_runs.find_one({"_id": db_service.current_run_id})
        # With the mutant (>= 0), this would try p/0*100 = ZeroDivisionError
        # With original (> 0), it correctly returns 0.0
        assert run["success_rate"] == 0.0

    def test_finalize_run_exactly_one_test(self, db_service, sample_run_data):
        """
        Kill Mutant #392: expected_total > 0 → > 1
        When exactly 1 test exists, the rate should be calculated (100%), not default to 0.
        """
        db_service.create_test_run(sample_run_data)
        
        db_service.db.test_runs.update_one(
            {"_id": db_service.current_run_id},
            {"$set": {"total_tests": 1}}
        )
        
        db_service.finalize_run(
            total_tests=1, passed=1, failed=0, duration_seconds=2.0
        )
        
        run = db_service.db.test_runs.find_one({"_id": db_service.current_run_id})
        # With the mutant (> 1), expected_total=1 fails the check, returns 0.0
        # With original (> 0), it correctly calculates 1/1*100 = 100.0
        assert run["success_rate"] == 100.0

    def test_finalize_run_zero_tests_rate_not_one(self, db_service, sample_run_data):
        """
        Kill Mutant #393: else 0.0 → else 1.0
        When no tests ran, the fallback rate must be exactly 0.0, not 1.0.
        """
        db_service.create_test_run(sample_run_data)
        
        db_service.db.test_runs.update_one(
            {"_id": db_service.current_run_id},
            {"$set": {"total_tests": 0}}
        )
        
        db_service.finalize_run(
            total_tests=0, passed=0, failed=0, duration_seconds=0.0
        )
        
        run = db_service.db.test_runs.find_one({"_id": db_service.current_run_id})
        # With the mutant (else 1.0), this would be 1.0
        # With original (else 0.0), this is 0.0
        assert run["success_rate"] != 1.0
        assert run["success_rate"] == 0.0


class TestUpdateTestRunBoundaryConditions:
    """
    Targeted tests to kill Mutant #339 (ROR) in update_test_run():
    `result.modified_count > 0` → `result.modified_count >= 0`
    
    When the update doesn't actually modify anything (e.g., setting a field
    to its existing value), modified_count is 0. The original code returns
    False (meaning "nothing changed"), but the mutant would return True.
    """

    def test_update_nonexistent_run_returns_false(self, db_service):
        """
        Kill Mutant #339: modified_count > 0 → >= 0
        When updating a run that doesn't exist, modified_count is 0.
        Original returns False. Mutant would return True (>= 0 is true for 0).
        """
        # Set a fake run_id that doesn't exist in DB
        db_service.current_run_id = ObjectId()
        
        result = db_service.update_test_run(
            update_data={"status": "completed"}
        )
        # With the mutant (>= 0), modified_count=0 passes, returns True
        # With original (> 0), modified_count=0 fails, returns False
        assert result is False

    def test_update_existing_run_returns_true(self, db_service, sample_run_data):
        """Verify update_test_run returns True when it actually modifies data."""
        db_service.create_test_run(sample_run_data)
        
        result = db_service.update_test_run(
            update_data={"status": "completed"}
        )
        assert result is True


class TestSaveVideoLogicalConnector:
    """
    Targeted tests to kill Mutant #193 (LCR) in save_video():
    `if filepath and os.path.exists(filepath)` → `if filepath or os.path.exists(filepath)`
    
    With 'and': BOTH conditions must be true to attempt reading the file.
    With 'or': EITHER condition true → tries to read the file.
    
    When filepath is None/empty, the 'or' mutant would try os.path.exists(None)
    which raises TypeError, or if filepath is "", os.path.exists("") returns False
    but the mutant still enters the block because filepath="" is falsy but "or"
    means the second condition is still checked.
    
    More critically: when filepath is a non-empty string pointing to a 
    non-existent file, 'or' would try to open it and crash.
    """

    def test_save_video_with_none_filepath(self, db_service):
        """
        Kill Mutant #193: 'and' → 'or'
        When filepath is None, the code should NOT try to call os.path.exists(None).
        With 'and', the short-circuit prevents the call. With 'or', it tries anyway.
        """
        video_data = {
            "test_name": "test_login.py",
            "filename": "test_video.mp4",
            "name": "test_video.mp4",
            "filepath": None,  # No file path provided
            "duration_seconds": 5.0,
            "browser": "chrome"
        }
        
        # Should succeed without trying to read a file
        result = db_service.save_video(video_data)
        assert result is True

    def test_save_video_with_nonexistent_filepath(self, db_service):
        """
        Kill Mutant #193: 'and' → 'or'
        When filepath points to a non-existent file, 'and' correctly prevents
        the open() call. With 'or', filepath is truthy so it enters the block
        and tries to open a non-existent file.
        """
        video_data = {
            "test_name": "test_login.py",
            "filename": "test_video.mp4",
            "name": "test_video.mp4",
            "filepath": "/nonexistent/path/to/video.mp4",
            "duration_seconds": 5.0,
            "browser": "chrome"
        }
        
        # Should succeed without crashing (no file to read)
        result = db_service.save_video(video_data)
        assert result is True

    def test_save_video_with_empty_filepath(self, db_service):
        """
        Test that an empty string filepath is handled correctly.
        """
        video_data = {
            "test_name": "test_login.py",
            "filename": "test_video.mp4",
            "name": "test_video.mp4",
            "filepath": "",
            "duration_seconds": 5.0,
            "browser": "chrome"
        }
        result = db_service.save_video(video_data)
        assert result is True


class TestInitValidationBoundary:
    """Additional boundary tests for __init__ validation."""

    def test_init_with_empty_username_raises(self):
        """Verify that empty username raises ValueError."""
        from database_service import DatabaseService
        
        with patch('database_service.MongoClient'):
            with pytest.raises(ValueError):
                DatabaseService(username="", email="test@example.com")

    def test_init_with_empty_email_raises(self):
        """Verify that empty email raises ValueError."""
        from database_service import DatabaseService
        
        with patch('database_service.MongoClient'):
            with pytest.raises(ValueError):
                DatabaseService(username="testuser", email="")

    def test_init_with_both_none_raises(self):
        """Verify that both None raises ValueError."""
        from database_service import DatabaseService
        
        with patch('database_service.MongoClient'):
            with pytest.raises(ValueError):
                DatabaseService(username=None, email=None)


class TestFinalizeRunStatusDetermination:
    """Additional boundary tests for status determination in finalize_run."""

    def test_finalize_run_partial_completion_stays_running(self, db_service, sample_run_data):
        """When not all tests are complete, status should remain 'running'."""
        db_service.create_test_run(sample_run_data)
        
        db_service.db.test_runs.update_one(
            {"_id": db_service.current_run_id},
            {"$set": {"total_tests": 10}}
        )
        
        # Only 5 out of 10 tests done
        db_service.finalize_run(
            total_tests=5, passed=3, failed=2, duration_seconds=20.0
        )
        
        run = db_service.db.test_runs.find_one({"_id": db_service.current_run_id})
        assert run["status"] == "running"

    def test_finalize_run_exact_boundary_completed(self, db_service, sample_run_data):
        """When completed_count exactly equals expected_total, status should finalize."""
        db_service.create_test_run(sample_run_data)
        
        db_service.db.test_runs.update_one(
            {"_id": db_service.current_run_id},
            {"$set": {"total_tests": 3}}
        )
        
        # All 3 tests done — exactly at boundary
        db_service.finalize_run(
            total_tests=3, passed=2, failed=1, duration_seconds=15.0
        )
        
        run = db_service.db.test_runs.find_one({"_id": db_service.current_run_id})
        # completed_count (2+1) >= expected_total (3), so should finalize
        assert run["status"] == "failed"  # failed because f > 0

    def test_finalize_run_100_percent_pass_rate(self, db_service, sample_run_data):
        """Verify 100% pass rate is calculated correctly."""
        db_service.create_test_run(sample_run_data)
        
        db_service.db.test_runs.update_one(
            {"_id": db_service.current_run_id},
            {"$set": {"total_tests": 5}}
        )
        
        db_service.finalize_run(
            total_tests=5, passed=5, failed=0, duration_seconds=25.0
        )
        
        run = db_service.db.test_runs.find_one({"_id": db_service.current_run_id})
        assert run["success_rate"] == 100.0
        assert run["status"] == "completed"


class TestInitDefaults:
    def test_init_env_defaults(self, monkeypatch):
        """Kill mutants related to default environment variables"""
        import os
        from database_service import DatabaseService
        
        # Clear env vars
        monkeypatch.delenv("MONGO_HOST", raising=False)
        monkeypatch.delenv("MONGO_PORT", raising=False)
        monkeypatch.delenv("MONGO_DATABASE", raising=False)
        
        with patch('database_service.MongoClient'):
            service = DatabaseService(username="testuser", email="test@example.com")
            # The defaults should be used
            assert "mongodb" in service.connection_string
            assert "27017" in service.connection_string
            assert service.database_name == "testops"

class TestCreateTestRunDefaults:
    def test_create_test_run_missing_fields(self, db_service):
        """Kill mutants that change default values like 'Test Run' or 'manual'"""
        run_data = {} # Empty dict to trigger defaults
        
        db_service.create_test_run(run_data)
        
        # find the created run
        run = db_service.db.test_runs.find_one()
        assert run["suite_name"] == "Test Run"
        assert run["trigger_type"] == "manual"
        assert run["total_tests"] == 0
        assert run["passed"] == 0
        assert run["failed"] == 0
        assert run["skipped"] == 0

class TestSaveTestResultDefaults:
    def test_save_test_result_defaults(self, db_service):
        """Kill mutants changing 'UNKNOWN' default status"""
        result_data = {
            "test_name": "test_missing.py"
        }
        db_service.save_test_result(result_data)
        
        saved = db_service.db.test_results.find_one({"test_name": "test_missing.py"})
        assert saved["status"] == "UNKNOWN"
        assert saved["duration_seconds"] == 0
