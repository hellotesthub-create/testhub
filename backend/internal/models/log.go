package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// Log represents a log entry from test execution
type Log struct {
	ID          primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	ResultID    primitive.ObjectID `bson:"result_id" json:"result_id"`             // Reference to test_results._id
	RunID       primitive.ObjectID `bson:"run_id" json:"run_id"`                   // For fast run-level queries
	RunIDString string             `bson:"run_id_string" json:"run_id_string"`     // Human-readable run ID
	TestName    string             `bson:"test_name" json:"test_name"`             // Denormalized
	Browser     string             `bson:"browser" json:"browser"`                 // chrome, firefox
	Level       string             `bson:"level" json:"level"`                     // info, warning, error, debug
	Message     string             `bson:"message" json:"message"`
	CreatedAt   time.Time          `bson:"created_at" json:"created_at"`
}

// LogResponse is used for returning log data to frontend
type LogResponse struct {
	ID        string `json:"id"`
	TestName  string `json:"test_name"`
	Browser   string `json:"browser"`
	Level     string `json:"level"`
	Message   string `json:"message"`
	Timestamp string `json:"timestamp"` // Formatted datetime
}

