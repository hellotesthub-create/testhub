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

// TestRunRepository handles test run CRUD operations
type TestRunRepository struct {
	collection *mongo.Collection
}

func NewTestRunRepository(db *mongo.Database) *TestRunRepository {
	return &TestRunRepository{
		collection: db.Collection("test_runs"),
	}
}

// Create creates a new test run
func (r *TestRunRepository) Create(ctx context.Context, run *models.TestRun) error {
	run.CreatedAt = time.Now()
	run.UpdatedAt = time.Now()
	run.Status = "pending"

	result, err := r.collection.InsertOne(ctx, run)
	if err != nil {
		return err
	}

	run.ID = result.InsertedID.(primitive.ObjectID)
	return nil
}

// GetByID retrieves a test run by ID
func (r *TestRunRepository) GetByID(ctx context.Context, id primitive.ObjectID) (*models.TestRun, error) {
	filter := bson.M{"_id": id}

	var run models.TestRun
	err := r.collection.FindOne(ctx, filter).Decode(&run)
	if err != nil {
		return nil, err
	}

	return &run, nil
}

// GetByRunID retrieves a test run by human-readable run_id
func (r *TestRunRepository) GetByRunID(ctx context.Context, runID string) (*models.TestRun, error) {
	filter := bson.M{"run_id": runID}

	var run models.TestRun
	err := r.collection.FindOne(ctx, filter).Decode(&run)
	if err != nil {
		return nil, err
	}

	return &run, nil
}

// GetByRunIDAndEmail retrieves a test run by run_id and user email
func (r *TestRunRepository) GetByRunIDAndEmail(ctx context.Context, runID string, email string) (*models.TestRun, error) {
	filter := bson.M{
		"run_id":       runID,
		"triggered_by": email,
	}

	var run models.TestRun
	err := r.collection.FindOne(ctx, filter).Decode(&run)
	if err != nil {
		return nil, err
	}

	return &run, nil
}

// GetUserRuns retrieves all test runs for a specific user
func (r *TestRunRepository) GetUserRuns(ctx context.Context, email string) ([]models.TestRun, error) {
	filter := bson.M{"triggered_by": email}
	opts := options.Find().SetSort(bson.D{{Key: "created_at", Value: -1}})

	cursor, err := r.collection.Find(ctx, filter, opts)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	runs := make([]models.TestRun, 0)
	if err = cursor.All(ctx, &runs); err != nil {
		return nil, err
	}

	return runs, nil
}

// GetBySuiteID retrieves all runs for a specific suite
func (r *TestRunRepository) GetBySuiteID(ctx context.Context, suiteID primitive.ObjectID) ([]models.TestRun, error) {
	filter := bson.M{"suite_id": suiteID}
	opts := options.Find().SetSort(bson.D{{Key: "created_at", Value: -1}})

	cursor, err := r.collection.Find(ctx, filter, opts)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	runs := make([]models.TestRun, 0)
	if err = cursor.All(ctx, &runs); err != nil {
		return nil, err
	}

	return runs, nil
}

// GetLatestBySuiteID retrieves the most recent run for a suite
func (r *TestRunRepository) GetLatestBySuiteID(ctx context.Context, suiteID primitive.ObjectID) (*models.TestRun, error) {
	filter := bson.M{"suite_id": suiteID}
	opts := options.FindOne().SetSort(bson.D{{Key: "created_at", Value: -1}})

	var run models.TestRun
	err := r.collection.FindOne(ctx, filter, opts).Decode(&run)
	if err != nil {
		return nil, err
	}

	return &run, nil
}

// UpdateStatus updates the status of a test run
func (r *TestRunRepository) UpdateStatus(ctx context.Context, id primitive.ObjectID, status string) error {
	filter := bson.M{"_id": id}

	update := bson.M{
		"$set": bson.M{
			"status":     status,
			"updated_at": time.Now(),
		},
	}

	_, err := r.collection.UpdateOne(ctx, filter, update)
	return err
}

// UpdateResults updates the results counters and status
func (r *TestRunRepository) UpdateResults(ctx context.Context, id primitive.ObjectID, passed, failed, skipped int, status string) error {
	filter := bson.M{"_id": id}

	totalTests := passed + failed + skipped
	var successRate float64
	if totalTests > 0 {
		successRate = float64(passed) / float64(totalTests) * 100
	}

	update := bson.M{
		"$set": bson.M{
			"passed":       passed,
			"failed":       failed,
			"skipped":      skipped,
			"total_tests":  totalTests,
			"success_rate": successRate,
			"status":       status,
			"updated_at":   time.Now(),
		},
	}

	_, err := r.collection.UpdateOne(ctx, filter, update)
	return err
}

