package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

const (
	VisualStatusBaselineCreated   = "BASELINE_CREATED"
	VisualStatusBaselinePromoted  = "BASELINE_PROMOTED"
	VisualStatusPassed            = "PASSED"
	VisualStatusFailed            = "FAILED"
	VisualStatusDimensionMismatch = "DIMENSION_MISMATCH"
	VisualStatusError             = "ERROR"
)

type VisualRegressionCompareRequest struct {
	ResultID         string   `json:"result_id,omitempty"`
	TestCaseID       string   `json:"test_case_id"`
	StepName         string   `json:"step_name"`
	Framework        string   `json:"framework"`
	Browser          string   `json:"browser"`
	CurrentImagePath string   `json:"current_image_path"`
	Threshold        *float64 `json:"threshold,omitempty"`
}

type VisualRegressionCompareResponse struct {
	Status               string  `json:"status"`
	DifferencePercentage float64 `json:"difference_percentage"`
	BaselinePath         string  `json:"baseline_path"`
	CurrentPath          string  `json:"current_path"`
	DiffPath             *string `json:"diff_path"`
}

type VisualComparison struct {
	ID                   primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	ResultID             primitive.ObjectID `bson:"result_id" json:"result_id"`
	RunID                string             `bson:"-" json:"run_id,omitempty"`
	// JobID/RunRef link a comparison to its background VRT job + run (set by the
	// automatic pipeline; empty for legacy manual single-result comparisons).
	JobID      primitive.ObjectID `bson:"job_id,omitempty" json:"job_id,omitempty"`
	RunRef     primitive.ObjectID `bson:"run_ref,omitempty" json:"-"`
	TestName   string             `bson:"test_name,omitempty" json:"test_name,omitempty"`
	TestCaseID           string             `bson:"test_case_id" json:"test_case_id"`
	StepName             string             `bson:"step_name" json:"step_name"`
	Framework            string             `bson:"framework" json:"framework"`
	Browser              string             `bson:"browser" json:"browser"`
	Status               string             `bson:"status" json:"status"`
	DifferencePercentage float64            `bson:"difference_percentage" json:"difference_percentage"`
	BaselinePath         string             `bson:"baseline_path" json:"baseline_path"`
	CurrentPath          string             `bson:"current_path" json:"current_path"`
	DiffPath             *string            `bson:"diff_path,omitempty" json:"diff_path"`
	ApprovedAt           *time.Time         `bson:"approved_at,omitempty" json:"approved_at,omitempty"`
	ApprovedBy           string             `bson:"approved_by,omitempty" json:"approved_by,omitempty"`
	CreatedAt            time.Time          `bson:"created_at" json:"created_at"`
	UpdatedAt            time.Time          `bson:"updated_at" json:"updated_at"`
}

type ApproveBaselineRequest struct {
	ComparisonID string `json:"comparison_id"`
}

type PromoteAllBaselinesRequest struct {
	ComparisonIDs []string `json:"comparison_ids"`
}

type PromoteAllBaselinesResponse struct {
	Promoted int      `json:"promoted"`
	Failed   int      `json:"failed"`
	Errors   []string `json:"errors,omitempty"`
}

type ApproveBaselineResponse struct {
	Success      bool   `json:"success"`
	Message      string `json:"message"`
	BaselinePath string `json:"baseline_path"`
}
