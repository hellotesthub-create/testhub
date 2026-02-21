package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// Video represents a video recording from test execution
type Video struct {
	ID              primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	ResultID        primitive.ObjectID `bson:"result_id" json:"result_id"`             // Reference to test_results._id
	RunID           primitive.ObjectID `bson:"run_id" json:"run_id"`                   // For fast run-level queries
	RunIDString     string             `bson:"run_id_string" json:"run_id_string"`     // Human-readable run ID
	TestName        string             `bson:"test_name" json:"test_name"`             // Denormalized
	Browser         string             `bson:"browser" json:"browser"`                 // chrome, firefox
	Name            string             `bson:"name" json:"name"`                       // Video filename
	GridFSID        string             `bson:"gridfs_id,omitempty" json:"gridfs_id"`   // GridFS file ID
	FileData        []byte             `bson:"file_data,omitempty" json:"-"`           // Binary data (not in JSON)
	ContentType     string             `bson:"content_type" json:"content_type"`       // video/mp4
	DurationSeconds float64            `bson:"duration_seconds" json:"duration_seconds"`
	SizeBytes       int64              `bson:"size_bytes" json:"size_bytes"`
	CreatedAt       time.Time          `bson:"created_at" json:"created_at"`
}

// VideoResponse is used for returning video data to frontend
type VideoResponse struct {
	ID              string  `json:"id"`
	Name            string  `json:"name"`
	TestName        string  `json:"test_name"`
	Browser         string  `json:"browser"`
	Duration        string  `json:"duration"` // Formatted duration
	DurationSeconds float64 `json:"duration_seconds"`
	Size            string  `json:"size"` // Formatted size
	SizeBytes       int64   `json:"size_bytes"`
	URL             string  `json:"url"` // Stream URL
}

