package handlers

import (
	"backend/internal/middleware"
	"backend/internal/models"
	"backend/internal/repository"
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/gorilla/mux"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
)

// DiagnosisHandler handles AI failure diagnosis endpoints
type DiagnosisHandler struct {
	testResultRepo *repository.TestResultRepository
	testRunRepo    *repository.TestRunRepository
	testCaseRepo   *repository.TestCaseRepository
	logRepo        *repository.LogRepository
	screenshotRepo *repository.ScreenshotRepository
	diagnosisRepo  *repository.DiagnosisRepository
}

func NewDiagnosisHandler(
	testResultRepo *repository.TestResultRepository,
	testRunRepo *repository.TestRunRepository,
	testCaseRepo *repository.TestCaseRepository,
	logRepo *repository.LogRepository,
	screenshotRepo *repository.ScreenshotRepository,
	diagnosisRepo *repository.DiagnosisRepository,
) *DiagnosisHandler {
	return &DiagnosisHandler{
		testResultRepo: testResultRepo,
		testRunRepo:    testRunRepo,
		testCaseRepo:   testCaseRepo,
		logRepo:        logRepo,
		screenshotRepo: screenshotRepo,
		diagnosisRepo:  diagnosisRepo,
	}
}

// Credential-matching patterns compiled once
var sanitizePatterns = []*regexp.Regexp{
	regexp.MustCompile(`(?i)password\s*=\s*\S+`),
	regexp.MustCompile(`(?i)Authorization:\s*Bearer\s+\S+`),
	regexp.MustCompile(`(?i)(api[_\-]?key|apikey|secret|token)\s*[=:]\s*\S+`),
}

// SanitizeLogs redacts credentials from text before it leaves the backend.
func SanitizeLogs(text string) string {
	result := text
	result = sanitizePatterns[0].ReplaceAllString(result, "password=[REDACTED]")
	result = sanitizePatterns[1].ReplaceAllString(result, "Authorization: Bearer [REDACTED]")
	result = sanitizePatterns[2].ReplaceAllStringFunc(result, func(match string) string {
		eqIdx := strings.IndexAny(match, "=:")
		if eqIdx > 0 {
			return match[:eqIdx+1] + "[REDACTED]"
		}
		return "[REDACTED]"
	})
	return result
}

// extractTargetURL scans log messages for the first http(s) URL.
func extractTargetURL(logMessages string) string {
	re := regexp.MustCompile(`https?://[^\s"'\]>]+`)
	match := re.FindString(logMessages)
	if match != "" {
		return match
	}
	return "unknown"
}

const (
	ErrCatLocator   = "LOCATOR_NOT_FOUND"
	ErrCatTimeout   = "TIMEOUT"
	ErrCatStale     = "STALE_ELEMENT"
	ErrCatAssertion = "ASSERTION_FAILURE"
	ErrCatFrame     = "FRAME_ERROR"
	ErrCatUnknown   = "UNKNOWN"
)

func ClassifyError(errorMessage, errorStack string) string {
	if errorMessage == "" && errorStack == "" {
		return ErrCatUnknown
	}

	combined := strings.ToLower(errorMessage + " " + errorStack)

	switch {
	case strings.Contains(combined, "assertionerror") ||
		(strings.Contains(combined, "expected") && strings.Contains(combined, "got")) ||
		(strings.Contains(combined, "expected") && strings.Contains(combined, "but was")) ||
		(strings.Contains(combined, "assert") && strings.Contains(combined, "failed")):
		return ErrCatAssertion

	case strings.Contains(combined, "staleelement") ||
		strings.Contains(combined, "stale element") ||
		strings.Contains(combined, "element is stale"):
		return ErrCatStale

	case strings.Contains(combined, "framelocator") ||
		strings.Contains(combined, "frame locator") ||
		strings.Contains(combined, "frame was detached") ||
		strings.Contains(combined, "frame has been detached") ||
		strings.Contains(combined, "iframe"):
		return ErrCatFrame

	case strings.Contains(combined, "nosuchelement") ||
		strings.Contains(combined, "no such element") ||
		strings.Contains(combined, "unable to locate") ||
		strings.Contains(combined, "element not found") ||
		strings.Contains(combined, "cannot find element") ||
		(strings.Contains(combined, "locator(") &&
			(strings.Contains(combined, "locator.click") ||
				strings.Contains(combined, "locator.fill") ||
				strings.Contains(combined, "locator.check") ||
				strings.Contains(combined, "locator.press"))):
		return ErrCatLocator

	case strings.Contains(combined, "timeout") ||
		strings.Contains(combined, "timed out") ||
		strings.Contains(combined, "time out") ||
		strings.Contains(combined, "waiting for") ||
		strings.Contains(combined, "playwrighttimeout"):
		return ErrCatTimeout

	default:
		return ErrCatUnknown
	}
}

