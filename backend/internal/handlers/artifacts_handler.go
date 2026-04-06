package handlers

import (
	"backend/internal/models"
	"backend/internal/repository"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"mime"
	"net/http"
	"path/filepath"
	"strings"
	"time"

	"github.com/gorilla/mux"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

type ArtifactsHandler struct {
	screenshotRepo *repository.ScreenshotRepository
	logRepo        *repository.LogRepository
	videoRepo      *repository.VideoRepository
}

func NewArtifactsHandler(
	screenshotRepo *repository.ScreenshotRepository,
	logRepo *repository.LogRepository,
	videoRepo *repository.VideoRepository,
) *ArtifactsHandler {
	return &ArtifactsHandler{
		screenshotRepo: screenshotRepo,
		logRepo:        logRepo,
		videoRepo:      videoRepo,
	}
}

func detectVideoContentType(filename string, fallback string) string {
	if ext := strings.ToLower(filepath.Ext(filename)); ext != "" {
		if guessed := mime.TypeByExtension(ext); guessed != "" {
			return guessed
		}
	}
	if strings.TrimSpace(fallback) != "" {
		return fallback
	}
	return "video/mp4"
}

func shouldForceDownload(r *http.Request) bool {
	value := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("download")))
	return value == "1" || value == "true" || value == "yes"
}

// ====================================================================
// RUN ARTIFACTS ENDPOINTS - Get artifacts by run_id
// ====================================================================

