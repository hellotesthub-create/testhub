package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// TestRun represents a single execution of a test suite
type TestRun struct {
	ID                primitive.ObjectID `json:"id" bson:"_id,omitempty"`
	RunID             string             `json:"run_id" bson:"run_id"`             // Human-readable ID (e.g., 20260220_143052)
	SuiteID           primitive.ObjectID `json:"suite_id" bson:"suite_id"`         // Reference to test_suites._id
	SuiteName         string             `json:"suite_name" bson:"suite_name"`     // Denormalized
	TriggeredBy       string             `json:"triggered_by" bson:"triggered_by"` // User email who triggered
	TriggerType       string             `json:"trigger_type" bson:"trigger_type"` // manual, github, scheduled
	Browsers          []string           `json:"browsers" bson:"browsers"`         // Browsers used in this run
	StartTime         *time.Time         `json:"start_time,omitempty" bson:"start_time,omitempty"`
	EndTime           *time.Time         `json:"end_time,omitempty" bson:"end_time,omitempty"`
	DurationSeconds   float64            `json:"duration_seconds" bson:"duration_seconds"`
	Framework         string             `json:"framework" bson:"framework"` // selenium, playwright
	Status            string             `json:"status" bson:"status"`       // pending, running, completed, failed, cancelled
	TotalTests        int                `json:"total_tests" bson:"total_tests"`
	Passed            int                `json:"passed" bson:"passed"`
	Failed            int                `json:"failed" bson:"failed"`
	Skipped           int                `json:"skipped" bson:"skipped"`
	SuccessRate       float64            `json:"success_rate" bson:"success_rate"`
	EmailOnCompletion bool               `json:"email_on_completion,omitempty" bson:"email_on_completion,omitempty"`
	EmailStatus       string             `json:"email_status,omitempty" bson:"email_status,omitempty"` // pending, sending, sent, failed
	EmailSentAt       *time.Time         `json:"email_sent_at,omitempty" bson:"email_sent_at,omitempty"`
	EmailError        string             `json:"email_error,omitempty" bson:"email_error,omitempty"`
	// VisualRegressionEnabled controls whether a background VRT job runs after
	// this run completes. Resolved at trigger time from the suite default or a
	// per-run override. VRTStatus mirrors the latest VRTJob for quick display.
	VisualRegressionEnabled bool       `json:"visual_regression_enabled" bson:"visual_regression_enabled"`
	VRTStatus               string     `json:"vrt_status,omitempty" bson:"vrt_status,omitempty"` // queued|running|completed|failed
	CreatedAt         time.Time          `json:"created_at" bson:"created_at"`
	UpdatedAt         time.Time          `json:"updated_at" bson:"updated_at"`
}

// TestRunCreateRequest is used for starting a new test run
type TestRunCreateRequest struct {
	SuiteID     string   `json:"suite_id" validate:"required"`
	Browsers    []string `json:"browsers" validate:"required,min=1"`
	TriggerType string   `json:"trigger_type"` // defaults to "manual"
}

// TestRunResponse is used for returning test run data
type TestRunResponse struct {
	ID              string     `json:"id"`
	RunID           string     `json:"run_id"`
	SuiteID         string     `json:"suite_id"`
	SuiteName       string     `json:"suite_name"`
	TriggerType     string     `json:"trigger_type"`
	Browsers        []string   `json:"browsers"`
	StartTime       *time.Time `json:"start_time,omitempty"`
	EndTime         *time.Time `json:"end_time,omitempty"`
	DurationSeconds float64    `json:"duration_seconds"`
	Framework       string     `json:"framework"`
	Status          string     `json:"status"`
	TotalTests      int        `json:"total_tests"`
	Passed          int        `json:"passed"`
	Failed          int        `json:"failed"`
	Skipped         int        `json:"skipped"`
	SuccessRate     float64    `json:"success_rate"`
	CreatedAt       time.Time  `json:"created_at"`
}

// TestRunListItem is used for listing test runs (lightweight)
type TestRunListItem struct {
	ID              string     `json:"id"`
	RunID           string     `json:"run_id"`
	SuiteName       string     `json:"suite_name"`
	Status          string     `json:"status"`
	TotalTests      int        `json:"total_tests"`
	Passed          int        `json:"passed"`
	Failed          int        `json:"failed"`
	SuccessRate     float64    `json:"success_rate"`
	DurationSeconds float64    `json:"duration_seconds"`
	Browsers        []string   `json:"browsers"`
	Framework       string     `json:"framework"`
	StartTime       *time.Time `json:"start_time,omitempty"`
	CreatedAt       time.Time  `json:"created_at"`
}
