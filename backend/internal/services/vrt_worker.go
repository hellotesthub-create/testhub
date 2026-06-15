package services

import (
	"context"
	"encoding/base64"
	"log"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"

	"backend/internal/models"
	"backend/internal/repository"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// VRTWorker runs visual-regression comparisons as a background, parallel job after
// a test run finishes. It never blocks test execution: it polls for finished runs
// with VRT enabled, then compares every captured screenshot against its baseline
// across a pool of workers, recording live progress on the VRTJob.
type VRTWorker struct {
	interval     time.Duration
	workers      int
	baselineRoot string
	tmpDir       string

	runRepo        *repository.TestRunRepository
	screenshotRepo *repository.ScreenshotRepository
	resultRepo     *repository.TestResultRepository
	jobRepo        *repository.VRTJobRepository
	comparisonRepo *repository.VisualComparisonRepository
	vrService      *VisualRegressionService
}

func NewVRTWorker(
	runRepo *repository.TestRunRepository,
	screenshotRepo *repository.ScreenshotRepository,
	resultRepo *repository.TestResultRepository,
	jobRepo *repository.VRTJobRepository,
	comparisonRepo *repository.VisualComparisonRepository,
	vrService *VisualRegressionService,
) *VRTWorker {
	workers := runtime.NumCPU()
	if v := strings.TrimSpace(os.Getenv("VRT_WORKERS")); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			workers = n
		}
	}
	if workers < 1 {
		workers = 1
	}
	if workers > 16 {
		workers = 16
	}

	interval := 10 * time.Second
	if v := strings.TrimSpace(os.Getenv("VRT_POLL_INTERVAL_SECONDS")); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			interval = time.Duration(n) * time.Second
		}
	}

	return &VRTWorker{
		interval:       interval,
		workers:        workers,
		baselineRoot:   "/app/baselines",
		tmpDir:         "/tmp/vr",
		runRepo:        runRepo,
		screenshotRepo: screenshotRepo,
		resultRepo:     resultRepo,
		jobRepo:        jobRepo,
		comparisonRepo: comparisonRepo,
		vrService:      vrService,
	}
}

func (w *VRTWorker) Start(ctx context.Context) {
	log.Printf("VRT worker started (interval=%s, workers=%d)", w.interval, w.workers)
	go w.loop(ctx)
}

func (w *VRTWorker) loop(ctx context.Context) {
	ticker := time.NewTicker(w.interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			w.tick(ctx)
		}
	}
}

func (w *VRTWorker) tick(ctx context.Context) {
	defer func() {
		if r := recover(); r != nil {
			log.Printf("VRT worker panic recovered: %v", r)
		}
	}()

	// 1. Auto-enqueue: finished runs with VRT enabled and no job yet.
	runs, err := w.runRepo.GetRunsNeedingVRT(ctx, 10)
	if err != nil {
		log.Printf("VRT: failed to list runs needing VRT: %v", err)
	}
	for i := range runs {
		run := runs[i]
		won, err := w.runRepo.TryClaimVRT(ctx, run.ID)
		if err != nil || !won {
			continue
		}
		job := &models.VRTJob{
			RunID:       run.ID,
			RunIDString: run.RunID,
			SuiteID:     run.SuiteID,
			TriggeredBy: run.TriggeredBy,
			Status:      models.VRTStatusQueued,
		}
		if err := w.jobRepo.Create(ctx, job); err != nil {
			log.Printf("VRT: failed to create job for run %s: %v", run.RunID, err)
		}
	}

	// 2. Process: claim one queued job and run it to completion.
	job, err := w.jobRepo.ClaimQueued(ctx)
	if err != nil {
		log.Printf("VRT: claim failed: %v", err)
		return
	}
	if job == nil {
		return
	}
	w.processJob(context.Background(), job)
}

