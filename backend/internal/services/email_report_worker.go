package services

import (
	"backend/internal/models"
	"backend/internal/repository"
	"context"
	"fmt"
	"log"
	"os"
	"strconv"
	"strings"
	"time"
)

type EmailReportWorkerConfig struct {
	Interval        time.Duration
	BatchLimit      int64
	FrontendBaseURL string
	MaxLogBytes     int
	RetryFailed     bool
}

func EmailReportWorkerConfigFromEnv() EmailReportWorkerConfig {
	intervalSeconds := 20
	if v := strings.TrimSpace(os.Getenv("EMAIL_POLL_INTERVAL_SECONDS")); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			intervalSeconds = n
		}
	}

	batchLimit := int64(5)
	if v := strings.TrimSpace(os.Getenv("EMAIL_BATCH_LIMIT")); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			batchLimit = int64(n)
		}
	}

	maxLogBytes := 500_000
	if v := strings.TrimSpace(os.Getenv("EMAIL_MAX_LOG_BYTES")); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			maxLogBytes = n
		}
	}

	frontendBaseURL := strings.TrimRight(strings.TrimSpace(os.Getenv("FRONTEND_BASE_URL")), "/")
	if frontendBaseURL == "" {
		frontendBaseURL = "http://localhost:5173"
	}

	retryFailed := false
	if v := strings.TrimSpace(os.Getenv("EMAIL_RETRY_FAILED")); v != "" {
		if b, err := strconv.ParseBool(v); err == nil {
			retryFailed = b
		}
	}

	return EmailReportWorkerConfig{
		Interval:        time.Duration(intervalSeconds) * time.Second,
		BatchLimit:      batchLimit,
		FrontendBaseURL: frontendBaseURL,
		MaxLogBytes:     maxLogBytes,
		RetryFailed:     retryFailed,
	}
}

type EmailReportWorker struct {
	cfg          EmailReportWorkerConfig
	emailService *EmailService

	testRunRepo    *repository.TestRunRepository
	testResultRepo *repository.TestResultRepository
	screenshotRepo *repository.ScreenshotRepository
	videoRepo      *repository.VideoRepository
	logRepo        *repository.LogRepository
}

func NewEmailReportWorker(
	cfg EmailReportWorkerConfig,
	emailService *EmailService,
	testRunRepo *repository.TestRunRepository,
	testResultRepo *repository.TestResultRepository,
	screenshotRepo *repository.ScreenshotRepository,
	videoRepo *repository.VideoRepository,
	logRepo *repository.LogRepository,
) *EmailReportWorker {
	return &EmailReportWorker{
		cfg:            cfg,
		emailService:   emailService,
		testRunRepo:    testRunRepo,
		testResultRepo: testResultRepo,
		screenshotRepo: screenshotRepo,
		videoRepo:      videoRepo,
		logRepo:        logRepo,
	}
}

func (w *EmailReportWorker) Start(ctx context.Context) {
	go w.loop(ctx)
}

func (w *EmailReportWorker) loop(ctx context.Context) {
	ticker := time.NewTicker(w.cfg.Interval)
	defer ticker.Stop()

	// Run once immediately on start (non-blocking, still in goroutine)
	w.tick(ctx)

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			w.tick(ctx)
		}
	}
}

func (w *EmailReportWorker) tick(ctx context.Context) {
	ctx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()

	runs, err := w.testRunRepo.GetRunsNeedingEmail(ctx, w.cfg.BatchLimit)
	if err != nil {
		log.Printf("email worker: failed to query runs needing email: %v", err)
		return
	}
	if len(runs) == 0 {
		return
	}

	for _, run := range runs {
		// Safety: don't keep retrying failed sends unless explicitly enabled.
		if strings.EqualFold(run.EmailStatus, "failed") && !w.cfg.RetryFailed {
			continue
		}

		claimed, err := w.testRunRepo.TryMarkEmailSending(ctx, run.ID)
		if err != nil {
			log.Printf("email worker: claim failed for run=%s: %v", run.RunID, err)
			continue
		}
		if !claimed {
			continue
		}

		if err := w.sendForRun(ctx, &run); err != nil {
			errMsg := err.Error()
			if len(errMsg) > 2000 {
				errMsg = errMsg[:2000]
			}
			_ = w.testRunRepo.MarkEmailFailed(ctx, run.ID, errMsg)
			log.Printf("email worker: send failed run=%s: %v", run.RunID, err)
			continue
		}
		_ = w.testRunRepo.MarkEmailSent(ctx, run.ID)
		log.Printf("email worker: sent report run=%s to=%s", run.RunID, run.TriggeredBy)
	}
}

