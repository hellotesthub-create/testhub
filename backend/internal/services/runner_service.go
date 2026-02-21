package services

import (
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
)

// RunnerService handles spawning the Python test runner process
type RunnerService struct {
	runnerDir      string
	testScriptsDir string
	pythonPath     string
	browserMu      map[string]*sync.Mutex // Per-browser mutex for sequential execution
	mu             sync.Mutex             // Protects browserMu map
}

// NewRunnerService creates a new RunnerService
func NewRunnerService() *RunnerService {
	// Find runner directory relative to backend
	runnerDir := os.Getenv("RUNNER_DIR")
	if runnerDir == "" {
		// Default: assume backend and runner are siblings
		runnerDir = "../runner"
	}

	// Resolve absolute path
	absRunnerDir, err := filepath.Abs(runnerDir)
	if err != nil {
		log.Printf("Warning: Could not resolve runner dir: %v", err)
		absRunnerDir = runnerDir
	}

	// Find Python executable
	pythonPath := os.Getenv("PYTHON_PATH")
	if pythonPath == "" {
		// Try common locations
		candidates := []string{"python3", "python"}
		for _, p := range candidates {
			if path, err := exec.LookPath(p); err == nil {
				pythonPath = path
				break
			}
		}
	}

	log.Printf("🐍 Runner service initialized: dir=%s, python=%s", absRunnerDir, pythonPath)

	return &RunnerService{
		runnerDir:      absRunnerDir,
		testScriptsDir: filepath.Join(absRunnerDir, "testscripts"),
		pythonPath:     pythonPath,
		browserMu:      make(map[string]*sync.Mutex),
	}
}

// getBrowserMutex returns a per-browser mutex, creating one if needed
func (s *RunnerService) getBrowserMutex(browser string) *sync.Mutex {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.browserMu[browser]; !ok {
		s.browserMu[browser] = &sync.Mutex{}
	}
	return s.browserMu[browser]
}

// ExecuteTestRunSync spawns the Python runner and waits for it to complete (blocking).
// Used when same-browser tests must run sequentially.
func (s *RunnerService) ExecuteTestRunSync(params RunParams) error {
	if s.pythonPath == "" {
		return fmt.Errorf("python executable not found")
	}

	runnerScript := filepath.Join(s.runnerDir, "src", "runner.py")
	if _, err := os.Stat(runnerScript); os.IsNotExist(err) {
		return fmt.Errorf("runner script not found: %s", runnerScript)
	}

	args := []string{
		runnerScript,
		"--email", params.Email,
		"--username", params.Username,
		"--test-id", params.RunID,
		"--backend-url", params.BackendURL,
	}
	if params.UserID != "" {
		args = append(args, "--user-id", params.UserID)
	}
	if params.TestFile != "" {
		args = append(args, "--file", params.TestFile)
	}
	if params.Browser != "" {
		args = append(args, "--browser", params.Browser)
	}

	cmd := exec.Command(s.pythonPath, args...)
	cmd.Dir = s.runnerDir

	env := os.Environ()
	env = append(env,
		"SELENIUM_CHROME_URL=http://localhost:4444",
		"SELENIUM_FIREFOX_URL=http://localhost:4445",
		"MONGO_HOST=localhost",
		"MONGO_PORT=27017",
		"MONGO_USERNAME=admin",
		"MONGO_PASSWORD=admin123",
		"MONGO_DATABASE=testops",
		"PYTHONUNBUFFERED=1",
		fmt.Sprintf("RUNNER_BASE_DIR=%s", s.runnerDir),
		fmt.Sprintf("TESTSCRIPTS_DIR=%s", s.testScriptsDir),
		fmt.Sprintf("OUTPUT_DIR=%s", filepath.Join(s.runnerDir, "output")),
	)
	cmd.Env = env

	testBaseName := strings.TrimSuffix(params.TestFile, filepath.Ext(params.TestFile))
	logFile := filepath.Join(s.runnerDir, "logs", fmt.Sprintf("run_%s_%s_%s.log", params.RunID, testBaseName, params.Browser))
	os.MkdirAll(filepath.Dir(logFile), 0755)

	outFile, err := os.Create(logFile)
	if err != nil {
		log.Printf("Warning: Could not create log file %s: %v", logFile, err)
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
	} else {
		defer outFile.Close()
		cmd.Stdout = outFile
		cmd.Stderr = outFile
	}

	log.Printf("🚀 Running (sync): %s on %s", params.TestFile, params.Browser)

	if err := cmd.Run(); err != nil {
		log.Printf("⚠️ Runner for %s on %s exited with error: %v", params.TestFile, params.Browser, err)
		return err
	}

	log.Printf("✅ Runner completed: %s on %s", params.TestFile, params.Browser)
	return nil
}

