package handlers

import (
	"backend/internal/middleware"
	"backend/internal/models"
	"backend/internal/repository"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/gorilla/mux"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

type TestSuiteHandler struct {
	testSuiteRepo *repository.TestSuiteRepository
	testCaseRepo  *repository.TestCaseRepository
}

func NewTestSuiteHandler(testSuiteRepo *repository.TestSuiteRepository, testCaseRepo *repository.TestCaseRepository) *TestSuiteHandler {
	return &TestSuiteHandler{
		testSuiteRepo: testSuiteRepo,
		testCaseRepo:  testCaseRepo,
	}
}

// CreateTestSuite creates a new test suite definition
func (h *TestSuiteHandler) CreateTestSuite(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok || claims.Email == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var req struct {
		SuiteName      string   `json:"suite_name"`
		Description    string   `json:"description"`
		Tags           []string `json:"tags"`
		DefaultBrowser string   `json:"default_browser"`
		Framework      string   `json:"framework"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.SuiteName == "" {
		http.Error(w, "Suite name is required", http.StatusBadRequest)
		return
	}

	if req.Framework == "" {
		req.Framework = "selenium"
	}
	if req.DefaultBrowser == "" {
		req.DefaultBrowser = "chrome"
	}

	suite := models.TestSuite{
		SuiteName:      req.SuiteName,
		Description:    req.Description,
		CreatedBy:      claims.Email,
		Tags:           req.Tags,
		DefaultBrowser: req.DefaultBrowser,
		Framework:      req.Framework,
		IsDeleted:      false,
		CreatedAt:      time.Now(),
		UpdatedAt:      time.Now(),
	}

	if err := h.testSuiteRepo.Create(r.Context(), &suite); err != nil {
		http.Error(w, fmt.Sprintf("Failed to create test suite: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "Test suite created successfully",
		"suite":   suite,
	})
}

// GetUserTestSuites retrieves all test suites for the authenticated user
func (h *TestSuiteHandler) GetUserTestSuites(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok || claims.Email == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	suites, err := h.testSuiteRepo.GetUserSuites(r.Context(), claims.Email)
	if err != nil {
		http.Error(w, "Failed to fetch test suites", http.StatusInternalServerError)
		return
	}

	if suites == nil {
		suites = []models.TestSuite{}
	}

	// Enrich suites with test case counts
	type SuiteWithCount struct {
		models.TestSuite
		TestCaseCount int64 `json:"test_case_count"`
	}

	enrichedSuites := make([]SuiteWithCount, len(suites))
	for i, suite := range suites {
		count, _ := h.testCaseRepo.CountBySuiteID(r.Context(), suite.ID)
		enrichedSuites[i] = SuiteWithCount{
			TestSuite:     suite,
			TestCaseCount: count,
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(enrichedSuites)
}

// GetTestSuiteDetails retrieves details of a specific test suite including its test cases
func (h *TestSuiteHandler) GetTestSuiteDetails(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok || claims.Email == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	vars := mux.Vars(r)
	suiteIDStr := vars["suite_id"]
	if suiteIDStr == "" {
		http.Error(w, "Suite ID is required", http.StatusBadRequest)
		return
	}

	suiteID, err := primitive.ObjectIDFromHex(suiteIDStr)
	if err != nil {
		http.Error(w, "Invalid suite ID", http.StatusBadRequest)
		return
	}

	// Get suite
	suite, err := h.testSuiteRepo.GetByID(r.Context(), suiteID)
	if err != nil {
		http.Error(w, "Test suite not found", http.StatusNotFound)
		return
	}

	// Verify ownership
	if suite.CreatedBy != claims.Email {
		http.Error(w, "Unauthorized access to this suite", http.StatusForbidden)
		return
	}

	// Get test cases
	testCases, err := h.testCaseRepo.GetActiveBySuiteID(r.Context(), suiteID)
	if err != nil {
		testCases = []models.TestCase{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"suite":      suite,
		"test_cases": testCases,
	})
}

// UpdateTestSuite updates a test suite definition
func (h *TestSuiteHandler) UpdateTestSuite(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok || claims.Email == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	vars := mux.Vars(r)
	suiteIDStr := vars["suite_id"]
	suiteID, err := primitive.ObjectIDFromHex(suiteIDStr)
	if err != nil {
		http.Error(w, "Invalid suite ID", http.StatusBadRequest)
		return
	}

	// Get existing suite
	suite, err := h.testSuiteRepo.GetByID(r.Context(), suiteID)
	if err != nil {
		http.Error(w, "Test suite not found", http.StatusNotFound)
		return
	}

	// Verify ownership
	if suite.CreatedBy != claims.Email {
		http.Error(w, "Unauthorized access to this suite", http.StatusForbidden)
		return
	}

	var req models.TestSuiteUpdateRequest

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if err := h.testSuiteRepo.Update(r.Context(), suiteID, claims.Email, &req); err != nil {
		http.Error(w, "Failed to update test suite", http.StatusInternalServerError)
		return
	}

	// Fetch updated suite
	suite, _ = h.testSuiteRepo.GetByID(r.Context(), suiteID)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "Test suite updated successfully",
		"suite":   suite,
	})
}

// DeleteTestSuite soft-deletes a test suite
func (h *TestSuiteHandler) DeleteTestSuite(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok || claims.Email == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	vars := mux.Vars(r)
	suiteIDStr := vars["suite_id"]
	suiteID, err := primitive.ObjectIDFromHex(suiteIDStr)
	if err != nil {
		http.Error(w, "Invalid suite ID", http.StatusBadRequest)
		return
	}

	// Get existing suite
	suite, err := h.testSuiteRepo.GetByID(r.Context(), suiteID)
	if err != nil {
		http.Error(w, "Test suite not found", http.StatusNotFound)
		return
	}

	// Verify ownership
	if suite.CreatedBy != claims.Email {
		http.Error(w, "Unauthorized access to this suite", http.StatusForbidden)
		return
	}

	if err := h.testSuiteRepo.Delete(r.Context(), suiteID, claims.Email); err != nil {
		http.Error(w, "Failed to delete test suite", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "Test suite deleted successfully",
	})
}