// GetRunScreenshots retrieves all screenshots for a run
func (h *ArtifactsHandler) GetRunScreenshots(w http.ResponseWriter, r *http.Request) {
	runIDStr := mux.Vars(r)["run_id"]
	if runIDStr == "" {
		http.Error(w, "Run ID is required", http.StatusBadRequest)
		return
	}

	// Try to get by run_id string first (human-readable ID like "20240101_120000")
	screenshots, err := h.screenshotRepo.GetByRunIDString(r.Context(), runIDStr)
	if err != nil || len(screenshots) == 0 {
		// Try as ObjectID
		runID, oidErr := primitive.ObjectIDFromHex(runIDStr)
		if oidErr == nil {
			screenshots, err = h.screenshotRepo.GetByRunID(r.Context(), runID)
		}
	}

	if err != nil {
		http.Error(w, "Failed to fetch screenshots", http.StatusInternalServerError)
		return
	}

	// Convert to response format
	var response []models.ScreenshotResponse
	for _, s := range screenshots {
		response = append(response, models.ScreenshotResponse{
			ID:        s.ID.Hex(),
			Name:      s.Name,
			Timestamp: s.CreatedAt.Format("3:04:05 PM"),
			URL:       fmt.Sprintf("/api/screenshots/%s", s.ID.Hex()),
			Step:      s.Step,
			TestName:  s.TestName,
		})
	}

	if response == nil {
		response = []models.ScreenshotResponse{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// GetRunLogs retrieves all logs for a run
func (h *ArtifactsHandler) GetRunLogs(w http.ResponseWriter, r *http.Request) {
	runIDStr := mux.Vars(r)["run_id"]
	if runIDStr == "" {
		http.Error(w, "Run ID is required", http.StatusBadRequest)
		return
	}

	// Try to get by run_id string first
	logs, err := h.logRepo.GetByRunIDString(r.Context(), runIDStr)
	if err != nil || len(logs) == 0 {
		// Try as ObjectID
		runID, oidErr := primitive.ObjectIDFromHex(runIDStr)
		if oidErr == nil {
			logs, err = h.logRepo.GetByRunID(r.Context(), runID)
		}
	}

	if err != nil {
		http.Error(w, "Failed to fetch logs", http.StatusInternalServerError)
		return
	}

	// Convert to response format
	var response []models.LogResponse
	for _, l := range logs {
		response = append(response, models.LogResponse{
			Timestamp: l.CreatedAt.Format("15:04:05"),
			Level:     l.Level,
			Message:   l.Message,
			TestName:  l.TestName,
		})
	}

	if response == nil {
		response = []models.LogResponse{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// GetRunVideos retrieves all videos for a run
func (h *ArtifactsHandler) GetRunVideos(w http.ResponseWriter, r *http.Request) {
	runIDStr := mux.Vars(r)["run_id"]
	if runIDStr == "" {
		http.Error(w, "Run ID is required", http.StatusBadRequest)
		return
	}

	// Try to get by run_id string first
	videos, err := h.videoRepo.GetByRunIDString(r.Context(), runIDStr)
	if err != nil || len(videos) == 0 {
		// Try as ObjectID
		runID, oidErr := primitive.ObjectIDFromHex(runIDStr)
		if oidErr == nil {
			videos, err = h.videoRepo.GetByRunID(r.Context(), runID)
		}
	}

	if err != nil {
		http.Error(w, "Failed to fetch videos", http.StatusInternalServerError)
		return
	}

	// Convert to response format
	var response []models.VideoResponse
	for _, v := range videos {
		duration := fmt.Sprintf("%.0fs", v.DurationSeconds)
		size := fmt.Sprintf("%.2f MB", float64(v.SizeBytes)/(1024*1024))
		response = append(response, models.VideoResponse{
			ID:              v.ID.Hex(),
			Name:            v.Name,
			TestName:        v.TestName,
			Browser:         v.Browser,
			Duration:        duration,
			DurationSeconds: v.DurationSeconds,
			Size:            size,
			SizeBytes:       v.SizeBytes,
			URL:             fmt.Sprintf("/api/videos/%s", v.ID.Hex()),
		})
	}

	if response == nil {
		response = []models.VideoResponse{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// ====================================================================
// CREATE ENDPOINTS - For runner to submit artifacts
// ====================================================================

// CreateScreenshot creates a new screenshot entry
func (h *ArtifactsHandler) CreateScreenshot(w http.ResponseWriter, r *http.Request) {
	var req struct {
		RunID       string `json:"run_id"`        // human-readable run ID
		RunObjectID string `json:"run_object_id"` // MongoDB ObjectID as string
		ResultID    string `json:"result_id"`     // MongoDB ObjectID of TestResult
		TestName    string `json:"test_name"`
		Browser     string `json:"browser"`
		Name        string `json:"name"`
		Step        string `json:"step"`
		ImageData   string `json:"image_data"` // Base64 encoded
		ContentType string `json:"content_type"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.RunID == "" && req.RunObjectID == "" {
		http.Error(w, "run_id or run_object_id is required", http.StatusBadRequest)
		return
	}

	// Parse ObjectIDs
	var runOID primitive.ObjectID
	if req.RunObjectID != "" {
		var err error
		runOID, err = primitive.ObjectIDFromHex(req.RunObjectID)
		if err != nil {
			http.Error(w, "Invalid run_object_id", http.StatusBadRequest)
			return
		}
	}

	var resultOID primitive.ObjectID
	if req.ResultID != "" {
		var err error
		resultOID, err = primitive.ObjectIDFromHex(req.ResultID)
		if err != nil {
			http.Error(w, "Invalid result_id", http.StatusBadRequest)
			return
		}
	}

	if req.ContentType == "" {
		req.ContentType = "image/png"
	}

	screenshot := &models.Screenshot{
		ResultID:    resultOID,
		RunID:       runOID,
		RunIDString: req.RunID,
		TestName:    req.TestName,
		Browser:     req.Browser,
		Name:        req.Name,
		Step:        req.Step,
		ImageData:   req.ImageData,
		ContentType: req.ContentType,
		CreatedAt:   time.Now(),
	}

	if err := h.screenshotRepo.Create(r.Context(), screenshot); err != nil {
		http.Error(w, "Failed to create screenshot", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"message":       "Screenshot created successfully",
		"screenshot_id": screenshot.ID.Hex(),
	})
}

// CreateLog creates a new log entry
func (h *ArtifactsHandler) CreateLog(w http.ResponseWriter, r *http.Request) {
	var req struct {
		RunID       string `json:"run_id"`
		RunObjectID string `json:"run_object_id"`
		ResultID    string `json:"result_id"`
		TestName    string `json:"test_name"`
		Browser     string `json:"browser"`
		Level       string `json:"level"`
		Message     string `json:"message"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.RunID == "" && req.RunObjectID == "" {
		http.Error(w, "run_id or run_object_id is required", http.StatusBadRequest)
		return
	}

	// Parse ObjectIDs
	var runOID primitive.ObjectID
	if req.RunObjectID != "" {
		var err error
		runOID, err = primitive.ObjectIDFromHex(req.RunObjectID)
		if err != nil {
			http.Error(w, "Invalid run_object_id", http.StatusBadRequest)
			return
		}
	}

	var resultOID primitive.ObjectID
	if req.ResultID != "" {
		var err error
		resultOID, err = primitive.ObjectIDFromHex(req.ResultID)
		if err != nil {
			http.Error(w, "Invalid result_id", http.StatusBadRequest)
			return
		}
	}

	if req.Level == "" {
		req.Level = "INFO"
	}

	logEntry := &models.Log{
		ResultID:    resultOID,
		RunID:       runOID,
		RunIDString: req.RunID,
		TestName:    req.TestName,
		Browser:     req.Browser,
		Level:       req.Level,
		Message:     req.Message,
		CreatedAt:   time.Now(),
	}

	if err := h.logRepo.Create(r.Context(), logEntry); err != nil {
		http.Error(w, "Failed to create log", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"message": "Log created successfully",
		"log_id":  logEntry.ID.Hex(),
	})
}

// CreateVideo creates a new video entry
func (h *ArtifactsHandler) CreateVideo(w http.ResponseWriter, r *http.Request) {
	var req struct {
		RunID           string  `json:"run_id"`
		RunObjectID     string  `json:"run_object_id"`
		ResultID        string  `json:"result_id"`
		TestName        string  `json:"test_name"`
		Browser         string  `json:"browser"`
		Name            string  `json:"name"`
		ContentType     string  `json:"content_type"`
		DurationSeconds float64 `json:"duration_seconds"`
		SizeBytes       int64   `json:"size_bytes"`
		GridFSID        string  `json:"gridfs_id"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.RunID == "" && req.RunObjectID == "" {
		http.Error(w, "run_id or run_object_id is required", http.StatusBadRequest)
		return
	}

	// Parse ObjectIDs
	var runOID primitive.ObjectID
	if req.RunObjectID != "" {
		var err error
		runOID, err = primitive.ObjectIDFromHex(req.RunObjectID)
		if err != nil {
			http.Error(w, "Invalid run_object_id", http.StatusBadRequest)
			return
		}
	}

	var resultOID primitive.ObjectID
	if req.ResultID != "" {
		var err error
		resultOID, err = primitive.ObjectIDFromHex(req.ResultID)
		if err != nil {
			http.Error(w, "Invalid result_id", http.StatusBadRequest)
			return
		}
	}

	video := &models.Video{
		ResultID:        resultOID,
		RunID:           runOID,
		RunIDString:     req.RunID,
		TestName:        req.TestName,
		Browser:         req.Browser,
		Name:            req.Name,
		DurationSeconds: req.DurationSeconds,
		SizeBytes:       req.SizeBytes,
		GridFSID:        req.GridFSID,
		ContentType:     detectVideoContentType(req.Name, req.ContentType),
		CreatedAt:       time.Now(),
	}

	if err := h.videoRepo.Create(r.Context(), video); err != nil {
		http.Error(w, "Failed to create video", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"message":  "Video created successfully",
		"video_id": video.ID.Hex(),
	})
}

// ====================================================================
// BINARY DATA ENDPOINTS - Serve actual images and videos
// ====================================================================

// ServeScreenshotImage serves the actual screenshot image data
func (h *ArtifactsHandler) ServeScreenshotImage(w http.ResponseWriter, r *http.Request) {
	screenshotIDStr := mux.Vars(r)["id"]
	if screenshotIDStr == "" {
		http.Error(w, "Screenshot ID is required", http.StatusBadRequest)
		return
	}

	screenshotID, err := primitive.ObjectIDFromHex(screenshotIDStr)
	if err != nil {
		http.Error(w, "Invalid screenshot ID", http.StatusBadRequest)
		return
	}

	screenshot, err := h.screenshotRepo.GetByID(r.Context(), screenshotID)
	if err != nil {
		http.Error(w, "Screenshot not found", http.StatusNotFound)
		return
	}

	contentType := screenshot.ContentType
	if contentType == "" {
		contentType = "image/png"
	}

	// Try FileData (binary) first, then ImageData (base64 legacy)
	if len(screenshot.FileData) > 0 {
		w.Header().Set("Content-Type", contentType)
		if shouldForceDownload(r) {
			filename := screenshot.Name
			if strings.TrimSpace(filename) == "" {
				filename = "screenshot.png"
			}
			w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", filename))
		}
		w.Header().Set("Cache-Control", "public, max-age=3600")
		w.Write(screenshot.FileData)
		return
	}

	if screenshot.ImageData == "" {
		http.Error(w, "No image data available", http.StatusNotFound)
		return
	}

	imageData, err := base64.StdEncoding.DecodeString(screenshot.ImageData)
	if err != nil {
		http.Error(w, "Failed to decode image", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", contentType)
	if shouldForceDownload(r) {
		filename := screenshot.Name
		if strings.TrimSpace(filename) == "" {
			filename = "screenshot.png"
		}
		w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", filename))
	}
	w.Header().Set("Cache-Control", "public, max-age=3600")
	w.Write(imageData)
}

// ServeVideoStream serves the actual video data with Range support
func (h *ArtifactsHandler) ServeVideoStream(w http.ResponseWriter, r *http.Request) {
	videoIDStr := mux.Vars(r)["id"]
	if videoIDStr == "" {
		http.Error(w, "Video ID is required", http.StatusBadRequest)
		return
	}

	videoID, err := primitive.ObjectIDFromHex(videoIDStr)
	if err != nil {
		http.Error(w, "Invalid video ID", http.StatusBadRequest)
		return
	}

	video, err := h.videoRepo.GetByID(r.Context(), videoID)
	if err != nil {
		http.Error(w, "Video not found", http.StatusNotFound)
		return
	}

	// Try GridFS first, then binary data
	var videoData []byte
	if video.GridFSID != "" {
		videoData, err = h.videoRepo.GetVideoDataFromGridFS(r.Context(), video.GridFSID)
		if err != nil {
			http.Error(w, "Failed to load video from GridFS", http.StatusInternalServerError)
			return
		}
	} else if len(video.FileData) > 0 {
		videoData = video.FileData
	} else {
		http.Error(w, "No video data available", http.StatusNotFound)
		return
	}

	videoSize := int64(len(videoData))

	contentType := detectVideoContentType(video.Name, video.ContentType)
	w.Header().Set("Content-Type", contentType)
	if shouldForceDownload(r) {
		filename := video.Name
		if strings.TrimSpace(filename) == "" {
			if strings.Contains(contentType, "webm") {
				filename = "video.webm"
			} else {
				filename = "video.mp4"
			}
		}
		w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", filename))
	}
	w.Header().Set("Accept-Ranges", "bytes")
	w.Header().Set("Cache-Control", "public, max-age=3600")

	rangeHeader := r.Header.Get("Range")
	if rangeHeader != "" {
		var start, end int64
		if _, err := fmt.Sscanf(rangeHeader, "bytes=%d-%d", &start, &end); err != nil {
			if _, err := fmt.Sscanf(rangeHeader, "bytes=%d-", &start); err == nil {
				end = videoSize - 1
			} else {
				http.Error(w, "Invalid Range header", http.StatusRequestedRangeNotSatisfiable)
				return
			}
		}

		if start < 0 || start >= videoSize || end >= videoSize || start > end {
			http.Error(w, "Range not satisfiable", http.StatusRequestedRangeNotSatisfiable)
			return
		}

		contentLength := end - start + 1
		w.Header().Set("Content-Range", fmt.Sprintf("bytes %d-%d/%d", start, end, videoSize))
		w.Header().Set("Content-Length", fmt.Sprintf("%d", contentLength))
		w.WriteHeader(http.StatusPartialContent)
		w.Write(videoData[start : end+1])
	} else {
		w.Header().Set("Content-Length", fmt.Sprintf("%d", videoSize))
		w.WriteHeader(http.StatusOK)
		w.Write(videoData)
	}
}
