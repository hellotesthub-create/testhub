package repository

import (
	"backend/internal/models"
	"context"
	"log"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
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

// GetByID fetches one diagnosis (for ownership checks on delete).
func (r *DiagnosisRepository) GetByID(ctx context.Context, id primitive.ObjectID) (*models.Diagnosis, error) {
	var d models.Diagnosis
	if err := r.collection.FindOne(ctx, bson.M{"_id": id}).Decode(&d); err != nil {
		return nil, err
	}
	return &d, nil
}

// GetByExecutionIDs returns all diagnoses whose result belongs to the user
// (execution_id is the test result _id as a hex string), newest first.
func (r *DiagnosisRepository) GetByExecutionIDs(ctx context.Context, execIDs []string) ([]models.Diagnosis, error) {
	if len(execIDs) == 0 {
		return []models.Diagnosis{}, nil
	}
	filter := bson.M{"execution_id": bson.M{"$in": execIDs}}
	opts := options.Find().SetSort(bson.D{{Key: "generated_at", Value: -1}}).SetLimit(500)
	cursor, err := r.collection.Find(ctx, filter, opts)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)
	items := make([]models.Diagnosis, 0)
	if err := cursor.All(ctx, &items); err != nil {
		return nil, err
	}
	return items, nil
}

// DeleteByID removes one diagnosis record (per-row delete on history page).
func (r *DiagnosisRepository) DeleteByID(ctx context.Context, id primitive.ObjectID) error {
	_, err := r.collection.DeleteOne(ctx, bson.M{"_id": id})
	return err
}

// DeleteByExecutionIDs removes every diagnosis across the user's results (clear all).
func (r *DiagnosisRepository) DeleteByExecutionIDs(ctx context.Context, execIDs []string) (int64, error) {
	if len(execIDs) == 0 {
		return 0, nil
	}
	res, err := r.collection.DeleteMany(ctx, bson.M{"execution_id": bson.M{"$in": execIDs}})
	if err != nil {
		return 0, err
	}
	return res.DeletedCount, nil
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