// SetStartTime sets the start time of a run
func (r *TestRunRepository) SetStartTime(ctx context.Context, id primitive.ObjectID) error {
	now := time.Now()
	filter := bson.M{"_id": id}

	update := bson.M{
		"$set": bson.M{
			"start_time": now,
			"status":     "running",
			"updated_at": now,
		},
	}

	_, err := r.collection.UpdateOne(ctx, filter, update)
	return err
}

// SetEndTime sets the end time and calculates duration
func (r *TestRunRepository) SetEndTime(ctx context.Context, id primitive.ObjectID) error {
	// First get the run to calculate duration
	run, err := r.GetByID(ctx, id)
	if err != nil {
		return err
	}

	now := time.Now()
	var durationSeconds float64
	if run.StartTime != nil {
		durationSeconds = now.Sub(*run.StartTime).Seconds()
	}

	filter := bson.M{"_id": id}

	update := bson.M{
		"$set": bson.M{
			"end_time":         now,
			"duration_seconds": durationSeconds,
			"updated_at":       now,
		},
	}

	_, err = r.collection.UpdateOne(ctx, filter, update)
	return err
}

// Update performs a generic update on a test run
func (r *TestRunRepository) Update(ctx context.Context, id primitive.ObjectID, updateData bson.M) error {
	filter := bson.M{"_id": id}

	updateData["updated_at"] = time.Now()

	update := bson.M{"$set": updateData}

	_, err := r.collection.UpdateOne(ctx, filter, update)
	return err
}

// GetRunsNeedingEmail finds completed/failed runs that have not been emailed yet.
// This is used by the background email worker.
func (r *TestRunRepository) GetRunsNeedingEmail(ctx context.Context, limit int64) ([]models.TestRun, error) {
	if limit <= 0 {
		limit = 10
	}

	filter := bson.M{
		"status":              bson.M{"$in": []string{"completed", "failed"}},
		"triggered_by":        bson.M{"$ne": ""},
		"email_on_completion": true,
		"$or": []bson.M{
			{"email_status": bson.M{"$exists": false}},
			{"email_status": bson.M{"$nin": []string{"sent", "sending"}}},
		},
	}

	opts := options.Find().SetSort(bson.D{{Key: "updated_at", Value: 1}}).SetLimit(limit)
	cursor, err := r.collection.Find(ctx, filter, opts)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	runs := make([]models.TestRun, 0)
	if err := cursor.All(ctx, &runs); err != nil {
		return nil, err
	}

	return runs, nil
}

// TryMarkEmailSending atomically marks a run as "sending" (idempotency guard).
// Returns true if this call acquired the send responsibility.
func (r *TestRunRepository) TryMarkEmailSending(ctx context.Context, id primitive.ObjectID) (bool, error) {
	filter := bson.M{
		"_id":                 id,
		"status":              bson.M{"$in": []string{"completed", "failed"}},
		"email_on_completion": true,
		"$or": []bson.M{
			{"email_status": bson.M{"$exists": false}},
			{"email_status": bson.M{"$nin": []string{"sent", "sending"}}},
		},
	}

	update := bson.M{
		"$set": bson.M{
			"email_status": "sending",
			"updated_at":   time.Now(),
		},
		"$unset": bson.M{
			"email_error": "",
		},
	}

	res, err := r.collection.UpdateOne(ctx, filter, update)
	if err != nil {
		return false, err
	}
	return res.ModifiedCount > 0, nil
}

func (r *TestRunRepository) MarkEmailSent(ctx context.Context, id primitive.ObjectID) error {
	now := time.Now()
	filter := bson.M{"_id": id}
	update := bson.M{
		"$set": bson.M{
			"email_status":  "sent",
			"email_sent_at": now,
			"updated_at":    now,
		},
		"$unset": bson.M{
			"email_error": "",
		},
	}
	_, err := r.collection.UpdateOne(ctx, filter, update)
	return err
}

func (r *TestRunRepository) MarkEmailFailed(ctx context.Context, id primitive.ObjectID, errMsg string) error {
	now := time.Now()
	filter := bson.M{"_id": id}
	update := bson.M{
		"$set": bson.M{
			"email_status": "failed",
			"email_error":  errMsg,
			"updated_at":   now,
		},
	}
	_, err := r.collection.UpdateOne(ctx, filter, update)
	return err
}
