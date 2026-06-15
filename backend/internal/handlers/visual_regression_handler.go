package handlers

import (
	"encoding/base64"
	"encoding/json"
	"context"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"backend/internal/middleware"
	"backend/internal/models"
	"backend/internal/repository"
	"backend/internal/services"

	"github.com/gorilla/mux"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

type VisualRegressionHandler struct {
	service              *services.VisualRegressionService
	visualComparisonRepo *repository.VisualComparisonRepository
	testResultRepo       *repository.TestResultRepository
	testRunRepo          *repository.TestRunRepository
	screenshotRepo       *repository.ScreenshotRepository
	testCaseRepo         *repository.TestCaseRepository
}

func NewVisualRegressionHandler(
	service *services.VisualRegressionService,
	visualComparisonRepo *repository.VisualComparisonRepository,
	testResultRepo *repository.TestResultRepository,
	testRunRepo *repository.TestRunRepository,
	screenshotRepo *repository.ScreenshotRepository,
	testCaseRepo *repository.TestCaseRepository,
) *VisualRegressionHandler {
	return &VisualRegressionHandler{
		service:              service,
		visualComparisonRepo: visualComparisonRepo,
		testResultRepo:       testResultRepo,
		testRunRepo:          testRunRepo,
		screenshotRepo:       screenshotRepo,
		testCaseRepo:         testCaseRepo,
	}
}

func (h *VisualRegressionHandler) Compare(w http.ResponseWriter, r *http.Request) {
	var req models.VisualRegressionCompareRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_request_body"})
		return
	}

	if strings.TrimSpace(req.ResultID) == "" {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "result_id_required"})
		return
	}

	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	resultID, err := primitive.ObjectIDFromHex(req.ResultID)
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid result_id"})
		return
	}

	resultDoc, err := h.testResultRepo.GetByID(r.Context(), resultID)
	if err != nil {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "result_not_found"})
		return
	}

	run, err := h.testRunRepo.GetByID(r.Context(), resultDoc.RunID)
	if err != nil {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "run_not_found"})
		return
	}
	if run.TriggeredBy != claims.Email {
		respondJSON(w, http.StatusForbidden, map[string]string{"error": "unauthorized"})
		return
	}

	shots, err := h.resolveScreenshotsForVisualRegression(r.Context(), resultID, resultDoc)
	if err != nil {
		log.Printf("Failed to resolve screenshots for visual regression: %v", err)
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "screenshot_lookup_failed"})
		return
	}
	if len(shots) == 0 {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "screenshot_not_found"})
		return
	}

	latestShot := shots[len(shots)-1]
	currentPath := filepath.Join("/tmp/vr", "current_"+resultID.Hex()+".png")
	if err := os.MkdirAll("/tmp/vr", 0755); err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "visual_regression_disk_error"})
		return
	}
	if err := writeScreenshotFile(currentPath, latestShot); err != nil {
		log.Printf("Failed to write visual regression screenshot: %v", err)
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "visual_regression_disk_error"})
		return
	}

	compareReq := models.VisualRegressionCompareRequest{
		TestCaseID:       visualBaselineTestKey(r.Context(), h.testCaseRepo, resultDoc),
		StepName:         visualStepName(latestShot, resultDoc.TestName),
		Framework:        run.Framework,
		Browser:          resultDoc.Browser,
		CurrentImagePath: currentPath,
		Threshold:        req.Threshold,
	}

	result, err := h.service.Compare(r.Context(), compareReq)
	if err != nil {
		log.Printf("Visual regression compare failed: %v", err)
		respondJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "visual_regression_unavailable"})
		return
	}

	comparison := &models.VisualComparison{
		ResultID:             resultID,
		TestCaseID:           compareReq.TestCaseID,
		StepName:             compareReq.StepName,
		Framework:            compareReq.Framework,
		Browser:              compareReq.Browser,
		Status:               result.Status,
		DifferencePercentage: result.DifferencePercentage,
		BaselinePath:         result.BaselinePath,
		CurrentPath:          result.CurrentPath,
		DiffPath:             result.DiffPath,
	}
	if err := h.visualComparisonRepo.Insert(r.Context(), comparison); err != nil {
		log.Printf("Failed to save visual comparison: %v", err)
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "visual_comparison_save_failed"})
		return
	}

	respondJSON(w, http.StatusOK, comparison)
}

func (h *VisualRegressionHandler) GetComparison(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	resultID, err := primitive.ObjectIDFromHex(vars["result_id"])
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid result_id"})
		return
	}

	if !h.userOwnsResult(w, r, resultID) {
		return
	}

	vc, err := h.visualComparisonRepo.GetByResultID(r.Context(), resultID)
	if err != nil {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "no_visual_comparison"})
		return
	}

	respondJSON(w, http.StatusOK, vc)
}

