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

// TestCaseRepository handles test case CRUD operations
type TestCaseRepository struct {
	collection *mongo.Collection
}

func NewTestCaseRepository(db *mongo.Database) *TestCaseRepository {
	return &TestCaseRepository{
		collection: db.Collection("test_cases"),
	}
}

// Create creates a new test case
func (r *TestCaseRepository) Create(ctx context.Context, testCase *models.TestCase) error {
	testCase.CreatedAt = time.Now()
	testCase.UpdatedAt = time.Now()
	testCase.IsActive = true

	result, err := r.collection.InsertOne(ctx, testCase)
	if err != nil {
		return err
	}

	testCase.ID = result.InsertedID.(primitive.ObjectID)
	return nil
}

// GetByID retrieves a test case by ID
func (r *TestCaseRepository) GetByID(ctx context.Context, id primitive.ObjectID) (*models.TestCase, error) {
	filter := bson.M{"_id": id}

	var testCase models.TestCase
	err := r.collection.FindOne(ctx, filter).Decode(&testCase)
	if err != nil {
		return nil, err
	}

	return &testCase, nil
}

// GetBySuiteID retrieves all test cases for a specific suite
func (r *TestCaseRepository) GetBySuiteID(ctx context.Context, suiteID primitive.ObjectID) ([]models.TestCase, error) {
	filter := bson.M{
		"suite_id":  suiteID,
		"is_active": true,
	}
	opts := options.Find().SetSort(bson.D{{Key: "created_at", Value: 1}})

	cursor, err := r.collection.Find(ctx, filter, opts)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	testCases := make([]models.TestCase, 0)
	if err = cursor.All(ctx, &testCases); err != nil {
		return nil, err
	}

	return testCases, nil
}

// GetActiveBySuiteID retrieves all active test cases for a suite
func (r *TestCaseRepository) GetActiveBySuiteID(ctx context.Context, suiteID primitive.ObjectID) ([]models.TestCase, error) {
	filter := bson.M{
		"suite_id":  suiteID,
		"is_active": true,
	}
	opts := options.Find().SetSort(bson.D{{Key: "created_at", Value: 1}})

	cursor, err := r.collection.Find(ctx, filter, opts)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	testCases := make([]models.TestCase, 0)
	if err = cursor.All(ctx, &testCases); err != nil {
		return nil, err
	}

	return testCases, nil
}

// CountBySuiteID counts test cases in a suite
func (r *TestCaseRepository) CountBySuiteID(ctx context.Context, suiteID primitive.ObjectID) (int64, error) {
	filter := bson.M{
		"suite_id":  suiteID,
		"is_active": true,
	}
	return r.collection.CountDocuments(ctx, filter)
}

// Update updates a test case
func (r *TestCaseRepository) Update(ctx context.Context, id primitive.ObjectID, update *models.TestCaseUpdateRequest) error {
	filter := bson.M{"_id": id}

	updateDoc := bson.M{
		"$set": bson.M{
			"updated_at": time.Now(),
		},
	}

	if update.TestName != "" {
		updateDoc["$set"].(bson.M)["test_name"] = update.TestName
	}
	if update.Language != "" {
		updateDoc["$set"].(bson.M)["language"] = update.Language
	}
	if update.Framework != "" {
		updateDoc["$set"].(bson.M)["framework"] = update.Framework
	}
	if update.ScriptContent != "" {
		updateDoc["$set"].(bson.M)["script_content"] = update.ScriptContent
	}
	if update.Priority != "" {
		updateDoc["$set"].(bson.M)["priority"] = update.Priority
	}
	if update.IsActive != nil {
		updateDoc["$set"].(bson.M)["is_active"] = *update.IsActive
	}

	_, err := r.collection.UpdateOne(ctx, filter, updateDoc)
	return err
}

// Delete deletes a test case (soft delete by setting is_active to false)
func (r *TestCaseRepository) Delete(ctx context.Context, id primitive.ObjectID) error {
	filter := bson.M{"_id": id}

	update := bson.M{
		"$set": bson.M{
			"is_active":  false,
			"updated_at": time.Now(),
		},
	}

	_, err := r.collection.UpdateOne(ctx, filter, update)
	return err
}

// HardDelete permanently removes a test case
func (r *TestCaseRepository) HardDelete(ctx context.Context, id primitive.ObjectID) error {
	filter := bson.M{"_id": id}
	_, err := r.collection.DeleteOne(ctx, filter)
	return err
}