func GetLastSuccessfulStep(screenshots []models.Screenshot) (string, int) {
	total := len(screenshots)

	if total == 0 {
		return "", 0
	}

	ordered := append([]models.Screenshot(nil), screenshots...)
	sort.Slice(ordered, func(i, j int) bool {
		return ordered[i].CreatedAt.Before(ordered[j].CreatedAt)
	})

	lastShot := ordered[total-1]
	stepName := strings.TrimSpace(lastShot.Step)

	if stepName == "" {
		if total == 1 {
			return "initial page load", total
		}
		return fmt.Sprintf("step %d", total), total
	}

	stepName = strings.ReplaceAll(stepName, "_", " ")
	stepName = strings.TrimPrefix(stepName, "step ")
	stepName = strings.TrimSpace(stepName)

	return stepName, total
}

type FailingLineResult struct {
	LineNumber int
	Snippet    string
	RawLine    string
}

func ExtractFailingLine(errorStack, scriptContentBase64, language string) FailingLineResult {
	result := FailingLineResult{}

	if strings.TrimSpace(errorStack) == "" {
		return result
	}

	var lineNum int

	switch strings.ToLower(language) {
	case "python":
		// Prioritize matches from testscripts to avoid capturing runner/library traceback lines
		re := regexp.MustCompile(`(?i)File\s+"[^"]*testscripts[^"]*",\s+line\s+(\d+)`)
		matches := re.FindAllStringSubmatch(errorStack, -1)
		if len(matches) == 0 {
			// Fallback to any line number if no testscripts match is found
			re = regexp.MustCompile(`(?i)line\s+(\d+)`)
			matches = re.FindAllStringSubmatch(errorStack, -1)
		}
		if len(matches) > 0 {
			last := matches[len(matches)-1]
			if len(last) > 1 {
				lineNum, _ = strconv.Atoi(last[1])
			}
		}

	case "java":
		re := regexp.MustCompile(`([A-Za-z0-9_$]+\.java):(\d+)\)`)
		matches := re.FindAllStringSubmatch(errorStack, -1)
		for _, match := range matches {
			if len(match) <= 2 {
				continue
			}
			fileName := strings.ToLower(match[1])
			if strings.Contains(fileName, "basetest.java") ||
				strings.Contains(fileName, "playwrightbasetest.java") {
				continue
			}
			lineNum, _ = strconv.Atoi(match[2])
			break
		}
		if lineNum == 0 && len(matches) > 0 {
			last := matches[len(matches)-1]
			if len(last) > 2 {
				lineNum, _ = strconv.Atoi(last[2])
			}
		}

	default:
		re := regexp.MustCompile(`(?i)line\s+(\d+)`)
		matches := re.FindAllStringSubmatch(errorStack, -1)
		if len(matches) > 0 {
			last := matches[len(matches)-1]
			if len(last) > 1 {
				lineNum, _ = strconv.Atoi(last[1])
			}
		}
	}

	if lineNum == 0 {
		return result
	}

	result.LineNumber = lineNum

	if strings.TrimSpace(scriptContentBase64) == "" {
		return result
	}

	decoded, err := base64.StdEncoding.DecodeString(scriptContentBase64)
	if err != nil {
		decoded, err = base64.RawStdEncoding.DecodeString(scriptContentBase64)
		if err != nil {
			return result
		}
	}

	lines := strings.Split(string(decoded), "\n")

	if lineNum < 1 || lineNum > len(lines) {
		result.Snippet = fmt.Sprintf("(line %d - code may have changed since this run)", lineNum)
		return result
	}

	startIdx := lineNum - 4
	endIdx := lineNum + 3

	if startIdx < 0 {
		startIdx = 0
	}
	if endIdx > len(lines) {
		endIdx = len(lines)
	}

	var snippet strings.Builder
	for i := startIdx; i < endIdx; i++ {
		displayNum := i + 1
		lineContent := lines[i]

		if len(lineContent) > 120 {
			lineContent = lineContent[:117] + "..."
		}

		if displayNum == lineNum {
			snippet.WriteString(fmt.Sprintf(">>> %d: %s\n", displayNum, lineContent))
			result.RawLine = strings.TrimSpace(lineContent)
		} else {
			snippet.WriteString(fmt.Sprintf("    %d: %s\n", displayNum, lineContent))
		}
	}

	result.Snippet = snippet.String()
	return result
}