func (h *VisualRegressionHandler) ServeImage(w http.ResponseWriter, r *http.Request) {
	imagePath := strings.TrimSpace(r.URL.Query().Get("path"))
	if !isAllowedVisualImagePath(imagePath) {
		respondJSON(w, http.StatusForbidden, map[string]string{"error": "invalid_image_path"})
		return
	}

	resolvedPath := resolveVisualImagePath(imagePath)
	if _, err := os.Stat(resolvedPath); err != nil {
		log.Printf("Visual regression image not found: %s (resolved: %s): %v", imagePath, resolvedPath, err)
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "image_not_found"})
		return
	}

	w.Header().Set("Cache-Control", "private, max-age=60")
	http.ServeFile(w, r, resolvedPath)
}

func (h *VisualRegressionHandler) Health(w http.ResponseWriter, r *http.Request) {
	result, err := h.service.Health(r.Context())
	if err != nil {
		log.Printf("Visual regression health check failed: %v", err)
		respondJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "visual_regression_unavailable"})
		return
	}

	respondJSON(w, http.StatusOK, result)
}

// GET /api/visual-regression/history
func (h *VisualRegressionHandler) GetHistory(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()

	runs, err := h.testRunRepo.GetUserRuns(ctx, claims.Email)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to fetch user runs"})
		return
	}

	var runIDs []primitive.ObjectID
	for _, run := range runs {
		runIDs = append(runIDs, run.ID)
	}

	resultIDs, err := h.testResultRepo.GetResultIDsByRunIDs(ctx, runIDs)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to fetch result IDs"})
		return
	}

	items, err := h.visualComparisonRepo.GetHistory(ctx, resultIDs)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to fetch comparisons"})
		return
	}

	if items == nil {
		items = []models.VisualComparison{}
	} else {
		// Populate RunID by fetching the associated results
		for i := range items {
			res, err := h.testResultRepo.GetByID(ctx, items[i].ResultID)
			if err == nil && res != nil {
				items[i].RunID = res.RunID.Hex()
			}
		}
	}

	respondJSON(w, http.StatusOK, items)
}

// POST /api/visual-regression/approve-baseline
func (h *VisualRegressionHandler) ApproveBaseline(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	var req models.ApproveBaselineRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}

	comparisonObjID, err := primitive.ObjectIDFromHex(req.ComparisonID)
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid comparison_id"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()

	comparison, err := h.visualComparisonRepo.GetByID(ctx, comparisonObjID)
	if err != nil {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "comparison not found"})
		return
	}

	// Security: verify the result_id belongs to the authenticated user
	result, err := h.testResultRepo.GetByID(ctx, comparison.ResultID)
	if err != nil {
		respondJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden"})
		return
	}
	
	run, err := h.testRunRepo.GetByID(ctx, result.RunID)
	if err != nil || run.TriggeredBy != claims.Email {
		respondJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden"})
		return
	}

	if comparison.CurrentPath == "" || comparison.BaselinePath == "" {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "comparison missing paths"})
		return
	}

	// Create baseline directory if it does not exist
	baselinePath := resolveVisualImagePath(comparison.BaselinePath)
	if err := os.MkdirAll(filepath.Dir(baselinePath), 0755); err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to create baseline directory"})
		return
	}

	currentPath := resolveVisualImagePath(comparison.CurrentPath)

	// Copy current image to baseline path
	src, err := os.Open(currentPath)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to open current image"})
		return
	}
	defer src.Close()

	dst, err := os.Create(baselinePath)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to create baseline file"})
		return
	}
	defer dst.Close()

	if _, err := io.Copy(dst, src); err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to copy file"})
		return
	}

	// Update MongoDB with approved_at and approved_by
	updated, err := h.visualComparisonRepo.ApproveBaseline(ctx, comparisonObjID, claims.Email)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to update comparison"})
		return
	}

	respondJSON(w, http.StatusOK, models.ApproveBaselineResponse{
		Success:      true,
		Message:      "Baseline updated successfully",
		BaselinePath: updated.BaselinePath,
	})
}

// resolveScreenshotsForVisualRegression finds screenshots for a test result.
// Primary lookup is by result_id; falls back to run + test name + browser when
// the runner stored artifacts without linking result_id (visual regression only).
func (h *VisualRegressionHandler) resolveScreenshotsForVisualRegression(
	ctx context.Context,
	resultID primitive.ObjectID,
	resultDoc *models.TestResult,
) ([]models.Screenshot, error) {
	shots, err := h.screenshotRepo.GetByResultID(ctx, resultID)
	if err != nil {
		return nil, err
	}
	if len(shots) > 0 {
		return shots, nil
	}

	runShots, err := h.screenshotRepo.GetByRunIDAndTestName(ctx, resultDoc.RunID, resultDoc.TestName)
	if err != nil {
		return nil, err
	}

	filtered := make([]models.Screenshot, 0, len(runShots))
	for _, shot := range runShots {
		if shot.Browser == resultDoc.Browser {
			filtered = append(filtered, shot)
		}
	}
	return filtered, nil
}

