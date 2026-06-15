package repository

import (
	"context"
	"time"

	"backend/internal/models"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// VRTJobRepository persists background visual-regression jobs and their progress.
type VRTJobRepository struct {
	collection *mongo.Collection
}

func NewVRTJobRepository(db *mongo.Database) *VRTJobRepository {
	repo := &VRTJobRepository{collection: db.Collection("vrt_jobs")}
	repo.EnsureIndexes(context.Background())
	return repo
}

func (r *VRTJobRepository) EnsureIndexes(ctx context.Context) {
	_, _ = r.collection.Indexes().CreateMany(ctx, []mongo.IndexModel{
		{Keys: bson.D{{Key: "run_id", Value: 1}, {Key: "created_at", Value: -1}}},
		{Keys: bson.D{{Key: "status", Value: 1}}},
	})
}

func (r *VRTJobRepository) Create(ctx context.Context, job *models.VRTJob) error {
	now := time.Now()
	job.CreatedAt = now
	job.UpdatedAt = now
	if job.Status == "" {
		job.Status = models.VRTStatusQueued
	}
	res, err := r.collection.InsertOne(ctx, job)
	if err != nil {
		return err
	}
	job.ID = res.InsertedID.(primitive.ObjectID)
	return nil
}

func (r *VRTJobRepository) GetByID(ctx context.Context, id primitive.ObjectID) (*models.VRTJob, error) {
	var job models.VRTJob
	if err := r.collection.FindOne(ctx, bson.M{"_id": id}).Decode(&job); err != nil {
		return nil, err
	}
	return &job, nil
}

// GetLatestByRunID returns the most recent VRT job for a run (what the UI polls).
func (r *VRTJobRepository) GetLatestByRunID(ctx context.Context, runID primitive.ObjectID) (*models.VRTJob, error) {
	opts := options.FindOne().SetSort(bson.D{{Key: "created_at", Value: -1}})
	var job models.VRTJob
	if err := r.collection.FindOne(ctx, bson.M{"run_id": runID}, opts).Decode(&job); err != nil {
		return nil, err
	}
	return &job, nil
}

// ClaimQueued atomically moves the oldest queued job to running and returns it.
// Returns (nil, nil) when there is nothing to claim. Safe across worker replicas.
func (r *VRTJobRepository) ClaimQueued(ctx context.Context) (*models.VRTJob, error) {
	now := time.Now()
	update := bson.M{"$set": bson.M{"status": models.VRTStatusRunning, "started_at": now, "updated_at": now}}
	opts := options.FindOneAndUpdate().
		SetSort(bson.D{{Key: "created_at", Value: 1}}).
		SetReturnDocument(options.After)
	var job models.VRTJob
	err := r.collection.FindOneAndUpdate(ctx, bson.M{"status": models.VRTStatusQueued}, update, opts).Decode(&job)
	if err == mongo.ErrNoDocuments {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &job, nil
}

// SetTotal records how many comparisons the job will perform.
func (r *VRTJobRepository) SetTotal(ctx context.Context, id primitive.ObjectID, total int) error {
	_, err := r.collection.UpdateByID(ctx, id, bson.M{"$set": bson.M{"total": total, "updated_at": time.Now()}})
	return err
}

// IncProgress atomically bumps the completed counter plus the per-outcome counter
// (passed/failed/baseline_created/dimension_mismatch/missing/errored).
func (r *VRTJobRepository) IncProgress(ctx context.Context, id primitive.ObjectID, outcomeField string) error {
	inc := bson.M{"completed": 1}
	if outcomeField != "" {
		inc[outcomeField] = 1
	}
	_, err := r.collection.UpdateByID(ctx, id, bson.M{
		"$inc": inc,
		"$set": bson.M{"updated_at": time.Now()},
	})
	return err
}

// IncCounter bumps a single counter without touching completed (e.g. missing steps).
func (r *VRTJobRepository) IncCounter(ctx context.Context, id primitive.ObjectID, field string, n int) error {
	_, err := r.collection.UpdateByID(ctx, id, bson.M{
		"$inc": bson.M{field: n},
		"$set": bson.M{"updated_at": time.Now()},
	})
	return err
}

// DeleteByRunID removes every VRT job for a run (used when clearing history).
func (r *VRTJobRepository) DeleteByRunID(ctx context.Context, runID primitive.ObjectID) error {
	_, err := r.collection.DeleteMany(ctx, bson.M{"run_id": runID})
	return err
}

func (r *VRTJobRepository) Finish(ctx context.Context, id primitive.ObjectID, status, errMsg string) error {
	now := time.Now()
	set := bson.M{"status": status, "finished_at": now, "updated_at": now}
	if errMsg != "" {
		set["error"] = errMsg
	}
	_, err := r.collection.UpdateByID(ctx, id, bson.M{"$set": set})
	return err
}
