package services

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
)

// Reset links are valid for 5 minutes only.
const resetTokenTTL = 5 * time.Minute

var errInvalidResetToken = errors.New("invalid or expired reset link")

// hashResetToken returns the SHA-256 hex of a token; only the hash is stored.
func hashResetToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

// isStrongPassword enforces the same rules as the frontend signup form:
// >= 8 chars and at least one upper, lower, digit, and special character.
func isStrongPassword(pw string) bool {
	if len(pw) < 8 {
		return false
	}
	var upper, lower, digit, special bool
	for _, r := range pw {
		switch {
		case r >= 'A' && r <= 'Z':
			upper = true
		case r >= 'a' && r <= 'z':
			lower = true
		case r >= '0' && r <= '9':
			digit = true
		default:
			special = true
		}
	}
	return upper && lower && digit && special
}

// CreatePasswordResetToken issues a single-use, time-limited reset token for the
// given email. Returns (rawToken, expiresAt, exists, err). When the email is not
// registered, exists=false and err=nil — callers MUST NOT reveal this difference.
func (s *UserService) CreatePasswordResetToken(ctx context.Context, email string) (string, time.Time, bool, error) {
	email = strings.TrimSpace(email)
	if email == "" {
		return "", time.Time{}, false, nil
	}

	exists, err := s.userRepo.CheckEmailExists(ctx, email)
	if err != nil {
		return "", time.Time{}, false, err
	}
	if !exists {
		return "", time.Time{}, false, nil
	}

	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", time.Time{}, true, err
	}
	token := hex.EncodeToString(buf)
	expiresAt := time.Now().Add(resetTokenTTL)

	if err := s.userRepo.SetResetToken(ctx, email, hashResetToken(token), expiresAt); err != nil {
		return "", time.Time{}, true, err
	}
	return token, expiresAt, true, nil
}

// ValidateResetToken returns the token's expiry if it is valid and unexpired.
func (s *UserService) ValidateResetToken(ctx context.Context, token string) (time.Time, error) {
	token = strings.TrimSpace(token)
	if token == "" {
		return time.Time{}, errInvalidResetToken
	}
	user, err := s.userRepo.GetUserByResetTokenHash(ctx, hashResetToken(token))
	if err != nil || user == nil || user.ResetTokenExpiresAt == nil {
		return time.Time{}, errInvalidResetToken
	}
	if time.Now().After(*user.ResetTokenExpiresAt) {
		return time.Time{}, errInvalidResetToken
	}
	return *user.ResetTokenExpiresAt, nil
}

// ResetPasswordWithToken validates the token, enforces password strength, updates
// the (hashed) password, and clears the token so it cannot be reused.
func (s *UserService) ResetPasswordWithToken(ctx context.Context, token, newPassword string) error {
	token = strings.TrimSpace(token)
	if token == "" {
		return errInvalidResetToken
	}
	user, err := s.userRepo.GetUserByResetTokenHash(ctx, hashResetToken(token))
	if err != nil || user == nil || user.ResetTokenExpiresAt == nil {
		return errInvalidResetToken
	}
	if time.Now().After(*user.ResetTokenExpiresAt) {
		_ = s.userRepo.ClearResetToken(ctx, user.Email)
		return errInvalidResetToken
	}
	if !isStrongPassword(newPassword) {
		return errors.New("password must be at least 8 characters and include an uppercase letter, a lowercase letter, a number, and a special character")
	}

	hashed, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
	if err != nil {
		return errors.New("failed to hash password")
	}
	if err := s.userRepo.UpdateUserPassword(ctx, user.Email, string(hashed)); err != nil {
		return errors.New("failed to update password")
	}

	// Single-use: invalidate the token immediately after a successful reset.
	_ = s.userRepo.ClearResetToken(ctx, user.Email)
	return nil
}
