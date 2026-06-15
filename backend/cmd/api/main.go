package main

/**
 * Backend API Entry Point
 *
 * Purpose: Main entry point for the TestOps backend API
 * This handles all HTTP requests and routes them to appropriate handlers
 *
 * New Schema (2024):
 * - test_suites: Suite definitions (reusable)
 * - test_cases: Test scripts within suites
 * - test_runs: Each execution of a suite
 * - test_results: Results per test case per browser
 * - screenshots/videos/logs: Artifacts linked to results
 */

import (
	"context"
	"log"
	"net/http"
	"os"
	"strconv"
	"time"

	"github.com/gorilla/mux"
	"github.com/rs/cors"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"

	"backend/internal/handlers"
	"backend/internal/middleware"
	"backend/internal/repository"
	"backend/internal/services"
)

func getEnvBool(key string, defaultVal bool) bool {
	v := os.Getenv(key)
	if v == "" {
		return defaultVal
	}
	b, err := strconv.ParseBool(v)
	if err != nil {
		return defaultVal
	}
	return b
}

func getEnvInt(key string, defaultVal int) int {
	v := os.Getenv(key)
	if v == "" {
		return defaultVal
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return defaultVal
	}
	return n
}

func main() {
	// ==================================================
	// ENVIRONMENT CONFIGURATION
	// ==================================================
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	mongoURL := os.Getenv("MONGO_URL")
	if mongoURL == "" {
		mongoURL = "mongodb://admin:admin123@localhost:27017"
	}

	log.Println("=== Starting TestOps Backend API ===")
	log.Printf("Port: %s", port)
	log.Printf("MongoDB URL: %s", mongoURL)

	// ==================================================
	// DATABASE CONNECTION
	// ==================================================
	log.Println("Connecting to MongoDB...")

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	client, err := mongo.Connect(ctx, options.Client().ApplyURI(mongoURL))
	if err != nil {
		log.Fatal("Failed to connect to MongoDB:", err)
	}

	err = client.Ping(ctx, nil)
	if err != nil {
		log.Fatal("Failed to ping MongoDB:", err)
	}

	log.Println("Successfully connected to MongoDB")

	database := client.Database("testops")

	// ==================================================
	// INITIALIZE LAYERS
	// ==================================================

	// Repository Layer
	userRepo := repository.NewUserRepository(database)
	screenshotRepo := repository.NewScreenshotRepository(database)
	logRepo := repository.NewLogRepository(database)
	videoRepo := repository.NewVideoRepository(database)
	testSuiteRepo := repository.NewTestSuiteRepository(database)
	testCaseRepo := repository.NewTestCaseRepository(database)
	testRunRepo := repository.NewTestRunRepository(database)
	testResultRepo := repository.NewTestResultRepository(database)
	diagnosisRepo := repository.NewDiagnosisRepository(database)
	visualComparisonRepo := repository.NewVisualComparisonRepository(database)
	vrtJobRepo := repository.NewVRTJobRepository(database)
	diagnosisRepo.EnsureIndexes(context.Background())

	// Service Layer
	userService := services.NewUserService(userRepo)
	jwtService := services.NewJWTService()

	// Middleware
	authMiddleware := middleware.NewAuthMiddleware(jwtService)

	// Handler Layer
	userHandler := handlers.NewUserHandler(userService, jwtService)
	googleAuthHandler := handlers.NewGoogleAuthHandler(userService, jwtService)
	githubHandler := handlers.NewGitHubHandler()
	artifactsHandler := handlers.NewArtifactsHandler(screenshotRepo, logRepo, videoRepo)
	visualRegressionHandler := handlers.NewVisualRegressionHandler(
		services.NewVisualRegressionService(),
		visualComparisonRepo,
		testResultRepo,
		testRunRepo,
		screenshotRepo,
		testCaseRepo,
	)
	vrtHandler := handlers.NewVRTHandler(testRunRepo, vrtJobRepo, visualComparisonRepo)
	testSuiteHandler := handlers.NewTestSuiteHandler(testSuiteRepo, testCaseRepo)
	diagnosisHandler := handlers.NewDiagnosisHandler(
		testResultRepo, testRunRepo, testCaseRepo,
		logRepo, screenshotRepo, diagnosisRepo,
	)
	testCaseHandler := handlers.NewTestCaseHandler(testSuiteRepo, testCaseRepo)
	testRunHandler := handlers.NewTestRunHandler(
		testSuiteRepo,
		testCaseRepo,
		testRunRepo,
		testResultRepo,
		screenshotRepo,
		videoRepo,
		logRepo,
		services.NewRunnerService(),
	)

	// ==================================================
	// OPTIONAL: BACKGROUND EMAIL REPORT WORKER (DISABLED BY DEFAULT)
	// ==================================================
	if getEnvBool("EMAIL_AUTOSEND_ENABLED", false) {
		workerCfg := services.EmailReportWorkerConfigFromEnv()
		emailSvc, emailErr := services.NewEmailServiceFromEnv()
		if emailErr != nil {
			log.Printf("Email autosend enabled but email config invalid: %v", emailErr)
		} else {
			worker := services.NewEmailReportWorker(
				workerCfg,
				emailSvc,
				testRunRepo,
				testResultRepo,
				screenshotRepo,
				videoRepo,
				logRepo,
			)
			worker.Start(context.Background())
			log.Printf("Email autosend worker started (interval=%s)", workerCfg.Interval)
		}
	}

	// ==================================================
	// BACKGROUND VISUAL REGRESSION WORKER (always on; only acts on VRT-enabled runs)
	// ==================================================
	vrtWorker := services.NewVRTWorker(
		testRunRepo,
		screenshotRepo,
		testResultRepo,
		vrtJobRepo,
		visualComparisonRepo,
		services.NewVisualRegressionService(),
	)
	vrtWorker.Start(context.Background())

	// ==================================================
	// ROUTER SETUP
	// ==================================================
	router := mux.NewRouter()

	// Health check endpoint
	router.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))
	}).Methods("GET")

	// API routes
	api := router.PathPrefix("/api").Subrouter()

	api.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))
	}).Methods("GET")

	// Public routes (no authentication required)
	api.HandleFunc("/users/signup", userHandler.Signup).Methods("POST", "OPTIONS")
	api.HandleFunc("/users/set-password", userHandler.SetPassword).Methods("POST", "OPTIONS")
	api.HandleFunc("/auth/login", userHandler.Login).Methods("POST", "OPTIONS")
	api.HandleFunc("/auth/forgot-password", userHandler.ForgotPassword).Methods("POST", "OPTIONS")
	api.HandleFunc("/auth/reset-password", userHandler.ResetPassword).Methods("POST", "OPTIONS")
	api.HandleFunc("/auth/reset-token", userHandler.ValidateResetToken).Methods("GET", "OPTIONS")
	api.HandleFunc("/auth/google", googleAuthHandler.GoogleAuth).Methods("POST", "OPTIONS")
	api.HandleFunc("/auth/google/verify-password", googleAuthHandler.GoogleLoginVerifyPassword).Methods("POST", "OPTIONS")

	// Protected routes (authentication required)
	api.HandleFunc("/auth/me", authMiddleware.Authenticate(userHandler.GetCurrentUser)).Methods("GET", "OPTIONS")

	// ===========================================
	// GITHUB INTEGRATION
	// ===========================================
	api.HandleFunc("/github/fetch", authMiddleware.Authenticate(githubHandler.FetchRepoFiles)).Methods("POST", "OPTIONS")

	// ===========================================
	// TEST SUITES - Suite definition CRUD
	// ===========================================
	api.HandleFunc("/suites", authMiddleware.Authenticate(testSuiteHandler.GetUserTestSuites)).Methods("GET", "OPTIONS")
	api.HandleFunc("/suites", authMiddleware.Authenticate(testSuiteHandler.CreateTestSuite)).Methods("POST", "OPTIONS")
	api.HandleFunc("/suites/run", authMiddleware.Authenticate(testRunHandler.CreateAndRunSuite)).Methods("POST", "OPTIONS") // Must be before {suite_id}
	api.HandleFunc("/suites/{suite_id}", authMiddleware.Authenticate(testSuiteHandler.GetTestSuiteDetails)).Methods("GET", "OPTIONS")
	api.HandleFunc("/suites/{suite_id}", authMiddleware.Authenticate(testSuiteHandler.UpdateTestSuite)).Methods("PUT", "OPTIONS")
	api.HandleFunc("/suites/{suite_id}", authMiddleware.Authenticate(testSuiteHandler.DeleteTestSuite)).Methods("DELETE", "OPTIONS")

	// ===========================================
	// TEST CASES - Test scripts within suites
	// ===========================================
	api.HandleFunc("/suites/{suite_id}/test-cases", authMiddleware.Authenticate(testCaseHandler.GetTestCases)).Methods("GET", "OPTIONS")
	api.HandleFunc("/suites/{suite_id}/test-cases", authMiddleware.Authenticate(testCaseHandler.AddTestCase)).Methods("POST", "OPTIONS")
	api.HandleFunc("/test-cases/{test_case_id}", authMiddleware.Authenticate(testCaseHandler.GetTestCase)).Methods("GET", "OPTIONS")
	api.HandleFunc("/test-cases/{test_case_id}", authMiddleware.Authenticate(testCaseHandler.UpdateTestCase)).Methods("PUT", "OPTIONS")
	api.HandleFunc("/test-cases/{test_case_id}", authMiddleware.Authenticate(testCaseHandler.DeleteTestCase)).Methods("DELETE", "OPTIONS")

	// ===========================================
	// TEST RUNS - Suite executions
	// ===========================================
	api.HandleFunc("/runs", authMiddleware.Authenticate(testRunHandler.GetUserRuns)).Methods("GET", "OPTIONS")
	api.HandleFunc("/suites/{suite_id}/runs", authMiddleware.Authenticate(testRunHandler.GetSuiteRuns)).Methods("GET", "OPTIONS")
	api.HandleFunc("/suites/{suite_id}/run", authMiddleware.Authenticate(testRunHandler.TriggerRun)).Methods("POST", "OPTIONS")
	api.HandleFunc("/runs/{run_id}", authMiddleware.Authenticate(testRunHandler.GetRunDetails)).Methods("GET", "OPTIONS")
	api.HandleFunc("/runs/{run_id}/report", authMiddleware.Authenticate(testRunHandler.DownloadRunReport)).Methods("GET", "OPTIONS")
	api.HandleFunc("/runs/{run_id}/cancel", authMiddleware.Authenticate(testRunHandler.CancelRun)).Methods("POST", "OPTIONS")
	api.HandleFunc("/results/{result_id}", authMiddleware.Authenticate(testRunHandler.GetResultDetails)).Methods("GET", "OPTIONS")

	// ===========================================
	// AI DIAGNOSIS
	// ===========================================
	api.HandleFunc("/results/{result_id}/diagnose", authMiddleware.Authenticate(diagnosisHandler.DiagnoseResult)).Methods("POST", "OPTIONS")
	api.HandleFunc("/results/{result_id}/diagnosis", authMiddleware.Authenticate(diagnosisHandler.GetDiagnosis)).Methods("GET", "OPTIONS")
	// AI Diagnosis history (all diagnoses across the user's runs) + delete one / clear all
	api.HandleFunc("/diagnosis/history", authMiddleware.Authenticate(diagnosisHandler.GetDiagnosisHistory)).Methods("GET", "OPTIONS")
	api.HandleFunc("/diagnosis/history", authMiddleware.Authenticate(diagnosisHandler.ClearDiagnosisHistory)).Methods("DELETE", "OPTIONS")
	api.HandleFunc("/diagnosis/{id}", authMiddleware.Authenticate(diagnosisHandler.DeleteDiagnosis)).Methods("DELETE", "OPTIONS")

	// ===========================================
	// VISUAL REGRESSION
	// ===========================================
	api.HandleFunc("/visual-regression/compare", authMiddleware.Authenticate(visualRegressionHandler.Compare)).Methods("POST", "OPTIONS")
	api.HandleFunc("/visual-regression/comparison/{result_id}", authMiddleware.Authenticate(visualRegressionHandler.GetComparison)).Methods("GET", "OPTIONS")
	// Public image route: <img> tags cannot send Authorization headers (same pattern as /screenshots/:id).
	// Path whitelist in ServeImage prevents arbitrary file access.
	api.HandleFunc("/visual-regression/image", visualRegressionHandler.ServeImage).Methods("GET", "HEAD", "OPTIONS")
	api.HandleFunc("/visual-regression/health", authMiddleware.Authenticate(visualRegressionHandler.Health)).Methods("GET", "OPTIONS")
	api.HandleFunc("/visual-regression/history", authMiddleware.Authenticate(visualRegressionHandler.GetHistory)).Methods("GET", "OPTIONS")
	api.HandleFunc("/visual-regression/history", authMiddleware.Authenticate(visualRegressionHandler.ClearHistory)).Methods("DELETE", "OPTIONS")
	api.HandleFunc("/visual-regression/comparison/{id}", authMiddleware.Authenticate(visualRegressionHandler.DeleteComparison)).Methods("DELETE", "OPTIONS")
	api.HandleFunc("/visual-regression/approve-baseline", authMiddleware.Authenticate(visualRegressionHandler.ApproveBaseline)).Methods("POST", "OPTIONS")
	api.HandleFunc("/visual-regression/promote-baseline", authMiddleware.Authenticate(visualRegressionHandler.PromoteBaseline)).Methods("POST", "OPTIONS")
	api.HandleFunc("/visual-regression/promote-all-baselines", authMiddleware.Authenticate(visualRegressionHandler.PromoteAllBaselines)).Methods("POST", "OPTIONS")
	// Background VRT job: trigger/re-run, live progress, per-run comparison list.
	api.HandleFunc("/runs/{run_id}/visual-regression", authMiddleware.Authenticate(vrtHandler.TriggerRun)).Methods("POST", "OPTIONS")
	api.HandleFunc("/runs/{run_id}/visual-regression", authMiddleware.Authenticate(vrtHandler.GetStatus)).Methods("GET", "OPTIONS")
	api.HandleFunc("/runs/{run_id}/visual-regression", authMiddleware.Authenticate(vrtHandler.DeleteHistory)).Methods("DELETE", "OPTIONS")
	api.HandleFunc("/runs/{run_id}/visual-regression/comparisons", authMiddleware.Authenticate(vrtHandler.GetComparisons)).Methods("GET", "OPTIONS")

	// ===========================================
	// ARTIFACTS - Screenshots, Videos, Logs by run_id
	// ===========================================
	api.HandleFunc("/runs/{run_id}/screenshots", artifactsHandler.GetRunScreenshots).Methods("GET", "OPTIONS")
	api.HandleFunc("/runs/{run_id}/logs", artifactsHandler.GetRunLogs).Methods("GET", "OPTIONS")
	api.HandleFunc("/runs/{run_id}/videos", artifactsHandler.GetRunVideos).Methods("GET", "OPTIONS")

	// Create artifact routes - for runner to submit test artifacts
	api.HandleFunc("/artifacts/screenshots", artifactsHandler.CreateScreenshot).Methods("POST", "OPTIONS")
	api.HandleFunc("/artifacts/logs", artifactsHandler.CreateLog).Methods("POST", "OPTIONS")
	api.HandleFunc("/artifacts/videos", artifactsHandler.CreateVideo).Methods("POST", "OPTIONS")

	// Serve binary data - screenshots as images, videos as streams
	api.HandleFunc("/screenshots/{id}", artifactsHandler.ServeScreenshotImage).Methods("GET", "HEAD", "OPTIONS")
	api.HandleFunc("/videos/{id}", artifactsHandler.ServeVideoStream).Methods("GET", "HEAD", "OPTIONS")

	// ==================================================
	// CORS CONFIGURATION
	// ==================================================
	c := cors.New(cors.Options{
		AllowedOrigins:   []string{"http://localhost", "http://localhost:80", "http://localhost:5173", "http://localhost:3000", "http://localhost:3456", "http://localhost:3457"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Content-Type", "Authorization"},
		AllowCredentials: true,
	})

	handler := c.Handler(router)

	// ==================================================
	// START SERVER
	// ==================================================
	log.Printf("Server starting on port %s", port)
	log.Println("Endpoints available:")
	log.Println("GET /health")
	log.Println("POST /api/users/signup")
	log.Println("POST /api/auth/login")
	log.Println("POST /api/auth/google")
	log.Println("GET /api/auth/me")
	log.Println("")
	log.Println(" === Test Suites ===")
	log.Println("GET /api/suites")
	log.Println("POST /api/suites")
	log.Println("GET /api/suites/:suite_id")
	log.Println("PUT /api/suites/:suite_id")
	log.Println("DELETE /api/suites/:suite_id")
	log.Println("POST /api/suites/run (create and run)")
	log.Println("")
	log.Println(" === Test Cases ===")
	log.Println("GET /api/suites/:suite_id/test-cases")
	log.Println("POST /api/suites/:suite_id/test-cases")
	log.Println("GET /api/test-cases/:test_case_id")
	log.Println("PUT /api/test-cases/:test_case_id")
	log.Println("DELETE /api/test-cases/:test_case_id")
	log.Println("")
	log.Println(" === Test Runs ===")
	log.Println("GET /api/runs")
	log.Println("GET /api/suites/:suite_id/runs")
	log.Println("POST /api/suites/:suite_id/run")
	log.Println("GET /api/runs/:run_id")
	log.Println("GET /api/results/:result_id")
	log.Println("")
	log.Println(" === Artifacts ===")
	log.Println("GET /api/runs/:run_id/screenshots")
	log.Println("GET /api/runs/:run_id/logs")
	log.Println("GET /api/runs/:run_id/videos")
	log.Println("POST /api/artifacts/screenshots")
	log.Println("POST /api/artifacts/logs")
	log.Println("POST /api/artifacts/videos")
	log.Println("GET /api/screenshots/:id")
	log.Println("GET /api/videos/:id")
	log.Println("")
	log.Println(" === Visual Regression ===")
	log.Println("POST /api/visual-regression/compare")
	log.Println("GET /api/visual-regression/comparison/:result_id")
	log.Println("GET /api/visual-regression/image")
	log.Println("GET /api/visual-regression/health")
	log.Println("GET /api/visual-regression/history")
	log.Println("POST /api/visual-regression/approve-baseline")

	if err := http.ListenAndServe(":"+port, handler); err != nil {
		log.Fatal("Server failed to start:", err)
	}
}