func ExtractFailingLocator(errorMessage, errorStack string) string {
	combined := errorMessage + " " + errorStack

	if strings.TrimSpace(combined) == " " {
		return ""
	}

	type pattern struct {
		re    string
		group int
	}

	patterns := []pattern{
		{`(?i)page\.locator\(['"]([^'"]{2,})['"]\)`, 1},
		{`(?i)locator\(['"]([^'"]{2,})['"]\)`, 1},
		{`(?i)wait_for_selector\(['"]([^'"]{2,})['"]`, 1},
		{`(?i)waiting for selector\s+['"]([^'"]{2,})['"]`, 1},
		{`(?i)waiting for locator\(['"]([^'"]{2,})['"]\)`, 1},
		{`(?i)By\.[A-Z_]+,\s*['"]([^'"]{2,})['"]`, 1},
		{`"selector"\s*:\s*"(.+?)"(?:,|})`, 1},
		{`"value"\s*:\s*"(.+?)"(?:,|})`, 1},
		{`(?i)xpath=([^\s'")\]]{3,})`, 1},
		{`(?i)css=([^\s'")\]]{2,})`, 1},
		{`(?i)cssSelector\(['"]([^'"]{2,})['"]\)`, 1},
		{`(?i)By\.id\(['"]([^'"]{2,})['"]\)`, 1},
		{`(?i)By\.xpath\(['"]([^'"]{2,})['"]\)`, 1},
	}

	for _, p := range patterns {
		re, err := regexp.Compile(p.re)
		if err != nil {
			continue
		}
		match := re.FindStringSubmatch(combined)
		if len(match) > p.group {
			locator := strings.TrimSpace(match[p.group])
			locator = strings.TrimRight(locator, "\"")
			if len(locator) < 2 {
				continue
			}
			if locator == "true" || locator == "false" || locator == "null" {
				continue
			}
			return locator
		}
	}

	return ""
}