func (w *VRTWorker) processJob(ctx context.Context, job *models.VRTJob) {
	log.Printf("VRT: processing job %s for run %s", job.ID.Hex(), job.RunIDString)
	_ = w.runRepo.SetVRTStatus(ctx, job.RunID, models.VRTStatusRunning)

	run, err := w.runRepo.GetByID(ctx, job.RunID)
	if err != nil {
		w.failJob(ctx, job, "run not found: "+err.Error())
		return
	}

	shots, err := w.screenshotRepo.GetByRunID(ctx, job.RunID)
	if err != nil {
		w.failJob(ctx, job, "screenshot lookup failed: "+err.Error())
		return
	}
	// Skip runner success/failure artifact frames; keep real step captures.
	shots = filterComparableShots(shots)

	results, err := w.resultRepo.GetByRunID(ctx, job.RunID)
	if err != nil {
		w.failJob(ctx, job, "result lookup failed: "+err.Error())
		return
	}
	resultByKey := make(map[string]primitive.ObjectID, len(results))
	for _, res := range results {
		resultByKey[res.TestName+"|"+res.Browser] = res.ID
	}

	_ = w.jobRepo.SetTotal(ctx, job.ID, len(shots))
	if err := os.MkdirAll(w.tmpDir, 0755); err != nil {
		w.failJob(ctx, job, "scratch dir error: "+err.Error())
		return
	}

	// Parallel comparison across a worker pool. The Python service runs multiple
	// uvicorn workers, so concurrent calls fan out across CPU cores.
	type task struct {
		index int
		shot  models.Screenshot
	}
	tasks := make(chan task)
	var wg sync.WaitGroup
	// Track which (testKey/browser/step) we saw so we can detect missing baselines.
	var seenMu sync.Mutex
	seen := map[string]bool{}

	for i := 0; i < w.workers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for t := range tasks {
				testKey := stableTestKey(t.shot.TestName)
				step := stableStepName(t.shot)
				seenMu.Lock()
				seen[run.Framework+"|"+t.shot.Browser+"|"+testKey+"|"+step] = true
				seenMu.Unlock()
				w.compareOne(ctx, job, run, t.shot, testKey, step, t.index, resultByKey)
			}
		}()
	}
	for i := range shots {
		tasks <- task{index: i, shot: shots[i]}
	}
	close(tasks)
	wg.Wait()

	// Detect baselines that exist but had no current screenshot this run.
	w.detectMissing(ctx, job, run, seen)

	_ = w.jobRepo.Finish(ctx, job.ID, models.VRTStatusCompleted, "")
	_ = w.runRepo.SetVRTStatus(ctx, job.RunID, models.VRTStatusCompleted)
	log.Printf("VRT: job %s completed (%d screenshots)", job.ID.Hex(), len(shots))
}

func (w *VRTWorker) compareOne(ctx context.Context, job *models.VRTJob, run *models.TestRun, shot models.Screenshot, testKey, step string, index int, resultByKey map[string]primitive.ObjectID) {
	currentPath := filepath.Join(w.tmpDir, "job_"+job.ID.Hex()+"_"+strconv.Itoa(index)+".png")
	if err := writeShotFile(currentPath, shot); err != nil {
		log.Printf("VRT: write screenshot failed: %v", err)
		_ = w.jobRepo.IncProgress(ctx, job.ID, "errored")
		return
	}

	req := models.VisualRegressionCompareRequest{
		TestCaseID:       testKey,
		StepName:         step,
		Framework:        run.Framework,
		Browser:          shot.Browser,
		CurrentImagePath: currentPath,
	}
	resp, err := w.vrService.Compare(ctx, req)
	if err != nil {
		log.Printf("VRT: compare failed for %s/%s: %v", testKey, step, err)
		_ = w.jobRepo.IncProgress(ctx, job.ID, "errored")
		return
	}

	resultID := shot.ResultID
	if resultID.IsZero() {
		resultID = resultByKey[shot.TestName+"|"+shot.Browser]
	}

	// Store an IMMUTABLE snapshot of the baseline used for this comparison so that
	// promoting a new baseline later never retroactively changes what this past
	// history record displays. The live baseline (for future runs) stays under
	// /app/baselines and is reconstructable from the stable key on promote.
	baselineForRecord := resp.BaselinePath
	if snap := w.snapshotBaseline(resp.BaselinePath, job.ID.Hex(), index); snap != "" {
		baselineForRecord = snap
	}

	cmp := &models.VisualComparison{
		JobID:                job.ID,
		RunRef:               run.ID,
		ResultID:             resultID,
		TestName:             shot.TestName,
		TestCaseID:           testKey,
		StepName:             step,
		Framework:            run.Framework,
		Browser:              shot.Browser,
		Status:               resp.Status,
		DifferencePercentage: resp.DifferencePercentage,
		BaselinePath:         baselineForRecord,
		CurrentPath:          resp.CurrentPath,
		DiffPath:             resp.DiffPath,
	}
	if err := w.comparisonRepo.Insert(ctx, cmp); err != nil {
		log.Printf("VRT: save comparison failed: %v", err)
	}
	_ = w.jobRepo.IncProgress(ctx, job.ID, outcomeField(resp.Status))
}

// snapshotBaseline copies the baseline image used in a comparison into an
// immutable per-comparison file under the scratch volume, and returns its path.
// History records point at this snapshot so a later baseline promotion (which
// overwrites the live /app/baselines file) does not alter past records.
// Returns "" on failure so the caller falls back to the live path.
func (w *VRTWorker) snapshotBaseline(baselinePath string, jobHex string, index int) string {
	if baselinePath == "" {
		return ""
	}
	src := baselinePath
	if strings.HasPrefix(src, "baselines/") {
		src = filepath.Join(w.baselineRoot, strings.TrimPrefix(src, "baselines/"))
	}
	data, err := os.ReadFile(src)
	if err != nil {
		return ""
	}
	snap := filepath.Join(w.tmpDir, "job_"+jobHex+"_"+strconv.Itoa(index)+"_baseline.png")
	if err := os.WriteFile(snap, data, 0644); err != nil {
		return ""
	}
	return snap
}

