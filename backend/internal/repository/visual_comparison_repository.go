package repository

import (
	"context"
	"log"
	"time"

	"backend/internal/models"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type VisualComparisonRepository struct {
	collection *mongo.Collection
}

func NewVisualComparisonRepository(db *mongo.Database) *VisualComparisonRepository {
	repo := &VisualComparisonRepository{
		collection: db.Collection("visual_comparisons"),
	}
	repo.EnsureIndexes(context.Background())
	return repo
}

func (r *VisualComparisonRepository) EnsureIndexes(ctx context.Context) {
	indexModel := mongo.IndexModel{
		Keys: bson.D{
			{Key: "result_id", Value: 1},
			{Key: "created_at", Value: -1},
		},
	}
	if _, err := r.collection.Indexes().CreateOne(ctx, indexModel); err != nil {
		log.Printf("Warning: failed to create visual comparison index: %v", err)
	}
}

func (r *VisualComparisonRepository) Insert(ctx context.Context, vc *models.VisualComparison) error {
	now := time.Now()
	if vc.CreatedAt.IsZero() {
		vc.CreatedAt = now
	}
	vc.UpdatedAt = now

	result, err := r.collection.InsertOne(ctx, vc)
	if err != nil {
		return err
	}

	vc.ID = result.InsertedID.(primitive.ObjectID)
	return nil
}

func (r *VisualComparisonRepository) GetByResultID(ctx context.Context, resultID primitive.ObjectID) (*models.VisualComparison, error) {
	filter := bson.M{"result_id": resultID}
	opts := options.FindOne().SetSort(bson.D{{Key: "created_at", Value: -1}})

	var comparison models.VisualComparison
	if err := r.collection.FindOne(ctx, filter, opts).Decode(&comparison); err != nil {
		return nil, err
	}

	return &comparison, nil
}

func (r *VisualComparisonRepository) GetByID(ctx context.Context, id primitive.ObjectID) (*models.VisualComparison, error) {
	filter := bson.M{"_id": id}
	var comparison models.VisualComparison
	err := r.collection.FindOne(ctx, filter).Decode(&comparison)
	if err != nil {
		return nil, err
	}
	return &comparison, nil
}

// GetHistory returns comparisons scoped to a user's runs. Matches either result_id
// (manual comparisons) or run_ref (background VRT job output).
func (r *VisualComparisonRepository) GetHistory(ctx context.Context, resultIDs, runIDs []primitive.ObjectID) ([]models.VisualComparison, error) {
	if len(resultIDs) == 0 && len(runIDs) == 0 {
		return []models.VisualComparison{}, nil
	}
	or := []bson.M{}
	if len(resultIDs) > 0 {
		or = append(or, bson.M{"result_id": bson.M{"$in": resultIDs}})
	}
	if len(runIDs) > 0 {
		or = append(or, bson.M{"run_ref": bson.M{"$in": runIDs}})
	}
	opts := options.Find().
		SetSort(bson.D{{Key: "created_at", Value: -1}}).
		SetLimit(500)
	cursor, err := r.collection.Find(ctx, bson.M{"$or": or}, opts)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)
	var items []models.VisualComparison
	if err := cursor.All(ctx, &items); err != nil {
		return nil, err
	}
	return items, nil
}

// GetByJobID returns all comparisons produced by one background VRT job, newest first.
func (r *VisualComparisonRepository) GetByJobID(ctx context.Context, jobID primitive.ObjectID) ([]models.VisualComparison, error) {
	opts := options.Find().SetSort(bson.D{{Key: "created_at", Value: -1}}).SetLimit(5000)
	cursor, err := r.collection.Find(ctx, bson.M{"job_id": jobID}, opts)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)
	items := make([]models.VisualComparison, 0)
	if err := cursor.All(ctx, &items); err != nil {
		return nil, err
	}
	return items, nil
}

// DeleteByRunRef clears prior comparisons for a run so a manual re-run starts clean.
func (r *VisualComparisonRepository) DeleteByRunRef(ctx context.Context, runRef primitive.ObjectID) error {
	_, err := r.collection.DeleteMany(ctx, bson.M{"run_ref": runRef})
	return err
}

// DeleteByResultID clears prior manual comparisons for one test result so re-run
// replaces the stored record instead of stacking duplicates.
func (r *VisualComparisonRepository) DeleteByResultID(ctx context.Context, resultID primitive.ObjectID) error {
	_, err := r.collection.DeleteMany(ctx, bson.M{
		"result_id": resultID,
		"job_id":    bson.M{"$exists": false},
	})
	return err
}

// DeleteByID removes a single comparison (per-row delete on the history page).
func (r *VisualComparisonRepository) DeleteByID(ctx context.Context, id primitive.ObjectID) error {
	_, err := r.collection.DeleteOne(ctx, bson.M{"_id": id})
	return err
}

// DeleteByUserScope removes every comparison reachable from the user's runs
// (matched by either result_id or run_ref). Powers "Clear all history".
func (r *VisualComparisonRepository) DeleteByUserScope(ctx context.Context, resultIDs, runIDs []primitive.ObjectID) (int64, error) {
	if len(resultIDs) == 0 && len(runIDs) == 0 {
		return 0, nil
	}
	or := []bson.M{}
	if len(resultIDs) > 0 {
		or = append(or, bson.M{"result_id": bson.M{"$in": resultIDs}})
	}
	if len(runIDs) > 0 {
		or = append(or, bson.M{"run_ref": bson.M{"$in": runIDs}})
	}
	res, err := r.collection.DeleteMany(ctx, bson.M{"$or": or})
	if err != nil {
		return 0, err
	}
	return res.DeletedCount, nil
}

func (r *VisualComparisonRepository) ApproveBaseline(ctx context.Context, id primitive.ObjectID, approvedBy string) (*models.VisualComparison, error) {
	now := time.Now()
	filter := bson.M{"_id": id}
	update := bson.M{"$set": bson.M{
		"approved_at": now,
		"approved_by": approvedBy,
	}}
	opts := options.FindOneAndUpdate().SetReturnDocument(options.After)
	var comparison models.VisualComparison
	err := r.collection.FindOneAndUpdate(ctx, filter, update, opts).Decode(&comparison)
	if err != nil {
		return nil, err
	}
	return &comparison, nil
}
