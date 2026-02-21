#!/usr/bin/env python3
"""
Database log handler - Saves all log messages to MongoDB
"""
import logging
from database_service import DatabaseService


class DatabaseLogHandler(logging.Handler):
    """Custom log handler that saves logs to MongoDB"""
    
    def __init__(self, db_service: DatabaseService, suite_id: str, test_name: str = None):
        super().__init__()
        self.db_service = db_service
        self.suite_id = suite_id
        self.test_name = test_name
        self.setLevel(logging.INFO)
    
    def emit(self, record):
        """Save log record to database"""
        try:
            # Skip if no database connection
            if not self.db_service or not self.db_service.connected:
                return
            
            # Format the log message
            log_entry = self.format(record)
            
            # Create log data
            log_data = {
                "suite_id": self.suite_id,
                "test_name": self.test_name or "runner",
                "message": log_entry,
                "level": record.levelname,
                "id": self.suite_id  # test_id same as suite_id
            }
            
            # Save to database
            self.db_service.save_log(log_data)
        
        except Exception as e:
            # Don't let logging errors crash the test
            print(f"Failed to save log to database: {e}")
    
    def set_test_name(self, test_name: str):
        """Update the test name for subsequent log entries"""
        self.test_name = test_name