func respondJSON(w http.ResponseWriter, statusCode int, payload interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	json.NewEncoder(w).Encode(payload)
}

func (h *VisualRegressionHandler) userOwnsResult(w http.ResponseWriter, r *http.Request, resultID primitive.ObjectID) bool {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return false
	}

	resultDoc, err := h.testResultRepo.GetByID(r.Context(), resultID)
	if err != nil {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "result_not_found"})
		return false
	}

	run, err := h.testRunRepo.GetByID(r.Context(), resultDoc.RunID)
	if err != nil {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "run_not_found"})
		return false
	}
	if run.TriggeredBy != claims.Email {
		respondJSON(w, http.StatusForbidden, map[string]string{"error": "unauthorized"})
		return false
	}
	return true
}

func writeScreenshotFile(outputPath string, screenshot models.Screenshot) error {
	if len(screenshot.FileData) > 0 {
		return os.WriteFile(outputPath, screenshot.FileData, 0644)
	}
	if strings.TrimSpace(screenshot.ImageData) == "" {
		return os.ErrNotExist
	}
	imageData := screenshot.ImageData
	if idx := strings.Index(imageData, ","); idx >= 0 {
		imageData = imageData[idx+1:]
	}
	decoded, err := base64.StdEncoding.DecodeString(imageData)
	if err != nil {
		return err
	}
	return os.WriteFile(outputPath, decoded, 0644)
}

func visualStepName(screenshot models.Screenshot, fallback string) string {
	if strings.TrimSpace(screenshot.Step) != "" {
		return strings.TrimSpace(screenshot.Step)
	}
	if strings.TrimSpace(screenshot.Name) != "" {
		return strings.TrimSuffix(strings.TrimSpace(screenshot.Name), filepath.Ext(screenshot.Name))
	}
	return fallback
}

// visualBaselineTestKey returns a stable script identifier for baseline storage.
// MongoDB test_case_id changes on every suite run; the logical script name does not.
func visualBaselineTestKey(ctx context.Context, repo *repository.TestCaseRepository, result *models.TestResult) string {
	if result != nil && !result.TestCaseID.IsZero() && repo != nil {
		if tc, err := repo.GetByID(ctx, result.TestCaseID); err == nil {
			return visualBaselineTestKeyFromCase(tc, result.TestName)
		}
	}
	if result != nil {
		return visualBaselineTestKeyFromFilename(result.TestName)
	}
	return "unknown_test"
}

func visualBaselineTestKeyFromCase(tc *models.TestCase, resultTestName string) string {
	name := strings.TrimSpace(tc.TestName)
	if name == "" {
		return visualBaselineTestKeyFromFilename(resultTestName)
	}
	ext := filepath.Ext(resultTestName)
	if ext == "" {
		ext = filepath.Ext(tc.OriginalFilename)
	}
	return name + ext
}

func visualBaselineTestKeyFromFilename(testName string) string {
	base := filepath.Base(strings.TrimSpace(testName))
	if base == "" || base == "." {
		return "unknown_test"
	}
	ext := filepath.Ext(base)
	stem := strings.TrimSuffix(base, ext)
	if len(stem) > 16 {
		suffix := stem[len(stem)-15:]
		if isRunTimestampSuffix(suffix) {
			stem = stem[:len(stem)-16]
		}
	}
	if stem == "" {
		return base
	}
	return stem + ext
}

func isRunTimestampSuffix(s string) bool {
	if len(s) != 15 || s[8] != '_' {
		return false
	}
	for i, c := range s {
		if i == 8 {
			continue
		}
		if c < '0' || c > '9' {
			return false
		}
	}
	return true
}

func isAllowedVisualImagePath(imagePath string) bool {
	if imagePath == "" || strings.Contains(imagePath, "\x00") {
		return false
	}

	cleaned := filepath.Clean(imagePath)
	switch {
	case strings.HasPrefix(cleaned, "/tmp/vr/"):
		return true
	case strings.HasPrefix(cleaned, "/app/baselines/"):
		return true
	case cleaned == "baselines":
		return false
	case strings.HasPrefix(cleaned, "baselines/") && !strings.Contains(cleaned, ".."):
		return true
	default:
		return false
	}
}

func resolveVisualImagePath(imagePath string) string {
	cleaned := filepath.Clean(strings.TrimSpace(imagePath))
	if strings.HasPrefix(cleaned, "/") {
		return cleaned
	}
	if strings.HasPrefix(cleaned, "baselines/") {
		return filepath.Join("/app/baselines", strings.TrimPrefix(cleaned, "baselines/"))
	}
	return cleaned
}
