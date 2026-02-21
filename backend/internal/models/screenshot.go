package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// Screenshot represents a screenshot captured during test execution
type Screenshot struct {
	ID          primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	ResultID    primitive.ObjectID `bson:"result_id" json:"result_id"`             // Reference to test_results._id
	RunID       primitive.ObjectID `bson:"run_id" json:"run_id"`                   // For fast run-level queries
	RunIDString string             `bson:"run_id_string" json:"run_id_string"`     // Human-readable run ID
	TestName    string             `bson:"test_name" json:"test_name"`             // Denormalized
	Browser     string             `bson:"browser" json:"browser"`                 // chrome, firefox
	Name        string             `bson:"name" json:"name"`                       // Screenshot name
	Step        string             `bson:"step,omitempty" json:"step"`             // Test step name
	FileData    []byte             `bson:"file_data,omitempty" json:"-"`           // Binary data (not in JSON)
	ImageData   string             `bson:"image_data,omitempty" json:"-"`          // Base64 (legacy, not in JSON)
	ContentType string             `bson:"content_type" json:"content_type"`       // image/png
	SizeBytes   int64              `bson:"size_bytes" json:"size_bytes"`           // File size
	CreatedAt   time.Time          `bson:"created_at" json:"created_at"`
}

// ScreenshotResponse is used for returning screenshot data to frontend
type ScreenshotResponse struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	TestName  string `json:"test_name"`
	Browser   string `json:"browser"`
	Step      string `json:"step"`
	Timestamp string `json:"timestamp"` // Formatted datetime
	URL       string `json:"url"`       // Download URL
	SizeBytes int64  `json:"size_bytes"`
}

