package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// TestResult represents the result of a single test case in a specific run and browser
type TestResult struct {
	ID              primitive.ObjectID `json:"id" bson:"_id,omitempty"`
	RunID           primitive.ObjectID `json:"run_id" bson:"run_id"`               // Reference to test_runs._id
	RunIDString     string             `json:"run_id_string" bson:"run_id_string"` // Human-readable run ID
	TestCaseID      primitive.ObjectID `json:"test_case_id" bson:"test_case_id"`   // Reference to test_cases._id
	TestName        string             `json:"test_name" bson:"test_name"`         // Denormalized for filtering
	Browser         string             `json:"browser" bson:"browser"`             // chrome, firefox, edge
	Status          string             `json:"status" bson:"status"`               // passed, failed, skipped, error
	StartTime       *time.Time         `json:"start_time,omitempty" bson:"start_time,omitempty"`
	EndTime         *time.Time         `json:"end_time,omitempty" bson:"end_time,omitempty"`
	DurationSeconds float64            `json:"duration_seconds" bson:"duration_seconds"`
	ErrorMessage    string             `json:"error_message,omitempty" bson:"error_message,omitempty"`
	ErrorStack      string             `json:"error_stack,omitempty" bson:"error_stack,omitempty"`
	ErrorCategory   string             `json:"error_category,omitempty" bson:"-"`
	RetryCount      int                `json:"retry_count" bson:"retry_count"`
	HasDiagnosis    bool               `json:"has_diagnosis" bson:"has_diagnosis"`
	CreatedAt       time.Time          `json:"created_at" bson:"created_at"`
}

// TestResultResponse is used for returning test result data
type TestResultResponse struct {
	ID              string     `json:"id"`
	RunID           string     `json:"run_id"`
	TestCaseID      string     `json:"test_case_id"`
	TestName        string     `json:"test_name"`
	Browser         string     `json:"browser"`
	Status          string     `json:"status"`
	StartTime       *time.Time `json:"start_time,omitempty"`
	EndTime         *time.Time `json:"end_time,omitempty"`
	DurationSeconds float64    `json:"duration_seconds"`
	ErrorMessage    string     `json:"error_message,omitempty"`
	ErrorCategory   string     `json:"error_category,omitempty"`
	RetryCount      int        `json:"retry_count"`
	HasDiagnosis    bool       `json:"has_diagnosis"`
}

// Legacy Result struct for backward compatibility
type Result struct {
	ID             string    `json:"id" bson:"_id,omitempty"`
	TestID         string    `json:"test_id" bson:"test_id"`
	Status         string    `json:"status" bson:"status"`
	VideoPath      string    `json:"video_path" bson:"video_path"`
	ScreenshotPath string    `json:"screenshot_path" bson:"screenshot_path"`
	Logs           string    `json:"logs" bson:"logs"`
	Duration       float64   `json:"duration" bson:"duration"`
	CreatedAt      time.Time `json:"created_at" bson:"created_at"`
}
