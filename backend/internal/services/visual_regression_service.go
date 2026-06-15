package services

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"backend/internal/models"
)

const defaultVisualRegressionServiceURL = "http://visual-regression-service:8002"

type VisualRegressionService struct {
	baseURL string
	client  *http.Client
}

func NewVisualRegressionService() *VisualRegressionService {
	baseURL := os.Getenv("VISUAL_REGRESSION_SERVICE_URL")
	if baseURL == "" {
		baseURL = defaultVisualRegressionServiceURL
	}

	return &VisualRegressionService{
		baseURL: strings.TrimRight(baseURL, "/"),
		client:  &http.Client{Timeout: 30 * time.Second},
	}
}

func (s *VisualRegressionService) Compare(
	ctx context.Context,
	req models.VisualRegressionCompareRequest,
) (*models.VisualRegressionCompareResponse, error) {
	payload, err := json.Marshal(struct {
		TestCaseID       string   `json:"test_case_id"`
		StepName         string   `json:"step_name"`
		Framework        string   `json:"framework"`
		Browser          string   `json:"browser"`
		CurrentImagePath string   `json:"current_image_path"`
		Threshold        *float64 `json:"threshold,omitempty"`
	}{
		TestCaseID:       req.TestCaseID,
		StepName:         req.StepName,
		Framework:        req.Framework,
		Browser:          req.Browser,
		CurrentImagePath: req.CurrentImagePath,
		Threshold:        req.Threshold,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to serialize visual regression request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, s.baseURL+"/compare", bytes.NewReader(payload))
	if err != nil {
		return nil, fmt.Errorf("failed to build visual regression request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := s.client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("visual regression service unavailable: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("visual regression service returned status %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}

	var result models.VisualRegressionCompareResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("failed to parse visual regression response: %w", err)
	}

	return &result, nil
}

func (s *VisualRegressionService) Health(ctx context.Context) (map[string]string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, s.baseURL+"/health", nil)
	if err != nil {
		return nil, fmt.Errorf("failed to build visual regression health request: %w", err)
	}

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("visual regression service unavailable: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("visual regression health returned status %d", resp.StatusCode)
	}

	var result map[string]string
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("failed to parse visual regression health response: %w", err)
	}
	return result, nil
}
