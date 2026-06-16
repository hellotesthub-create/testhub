package handlers

/**
 * User Handler
 *
 * Purpose: Handle HTTP requests for user operations
 * This layer receives HTTP requests and sends responses
 *
 * Endpoints:
 * - POST /api/users/signup: Create new user account
 * - POST /api/auth/login: Login with email/password
 * - GET  /api/auth/me: Get current user info
 * - POST /api/users/set-password: Set password for OAuth users
 *
 * Note: Returns JSON responses with proper status codes
 */

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/mail"
	"os"
	"strings"
	"time"

	"backend/internal/middleware"
	"backend/internal/services"
)

type UserHandler struct {
	userService *services.UserService
	jwtService  *services.JWTService
}

// NewUserHandler creates a new user handler instance
func NewUserHandler(userService *services.UserService, jwtService *services.JWTService) *UserHandler {
	return &UserHandler{
		userService: userService,
		jwtService:  jwtService,
	}
}

// SignupRequest represents the JSON body for signup
type SignupRequest struct {
	Name     string `json:"name"`
	Email    string `json:"email"`
	Password string `json:"password"`
}

// Response represents a standard JSON response
type Response struct {
	Success bool        `json:"success"`
	Message string      `json:"message"`
	Data    interface{} `json:"data,omitempty"`
}

// Signup handles user registration
// POST /api/users/signup
func (h *UserHandler) Signup(w http.ResponseWriter, r *http.Request) {
	// Set response header
	w.Header().Set("Content-Type", "application/json")

	// Handle OPTIONS request for CORS
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	// ==================================================
	// PARSE REQUEST
	// ==================================================

	var req SignupRequest
	err := json.NewDecoder(r.Body).Decode(&req)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(Response{
			Success: false,
			Message: "Invalid request body",
		})
		return
	}

	// ==================================================
	// CREATE USER
	// ==================================================

	// Create service request (username = name for now)
	serviceReq := services.SignupRequest{
		Username: req.Name,
		Email:    req.Email,
		Password: req.Password,
	}

	user, err := h.userService.CreateUser(r.Context(), serviceReq)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(Response{
			Success: false,
			Message: err.Error(),
		})
		return
	}

	// ==================================================
	// GENERATE JWT TOKEN
	// ==================================================

	token, err := h.jwtService.GenerateToken(user.ID.Hex(), user.Email, user.Username, user.Role)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(Response{
			Success: false,
			Message: "User created but failed to generate token",
		})
		return
	}

	// ==================================================
	// SUCCESS RESPONSE
	// ==================================================

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(Response{
		Success: true,
		Message: "User created successfully",
		Data: map[string]interface{}{
			"token": token,
			"user": map[string]string{
				"id":       user.ID.Hex(),
				"email":    user.Email,
				"username": user.Username,
				"role":     user.Role,
			},
		},
	})
}

// SetPasswordRequest represents the request to set password for Google OAuth users
type SetPasswordRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

// SetPassword allows Google OAuth users to set a password for email/password login
// Endpoint: POST /api/users/set-password
func (h *UserHandler) SetPassword(w http.ResponseWriter, r *http.Request) {
	// Parse request body
	var req SetPasswordRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request format", http.StatusBadRequest)
		return
	}

	// Validate input
	if req.Email == "" || req.Password == "" {
		json.NewEncoder(w).Encode(Response{
			Success: false,
			Message: "Email and password are required",
		})
		return
	}

	if len(req.Password) < 6 {
		json.NewEncoder(w).Encode(Response{
			Success: false,
			Message: "Password must be at least 6 characters",
		})
		return
	}

	// Update user password via service
	err := h.userService.SetUserPassword(r.Context(), req.Email, req.Password)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(Response{
			Success: false,
			Message: err.Error(),
		})
		return
	}

	// Success response
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(Response{
		Success: true,
		Message: "Password set successfully",
	})
}

// LoginRequest represents the login request
type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

// Login handles user login with email/password
// Endpoint: POST /api/auth/login
func (h *UserHandler) Login(w http.ResponseWriter, r *http.Request) {
	// Parse request body
	var req LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request format", http.StatusBadRequest)
		return
	}

	// Validate credentials via service
	user, err := h.userService.LoginUser(r.Context(), req.Email, req.Password)
	if err != nil {
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(Response{
			Success: false,
			Message: err.Error(),
		})
		return
	}

	// Generate JWT token
	token, err := h.jwtService.GenerateToken(user.ID.Hex(), user.Email, user.Username, user.Role)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(Response{
			Success: false,
			Message: "Failed to generate token",
		})
		return
	}

	// Success response with JWT token
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(Response{
		Success: true,
		Message: "Login successful",
		Data: map[string]interface{}{
			"token": token,
			"user": map[string]string{
				"id":       user.ID.Hex(),
				"email":    user.Email,
				"username": user.Username,
				"role":     user.Role,
			},
		},
	})
}

