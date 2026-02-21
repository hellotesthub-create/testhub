package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// User represents a system user
type User struct {
	ID             primitive.ObjectID `json:"id" bson:"_id,omitempty"`
	FullName       string             `json:"full_name" bson:"full_name"`
	Username       string             `json:"username" bson:"username"`
	Email          string             `json:"email" bson:"email"`
	PasswordHash   string             `json:"-" bson:"password_hash"`                     // Never expose in JSON
	Password       string             `json:"-" bson:"password,omitempty"`                // Legacy field, migrate to password_hash
	Role           string             `json:"role" bson:"role"`                           // admin, qa_engineer, user
	ProfilePicture string             `json:"profile_picture,omitempty" bson:"profile_picture,omitempty"`
	Picture        string             `json:"picture,omitempty" bson:"picture,omitempty"` // Legacy field
	Provider       string             `json:"provider" bson:"provider"`                   // local, google
	IsActive       bool               `json:"is_active" bson:"is_active"`
	CreatedAt      time.Time          `json:"created_at" bson:"created_at"`
	UpdatedAt      time.Time          `json:"updated_at" bson:"updated_at"`
}

// UserCreateRequest is used for creating new users
type UserCreateRequest struct {
	FullName string `json:"full_name" validate:"required"`
	Username string `json:"username" validate:"required,min=3,max=30"`
	Email    string `json:"email" validate:"required,email"`
	Password string `json:"password" validate:"required,min=6"`
	Role     string `json:"role"`
}

// UserResponse is used for returning user data (without sensitive info)
type UserResponse struct {
	ID             string    `json:"id"`
	FullName       string    `json:"full_name"`
	Username       string    `json:"username"`
	Email          string    `json:"email"`
	Role           string    `json:"role"`
	ProfilePicture string    `json:"profile_picture,omitempty"`
	Provider       string    `json:"provider"`
	IsActive       bool      `json:"is_active"`
	CreatedAt      time.Time `json:"created_at"`
}
