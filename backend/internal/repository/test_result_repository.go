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

// TestResultRepository handles test result CRUD operations
type TestResultRepository struct {
	collection *mongo.Collection
}

func NewTestResultRepository(db *mongo.Database) *TestResultRepository {
	return &TestResultRepository{
		collection: db.Collection("test_results"),
	}
}

// Create creates a new test result
func (r *TestResultRepository) Create(ctx context.Context, result *models.TestResult) error {
	result.CreatedAt = time.Now()

	insertResult, err := r.collection.InsertOne(ctx, result)
	if err != nil {
		return err
	}

	result.ID = insertResult.InsertedID.(primitive.ObjectID)
	return nil
}

// GetByID retrieves a test result by ID
func (r *TestResultRepository) GetByID(ctx context.Context, id primitive.ObjectID) (*models.TestResult, error) {
	filter := bson.M{"_id": id}

	var result models.TestResult
	err := r.collection.FindOne(ctx, filter).Decode(&result)
	if err != nil {
		return nil, err
	}

	return &result, nil
}

// GetByRunID retrieves all results for a specific run
func (r *TestResultRepository) GetByRunID(ctx context.Context, runID primitive.ObjectID) ([]models.TestResult, error) {
	filter := bson.M{"run_id": runID}
	opts := options.Find().SetSort(bson.D{
		{Key: "test_name", Value: 1},
		{Key: "browser", Value: 1},
	})

	cursor, err := r.collection.Find(ctx, filter, opts)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	results := make([]models.TestResult, 0)
	if err = cursor.All(ctx, &results); err != nil {
		return nil, err
	}

	return results, nil
}

// GetByRunIDString retrieves all results for a specific run using human-readable run_id
func (r *TestResultRepository) GetByRunIDString(ctx context.Context, runIDString string) ([]models.TestResult, error) {
	filter := bson.M{"run_id_string": runIDString}
	opts := options.Find().SetSort(bson.D{
		{Key: "test_name", Value: 1},
		{Key: "browser", Value: 1},
	})

	cursor, err := r.collection.Find(ctx, filter, opts)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	results := make([]models.TestResult, 0)
	if err = cursor.All(ctx, &results); err != nil {
		return nil, err
	}

	return results, nil
}

// GetByRunIDAndTestName retrieves results for a specific test in a run
func (r *TestResultRepository) GetByRunIDAndTestName(ctx context.Context, runID primitive.ObjectID, testName string) ([]models.TestResult, error) {
	filter := bson.M{
		"run_id":    runID,
		"test_name": testName,
	}
	opts := options.Find().SetSort(bson.D{{Key: "browser", Value: 1}})

	cursor, err := r.collection.Find(ctx, filter, opts)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	results := make([]models.TestResult, 0)
	if err = cursor.All(ctx, &results); err != nil {
		return nil, err
	}

	return results, nil
}

// GetByRunIDAndBrowser retrieves results for a specific browser in a run
func (r *TestResultRepository) GetByRunIDAndBrowser(ctx context.Context, runID primitive.ObjectID, browser string) ([]models.TestResult, error) {
	filter := bson.M{
		"run_id":  runID,
		"browser": browser,
	}
	opts := options.Find().SetSort(bson.D{{Key: "test_name", Value: 1}})

	cursor, err := r.collection.Find(ctx, filter, opts)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	results := make([]models.TestResult, 0)
	if err = cursor.All(ctx, &results); err != nil {
		return nil, err
	}

	return results, nil
}

// CountByRunID counts results for a run
func (r *TestResultRepository) CountByRunID(ctx context.Context, runID primitive.ObjectID) (int64, error) {
	filter := bson.M{"run_id": runID}
	return r.collection.CountDocuments(ctx, filter)
}

// CountByRunIDAndStatus counts results with a specific status for a run
func (r *TestResultRepository) CountByRunIDAndStatus(ctx context.Context, runID primitive.ObjectID, status string) (int64, error) {
	filter := bson.M{
		"run_id": runID,
		"status": status,
	}
	return r.collection.CountDocuments(ctx, filter)
}

// UpdateStatus updates the status of a test result
func (r *TestResultRepository) UpdateStatus(ctx context.Context, id primitive.ObjectID, status string, errorMessage string) error {
	filter := bson.M{"_id": id}

	update := bson.M{
		"$set": bson.M{
			"status":        status,
			"error_message": errorMessage,
		},
	}

	_, err := r.collection.UpdateOne(ctx, filter, update)
	return err
}

// SetEndTime sets the end time and calculates duration
func (r *TestResultRepository) SetEndTime(ctx context.Context, id primitive.ObjectID, status string, errorMessage string) error {
	// Get the result to calculate duration
	result, err := r.GetByID(ctx, id)
	if err != nil {
		return err
	}

	now := time.Now()
	var durationSeconds float64
	if result.StartTime != nil {
		durationSeconds = now.Sub(*result.StartTime).Seconds()
	}

	filter := bson.M{"_id": id}

	update := bson.M{
		"$set": bson.M{
			"end_time":         now,
			"duration_seconds": durationSeconds,
			"status":           status,
			"error_message":    errorMessage,
		},
	}

	_, err = r.collection.UpdateOne(ctx, filter, update)
	return err
}

// Update performs a generic update on a test result
func (r *TestResultRepository) Update(ctx context.Context, id primitive.ObjectID, updateData bson.M) error {
	filter := bson.M{"_id": id}
	update := bson.M{"$set": updateData}

	_, err := r.collection.UpdateOne(ctx, filter, update)
	return err
}
