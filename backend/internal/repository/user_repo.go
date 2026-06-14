package repository

/**
 * User Repository
 *
 * Purpose: Handle all database operations for users collection
 * This layer directly interacts with MongoDB
 *
 * Operations:
 * - CreateUser: Insert new user into database
 * - CheckEmailExists: Verify if email already registered
 * - CheckUsernameExists: Verify if username already taken
 */

import (
	"context"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"

	"backend/internal/models"
)

type UserRepository struct {
	collection *mongo.Collection
}

// NewUserRepository creates a new user repository instance
func NewUserRepository(db *mongo.Database) *UserRepository {
	return &UserRepository{
		collection: db.Collection("users"),
	}
}

// CreateUser inserts a new user into the database
func (r *UserRepository) CreateUser(ctx context.Context, user *models.User) error {
	// Set timestamps
	user.CreatedAt = time.Now()
	user.UpdatedAt = time.Now()

	// Insert into database
	_, err := r.collection.InsertOne(ctx, user)
	return err
}

// CheckEmailExists checks if an email already exists in database
func (r *UserRepository) CheckEmailExists(ctx context.Context, email string) (bool, error) {
	filter := bson.M{"email": email}

	count, err := r.collection.CountDocuments(ctx, filter)
	if err != nil {
		return false, err
	}

	return count > 0, nil
}

// CheckUsernameExists checks if a username already exists in database
func (r *UserRepository) CheckUsernameExists(ctx context.Context, username string) (bool, error) {
	filter := bson.M{"username": username}

	count, err := r.collection.CountDocuments(ctx, filter)
	if err != nil {
		return false, err
	}

	return count > 0, nil
}

// GetUserByEmail retrieves a user by their email address
func (r *UserRepository) GetUserByEmail(ctx context.Context, email string) (*models.User, error) {
	filter := bson.M{"email": email}

	var user models.User
	err := r.collection.FindOne(ctx, filter).Decode(&user)
	if err != nil {
		return nil, err
	}

	return &user, nil
}

// UpdateUserPassword updates the password hash for a user identified by email
func (r *UserRepository) UpdateUserPassword(ctx context.Context, email, passwordHash string) error {
	filter := bson.M{"email": email}
	update := bson.M{
		"$set": bson.M{
			"password_hash": passwordHash,
			"updated_at":    time.Now(),
		},
		"$unset": bson.M{
			"password": "", // Remove legacy plain text password
		},
	}

	_, err := r.collection.UpdateOne(ctx, filter, update)
	return err
}

// SetResetToken stores a hashed password-reset token and its expiry for a user.
func (r *UserRepository) SetResetToken(ctx context.Context, email, tokenHash string, expiresAt time.Time) error {
	filter := bson.M{"email": email}
	update := bson.M{
		"$set": bson.M{
			"reset_token_hash":       tokenHash,
			"reset_token_expires_at": expiresAt,
			"updated_at":             time.Now(),
		},
	}
	_, err := r.collection.UpdateOne(ctx, filter, update)
	return err
}

// GetUserByResetTokenHash finds a user by their reset-token hash (expiry checked by caller).
func (r *UserRepository) GetUserByResetTokenHash(ctx context.Context, tokenHash string) (*models.User, error) {
	filter := bson.M{"reset_token_hash": tokenHash}
	var user models.User
	if err := r.collection.FindOne(ctx, filter).Decode(&user); err != nil {
		return nil, err
	}
	return &user, nil
}

// ClearResetToken removes the reset token fields for a user (single-use enforcement).
func (r *UserRepository) ClearResetToken(ctx context.Context, email string) error {
	filter := bson.M{"email": email}
	update := bson.M{
		"$unset": bson.M{
			"reset_token_hash":       "",
			"reset_token_expires_at": "",
		},
		"$set": bson.M{"updated_at": time.Now()},
	}
	_, err := r.collection.UpdateOne(ctx, filter, update)
	return err
}

// MigratePasswordToHash migrates a legacy plain text password to bcrypt hash
func (r *UserRepository) MigratePasswordToHash(ctx context.Context, email, passwordHash string) error {
	filter := bson.M{"email": email}
	update := bson.M{
		"$set": bson.M{
			"password_hash": passwordHash,
			"updated_at":    time.Now(),
		},
		"$unset": bson.M{
			"password": "", // Remove legacy plain text field
		},
	}

	_, err := r.collection.UpdateOne(ctx, filter, update)
	return err
}
