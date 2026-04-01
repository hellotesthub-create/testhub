# THEX - Test Automation Platform

THEX is a comprehensive test automation platform for executing Selenium-based test scripts (Python and Java) with parallel execution, video recording, step-by-step screenshots, and detailed reporting. It features JWT authentication, role-based access control, and a React-based frontend for managing test suites and viewing results.

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Architecture](#architecture)
3. [Technologies Used](#technologies-used)
4. [Prerequisites](#prerequisites)
5. [Setup Instructions](#setup-instructions)
6. [Running the System](#running-the-system)
7. [Test Execution Flow](#test-execution-flow)
8. [Writing Test Scripts](#writing-test-scripts)
9. [Authentication](#authentication)
10. [API Reference](#api-reference)
11. [Database Schema](#database-schema)
12. [Folder Structure](#folder-structure)
13. [Artifact Storage](#artifact-storage)
14. [Configuration Reference](#configuration-reference)
15. [Troubleshooting](#troubleshooting)
16. [Security Notes](#security-notes)

---

## Project Overview

THEX provides an end-to-end test automation workflow:

- **Test Upload**: Users upload Python or Java test scripts through the web interface.
- **Parallel Execution**: Tests execute in parallel across a Selenium Grid with multiple browser nodes (Chrome and Firefox).
- **Video Recording**: Each test execution is recorded as an MP4 video using ffmpeg inside the Selenium Grid node containers.
- **Step Screenshots**: Screenshots are captured at each meaningful step during test execution.
- **Humanized Interaction**: Form inputs are typed character-by-character with randomized delays to simulate real user behavior.
- **Artifact Storage**: Screenshots are stored as base64 in MongoDB; videos are stored in GridFS.
- **Reporting**: Test results, logs, screenshots, and videos are accessible through the frontend with drill-down from suite to individual test to artifacts.

### Key Features

- Multi-language support: Python and Java test scripts
- Parallel test execution with configurable browser matrix
- Live test status tracking (pending, running, completed, failed, cancelled, timeout)
- JWT-based authentication with optional Google OAuth
- Role-based access control (Admin and Tester roles)
- Remember Me functionality with localStorage/sessionStorage
- Binary artifact serving (screenshots and video streaming)
- Docker-based isolation for reproducible test environments

---

## Architecture

```
                           +-------------------+
                           |   React Frontend  |
                           |   (Vite, port     |
                           |    3456)          |
                           +--------+----------+
                                    |
                                    | HTTP/REST
                                    v
                           +-------------------+
                           |   Go Backend API  |
                           |   (port 8080)     |
                           +---+----------+----+
                               |          |
                    +----------+          +----------+
                    v                                v
           +----------------+              +------------------+
           |    MongoDB     |              | Docker Engine    |
           |  (port 27017)  |              | (docker.sock)    |
           +----------------+              +--------+---------+
                                                    |
                                        +-----------+-----------+
                                        |                       |
                                +-------v-------+    +----------v----------+
                                | Runner        |    | Selenium Grid Hub   |
                                | Container     |    | (port 4444)         |
                                | (per test     |    +-----+----------+----+
                                |  run)         |          |          |
                                +---------------+    +-----v----+ +---v------+
                                                     | Chrome   | | Firefox  |
                                                     | Nodes x6 | | Nodes x6 |
                                                     +----------+ +----------+
```

### Component Roles

- **Frontend**: React + TypeScript SPA for test management, result viewing, and user administration.
- **Backend**: Go REST API handling authentication, test suite CRUD, runner orchestration, and artifact serving.
- **Runner**: Python-based test executor packaged as a Docker image (`thex_runner:latest`). Spawned per test run. Supports both Python and Java test execution with video recording and screenshot capture.
- **Selenium Grid**: Hub + Node architecture. The Hub (port 4444) routes browser requests to Chrome or Firefox nodes based on capabilities.
- **MongoDB**: Stores users, test suites, test results, screenshots (base64), videos (GridFS), and logs.

### Docker Networks

- `testops-db-network`: Connects the backend to MongoDB.
- `thex_testops-network`: Connects the runner containers to the Selenium Grid Hub and nodes.
- Runner containers are connected to both networks at creation time.

---

## Technologies Used

### Frontend
- React 18 with TypeScript
- Vite (build tool and dev server)
- Wouter (client-side routing)
- Tailwind CSS with shadcn/ui components
- @react-oauth/google (Google Sign-In)

### Backend
- Go 1.24
- Gorilla Mux (HTTP routing)
- golang-jwt/jwt/v5 (JWT authentication)
- MongoDB Go Driver
- Docker SDK (runner container management)

### Runner
- Python 3.11
- Selenium WebDriver 4.16
- OpenJDK 21 (Java test support)
- Maven (Java dependency resolution at build time)
- ffmpeg (video recording inside Selenium containers)

### Infrastructure
- Docker and Docker Compose
- MongoDB 7
- Selenium Grid 4 (Hub + Chrome/Firefox nodes)
- Mongo Express (database admin UI)

---

## Prerequisites

Install the following before setting up the project:

| Tool             | Minimum Version | Verify Command             |
|------------------|-----------------|----------------------------|
| Docker           | 20.10+          | `docker --version`         |
| Docker Compose   | 2.0+            | `docker-compose --version` |
| Node.js          | 18+             | `node --version`           |
| npm              | 9+              | `npm --version`            |
| Go               | 1.24+           | `go version`               |
| Git              | 2.0+            | `git --version`            |

---

## Setup Instructions

### 1. Clone the Repository

```bash
git clone <REPOSITORY_URL>
cd THEX
```

### 2. Start the Database

```bash
cd database-microservice
./start-db.sh
cd ..
```

Wait 10-15 seconds for MongoDB to initialize.

Verify:
```bash
docker ps | grep testops-mongo
```

### 3. Start the Selenium Grid

```bash
docker-compose up -d --scale chrome-node=6 --scale firefox-node=6 --no-build selenium-hub chrome-node firefox-node
```

This starts the Selenium Hub on port 4444 with 6 Chrome nodes and 6 Firefox nodes (12 parallel slots).

### 4. Build the Runner Image

```bash
docker build -t thex_runner:latest ./runner
```

This builds the runner Docker image with Python, Java (JDK 21), all Selenium JARs (resolved via Maven), and the BaseTest helper class.

### 5. Build and Start the Backend

```bash
cd backend
go build -o api ./cmd/api/
```

Set the required environment variables (see [Configuration Reference](#configuration-reference)), then start:

```bash
MONGO_URI="mongodb://admin:admin123@localhost:27017/testops?authSource=admin" \
PORT=8080 \
TESTSCRIPTS_DIR="/home/<user>/Downloads/THEX-1/THEX/runner/testscripts" \
RUNNER_DIR="/home/<user>/Downloads/THEX-1/THEX/runner" \
HOST_PROJECT_PATH="/home/<user>/Downloads/THEX-1/THEX" \
JWT_SECRET="thex-secret-key-2024" \
BACKEND_INTERNAL_URL="http://testops-backend-api:8080/api" \
./api &
```

Replace `<user>` with your system username.

### 6. Install and Start the Frontend

```bash
cd Frontend
npm install
npx vite --port 3456 --host
```

### 7. Verify the Setup

| Service         | URL                      | Expected Response                     |
|-----------------|--------------------------|---------------------------------------|
| Frontend        | http://localhost:3456     | Landing page                          |
| Backend API     | http://localhost:8080     | `OK` or API info                      |
| Mongo Express   | http://localhost:8081     | Login page (admin / pass)             |
| Selenium Grid   | http://localhost:4444     | Grid console showing nodes            |

---

## Running the System

### Start All Services (After Initial Setup)

```bash
# 1. Database
cd database-microservice && ./start-db.sh && cd ..

# 2. Selenium Grid (12 nodes)
docker-compose up -d --scale chrome-node=6 --scale firefox-node=6 --no-build selenium-hub chrome-node firefox-node

# 3. Backend (native process)
cd backend && ./api &

# 4. Frontend
cd Frontend && npx vite --port 3456 --host &
```

### Stop All Services

```bash
# Frontend: Ctrl+C or kill the process

# Backend:
kill $(pgrep -f "./api")

# Selenium Grid:
docker-compose down

# Database:
cd database-microservice && ./stop-db.sh
```

### Ports Used

| Port  | Service        |
|-------|----------------|
| 3456  | Frontend       |
| 8080  | Backend API    |
| 27017 | MongoDB        |
| 8081  | Mongo Express  |
| 4444  | Selenium Hub   |

---

## Test Execution Flow

### End-to-End Flow

1. **User** opens the frontend and navigates to the Test Lab page.
2. **User** selects a language (Python, Java, or Both), uploads test scripts, chooses browsers, and clicks Run.
3. **Frontend** sends a `POST /api/suites/run` request with the test files, browser selection, and language as multipart form data. The JWT token is included in the Authorization header.
4. **Backend** authenticates the user via JWT, creates a test suite record in MongoDB with status `pending`, saves uploaded test files to the testscripts directory, and spawns a Docker runner container.
5. **Runner Container** is created with connections to both Docker networks, mounts for docker.sock, testscripts, output directories, and environment variables for MongoDB and Selenium Hub.
6. **Runner** discovers test files based on language and iterates over each test/browser combination using a thread pool for parallel execution.
7. **For Python tests**: The runner creates a BrowserManager (which opens a RemoteWebDriver session via Selenium Hub), starts video recording (using the session ID to find the Grid node container and running ffmpeg inside it), loads and executes the test module, captures screenshots, stops recording, and saves all artifacts to MongoDB.
8. **For Java tests**: The runner compiles the Java source file, launches `java com.thex.BaseTest <ClassName> <browser> <hubUrl> <screenshotsDir>` via subprocess.Popen, reads stdout line-by-line to capture the session ID printed by BaseTest, starts video recording using that session ID, waits for the Java process to complete, stops recording, and saves all artifacts to MongoDB.
9. **Backend** monitors the runner container via goroutine (docker logs), updates the suite status to `completed` or `failed`, and calculates final statistics.
10. **Frontend** polls for results and displays test outcomes with screenshots, videos, and logs.

### Video Recording Mechanism

1. When a test starts, the runner captures the WebDriver session ID.
2. The VideoRecorder queries the Selenium Grid Hub `/status` API to find which node is running that session.
3. The node's IP address is resolved to a Docker container ID via `docker inspect`.
4. ffmpeg is started inside that container: `docker exec -d <container> ffmpeg -f x11grab -i :99.0 -c:v libx264 -preset ultrafast /videos/<filename>.mp4`.
5. When the test finishes, the specific ffmpeg process is killed by PID, and the video file is saved to MongoDB GridFS.

### Humanized Input

Both Python and Java test scripts use character-by-character typing with random delays:
- Each keystroke: 50-150ms delay
- Small pause after typing: 200-400ms
- Human-like pauses between actions: 300-2500ms depending on context

---

## Writing Test Scripts

### Python Test Scripts

Test scripts must:
- Have a filename starting with `test_` or ending with `_test.py`
- Implement a `run_test(driver)` function
- Return `True` for pass, `False` for fail
- The `driver` parameter is a Selenium WebDriver instance already connected to the Grid

```python
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
import time
import random
import os
from datetime import datetime


def human_type(element, text):
    """Type text with human-like delays."""
    for char in text:
        element.send_keys(char)
        time.sleep(random.uniform(0.05, 0.15))
    time.sleep(random.uniform(0.2, 0.4))


def capture_step(driver, step_name):
    """Capture a step screenshot."""
    screenshots_dir = os.environ.get("SCREENSHOTS_DIR", "/app/output/screenshots")
    os.makedirs(screenshots_dir, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"step_{step_name}_{timestamp}.png"
    driver.save_screenshot(os.path.join(screenshots_dir, filename))


def run_test(driver):
    try:
        driver.get("https://www.example.com")
        WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.TAG_NAME, "h1"))
        )
        capture_step(driver, "page_loaded")
        assert "Example" in driver.title
        return True
    except Exception as e:
        print(f"Test failed: {e}")
        return False
```

### Java Test Scripts

Test scripts must:
- Define a public class with a `public boolean runTest(WebDriver driver)` method
- Return `true` for pass, `false` for fail
- The `driver` parameter is a Selenium WebDriver instance already connected to the Grid

Available helper methods from `com.thex.BaseTest`:
- `BaseTest.humanType(element, text)` -- Types with human-like delays (50-150ms per character)
- `BaseTest.captureStep(driver, stepName)` -- Captures a numbered step screenshot
- `BaseTest.smallPause()` -- 300-600ms delay
- `BaseTest.mediumPause()` -- 800-1500ms delay
- `BaseTest.longPause()` -- 1500-2500ms delay

```java
import org.openqa.selenium.By;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.support.ui.WebDriverWait;
import org.openqa.selenium.support.ui.ExpectedConditions;
import com.thex.BaseTest;
import java.time.Duration;

public class MyTest {
    public boolean runTest(WebDriver driver) {
        try {
            driver.get("https://www.example.com");
            WebDriverWait wait = new WebDriverWait(driver, Duration.ofSeconds(10));
            wait.until(ExpectedConditions.presenceOfElementLocated(By.tagName("h1")));
            BaseTest.captureStep(driver, "page_loaded");
            BaseTest.longPause();
            return true;
        } catch (Exception e) {
            System.out.println("Test failed: " + e.getMessage());
            return false;
        }
    }
}
```

---

## Authentication

THEX uses JWT-based authentication with 24-hour token expiration.

### Authentication Flows

1. **Email/Password Signup**: User creates an account. Returns JWT token and user data.
2. **Email/Password Login**: Validates credentials. Returns JWT token.
3. **Google OAuth Signup** (optional): New users sign up with Google. Requires Google Cloud Console configuration.
4. **Google OAuth Login** (optional): Existing users log in with Google.

### Remember Me

- Checked: Token stored in `localStorage` (persists after browser close).
- Unchecked: Token stored in `sessionStorage` (cleared when browser closes).
- Google OAuth: Always uses `localStorage`.

### JWT Token Structure

Claims include: `user_id`, `email`, `username`, `role`, `iss`, `exp`, `iat`.

### Google OAuth Configuration (Optional)

Google Sign-In buttons will not work without configuration. To enable:

1. Go to [Google Cloud Console](https://console.cloud.google.com/).
2. Create a project and enable the Google+ API.
3. Create an OAuth 2.0 Client ID (Web application type).
4. Set authorized JavaScript origins to `http://localhost:3456`.
5. Set authorized redirect URIs to `http://localhost:3456`.
6. Copy the Client ID and update `Frontend/src/main.tsx`:
   ```typescript
   <GoogleOAuthProvider clientId="YOUR_CLIENT_ID_HERE">
   ```
7. Restart the frontend.

Email/password authentication works without any additional configuration.

---

## API Reference

### Public Endpoints

| Method | Endpoint                          | Description                          |
|--------|-----------------------------------|--------------------------------------|
| POST   | `/api/users/signup`               | Email/password signup                |
| POST   | `/api/auth/login`                 | Email/password login                 |
| POST   | `/api/auth/google/signup`         | Google OAuth signup                  |
| POST   | `/api/auth/google/login`          | Google OAuth login                   |
| POST   | `/api/auth/google/verify-password`| Verify password for Google login     |
| POST   | `/api/users/set-password`         | Set password for Google OAuth users  |
| GET    | `/api/screenshots/{id}`           | Serve screenshot image (PNG)         |
| GET    | `/api/videos/{id}`                | Stream video file (MP4)              |

### Protected Endpoints (Require JWT Bearer Token)

| Method | Endpoint                          | Description                              |
|--------|-----------------------------------|------------------------------------------|
| GET    | `/api/auth/me`                    | Get current user info                    |
| GET    | `/api/users`                      | List all users (admin only)              |
| POST   | `/api/suites/run`                 | Create and run a test suite              |
| GET    | `/api/suites`                     | List user's test suites                  |
| GET    | `/api/suites/{suite_id}`          | Get suite details with artifacts         |
| POST   | `/api/suites/{suite_id}/run`      | Trigger a run for an existing suite      |
| GET    | `/api/runs`                       | List user's test runs                    |
| GET    | `/api/suites/{suite_id}/runs`     | List runs for a suite                    |
| GET    | `/api/runs/{run_id}`              | Get run details (results, artifacts)     |
| GET    | `/api/runs/{run_id}/screenshots`  | Get screenshots for a run                |
| GET    | `/api/runs/{run_id}/logs`         | Get logs for a run                       |
| GET    | `/api/runs/{run_id}/videos`       | Get videos for a run                     |

### Create and Run Suite (POST /api/suites/run)

Multipart form data:
- `suite_name` (string, required): Name of the test suite.
- `browser` (string): Browser to use (`chrome`, `firefox`).
- `language` (string): Script language (`python`, `java`, `both`). Defaults to `python`.
- `test_files` (file, repeatable): One or more test script files.

---

## Database Schema

Database: `testops` (MongoDB)

### Collections

**users**
```
{
  _id: ObjectId,
  username: String (unique),
  email: String (unique),
  password: String,
  role: "admin" | "tester",
  picture: String (optional),
  created_at: Date,
  updated_at: Date
}
```

**test_suites**
```
{
  _id: ObjectId,
  suite_id: String,
  suite_name: String,
  user_id: ObjectId,
  email: String,
  username: String,
  test_scripts: [{ filename, content, uploaded_at }],
  browsers: [String],
  status: "pending" | "running" | "completed" | "failed" | "cancelled" | "timeout",
  total_tests: Number,
  passed: Number,
  failed: Number,
  created_at: Date,
  started_at: Date,
  finished_at: Date,
  updated_at: Date
}
```

**test_results**
```
{
  _id: ObjectId,
  run_id_string: String,
  test_name: String,
  browser: String,
  status: "PASSED" | "FAILED",
  duration_seconds: Number,
  start_time: Date,
  end_time: Date,
  error_message: String
}
```

**screenshots**
```
{
  _id: ObjectId,
  run_id_string: String,
  test_name: String,
  browser: String,
  name: String,
  filename: String,
  filepath: String,
  step: String,
  image_data: String (base64),
  content_type: "image/png",
  datetime: Date
}
```

**videos**
```
{
  _id: ObjectId,
  run_id_string: String,
  test_name: String,
  browser: String,
  name: String,
  filename: String,
  filepath: String,
  duration_seconds: Number,
  gridfs_id: String,
  datetime: Date
}
```

**logs**
```
{
  _id: ObjectId,
  run_id_string: String,
  test_name: String,
  browser: String,
  message: String,
  level: "info" | "error" | "warning",
  datetime: Date
}
```

### Indexes

- `users`: unique on `email`, unique on `username`
- `test_suites`: on `email`, `user_id`, `status`, compound `{user_id: 1, created_at: -1}`
- `test_results`: on `run_id_string`, `email`, `user_id`
- `screenshots`: on `run_id_string`
- `videos`: on `run_id_string`
- `logs`: on `run_id_string`

---

## Folder Structure

```
THEX/
|-- PROJECT.md                          # This documentation file
|-- LICENSE
|-- docker-compose.yml                  # Selenium Grid services
|
|-- Frontend/                           # React + TypeScript frontend
|   |-- src/
|   |   |-- pages/                      # Page components (auth, dashboard, test-lab, etc.)
|   |   |-- components/                 # Reusable UI components
|   |   |-- lib/                        # Auth context, API config, utilities
|   |   |-- hooks/                      # Custom React hooks
|   |   |-- App.tsx                     # Main app with routing
|   |   +-- main.tsx                    # Entry point with providers
|   |-- package.json
|   |-- vite.config.ts
|   +-- tsconfig.json
|
|-- backend/                            # Go backend API
|   |-- cmd/api/
|   |   +-- main.go                     # Entry point, route registration
|   |-- internal/
|   |   |-- handlers/                   # HTTP request handlers
|   |   |-- services/                   # Business logic (JWT, auth, runner)
|   |   |-- middleware/                 # Auth middleware
|   |   |-- models/                     # Data models
|   |   |-- repository/                # MongoDB data access layer
|   |   |-- storage/                   # File storage utilities
|   |   +-- utils/                     # Helper utilities
|   |-- pkg/errors/                    # Custom error types
|   |-- go.mod
|   |-- docker-compose.yml             # Backend Docker config
|   +-- Dockerfile
|
|-- runner/                             # Test runner (Docker image)
|   |-- Dockerfile                      # Python 3.11 + JDK 21 + Maven + Chrome
|   |-- requirements.txt               # Python dependencies
|   |-- java/com/thex/
|   |   +-- BaseTest.java              # Java test helper (humanType, captureStep, etc.)
|   |-- src/
|   |   |-- runner.py                   # Main test execution engine
|   |   |-- browser_manager.py          # Selenium WebDriver management
|   |   |-- video_recorder.py           # ffmpeg-based video recording
|   |   |-- screenshot.py              # Screenshot capture utilities
|   |   |-- database_service.py        # MongoDB integration for artifacts
|   |   |-- database_log_handler.py    # Log handler for DB storage
|   |   |-- api_client.py             # Backend API client
|   |   |-- result_uploader.py         # Result upload to backend
|   |   +-- logger.py                  # Logging configuration
|   |-- testscripts/                   # User test scripts directory
|   |   |-- test_swagLabs.py           # Example Python test
|   |   +-- javaScripts/
|   |       +-- DemoQAFormTest.java    # Example Java test
|   +-- output/
|       |-- reports/                   # Generated HTML/JSON reports
|       |-- screenshots/               # Test screenshots
|       +-- videos/                    # Test video recordings
|
|-- database-microservice/             # MongoDB setup
|   |-- docker-compose.yml
|   |-- init-mongo.js                  # Database initialization and indexes
|   |-- start-db.sh
|   |-- stop-db.sh
|   |-- check-db.sh
|   +-- restart-db.sh
|
|-- database/postgres/                 # PostgreSQL init scripts (alternative)
|   +-- init.sql/
|
+-- docker/                            # Additional Dockerfiles
    |-- backend.Dockerfile
    |-- gateway.Dockerfile
    |-- mongo.Dockerfile
    |-- redis.Dockerfile
    +-- runner.Dockerfile
```

---

## Artifact Storage

### Screenshots

- Stored as base64-encoded strings in regular MongoDB documents.
- Typical size: 100-500 KB per screenshot.
- Served via `GET /api/screenshots/{id}` which decodes base64 and returns `image/png`.

### Videos

- Stored in MongoDB GridFS (designed for large binary files).
- Typical size: 0.5-10 MB per video.
- Streamed via `GET /api/videos/{id}` which reads from GridFS and returns `video/mp4`.
- Videos are recorded inside Selenium Grid node containers using ffmpeg with x11grab (capturing the Xvfb virtual display).

### Logs

- Stored as text documents in the `logs` collection.
- Captured from runner container stdout/stderr via `docker logs -f`.

---

## Configuration Reference

### Backend Environment Variables

| Variable              | Description                                          | Example                                                    |
|-----------------------|------------------------------------------------------|------------------------------------------------------------|
| `MONGO_URI`           | MongoDB connection string                            | `mongodb://admin:admin123@localhost:27017/testops?authSource=admin` |
| `PORT`                | Backend HTTP port                                    | `8080`                                                     |
| `JWT_SECRET`          | Secret key for JWT signing                           | `thex-secret-key-2024`                                     |
| `TESTSCRIPTS_DIR`     | Host path to testscripts directory                   | `/home/user/THEX/runner/testscripts`                       |
| `RUNNER_DIR`          | Host path to runner directory                        | `/home/user/THEX/runner`                                   |
| `HOST_PROJECT_PATH`   | Host path to project root                            | `/home/user/THEX`                                          |
| `BACKEND_INTERNAL_URL`| Internal URL for backend (used by runner containers) | `http://testops-backend-api:8080/api`                      |

### Runner Environment Variables (Set in Container)

| Variable              | Description                      | Default                       |
|-----------------------|----------------------------------|-------------------------------|
| `SELENIUM_HUB_URL`   | Selenium Grid Hub URL            | `http://selenium-hub:4444`    |
| `MONGO_HOST`          | MongoDB hostname                 | `testops-mongo`               |
| `MONGO_PORT`          | MongoDB port                     | `27017`                       |
| `MONGO_DATABASE`      | MongoDB database name            | `testops`                     |
| `MONGO_USERNAME`      | MongoDB username                 | `admin`                       |
| `MONGO_PASSWORD`      | MongoDB password                 | `admin123`                    |
| `JAVA_LIBS_DIR`       | Path to Java library JARs        | `/app/java-libs`              |
| `PYTHONUNBUFFERED`    | Disable Python output buffering  | `1`                           |

### Default Credentials

| Service        | Username | Password   |
|----------------|----------|------------|
| MongoDB        | admin    | admin123   |
| Mongo Express  | admin    | pass       |

---

## Troubleshooting

### Backend fails to start or shows "Error connecting to MongoDB"

Ensure the database is running first:
```bash
cd database-microservice && ./start-db.sh
```
Wait 10-15 seconds for MongoDB to initialize before starting the backend.

### Frontend shows "Network Error"

The backend is not running. Start it and verify with:
```bash
curl http://localhost:8080/api/health
```

### "Port already in use"

Find and kill the process using the port:
```bash
lsof -i :8080
kill -9 <PID>
```

Or stop all Docker containers:
```bash
docker stop $(docker ps -aq)
```

### npm install fails with ERESOLVE error

```bash
npm cache clean --force
rm -rf node_modules package-lock.json
npm install --legacy-peer-deps
```

### Google OAuth shows "Invalid Client ID"

This is expected if Google OAuth has not been configured. Use email/password authentication, or follow the [Google OAuth Configuration](#google-oauth-configuration-optional) steps.

### Tests not discovered by the runner

- Python: Ensure filenames start with `test_` or end with `_test.py` and contain a `run_test(driver)` function.
- Java: Ensure the file contains a public class with a `public boolean runTest(WebDriver driver)` method.

### Runner container fails to connect to Selenium Grid

Verify the Selenium Grid is running:
```bash
docker ps | grep selenium
```
Ensure nodes are available:
```bash
curl http://localhost:4444/status
```

### Video recording not working

- Verify ffmpeg is available inside Selenium node containers.
- Check that the runner container has access to docker.sock.
- Verify the Selenium Grid `/status` API returns node information with active sessions.

### Database UI (Mongo Express) does not show data

Refresh the page. Alternatively, query MongoDB directly:
```bash
docker exec testops-mongo mongosh -u admin -p admin123 --authenticationDatabase admin --eval "use testops" --eval "db.users.find().pretty()"
```

---

## Security Notes

This project is configured for **development use only**. Before deploying to production:

- Implement password hashing (bcrypt or argon2). Passwords are currently stored in plain text.
- Use environment-specific configuration files. Do not commit credentials to version control.
- Enable HTTPS with TLS certificates.
- Use strong, unique passwords for all services.
- Configure CORS to allow only trusted origins.
- Add rate limiting to authentication endpoints.
- Implement JWT secret rotation.
- Restrict artifact endpoints with authentication if needed.
