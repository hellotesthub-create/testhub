package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// TestSuite represents a test suite definition (not execution)
// A suite is a reusable collection of test cases
type TestSuite struct {
	ID             primitive.ObjectID `json:"id" bson:"_id,omitempty"`
	SuiteName      string             `json:"suite_name" bson:"suite_name"`
	Description    string             `json:"description,omitempty" bson:"description,omitempty"`
	CreatedBy      string             `json:"created_by" bson:"created_by"` // User email
	Tags           []string           `json:"tags,omitempty" bson:"tags,omitempty"`
	DefaultBrowser string             `json:"default_browser" bson:"default_browser"` // chrome, firefox
	Framework      string             `json:"framework" bson:"framework"`             // selenium, playwright
	IsDeleted      bool               `json:"is_deleted" bson:"is_deleted"`
	CreatedAt      time.Time          `json:"created_at" bson:"created_at"`
	UpdatedAt      time.Time          `json:"updated_at" bson:"updated_at"`
}

// TestSuiteCreateRequest is used for creating a new test suite
type TestSuiteCreateRequest struct {
	SuiteName      string   `json:"suite_name" validate:"required,min=3,max=100"`
	Description    string   `json:"description"`
	Tags           []string `json:"tags"`
	DefaultBrowser string   `json:"default_browser"`
	Framework      string   `json:"framework"`
}

// TestSuiteUpdateRequest is used for updating a test suite
type TestSuiteUpdateRequest struct {
	SuiteName      string   `json:"suite_name"`
	Description    string   `json:"description"`
	Tags           []string `json:"tags"`
	DefaultBrowser string   `json:"default_browser"`
	Framework      string   `json:"framework"`
}

// TestSuiteResponse is used for returning suite data with test case count
type TestSuiteResponse struct {
	ID             string    `json:"id"`
	SuiteName      string    `json:"suite_name"`
	Description    string    `json:"description"`
	Tags           []string  `json:"tags"`
	DefaultBrowser string    `json:"default_browser"`
	Framework      string    `json:"framework"`
	TestCaseCount  int       `json:"test_case_count"`
	LastRunAt      *string   `json:"last_run_at,omitempty"`
	LastRunStatus  string    `json:"last_run_status,omitempty"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}

