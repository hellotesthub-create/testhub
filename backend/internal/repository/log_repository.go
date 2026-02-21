package repository

import (
	"backend/internal/models"
	"context"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type LogRepository struct {
	collection *mongo.Collection
}

func NewLogRepository(db *mongo.Database) *LogRepository {
	return &LogRepository{
		collection: db.Collection("logs"),
	}
}

// Create inserts a new log document
func (r *LogRepository) Create(ctx context.Context, log *models.Log) error {
	log.CreatedAt = time.Now()

	result, err := r.collection.InsertOne(ctx, log)
	if err != nil {
		return err
	}

	log.ID = result.InsertedID.(primitive.ObjectID)
	return nil
}

// GetByID retrieves a single log by its ID
func (r *LogRepository) GetByID(ctx context.Context, id primitive.ObjectID) (*models.Log, error) {
	filter := bson.M{"_id": id}

	var log models.Log
	err := r.collection.FindOne(ctx, filter).Decode(&log)
	if err != nil {
		return nil, err
	}

	return &log, nil
}

// GetByRunID retrieves all logs for a specific run
func (r *LogRepository) GetByRunID(ctx context.Context, runID primitive.ObjectID) ([]models.Log, error) {
	filter := bson.M{"run_id": runID}
	opts := options.Find().SetSort(bson.D{
		{Key: "test_name", Value: 1},
		{Key: "created_at", Value: 1},
	})

	cursor, err := r.collection.Find(ctx, filter, opts)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	logs := make([]models.Log, 0)
	if err = cursor.All(ctx, &logs); err != nil {
		return nil, err
	}

	return logs, nil
}

// GetByRunIDString retrieves all logs for a specific run using human-readable run_id
func (r *LogRepository) GetByRunIDString(ctx context.Context, runIDString string) ([]models.Log, error) {
	filter := bson.M{"run_id_string": runIDString}
	opts := options.Find().SetSort(bson.D{
		{Key: "test_name", Value: 1},
		{Key: "created_at", Value: 1},
	})

	cursor, err := r.collection.Find(ctx, filter, opts)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	logs := make([]models.Log, 0)
	if err = cursor.All(ctx, &logs); err != nil {
		return nil, err
	}

	return logs, nil
}

// GetByResultID retrieves all logs for a specific test result
func (r *LogRepository) GetByResultID(ctx context.Context, resultID primitive.ObjectID) ([]models.Log, error) {
	filter := bson.M{"result_id": resultID}
	opts := options.Find().SetSort(bson.D{{Key: "created_at", Value: 1}})

	cursor, err := r.collection.Find(ctx, filter, opts)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	logs := make([]models.Log, 0)
	if err = cursor.All(ctx, &logs); err != nil {
		return nil, err
	}

	return logs, nil
}

// GetByRunIDAndTestName retrieves logs for a specific test in a run
func (r *LogRepository) GetByRunIDAndTestName(ctx context.Context, runID primitive.ObjectID, testName string) ([]models.Log, error) {
	filter := bson.M{
		"run_id":    runID,
		"test_name": testName,
	}
	opts := options.Find().SetSort(bson.D{{Key: "created_at", Value: 1}})

	cursor, err := r.collection.Find(ctx, filter, opts)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	logs := make([]models.Log, 0)
	if err = cursor.All(ctx, &logs); err != nil {
		return nil, err
	}

	return logs, nil
}

// CountByRunID counts logs for a run
func (r *LogRepository) CountByRunID(ctx context.Context, runID primitive.ObjectID) (int64, error) {
	filter := bson.M{"run_id": runID}
	return r.collection.CountDocuments(ctx, filter)
}

// DeleteByRunID deletes all logs for a specific run
func (r *LogRepository) DeleteByRunID(ctx context.Context, runID primitive.ObjectID) error {
	filter := bson.M{"run_id": runID}
	_, err := r.collection.DeleteMany(ctx, filter)
	return err
}