func (w *EmailReportWorker) sendForRun(ctx context.Context, run *models.TestRun) error {
	// Fetch run details
	results, err := w.testResultRepo.GetByRunID(ctx, run.ID)
	if err != nil {
		results = []models.TestResult{}
	}
	logsList, err := w.logRepo.GetByRunID(ctx, run.ID)
	if err != nil {
		logsList = []models.Log{}
	}
	screenshots, err := w.screenshotRepo.GetByRunID(ctx, run.ID)
	if err != nil {
		screenshots = []models.Screenshot{}
	}
	videos, err := w.videoRepo.GetByRunID(ctx, run.ID)
	if err != nil {
		videos = []models.Video{}
	}

	// truncated flag is still used in the email body text.
	_, truncated := formatLogsAsText(logsList, w.cfg.MaxLogBytes)

	statusWord := strings.ToUpper(run.Status)
	subject := fmt.Sprintf("THEX Run %s — %s", run.RunID, statusWord)

	resultsURL := fmt.Sprintf("%s/tester/test-results/%s", w.cfg.FrontendBaseURL, run.RunID)

	body := buildEmailBody(run, resultsURL, results, len(screenshots), len(videos), len(logsList), truncated)

	// Only the Allure-style PDF report is attached to the completion email.
	var attachments []EmailAttachment
	if pdf, perr := GenerateRunReportPDF(run, results, screenshots, logsList); perr == nil && len(pdf) > 0 {
		attachments = append(attachments, EmailAttachment{
			Filename:    fmt.Sprintf("THEX_Report_%s.pdf", run.RunID),
			ContentType: "application/pdf",
			Data:        pdf,
		})
	} else if perr != nil {
		log.Printf("[email-worker] failed to generate PDF report for run %s: %v", run.RunID, perr)
	}

	return w.emailService.Send(run.TriggeredBy, subject, body, attachments)
}

func buildEmailBody(run *models.TestRun, resultsURL string, results []models.TestResult, screenshotsCount int, videosCount int, logsCount int, logsTruncated bool) string {
	passed := run.Passed
	failed := run.Failed
	total := run.TotalTests

	duration := fmt.Sprintf("%.1fs", run.DurationSeconds)

	failedNames := make([]string, 0)
	for _, r := range results {
		if strings.EqualFold(r.Status, "failed") {
			failedNames = append(failedNames, fmt.Sprintf("- %s [%s]", r.TestName, r.Browser))
		}
		if len(failedNames) >= 20 {
			break
		}
	}

	lines := []string{
		"THEX Test Run Report",
		"",
		fmt.Sprintf("Run ID: %s", run.RunID),
		fmt.Sprintf("Suite: %s", run.SuiteName),
		fmt.Sprintf("Status: %s", strings.ToUpper(run.Status)),
		fmt.Sprintf("Browsers: %s", strings.Join(run.Browsers, ", ")),
		fmt.Sprintf("Results: %d total, %d passed, %d failed", total, passed, failed),
		fmt.Sprintf("Duration: %s", duration),
		"",
		fmt.Sprintf("Artifacts: %d screenshots, %d videos, %d logs", screenshotsCount, videosCount, logsCount),
	}

	if logsTruncated {
		lines = append(lines, "Note: logs attachment was truncated due to size limit.")
	}

	lines = append(lines,
		"",
		"View in THEX:",
		resultsURL,
	)

	if len(failedNames) > 0 {
		lines = append(lines, "", "Failed tests (top 20):")
		lines = append(lines, failedNames...)
	}

	lines = append(lines, "")
	return strings.Join(lines, "\n")
}

func formatLogsAsText(logs []models.Log, maxBytes int) (string, bool) {
	if maxBytes <= 0 {
		maxBytes = 500_000
	}

	var b strings.Builder
	truncated := false

	for _, l := range logs {
		line := fmt.Sprintf("%s [%s] %s %s: %s\n",
			l.CreatedAt.Format(time.RFC3339),
			strings.ToUpper(l.Level),
			l.Browser,
			l.TestName,
			l.Message,
		)
		if b.Len()+len(line) > maxBytes {
			truncated = true
			break
		}
		b.WriteString(line)
	}

	if truncated {
		b.WriteString("\n[TRUNCATED] Log output exceeded size limit.\n")
	}

	return b.String(), truncated
}
