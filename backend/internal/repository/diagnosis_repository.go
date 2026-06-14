package repository

import (
	"backend/internal/models"
	"context"
	"log"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// DiagnosisRepository handles diagnosis CRUD operations
type DiagnosisRepository struct {
	collection *mongo.Collection
}

func NewDiagnosisRepository(db *mongo.Database) *DiagnosisRepository {
	return &DiagnosisRepository{
		collection: db.Collection("diagnoses"),
	}
}

// EnsureIndexes creates indexes for efficient querying.
// Called once on startup from main.go.
func (r *DiagnosisRepository) EnsureIndexes(ctx context.Context) {
	indexModel := mongo.IndexModel{
		Keys: bson.D{
			{Key: "execution_id", Value: 1},
			{Key: "generated_at", Value: -1},
		},
	}
	_, err := r.collection.Indexes().CreateOne(ctx, indexModel)
	if err != nil {
		log.Printf("Warning: failed to create diagnosis index: %v", err)
	}
}

// InsertDiagnosis always inserts a new document (never upserts) to preserve history.
func (r *DiagnosisRepository) InsertDiagnosis(ctx context.Context, d *models.Diagnosis) error {
	_, err := r.collection.InsertOne(ctx, d)
	return err
}

// GetLatestByExecutionID finds the most recent diagnosis for a given test result.
func (r *DiagnosisRepository) GetLatestByExecutionID(ctx context.Context, executionID string) (*models.Diagnosis, error) {
	filter := bson.M{"execution_id": executionID}
	opts := options.FindOne().SetSort(bson.D{{Key: "generated_at", Value: -1}})

	var diagnosis models.Diagnosis
	err := r.collection.FindOne(ctx, filter, opts).Decode(&diagnosis)
	if err != nil {
		return nil, err
	}

	return &diagnosis, nil
}