// GetCurrentUser returns the currently authenticated user's information
// Endpoint: GET /api/auth/me (Protected - requires JWT)
func (h *UserHandler) GetCurrentUser(w http.ResponseWriter, r *http.Request) {
	// Extract user claims from context (set by auth middleware)
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		http.Error(w, "User not found in context", http.StatusUnauthorized)
		return
	}

	// Return user information
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(Response{
		Success: true,
		Message: "User retrieved successfully",
		Data: map[string]string{
			"id":       claims.UserID,
			"email":    claims.Email,
			"username": claims.Username,
			"role":     claims.Role,
		},
	})
}

// ForgotPasswordRequest is the body for requesting a password reset link.
type ForgotPasswordRequest struct {
	Email string `json:"email"`
}

// ResetPasswordRequest is the body for completing a password reset.
type ResetPasswordRequest struct {
	Token    string `json:"token"`
	Password string `json:"password"`
}

// ForgotPassword issues a reset link by email. Always returns the same generic
// message so it never reveals whether an account exists (anti-enumeration).
// Endpoint: POST /api/auth/forgot-password
func (h *UserHandler) ForgotPassword(w http.ResponseWriter, r *http.Request) {
	var req ForgotPasswordRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request format", http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	email := strings.TrimSpace(req.Email)

	// Reject malformed email addresses up front.
	if addr, perr := mail.ParseAddress(email); perr != nil || addr.Address != email {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(Response{
			Success: false,
			Message: "That doesn't look like a valid email address. Please correct it and try again.",
		})
		return
	}

	token, _, exists, err := h.userService.CreatePasswordResetToken(r.Context(), email)
	if err != nil {
		log.Printf("[forgot-password] token creation error: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(Response{Success: false, Message: "Something went wrong. Please try again."})
		return
	}

	// No account for this email → tell the user instead of silently doing nothing.
	if !exists || token == "" {
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(Response{
			Success: false,
			Message: "No account is registered with this email. Please check the address and try again.",
		})
		return
	}

	// Valid, registered email → send the reset link.
	go h.sendResetEmail(email, token)
	json.NewEncoder(w).Encode(Response{
		Success: true,
		Message: "A password reset link has been sent to your email.",
	})
}

// sendResetEmail builds and sends the password-reset email via the existing SMTP config.
func (h *UserHandler) sendResetEmail(email, token string) {
	emailSvc, err := services.NewEmailServiceFromEnv()
	if err != nil {
		log.Printf("[forgot-password] email service unavailable: %v", err)
		return
	}
	base := strings.TrimRight(os.Getenv("FRONTEND_BASE_URL"), "/")
	if base == "" {
		base = "http://localhost:3456"
	}
	link := fmt.Sprintf("%s/reset-password?token=%s", base, token)
	subject := "Reset your TESTHUB password"
	body := fmt.Sprintf(
		"Hi,\n\nWe received a request to reset your TESTHUB password.\n\n"+
			"Click the link below to choose a new password. For your security, this link is valid for 5 minutes only:\n\n%s\n\n"+
			"If you didn't request a password reset, you can safely ignore this email — your password will not change.\n\n— TESTHUB",
		link,
	)
	if err := emailSvc.Send(email, subject, body, nil); err != nil {
		log.Printf("[forgot-password] failed to send reset email to %s: %v", email, err)
	}
}

// ValidateResetToken reports whether a reset token is valid and, if so, its expiry
// (so the UI can show a countdown). Endpoint: GET /api/auth/reset-token?token=...
func (h *UserHandler) ValidateResetToken(w http.ResponseWriter, r *http.Request) {
	token := r.URL.Query().Get("token")
	w.Header().Set("Content-Type", "application/json")
	expiresAt, err := h.userService.ValidateResetToken(r.Context(), token)
	if err != nil {
		json.NewEncoder(w).Encode(map[string]any{"valid": false})
		return
	}
	json.NewEncoder(w).Encode(map[string]any{
		"valid":      true,
		"expires_at": expiresAt.UTC().Format(time.RFC3339),
	})
}

// ResetPassword completes a password reset using a valid token.
// Endpoint: POST /api/auth/reset-password
func (h *UserHandler) ResetPassword(w http.ResponseWriter, r *http.Request) {
	var req ResetPasswordRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request format", http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if err := h.userService.ResetPasswordWithToken(r.Context(), req.Token, req.Password); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(Response{Success: false, Message: err.Error()})
		return
	}

	json.NewEncoder(w).Encode(Response{
		Success: true,
		Message: "Your password has been successfully updated.",
	})
}