// CollectDiagnosisPayload gathers all context needed for an AI diagnosis.
func CollectDiagnosisPayload(
	ctx context.Context,
	resultID primitive.ObjectID,
	testResultRepo *repository.TestResultRepository,
	testRunRepo *repository.TestRunRepository,
	testCaseRepo *repository.TestCaseRepository,
	logRepo *repository.LogRepository,
	screenshotRepo *repository.ScreenshotRepository,
) (models.DiagnosisPayload, error) {
	var payload models.DiagnosisPayload

	// 1. Get test result
	result, err := testResultRepo.GetByID(ctx, resultID)
	if err != nil {
		return payload, fmt.Errorf("test result not found: %w", err)
	}

	// 2. Get test run (for framework)
	framework := "selenium"
	run, err := testRunRepo.GetByID(ctx, result.RunID)
	if err == nil && run.Framework != "" {
		framework = run.Framework
	}

	// 3. Get test case (for language)
	language := "python"
	if !result.TestCaseID.IsZero() {
		tc, err := testCaseRepo.GetByID(ctx, result.TestCaseID)
		if err == nil && tc.Language != "" {
			language = tc.Language
		}
	}

	// 4. Get logs — concatenate messages, take last 100 lines, sanitize
	var allLogText string
	logs, err := logRepo.GetByResultID(ctx, resultID)
	if err == nil && len(logs) > 0 {
		var lines []string
		for _, l := range logs {
			lines = append(lines, l.Message)
		}
		// Keep only last 100 lines
		if len(lines) > 100 {
			lines = lines[len(lines)-100:]
		}
		allLogText = strings.Join(lines, "\n")
	}

	// If result-level logs are empty, fall back to run-level logs filtered by test name
	if allLogText == "" && !result.RunID.IsZero() {
		runLogs, err := logRepo.GetByRunID(ctx, result.RunID)
		if err == nil && len(runLogs) > 0 {
			var lines []string
			for _, l := range runLogs {
				// Filter by test name if available
				if result.TestName != "" && l.TestName != "" && l.TestName != result.TestName {
					continue
				}
				lines = append(lines, l.Message)
			}
			if len(lines) > 100 {
				lines = lines[len(lines)-100:]
			}
			allLogText = strings.Join(lines, "\n")
		}
	}

	sanitizedLogs := SanitizeLogs(allLogText)

	// 5. Get latest screenshot — sort by created_at desc, take first
	var screenshotB64 string
	screenshots, err := screenshotRepo.GetByResultID(ctx, resultID)
	if err == nil && len(screenshots) > 0 {
		// Sort by created_at descending
		sort.Slice(screenshots, func(i, j int) bool {
			return screenshots[i].CreatedAt.After(screenshots[j].CreatedAt)
		})
		latest := screenshots[0]
		if len(latest.FileData) > 0 {
			screenshotB64 = base64.StdEncoding.EncodeToString(latest.FileData)
		} else if latest.ImageData != "" {
			screenshotB64 = latest.ImageData
		}
	}

	// 6. Extract target URL from logs
	targetURL := extractTargetURL(allLogText)

	// 7. Combine error trace
	errorTrace := result.ErrorMessage
	if result.ErrorStack != "" {
		errorTrace += "\n" + result.ErrorStack
	}
	errorTrace = SanitizeLogs(errorTrace)

	// 8. Extract enhanced diagnosis context
	errorCategory := ClassifyError(result.ErrorMessage, result.ErrorStack)

	// GetLastSuccessfulStep requires ascending sort
	if err == nil && len(screenshots) > 0 {
		sort.Slice(screenshots, func(i, j int) bool {
			return screenshots[i].CreatedAt.Before(screenshots[j].CreatedAt)
		})
	}
	lastStep, totalSteps := GetLastSuccessfulStep(screenshots)

	lineResult := FailingLineResult{}
	if !result.TestCaseID.IsZero() {
		// Re-fetch tc here if not already available in scope
		tc, tcErr := testCaseRepo.GetByID(ctx, result.TestCaseID)
		if tcErr == nil {
			scriptContent := tc.ScriptContent
			if scriptContent == "" && tc.OriginalFilename != "" {
				filePath := filepath.Join("/app/testscripts", tc.OriginalFilename)
				b, err := os.ReadFile(filePath)
				if err == nil {
					scriptContent = base64.StdEncoding.EncodeToString(b)
				}
			}
			lineResult = ExtractFailingLine(result.ErrorStack, scriptContent, tc.Language)
		} else {
			lineResult = ExtractFailingLine(result.ErrorStack, "", language)
		}
	} else {
		inferredLang := "python"
		if strings.HasSuffix(result.TestName, ".java") {
			inferredLang = "java"
		}
		scriptContent := ""
		filePath := filepath.Join("/app/testscripts", result.TestName)
		b, err := os.ReadFile(filePath)
		if err == nil {
			scriptContent = base64.StdEncoding.EncodeToString(b)
		}
		lineResult = ExtractFailingLine(result.ErrorStack, scriptContent, inferredLang)
	}

	failingLocator := ExtractFailingLocator(result.ErrorMessage, result.ErrorStack)
	if failingLocator == "" && lineResult.RawLine != "" {
		failingLocator = ExtractFailingLocator(lineResult.RawLine, "")
	}

	payload = models.DiagnosisPayload{
		ExecutionID:        resultID.Hex(),
		TestName:           result.TestName,
		Framework:          framework,
		Language:           language,
		Browser:            result.Browser,
		TargetURL:          targetURL,
		ErrorTrace:         errorTrace,
		LastLogs:           sanitizedLogs,
		ScreenshotBase64:   screenshotB64,
		ErrorCategory:      errorCategory,
		LastSuccessfulStep: lastStep,
		TotalStepsCaptured: totalSteps,
		FailingLineNumber:  lineResult.LineNumber,
		FailingCodeSnippet: lineResult.Snippet,
		FailingLocator:     failingLocator,
	}

	return payload, nil
}