// detectMissing flags baselines that exist on disk but had no matching current
// screenshot in this run (a screen that used to be captured no longer is).
func (w *VRTWorker) detectMissing(ctx context.Context, job *models.VRTJob, run *models.TestRun, seen map[string]bool) {
	// Distinct (testKey, browser) pairs seen this run.
	dirs := map[string]bool{}
	for key := range seen {
		parts := strings.SplitN(key, "|", 4)
		if len(parts) != 4 {
			continue
		}
		dirs[parts[0]+"|"+parts[1]+"|"+parts[2]] = true // framework|browser|testKey
	}
	for d := range dirs {
		p := strings.SplitN(d, "|", 3)
		framework, browser, testKey := p[0], p[1], p[2]
		baseDir := filepath.Join(w.baselineRoot, framework, browser, testKey)
		entries, err := os.ReadDir(baseDir)
		if err != nil {
			continue
		}
		for _, e := range entries {
			if e.IsDir() || !strings.HasSuffix(strings.ToLower(e.Name()), ".png") {
				continue
			}
			step := strings.TrimSuffix(e.Name(), filepath.Ext(e.Name()))
			if seen[framework+"|"+browser+"|"+testKey+"|"+step] {
				continue
			}
			// Baseline with no current capture this run → possible regression.
			cmp := &models.VisualComparison{
				JobID:      job.ID,
				RunRef:     run.ID,
				TestCaseID: testKey,
				StepName:   step,
				Framework:  framework,
				Browser:    browser,
				Status:     models.VisualStatusMissing,
				BaselinePath: filepath.Join("baselines", framework, browser, testKey, e.Name()),
			}
			_ = w.comparisonRepo.Insert(ctx, cmp)
			_ = w.jobRepo.IncCounter(ctx, job.ID, "missing", 1)
		}
	}
}

func (w *VRTWorker) failJob(ctx context.Context, job *models.VRTJob, msg string) {
	log.Printf("VRT: job %s failed: %s", job.ID.Hex(), msg)
	_ = w.jobRepo.Finish(ctx, job.ID, models.VRTStatusFailed, msg)
	_ = w.runRepo.SetVRTStatus(ctx, job.RunID, models.VRTStatusFailed)
}

// outcomeField maps a comparison status to the VRTJob counter to increment.
func outcomeField(status string) string {
	switch status {
	case models.VisualStatusPassed:
		return "passed"
	case models.VisualStatusFailed:
		return "failed"
	case models.VisualStatusBaselineCreated:
		return "baseline_created"
	case models.VisualStatusDimensionMismatch:
		return "dimension_mismatch"
	default:
		return "errored"
	}
}

func writeShotFile(path string, shot models.Screenshot) error {
	if len(shot.FileData) > 0 {
		return os.WriteFile(path, shot.FileData, 0644)
	}
	data := strings.TrimSpace(shot.ImageData)
	if data == "" {
		return os.ErrNotExist
	}
	if idx := strings.Index(data, ","); idx >= 0 {
		data = data[idx+1:]
	}
	decoded, err := base64.StdEncoding.DecodeString(data)
	if err != nil {
		return err
	}
	return os.WriteFile(path, decoded, 0644)
}

// stableStepName returns the per-step key (filename-stable, not order-dependent).
func stableStepName(shot models.Screenshot) string {
	if s := strings.TrimSpace(shot.Step); s != "" {
		return s
	}
	if n := strings.TrimSpace(shot.Name); n != "" {
		return strings.TrimSuffix(n, filepath.Ext(n))
	}
	return "step"
}

// stableTestKey strips the per-run timestamp suffix so baselines persist across runs.
func stableTestKey(testName string) string {
	base := filepath.Base(strings.TrimSpace(testName))
	if base == "" || base == "." {
		return "unknown_test"
	}
	ext := filepath.Ext(base)
	stem := strings.TrimSuffix(base, ext)
	if len(stem) > 16 {
		suffix := stem[len(stem)-15:]
		if isTimestampSuffix(suffix) {
			stem = stem[:len(stem)-16]
		}
	}
	if stem == "" {
		return base
	}
	return stem + ext
}

func isTimestampSuffix(s string) bool {
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

// filterComparableShots drops the runner's success/failure summary frames.
func filterComparableShots(shots []models.Screenshot) []models.Screenshot {
	out := make([]models.Screenshot, 0, len(shots))
	for _, s := range shots {
		step := strings.ToLower(strings.TrimSpace(s.Step))
		name := strings.ToLower(strings.TrimSpace(s.Name))
		if strings.Contains(step, "success") || strings.Contains(step, "failure") ||
			strings.Contains(name, "_success") || strings.Contains(name, "_failure") {
			continue
		}
		out = append(out, s)
	}
	return out
}