// ExecuteTestRunsForBrowser runs a list of tests sequentially on one browser.
// This is launched as a goroutine so different browsers execute in parallel.
func (s *RunnerService) ExecuteTestRunsForBrowser(browser string, paramsList []RunParams) {
	bmu := s.getBrowserMutex(browser)
	bmu.Lock()
	defer bmu.Unlock()

	log.Printf("🔒 Starting sequential execution for browser: %s (%d tests)", browser, len(paramsList))
	for _, params := range paramsList {
		if err := s.ExecuteTestRunSync(params); err != nil {
			log.Printf("⚠️ Test %s failed on %s: %v", params.TestFile, browser, err)
		}
	}
	log.Printf("🔓 Completed all tests for browser: %s", browser)
}

// ExecuteTestRun spawns the Python runner to execute a test run
func (s *RunnerService) ExecuteTestRun(params RunParams) error {
	if s.pythonPath == "" {
		return fmt.Errorf("python executable not found")
	}

	runnerScript := filepath.Join(s.runnerDir, "src", "runner.py")
	if _, err := os.Stat(runnerScript); os.IsNotExist(err) {
		return fmt.Errorf("runner script not found: %s", runnerScript)
	}

	// Build command arguments
	args := []string{
		runnerScript,
		"--email", params.Email,
		"--username", params.Username,
		"--test-id", params.RunID,
		"--backend-url", params.BackendURL,
	}

	if params.UserID != "" {
		args = append(args, "--user-id", params.UserID)
	}

	if params.TestFile != "" {
		args = append(args, "--file", params.TestFile)
	}

	if params.Browser != "" {
		args = append(args, "--browser", params.Browser)
	}

	cmd := exec.Command(s.pythonPath, args...)
	cmd.Dir = s.runnerDir

	// Set environment variables for Selenium Grid (localhost when running outside Docker)
	env := os.Environ()
	env = append(env,
		"SELENIUM_CHROME_URL=http://localhost:4444",
		"SELENIUM_FIREFOX_URL=http://localhost:4445",
		"MONGO_HOST=localhost",
		"MONGO_PORT=27017",
		"MONGO_USERNAME=admin",
		"MONGO_PASSWORD=admin123",
		"MONGO_DATABASE=testops",
		"PYTHONUNBUFFERED=1",
		fmt.Sprintf("RUNNER_BASE_DIR=%s", s.runnerDir),
		fmt.Sprintf("TESTSCRIPTS_DIR=%s", s.testScriptsDir),
		fmt.Sprintf("OUTPUT_DIR=%s", filepath.Join(s.runnerDir, "output")),
	)
	cmd.Env = env

	// Log stdout/stderr — include browser and test file for unique names when parallel runners share the same RunID
	testBaseName := strings.TrimSuffix(params.TestFile, filepath.Ext(params.TestFile))
	logFile := filepath.Join(s.runnerDir, "logs", fmt.Sprintf("run_%s_%s_%s.log", params.RunID, testBaseName, params.Browser))
	os.MkdirAll(filepath.Dir(logFile), 0755)

	outFile, err := os.Create(logFile)
	if err != nil {
		log.Printf("Warning: Could not create log file %s: %v", logFile, err)
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
	} else {
		cmd.Stdout = outFile
		cmd.Stderr = outFile
	}

	log.Printf("🚀 Spawning runner: %s %s", s.pythonPath, strings.Join(args, " "))
	log.Printf("📁 Working dir: %s", s.runnerDir)
	log.Printf("📝 Log file: %s", logFile)

	// Start the process in the background
	if err := cmd.Start(); err != nil {
		if outFile != nil {
			outFile.Close()
		}
		return fmt.Errorf("failed to start runner: %v", err)
	}

	// Monitor in a goroutine
	go func() {
		defer func() {
			if outFile != nil {
				outFile.Close()
			}
		}()

		err := cmd.Wait()
		if err != nil {
			log.Printf("⚠️ Runner process for run %s exited with error: %v", params.RunID, err)
		} else {
			log.Printf("✅ Runner process for run %s completed successfully", params.RunID)
		}
	}()

	log.Printf("✅ Runner process spawned with PID %d for run %s", cmd.Process.Pid, params.RunID)
	return nil
}

// GetRunnerDir returns the runner directory path
func (s *RunnerService) GetRunnerDir() string {
	return s.runnerDir
}

// GetTestScriptsDir returns the testscripts directory path
func (s *RunnerService) GetTestScriptsDir() string {
	return s.testScriptsDir
}

// GetPlatformInfo returns OS info for debugging
func (s *RunnerService) GetPlatformInfo() string {
	return fmt.Sprintf("OS=%s ARCH=%s", runtime.GOOS, runtime.GOARCH)
}

// RunParams holds parameters for a test run execution
type RunParams struct {
	RunID      string
	Email      string
	Username   string
	UserID     string
	BackendURL string
	TestFile   string // Optional: specific test file to run
	Browser    string // Single browser for this execution (e.g., "chrome", "firefox")
}
