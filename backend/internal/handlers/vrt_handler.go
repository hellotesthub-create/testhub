package handlers

import (
	"net/http"
	"time"

	"backend/internal/middleware"
	"backend/internal/models"
	"backend/internal/repository"

	"github.com/gorilla/mux"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
)

// VRTHandler exposes the background visual-regression job: trigger/re-run, live
// progress, and the per-run comparison list for the dashboard.
type VRTHandler struct {
	runRepo        *repository.TestRunRepository
	jobRepo        *repository.VRTJobRepository
	comparisonRepo *repository.VisualComparisonRepository
}

func NewVRTHandler(
	runRepo *repository.TestRunRepository,
	jobRepo *repository.VRTJobRepository,
	comparisonRepo *repository.VisualComparisonRepository,
) *VRTHandler {
	return &VRTHandler{runRepo: runRepo, jobRepo: jobRepo, comparisonRepo: comparisonRepo}
}

// resolveOwnedRun loads the run by ObjectID hex (or human run_id) and verifies the
// caller owns it. Writes the error response itself and returns nil on failure.
func (h *VRTHandler) resolveOwnedRun(w http.ResponseWriter, r *http.Request) *models.TestRun {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return nil
	}
	idStr := mux.Vars(r)["run_id"]
	var run *models.TestRun
	var err error
	if oid, oidErr := primitive.ObjectIDFromHex(idStr); oidErr == nil {
		run, err = h.runRepo.GetByID(r.Context(), oid)
	} else {
		run, err = h.runRepo.GetByRunID(r.Context(), idStr)
	}
	if err != nil || run == nil {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "run_not_found"})
		return nil
	}
	if run.TriggeredBy != claims.Email {
		respondJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden"})
		return nil
	}
	return run
}

// TriggerRun (re)starts a visual-regression job for a run. POST /runs/{run_id}/visual-regression
// Clears any previous comparisons so the dashboard reflects a clean pass.
func (h *VRTHandler) TriggerRun(w http.ResponseWriter, r *http.Request) {
	run := h.resolveOwnedRun(w, r)
	if run == nil {
		return
	}

	// Clear prior comparisons for this run and enable VRT on it.
	_ = h.comparisonRepo.DeleteByRunRef(r.Context(), run.ID)
	_ = h.runRepo.Update(r.Context(), run.ID, map[string]interface{}{
		"visual_regression_enabled": true,
		"vrt_status":                models.VRTStatusQueued,
		"updated_at":                time.Now(),
	})

	job := &models.VRTJob{
		RunID:       run.ID,
		RunIDString: run.RunID,
		SuiteID:     run.SuiteID,
		TriggeredBy: run.TriggeredBy,
		Status:      models.VRTStatusQueued,
	}
	if err := h.jobRepo.Create(r.Context(), job); err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed_to_queue"})
		return
	}
	respondJSON(w, http.StatusAccepted, job)
}

// DeleteHistory clears all VRT jobs + comparisons for a run (keeps baselines).
// DELETE /runs/{run_id}/visual-regression
func (h *VRTHandler) DeleteHistory(w http.ResponseWriter, r *http.Request) {
	run := h.resolveOwnedRun(w, r)
	if run == nil {
		return
	}
	_ = h.comparisonRepo.DeleteByRunRef(r.Context(), run.ID)
	_ = h.jobRepo.DeleteByRunID(r.Context(), run.ID)
	_ = h.runRepo.SetVRTStatus(r.Context(), run.ID, "")
	respondJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

// GetStatus returns the latest job + progress for polling. GET /runs/{run_id}/visual-regression
func (h *VRTHandler) GetStatus(w http.ResponseWriter, r *http.Request) {
	run := h.resolveOwnedRun(w, r)
	if run == nil {
		return
	}
	job, err := h.jobRepo.GetLatestByRunID(r.Context(), run.ID)
	if err == mongo.ErrNoDocuments {
		// No job yet: report enabled/disabled so the UI can show the right state.
		respondJSON(w, http.StatusOK, map[string]interface{}{
			"status":                    "none",
			"visual_regression_enabled": run.VisualRegressionEnabled,
		})
		return
	}
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "lookup_failed"})
		return
	}
	respondJSON(w, http.StatusOK, job)
}

// GetComparisons returns the comparison list for the run's latest job (dashboard).
// GET /runs/{run_id}/visual-regression/comparisons
func (h *VRTHandler) GetComparisons(w http.ResponseWriter, r *http.Request) {
	run := h.resolveOwnedRun(w, r)
	if run == nil {
		return
	}
	job, err := h.jobRepo.GetLatestByRunID(r.Context(), run.ID)
	if err != nil {
		respondJSON(w, http.StatusOK, []models.VisualComparison{})
		return
	}
	items, err := h.comparisonRepo.GetByJobID(r.Context(), job.ID)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "lookup_failed"})
		return
	}
	for i := range items {
		items[i].RunID = run.RunID
	}
	respondJSON(w, http.StatusOK, items)
}
