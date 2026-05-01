"""
Shared pytest fixtures for database_service tests.
Uses mongomock to replace real MongoDB with an in-memory mock.
"""
import sys
import os
import pytest
import mongomock
from unittest.mock import patch, MagicMock
from bson import ObjectId

# Add runner/src to Python path so we can import database_service
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))


@pytest.fixture
def mock_mongo_client():
    """Create a mongomock client that behaves like a real MongoDB client."""
    client = mongomock.MongoClient()
    return client


@pytest.fixture
def db_service(mock_mongo_client):
    """
    Create a DatabaseService instance with a mocked MongoDB connection.
    Patches MongoClient so no real MongoDB server is needed.
    """
    with patch('database_service.MongoClient', return_value=mock_mongo_client), \
         patch('database_service.gridfs.GridFS') as mock_gridfs:
        # Mock the ping command
        mock_mongo_client.admin = MagicMock()
        mock_mongo_client.admin.command = MagicMock(return_value={'ok': 1})
        
        # Create a mock GridFS instance that supports put()
        mock_fs = MagicMock()
        mock_fs.put = MagicMock(return_value=ObjectId())
        mock_gridfs.return_value = mock_fs
        
        from database_service import DatabaseService
        service = DatabaseService(username="testuser", email="test@example.com")
        
        # Ensure it's connected and using our mock
        service.connected = True
        service.client = mock_mongo_client
        service.db = mock_mongo_client["testdb"]
        service.fs = mock_fs
        
        return service


@pytest.fixture
def db_service_disconnected():
    """
    Create a DatabaseService instance that is NOT connected to any database.
    Used to test disconnected-state behavior.
    """
    with patch('database_service.MongoClient') as mock_client:
        mock_client.side_effect = Exception("Connection refused")
        
        from database_service import DatabaseService
        try:
            service = DatabaseService(username="testuser", email="test@example.com")
        except:
            # If connection fails in __init__, create manually
            service = DatabaseService.__new__(DatabaseService)
            service.username = "testuser"
            service.email = "test@example.com"
            service.user_id = None
            service.db = None
            service.client = None
            service.connected = False
            service.current_run_id = None
            service.current_run_id_string = None
            service.current_result_id = None
            service.current_browser = "chrome"
        
        return service


@pytest.fixture
def sample_run_data():
    """Sample test run data for creating test runs."""
    return {
        "run_id": "20260430_120000",
        "suite_name": "Smoke Tests",
        "browsers": ["chrome", "firefox"],
        "trigger_type": "manual"
    }


@pytest.fixture
def sample_result_data():
    """Sample test result data."""
    return {
        "test_name": "test_login.py",
        "browser": "chrome",
        "status": "PASSED",
        "duration_seconds": 5.2,
        "error_message": None
    }


@pytest.fixture
def sample_video_data(tmp_path):
    """Sample video data with a real temporary file."""
    video_file = tmp_path / "test_video.mp4"
    video_file.write_bytes(b"fake video content " * 100)
    return {
        "test_name": "test_login.py",
        "filename": "test_video.mp4",
        "name": "test_video.mp4",
        "filepath": str(video_file),
        "duration_seconds": 12.5,
        "browser": "chrome"
    }


@pytest.fixture
def sample_screenshot_data(tmp_path):
    """Sample screenshot data with a real temporary file."""
    screenshot_file = tmp_path / "test_screenshot.png"
    screenshot_file.write_bytes(b"fake png content " * 50)
    return {
        "test_name": "test_login.py",
        "filename": "test_screenshot.png",
        "name": "test_screenshot.png",
        "filepath": str(screenshot_file),
        "step": "Login Page",
        "browser": "chrome"
    }
