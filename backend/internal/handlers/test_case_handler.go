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

type TestCaseHandler struct {
	testSuiteRepo *repository.TestSuiteRepository
	testCaseRepo  *repository.TestCaseRepository
}

func NewTestCaseHandler(testSuiteRepo *repository.TestSuiteRepository, testCaseRepo *repository.TestCaseRepository) *TestCaseHandler {
	return &TestCaseHandler{
		testSuiteRepo: testSuiteRepo,
		testCaseRepo:  testCaseRepo,
	}
}

// AddTestCase adds a new test case to an existing suite
func (h *TestCaseHandler) AddTestCase(w http.ResponseWriter, r *http.Request) {
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

	// Verify suite exists and belongs to user
	suite, err := h.testSuiteRepo.GetByID(r.Context(), suiteID)
	if err != nil {
		http.Error(w, "Test suite not found", http.StatusNotFound)
		return
	}
	if suite.CreatedBy != claims.Email {
		http.Error(w, "Unauthorized access to this suite", http.StatusForbidden)
		return
	}

	var req struct {
		TestName         string `json:"test_name"`
		OriginalFilename string `json:"original_filename"`
		Language         string `json:"language"`
		Framework        string `json:"framework"`
		ScriptContent    string `json:"script_content"`
		Priority         string `json:"priority"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.TestName == "" {
		http.Error(w, "Test name is required", http.StatusBadRequest)
		return
	}
	if req.ScriptContent == "" {
		http.Error(w, "Script content is required", http.StatusBadRequest)
		return
	}

	// Default values
	if req.Language == "" {
		req.Language = "python"
	}
	if req.Framework == "" {
		req.Framework = suite.Framework
	}
	if req.Priority == "" {
		req.Priority = "medium"
	}

	testCase := models.TestCase{
		SuiteID:          suiteID,
		TestName:         req.TestName,
		OriginalFilename: req.OriginalFilename,
		Language:         req.Language,
		Framework:        req.Framework,
		ScriptContent:    req.ScriptContent,
		Priority:         req.Priority,
		IsActive:         true,
		CreatedAt:        time.Now(),
		UpdatedAt:        time.Now(),
	}

	if err := h.testCaseRepo.Create(r.Context(), &testCase); err != nil {
		http.Error(w, fmt.Sprintf("Failed to create test case: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":   true,
		"message":   "Test case added successfully",
		"test_case": testCase,
	})
}

// GetTestCases retrieves all test cases for a suite
func (h *TestCaseHandler) GetTestCases(w http.ResponseWriter, r *http.Request) {
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

	// Verify suite exists and belongs to user
	suite, err := h.testSuiteRepo.GetByID(r.Context(), suiteID)
	if err != nil {
		http.Error(w, "Test suite not found", http.StatusNotFound)
		return
	}
	if suite.CreatedBy != claims.Email {
		http.Error(w, "Unauthorized access to this suite", http.StatusForbidden)
		return
	}

	// Check if we should include inactive
	includeInactive := r.URL.Query().Get("include_inactive") == "true"

	var testCases []models.TestCase
	if includeInactive {
		testCases, err = h.testCaseRepo.GetBySuiteID(r.Context(), suiteID)
	} else {
		testCases, err = h.testCaseRepo.GetActiveBySuiteID(r.Context(), suiteID)
	}

	if err != nil {
		http.Error(w, "Failed to fetch test cases", http.StatusInternalServerError)
		return
	}

	if testCases == nil {
		testCases = []models.TestCase{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(testCases)
}

// GetTestCase retrieves a single test case
func (h *TestCaseHandler) GetTestCase(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok || claims.Email == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	vars := mux.Vars(r)
	testCaseIDStr := vars["test_case_id"]
	testCaseID, err := primitive.ObjectIDFromHex(testCaseIDStr)
	if err != nil {
		http.Error(w, "Invalid test case ID", http.StatusBadRequest)
		return
	}

	testCase, err := h.testCaseRepo.GetByID(r.Context(), testCaseID)
	if err != nil {
		http.Error(w, "Test case not found", http.StatusNotFound)
		return
	}

	// Verify suite ownership
	suite, err := h.testSuiteRepo.GetByID(r.Context(), testCase.SuiteID)
	if err != nil || suite.CreatedBy != claims.Email {
		http.Error(w, "Unauthorized access to this test case", http.StatusForbidden)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(testCase)
}

// UpdateTestCase updates a test case
func (h *TestCaseHandler) UpdateTestCase(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok || claims.Email == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	vars := mux.Vars(r)
	testCaseIDStr := vars["test_case_id"]
	testCaseID, err := primitive.ObjectIDFromHex(testCaseIDStr)
	if err != nil {
		http.Error(w, "Invalid test case ID", http.StatusBadRequest)
		return
	}

	testCase, err := h.testCaseRepo.GetByID(r.Context(), testCaseID)
	if err != nil {
		http.Error(w, "Test case not found", http.StatusNotFound)
		return
	}

	// Verify suite ownership
	suite, err := h.testSuiteRepo.GetByID(r.Context(), testCase.SuiteID)
	if err != nil || suite.CreatedBy != claims.Email {
		http.Error(w, "Unauthorized access to this test case", http.StatusForbidden)
		return
	}

	var req models.TestCaseUpdateRequest

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if err := h.testCaseRepo.Update(r.Context(), testCaseID, &req); err != nil {
		http.Error(w, "Failed to update test case", http.StatusInternalServerError)
		return
	}

	// Fetch updated test case
	testCase, _ = h.testCaseRepo.GetByID(r.Context(), testCaseID)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":   true,
		"message":   "Test case updated successfully",
		"test_case": testCase,
	})
}

// DeleteTestCase soft-deletes a test case
func (h *TestCaseHandler) DeleteTestCase(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok || claims.Email == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	vars := mux.Vars(r)
	testCaseIDStr := vars["test_case_id"]
	testCaseID, err := primitive.ObjectIDFromHex(testCaseIDStr)
	if err != nil {
		http.Error(w, "Invalid test case ID", http.StatusBadRequest)
		return
	}

	testCase, err := h.testCaseRepo.GetByID(r.Context(), testCaseID)
	if err != nil {
		http.Error(w, "Test case not found", http.StatusNotFound)
		return
	}

	// Verify suite ownership
	suite, err := h.testSuiteRepo.GetByID(r.Context(), testCase.SuiteID)
	if err != nil || suite.CreatedBy != claims.Email {
		http.Error(w, "Unauthorized access to this test case", http.StatusForbidden)
		return
	}

	if err := h.testCaseRepo.Delete(r.Context(), testCaseID); err != nil {
		http.Error(w, "Failed to delete test case", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "Test case deleted successfully",
	})
}
