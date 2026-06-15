package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// VRT job lifecycle states.
const (
	VRTStatusQueued    = "queued"
	VRTStatusRunning   = "running"
	VRTStatusCompleted = "completed"
	VRTStatusFailed    = "failed"
)

// VisualStatusMissing marks a baseline that has no matching current screenshot
// in the latest run (a screen that used to be captured no longer is — a possible
// regression). Other VisualComparison statuses live in visual_regression.go.
const VisualStatusMissing = "MISSING"

// VRTJob tracks one background visual-regression pass over a test run. It is the
// progress/status record the dashboard polls while comparisons run in parallel.
type VRTJob struct {
	ID          primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	RunID       primitive.ObjectID `bson:"run_id" json:"run_id"`
	RunIDString string             `bson:"run_id_string" json:"run_id_string"`
	SuiteID     primitive.ObjectID `bson:"suite_id,omitempty" json:"suite_id,omitempty"`
	TriggeredBy string             `bson:"triggered_by" json:"triggered_by"`

	Status string `bson:"status" json:"status"` // queued | running | completed | failed

	// Progress counters (atomically incremented by workers).
	Total             int `bson:"total" json:"total"`
	Completed         int `bson:"completed" json:"completed"`
	Passed            int `bson:"passed" json:"passed"`
	Failed            int `bson:"failed" json:"failed"`
	BaselineCreated   int `bson:"baseline_created" json:"baseline_created"`
	DimensionMismatch int `bson:"dimension_mismatch" json:"dimension_mismatch"`
	Missing           int `bson:"missing" json:"missing"`
	Errored           int `bson:"errored" json:"errored"`

	Error      string     `bson:"error,omitempty" json:"error,omitempty"`
	StartedAt  *time.Time `bson:"started_at,omitempty" json:"started_at,omitempty"`
	FinishedAt *time.Time `bson:"finished_at,omitempty" json:"finished_at,omitempty"`
	CreatedAt  time.Time  `bson:"created_at" json:"created_at"`
	UpdatedAt  time.Time  `bson:"updated_at" json:"updated_at"`
}
