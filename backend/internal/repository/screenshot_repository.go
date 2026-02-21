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

type ScreenshotRepository struct {
	collection *mongo.Collection
}

func NewScreenshotRepository(db *mongo.Database) *ScreenshotRepository {
	return &ScreenshotRepository{
		collection: db.Collection("screenshots"),
	}
}

// Create inserts a new screenshot document
func (r *ScreenshotRepository) Create(ctx context.Context, screenshot *models.Screenshot) error {
	screenshot.CreatedAt = time.Now()

	result, err := r.collection.InsertOne(ctx, screenshot)
	if err != nil {
		return err
	}

	screenshot.ID = result.InsertedID.(primitive.ObjectID)
	return nil
}

// GetByID retrieves a single screenshot by its ID
func (r *ScreenshotRepository) GetByID(ctx context.Context, id primitive.ObjectID) (*models.Screenshot, error) {
	filter := bson.M{"_id": id}

	var screenshot models.Screenshot
	err := r.collection.FindOne(ctx, filter).Decode(&screenshot)
	if err != nil {
		return nil, err
	}

	return &screenshot, nil
}

// GetByRunID retrieves all screenshots for a specific run
func (r *ScreenshotRepository) GetByRunID(ctx context.Context, runID primitive.ObjectID) ([]models.Screenshot, error) {
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

	screenshots := make([]models.Screenshot, 0)
	if err = cursor.All(ctx, &screenshots); err != nil {
		return nil, err
	}

	return screenshots, nil
}

// GetByRunIDString retrieves all screenshots for a specific run using human-readable run_id
func (r *ScreenshotRepository) GetByRunIDString(ctx context.Context, runIDString string) ([]models.Screenshot, error) {
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

	screenshots := make([]models.Screenshot, 0)
	if err = cursor.All(ctx, &screenshots); err != nil {
		return nil, err
	}

	return screenshots, nil
}

// GetByResultID retrieves all screenshots for a specific test result
func (r *ScreenshotRepository) GetByResultID(ctx context.Context, resultID primitive.ObjectID) ([]models.Screenshot, error) {
	filter := bson.M{"result_id": resultID}
	opts := options.Find().SetSort(bson.D{{Key: "created_at", Value: 1}})

	cursor, err := r.collection.Find(ctx, filter, opts)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	screenshots := make([]models.Screenshot, 0)
	if err = cursor.All(ctx, &screenshots); err != nil {
		return nil, err
	}

	return screenshots, nil
}

// GetByRunIDAndTestName retrieves screenshots for a specific test in a run
func (r *ScreenshotRepository) GetByRunIDAndTestName(ctx context.Context, runID primitive.ObjectID, testName string) ([]models.Screenshot, error) {
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

	screenshots := make([]models.Screenshot, 0)
	if err = cursor.All(ctx, &screenshots); err != nil {
		return nil, err
	}

	return screenshots, nil
}

// CountByRunID counts screenshots for a run
func (r *ScreenshotRepository) CountByRunID(ctx context.Context, runID primitive.ObjectID) (int64, error) {
	filter := bson.M{"run_id": runID}
	return r.collection.CountDocuments(ctx, filter)
}

// DeleteByRunID deletes all screenshots for a specific run
func (r *ScreenshotRepository) DeleteByRunID(ctx context.Context, runID primitive.ObjectID) error {
	filter := bson.M{"run_id": runID}
	_, err := r.collection.DeleteMany(ctx, filter)
	return err
}
