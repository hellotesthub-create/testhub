package repository

import (
	"backend/internal/models"
	"context"
	"io"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/gridfs"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type VideoRepository struct {
	collection *mongo.Collection
	db         *mongo.Database
}

func NewVideoRepository(db *mongo.Database) *VideoRepository {
	return &VideoRepository{
		collection: db.Collection("videos"),
		db:         db,
	}
}

// Create inserts a new video document
func (r *VideoRepository) Create(ctx context.Context, video *models.Video) error {
	video.CreatedAt = time.Now()

	result, err := r.collection.InsertOne(ctx, video)
	if err != nil {
		return err
	}

	video.ID = result.InsertedID.(primitive.ObjectID)
	return nil
}

// GetByID retrieves a single video by its ID
func (r *VideoRepository) GetByID(ctx context.Context, id primitive.ObjectID) (*models.Video, error) {
	filter := bson.M{"_id": id}

	var video models.Video
	err := r.collection.FindOne(ctx, filter).Decode(&video)
	if err != nil {
		return nil, err
	}

	return &video, nil
}

// GetByRunID retrieves all videos for a specific run
func (r *VideoRepository) GetByRunID(ctx context.Context, runID primitive.ObjectID) ([]models.Video, error) {
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

	videos := make([]models.Video, 0)
	if err = cursor.All(ctx, &videos); err != nil {
		return nil, err
	}

	return videos, nil
}

// GetByRunIDString retrieves all videos for a specific run using human-readable run_id
func (r *VideoRepository) GetByRunIDString(ctx context.Context, runIDString string) ([]models.Video, error) {
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

	videos := make([]models.Video, 0)
	if err = cursor.All(ctx, &videos); err != nil {
		return nil, err
	}

	return videos, nil
}

// GetByResultID retrieves all videos for a specific test result
func (r *VideoRepository) GetByResultID(ctx context.Context, resultID primitive.ObjectID) ([]models.Video, error) {
	filter := bson.M{"result_id": resultID}
	opts := options.Find().SetSort(bson.D{{Key: "created_at", Value: 1}})

	cursor, err := r.collection.Find(ctx, filter, opts)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	videos := make([]models.Video, 0)
	if err = cursor.All(ctx, &videos); err != nil {
		return nil, err
	}

	return videos, nil
}

// GetByRunIDAndTestName retrieves videos for a specific test in a run
func (r *VideoRepository) GetByRunIDAndTestName(ctx context.Context, runID primitive.ObjectID, testName string) ([]models.Video, error) {
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

	videos := make([]models.Video, 0)
	if err = cursor.All(ctx, &videos); err != nil {
		return nil, err
	}

	return videos, nil
}

// CountByRunID counts videos for a run
func (r *VideoRepository) CountByRunID(ctx context.Context, runID primitive.ObjectID) (int64, error) {
	filter := bson.M{"run_id": runID}
	return r.collection.CountDocuments(ctx, filter)
}

// DeleteByRunID deletes all videos for a specific run
func (r *VideoRepository) DeleteByRunID(ctx context.Context, runID primitive.ObjectID) error {
	filter := bson.M{"run_id": runID}
	_, err := r.collection.DeleteMany(ctx, filter)
	return err
}

// GetVideoDataFromGridFS retrieves video binary data from GridFS
func (r *VideoRepository) GetVideoDataFromGridFS(ctx context.Context, gridfsID string) ([]byte, error) {
	objID, err := primitive.ObjectIDFromHex(gridfsID)
	if err != nil {
		return nil, err
	}

	bucket, err := gridfs.NewBucket(r.db)
	if err != nil {
		return nil, err
	}

	downloadStream, err := bucket.OpenDownloadStream(objID)
	if err != nil {
		return nil, err
	}
	defer downloadStream.Close()

	videoData, err := io.ReadAll(downloadStream)
	if err != nil {
		return nil, err
	}

	return videoData, nil
}
