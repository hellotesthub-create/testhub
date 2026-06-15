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

func (r *VisualComparisonRepository) GetHistory(ctx context.Context, resultIDs []primitive.ObjectID) ([]models.VisualComparison, error) {
	if len(resultIDs) == 0 {
		return []models.VisualComparison{}, nil
	}
	filter := bson.M{"result_id": bson.M{"$in": resultIDs}}
	opts := options.Find().
		SetSort(bson.D{{Key: "created_at", Value: -1}}).
		SetLimit(500)
	cursor, err := r.collection.Find(ctx, filter, opts)
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