// DiagnoseResult triggers AI analysis of a failed test result.
// POST /api/results/{result_id}/diagnose
func (h *DiagnosisHandler) DiagnoseResult(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok || claims.Email == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	vars := mux.Vars(r)
	resultIDStr := vars["result_id"]
	resultID, err := primitive.ObjectIDFromHex(resultIDStr)
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid_result_id", "Invalid result ID format")
		return
	}

	// Get result
	result, err := h.testResultRepo.GetByID(r.Context(), resultID)
	if err != nil {
		writeJSONError(w, http.StatusNotFound, "result_not_found", "Test result not found")
		return
	}

	// Verify ownership: result → run → TriggeredBy == claims.Email
	run, err := h.testRunRepo.GetByID(r.Context(), result.RunID)
	if err != nil {
		writeJSONError(w, http.StatusNotFound, "run_not_found", "Associated test run not found")
		return
	}
	if run.TriggeredBy != claims.Email {
		writeJSONError(w, http.StatusForbidden, "unauthorized", "You do not own this test result")
		return
	}

	// Only diagnose FAILED results
	if !strings.EqualFold(result.Status, "FAILED") {
		writeJSONError(w, http.StatusBadRequest, "not_failed", "Only failed test results can be diagnosed")
		return
	}

	// Collect diagnosis payload
	payload, err := CollectDiagnosisPayload(
		r.Context(), resultID,
		h.testResultRepo, h.testRunRepo, h.testCaseRepo,
		h.logRepo, h.screenshotRepo,
	)
	if err != nil {
		log.Printf("Failed to collect diagnosis payload: %v", err)
		writeJSONError(w, http.StatusInternalServerError, "payload_error", "Failed to collect diagnosis context")
		return
	}

	// POST to diagnosis microservice
	diagnosisURL := os.Getenv("DIAGNOSIS_SERVICE_URL")
	if diagnosisURL == "" {
		diagnosisURL = "http://testops-diagnosis-service:8001"
	}

	payloadJSON, err := json.Marshal(payload)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "marshal_error", "Failed to serialize payload")
		return
	}

	// 30-second timeout for the LLM call
	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Post(diagnosisURL+"/diagnose", "application/json", bytes.NewReader(payloadJSON))
	if err != nil {
		log.Printf("Diagnosis service call failed: %v", err)
		writeJSONError(w, http.StatusServiceUnavailable, "diagnosis_unavailable",
			"AI diagnosis service is temporarily unavailable. Please try again later.")
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		log.Printf("Diagnosis service returned status %d", resp.StatusCode)
		writeJSONError(w, http.StatusServiceUnavailable, "diagnosis_error",
			"AI diagnosis service returned an error. Please try again later.")
		return
	}

	// Parse response from microservice
	var diagResp struct {
		RootCause  string `json:"root_cause"`
		LikelyFix  string `json:"likely_fix"`
		Confidence string `json:"confidence"`
		ModelUsed  string `json:"model_used"`
		RawOutput  string `json:"raw_output"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&diagResp); err != nil {
		log.Printf("Failed to parse diagnosis response: %v", err)
		writeJSONError(w, http.StatusServiceUnavailable, "parse_error",
			"Failed to parse AI diagnosis response")
		return
	}

	// Store in MongoDB
	diagnosis := models.Diagnosis{
		ExecutionID:        resultID.Hex(),
		RootCause:          diagResp.RootCause,
		LikelyFix:          diagResp.LikelyFix,
		Confidence:         diagResp.Confidence,
		ModelUsed:          diagResp.ModelUsed,
		RawResponse:        diagResp.RawOutput,
		GeneratedAt:        time.Now(),
		ErrorCategory:      payload.ErrorCategory,
		FailingLineNumber:  payload.FailingLineNumber,
		FailingCodeSnippet: payload.FailingCodeSnippet,
		FailingLocator:     payload.FailingLocator,
		LastSuccessfulStep: payload.LastSuccessfulStep,
		TotalStepsCaptured: payload.TotalStepsCaptured,
	}

	if err := h.diagnosisRepo.InsertDiagnosis(r.Context(), &diagnosis); err != nil {
		log.Printf("Failed to store diagnosis: %v", err)
		// Still return the diagnosis even if storage fails
	} else {
		// Update test result to mark it as having a diagnosis
		updateData := bson.M{"has_diagnosis": true}
		if updateErr := h.testResultRepo.Update(r.Context(), resultID, updateData); updateErr != nil {
			log.Printf("Failed to update test result with diagnosis flag: %v", updateErr)
		}
	}

	// Return to frontend
	response := models.DiagnosisResponse{
		ExecutionID:        diagnosis.ExecutionID,
		RootCause:          diagnosis.RootCause,
		LikelyFix:          diagnosis.LikelyFix,
		Confidence:         diagnosis.Confidence,
		ModelUsed:          diagnosis.ModelUsed,
		GeneratedAt:        diagnosis.GeneratedAt,
		ErrorCategory:      diagnosis.ErrorCategory,
		FailingLineNumber:  diagnosis.FailingLineNumber,
		FailingCodeSnippet: diagnosis.FailingCodeSnippet,
		FailingLocator:     diagnosis.FailingLocator,
		LastSuccessfulStep: diagnosis.LastSuccessfulStep,
		TotalStepsCaptured: diagnosis.TotalStepsCaptured,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// GetDiagnosis retrieves the latest cached diagnosis for a test result.
// GET /api/results/{result_id}/diagnosis
func (h *DiagnosisHandler) GetDiagnosis(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok || claims.Email == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	vars := mux.Vars(r)
	resultIDStr := vars["result_id"]
	resultID, err := primitive.ObjectIDFromHex(resultIDStr)
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid_result_id", "Invalid result ID format")
		return
	}

	// Verify ownership
	result, err := h.testResultRepo.GetByID(r.Context(), resultID)
	if err != nil {
		writeJSONError(w, http.StatusNotFound, "result_not_found", "Test result not found")
		return
	}

	run, err := h.testRunRepo.GetByID(r.Context(), result.RunID)
	if err != nil {
		writeJSONError(w, http.StatusNotFound, "run_not_found", "Associated test run not found")
		return
	}
	if run.TriggeredBy != claims.Email {
		writeJSONError(w, http.StatusForbidden, "unauthorized", "You do not own this test result")
		return
	}

	// Get latest diagnosis
	diagnosis, err := h.diagnosisRepo.GetLatestByExecutionID(r.Context(), resultID.Hex())
	if err != nil {
		if err == mongo.ErrNoDocuments {
			writeJSONError(w, http.StatusNotFound, "no_diagnosis", "No diagnosis found for this result")
			return
		}
		writeJSONError(w, http.StatusInternalServerError, "fetch_error", "Failed to fetch diagnosis")
		return
	}

	response := models.DiagnosisResponse{
		ExecutionID:        diagnosis.ExecutionID,
		RootCause:          diagnosis.RootCause,
		LikelyFix:          diagnosis.LikelyFix,
		Confidence:         diagnosis.Confidence,
		ModelUsed:          diagnosis.ModelUsed,
		GeneratedAt:        diagnosis.GeneratedAt,
		ErrorCategory:      diagnosis.ErrorCategory,
		FailingLineNumber:  diagnosis.FailingLineNumber,
		FailingCodeSnippet: diagnosis.FailingCodeSnippet,
		FailingLocator:     diagnosis.FailingLocator,
		LastSuccessfulStep: diagnosis.LastSuccessfulStep,
		TotalStepsCaptured: diagnosis.TotalStepsCaptured,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// writeJSONError writes a structured JSON error response (never crashes the server).
func writeJSONError(w http.ResponseWriter, status int, errCode string, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]string{
		"error":   errCode,
		"message": message,
	})
}
