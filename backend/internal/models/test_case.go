package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// TestCase represents a test script inside a test suite
type TestCase struct {
	ID               primitive.ObjectID `json:"id" bson:"_id,omitempty"`
	SuiteID          primitive.ObjectID `json:"suite_id" bson:"suite_id"` // Reference to test_suites._id
	TestName         string             `json:"test_name" bson:"test_name"`
	OriginalFilename string             `json:"original_filename" bson:"original_filename"`
	Language         string             `json:"language" bson:"language"`   // python, javascript, java
	Framework        string             `json:"framework" bson:"framework"` // selenium, playwright, appium
	ScriptContent    string             `json:"script_content,omitempty" bson:"script_content,omitempty"` // Base64 encoded script
	Priority         string             `json:"priority" bson:"priority"`   // low, medium, high
	IsActive         bool               `json:"is_active" bson:"is_active"`
	CreatedAt        time.Time          `json:"created_at" bson:"created_at"`
	UpdatedAt        time.Time          `json:"updated_at" bson:"updated_at"`
}

// TestCaseCreateRequest is used for adding a test case to a suite
type TestCaseCreateRequest struct {
	TestName         string `json:"test_name" validate:"required"`
	OriginalFilename string `json:"original_filename" validate:"required"`
	Language         string `json:"language" validate:"required"`
	Framework        string `json:"framework" validate:"required"`
	ScriptContent    string `json:"script_content" validate:"required"` // Base64 encoded
	Priority         string `json:"priority"`
}

// TestCaseUpdateRequest is used for updating a test case
type TestCaseUpdateRequest struct {
	TestName      string `json:"test_name"`
	Language      string `json:"language"`
	Framework     string `json:"framework"`
	ScriptContent string `json:"script_content"`
	Priority      string `json:"priority"`
	IsActive      *bool  `json:"is_active"`
}

// TestCaseResponse is used for returning test case data
type TestCaseResponse struct {
	ID               string    `json:"id"`
	SuiteID          string    `json:"suite_id"`
	TestName         string    `json:"test_name"`
	OriginalFilename string    `json:"original_filename"`
	Language         string    `json:"language"`
	Framework        string    `json:"framework"`
	Priority         string    `json:"priority"`
	IsActive         bool      `json:"is_active"`
	CreatedAt        time.Time `json:"created_at"`
	UpdatedAt        time.Time `json:"updated_at"`
}
