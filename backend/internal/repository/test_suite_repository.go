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

// TestSuiteRepository handles test suite CRUD operations
type TestSuiteRepository struct {
	collection *mongo.Collection
}

func NewTestSuiteRepository(db *mongo.Database) *TestSuiteRepository {
	return &TestSuiteRepository{
		collection: db.Collection("test_suites"),
	}
}

// Create creates a new test suite
func (r *TestSuiteRepository) Create(ctx context.Context, suite *models.TestSuite) error {
	suite.CreatedAt = time.Now()
	suite.UpdatedAt = time.Now()
	suite.IsDeleted = false
	
	result, err := r.collection.InsertOne(ctx, suite)
	if err != nil {
		return err
	}
	
	suite.ID = result.InsertedID.(primitive.ObjectID)
	return nil
}

// GetByID retrieves a test suite by ID
func (r *TestSuiteRepository) GetByID(ctx context.Context, id primitive.ObjectID) (*models.TestSuite, error) {
	filter := bson.M{
		"_id":        id,
		"is_deleted": false,
	}

	var suite models.TestSuite
	err := r.collection.FindOne(ctx, filter).Decode(&suite)
	if err != nil {
		return nil, err
	}

	return &suite, nil
}

// GetByIDAndEmail retrieves a specific test suite by ID and email
func (r *TestSuiteRepository) GetByIDAndEmail(ctx context.Context, id primitive.ObjectID, email string) (*models.TestSuite, error) {
	filter := bson.M{
		"_id":        id,
		"email":      email,
		"is_deleted": false,
	}

	var suite models.TestSuite
	err := r.collection.FindOne(ctx, filter).Decode(&suite)
	if err != nil {
		return nil, err
	}

	return &suite, nil
}

// GetUserSuites retrieves all test suites for a specific user
func (r *TestSuiteRepository) GetUserSuites(ctx context.Context, email string) ([]models.TestSuite, error) {
	filter := bson.M{
		"email":      email,
		"is_deleted": false,
	}
	opts := options.Find().SetSort(bson.D{{Key: "created_at", Value: -1}})

	cursor, err := r.collection.Find(ctx, filter, opts)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	suites := make([]models.TestSuite, 0)
	if err = cursor.All(ctx, &suites); err != nil {
		return nil, err
	}

	return suites, nil
}

// Update updates a test suite
func (r *TestSuiteRepository) Update(ctx context.Context, id primitive.ObjectID, email string, update *models.TestSuiteUpdateRequest) error {
	filter := bson.M{
		"_id":        id,
		"email":      email,
		"is_deleted": false,
	}

	updateDoc := bson.M{
		"$set": bson.M{
			"updated_at": time.Now(),
		},
	}

	if update.SuiteName != "" {
		updateDoc["$set"].(bson.M)["suite_name"] = update.SuiteName
	}
	if update.Description != "" {
		updateDoc["$set"].(bson.M)["description"] = update.Description
	}
	if update.Tags != nil {
		updateDoc["$set"].(bson.M)["tags"] = update.Tags
	}
	if update.DefaultBrowser != "" {
		updateDoc["$set"].(bson.M)["default_browser"] = update.DefaultBrowser
	}
	if update.Framework != "" {
		updateDoc["$set"].(bson.M)["framework"] = update.Framework
	}

	_, err := r.collection.UpdateOne(ctx, filter, updateDoc)
	return err
}

// Delete soft-deletes a test suite
func (r *TestSuiteRepository) Delete(ctx context.Context, id primitive.ObjectID, email string) error {
	filter := bson.M{
		"_id":   id,
		"email": email,
	}

	update := bson.M{
		"$set": bson.M{
			"is_deleted": true,
			"updated_at": time.Now(),
		},
	}

	_, err := r.collection.UpdateOne(ctx, filter, update)
	return err
}

