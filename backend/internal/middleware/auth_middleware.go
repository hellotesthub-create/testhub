package middleware

/**
 * Auth Middleware
 *
 * Purpose: JWT authentication middleware
 * Verifies JWT tokens on protected routes
 *
 * Usage: Wrap protected routes with this middleware
 */

import (
	"context"
	"log"
	"net/http"
	"strings"

	"backend/internal/services"
)

type contextKey string

const UserContextKey contextKey = "user"

// AuthMiddleware verifies JWT tokens
type AuthMiddleware struct {
	jwtService *services.JWTService
}

// NewAuthMiddleware creates a new auth middleware instance
func NewAuthMiddleware(jwtService *services.JWTService) *AuthMiddleware {
	return &AuthMiddleware{
		jwtService: jwtService,
	}
}

// Authenticate verifies the JWT token and adds user claims to context
func (m *AuthMiddleware) Authenticate(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		log.Printf("Auth middleware: %s %s from %s", r.Method, r.URL.Path, r.RemoteAddr)
		
		// Extract token from Authorization header
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			log.Printf("Auth failed: Missing authorization header")
			http.Error(w, "Missing authorization header", http.StatusUnauthorized)
			return
		}

		// Expected format: "Bearer <token>"
		parts := strings.Split(authHeader, " ")
		if len(parts) != 2 || parts[0] != "Bearer" {
			log.Printf("Auth failed: Invalid authorization format")
			http.Error(w, "Invalid authorization format. Expected: Bearer <token>", http.StatusUnauthorized)
			return
		}

		tokenString := parts[1]

		// Verify token
		claims, err := m.jwtService.VerifyToken(tokenString)
		if err != nil {
			log.Printf("Auth failed: Invalid or expired token - %v", err)
			http.Error(w, "Invalid or expired token", http.StatusUnauthorized)
			return
		}

		log.Printf("Auth successful: user=%s email=%s", claims.Username, claims.Email)
		
		// Add claims to context
		ctx := context.WithValue(r.Context(), UserContextKey, claims)
		next.ServeHTTP(w, r.WithContext(ctx))
	}
}

// GetUserFromContext extracts user claims from request context
func GetUserFromContext(ctx context.Context) (*services.TokenClaims, bool) {
	claims, ok := ctx.Value(UserContextKey).(*services.TokenClaims)
	return claims, ok
}
