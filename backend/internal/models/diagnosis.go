package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// DiagnosisPayload is sent to the diagnosis microservice
type DiagnosisPayload struct {
	ExecutionID      string `json:"execution_id"`                // TestResult ObjectID as hex string
	TestName         string `json:"test_name"`
	Framework        string `json:"framework"`                   // selenium or playwright
	Language         string `json:"language"`                    // python or java
	Browser          string `json:"browser"`
	TargetURL        string `json:"url"`
	ErrorTrace       string `json:"error_trace"`                 // error_message + error_stack
	LastLogs         string `json:"last_logs"`
	ScreenshotBase64   string `json:"screenshot_base64,omitempty"`
	ErrorCategory      string `json:"error_category"`
	LastSuccessfulStep string `json:"last_successful_step,omitempty"`
	TotalStepsCaptured int    `json:"total_steps_captured"`
	FailingLineNumber  int    `json:"failing_line_number,omitempty"`
	FailingCodeSnippet string `json:"failing_code_snippet,omitempty"`
	FailingLocator     string `json:"failing_locator,omitempty"`
}

// Diagnosis is stored in MongoDB diagnoses collection
type Diagnosis struct {
	ID          primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	ExecutionID string             `bson:"execution_id" json:"execution_id"` // TestResult _id as hex
	RootCause   string             `bson:"root_cause" json:"root_cause"`
	LikelyFix   string             `bson:"likely_fix" json:"likely_fix"`
	Confidence  string             `bson:"confidence" json:"confidence"` // High | Medium | Low
	ModelUsed   string             `bson:"model_used" json:"model_used"`
	RawResponse string             `bson:"raw_response" json:"raw_response"`
	GeneratedAt        time.Time          `bson:"generated_at" json:"generated_at"`
	ErrorCategory      string             `bson:"error_category" json:"error_category"`
	FailingLineNumber  int                `bson:"failing_line_number" json:"failing_line_number,omitempty"`
	FailingCodeSnippet string             `bson:"failing_code_snippet" json:"failing_code_snippet,omitempty"`
	FailingLocator     string             `bson:"failing_locator" json:"failing_locator,omitempty"`
	LastSuccessfulStep string             `bson:"last_successful_step" json:"last_successful_step,omitempty"`
	TotalStepsCaptured int                `bson:"total_steps_captured" json:"total_steps_captured"`
	// AI-suggested corrected code (minimal failing line(s), ready to paste)
	CorrectedCode string `bson:"corrected_code,omitempty" json:"corrected_code,omitempty"`
	// Observability context snapshot captured at diagnosis time (lets the panel
	// show the evidence the AI reasoned over, so its conclusion is verifiable).
	ErrorTrace          string `bson:"error_trace,omitempty" json:"error_trace,omitempty"`
	ExecutionLogs       string `bson:"execution_logs,omitempty" json:"execution_logs,omitempty"`
	TargetURL           string `bson:"target_url,omitempty" json:"target_url,omitempty"`
	Browser             string `bson:"browser,omitempty" json:"browser,omitempty"`
	Framework           string `bson:"framework,omitempty" json:"framework,omitempty"`
	FailureScreenshotID string `bson:"failure_screenshot_id,omitempty" json:"failure_screenshot_id,omitempty"`
}

// DiagnosisResponse is returned to the frontend
type DiagnosisResponse struct {
	ExecutionID string    `json:"execution_id"`
	RootCause   string    `json:"root_cause"`
	LikelyFix   string    `json:"likely_fix"`
	Confidence  string    `json:"confidence"`
	ModelUsed   string    `json:"model_used"`
	GeneratedAt        time.Time `json:"generated_at"`
	ErrorCategory      string    `json:"error_category"`
	FailingLineNumber  int       `json:"failing_line_number,omitempty"`
	FailingCodeSnippet string    `json:"failing_code_snippet,omitempty"`
	FailingLocator     string    `json:"failing_locator,omitempty"`
	LastSuccessfulStep string    `json:"last_successful_step,omitempty"`
	TotalStepsCaptured int       `json:"total_steps_captured"`
	// AI-suggested corrected code + observability context (see Diagnosis above)
	CorrectedCode       string `json:"corrected_code,omitempty"`
	ErrorTrace          string `json:"error_trace,omitempty"`
	ExecutionLogs       string `json:"execution_logs,omitempty"`
	TargetURL           string `json:"target_url,omitempty"`
	Browser             string `json:"browser,omitempty"`
	Framework           string `json:"framework,omitempty"`
	FailureScreenshotID string `json:"failure_screenshot_id,omitempty"`
}
