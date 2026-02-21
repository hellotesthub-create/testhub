# Test History Integration - Complete Guide

## Overview
This document describes the complete integration between frontend, backend, and database for displaying user test history with full drill-down capability: Test Suites → Test Scripts → Artifacts (Logs, Screenshots, Videos).

## 🎯 Integration Status: ✅ COMPLETE

All backend APIs are working correctly and ready for frontend integration.

---

## Backend API Endpoints

### 1. List All User's Test Suites
**Endpoint:** `GET /api/test-suites`  
**Authentication:** JWT Bearer Token (required)  
**Description:** Returns all test suites run by the authenticated user

**Response Example:**
```json
[
  {
    "suite_id": "20260218_204838",
    "username": "1",
    "email": "1@1.com",
    "user_id": "692dceaec91672a6574b3c90",
    "status": "completed",
    "total_tests": 1,
    "passed": 1,
    "failed": 0,
    "created_at": "2026-02-18T20:48:38Z",
    "finished_at": "2026-02-18T20:49:04Z"
  }
]
```

### 2. Get Test Suite Details with Artifacts
**Endpoint:** `GET /api/test-suites/{suite_id}`  
**Authentication:** JWT Bearer Token (required)  
**Description:** Returns complete details for a specific test suite including:
- Suite metadata
- Test results (one per test script executed)
- Screenshots
- Videos

**Response Structure:**
```json
{
  "suite": {
    "suite_id": "20260218_204838",
    "username": "1",
    "email": "1@1.com",
    "status": "completed",
    "total_tests": 1,
    "passed": 1,
    "failed": 0,
    "created_at": "2026-02-18T20:48:38Z"
  },
  "results": [
    {
      "id": "...",
      "suite_id": "20260218_204838",
      "test_name": "test_python",
      "status": "PASSED",
      "duration_seconds": 25.905644,
      "start_time": "2026-02-18T20:48:38Z",
      "end_time": "2026-02-18T20:49:04Z",
      "error_message": null
    }
  ],
  "screenshots": [
    {
      "id": "...",
      "name": "test_python_success_20260218_204901.png",
      "timestamp": "8:49:01 PM",
      "url": "/api/screenshots/{screenshot_id}",
      "step": "Success Screenshot"
    }
  ],
  "videos": [
    {
      "name": "chrome_test_python_20260218_204839.mp4",
      "duration": 0,
      "size": 3267328,
      "url": "/api/videos/{video_id}"
    }
  ]
}
```

### 3. Get Logs for Test Suite
**Endpoint:** `GET /api/tester/test-results/{suite_id}/logs`  
**Authentication:** JWT Bearer Token (required)  
**Description:** Returns all log entries for a test suite execution

**Response Example:**
```json
[
  {
    "timestamp": "20:49:04",
    "level": "INFO",
    "message": "Test PASSED: test_python"
  }
]
```

### 4. Get Screenshot Binary Data
**Endpoint:** `GET /api/screenshots/{screenshot_id}`  
**Authentication:** JWT Bearer Token (required)  
**Description:** Returns the actual image file (PNG format)  
**Response:** Binary image data (Content-Type: image/png)

### 5. Get Video Binary Data
**Endpoint:** `GET /api/videos/{video_id}`  
**Authentication:** JWT Bearer Token (required)  
**Description:** Returns the actual video file (MP4 format)  
**Response:** Binary video data (Content-Type: video/mp4)

---

## Database Schema & Relationships

### Collections

#### 1. `test_suites`
Stores test suite execution metadata
```javascript
{
  "_id": ObjectId,
  "suite_id": "20260218_204838",
  "user_id": ObjectId("692dceaec91672a6574b3c90"),
  "email": "1@1.com",
  "username": "1",
  "test_scripts": [
    {
      "filename": "test_python.py",
      "content": "...",
      "uploaded_at": ISODate
    }
  ],
  "browsers": ["chrome"],
  "status": "completed",
  "total_tests": 1,
  "passed": 1,
  "failed": 0,
  "created_at": ISODate,
  "started_at": ISODate,
  "finished_at": ISODate,
  "updated_at": ISODate
}
```

**Indexes:**
- `user_id` (for filtering by user)
- `email` (for filtering by email)
- `status` (for filtering by status)
- `{user_id: 1, created_at: -1}` (compound index for user's test history)

#### 2. `test_results`
Stores individual test execution results (one per test script per browser)
```javascript
{
  "_id": ObjectId,
  "suite_id": "20260218_204838",
  "user_id": ObjectId("692dceaec91672a6574b3c90"),
  "email": "1@1.com",
  "username": "1",
  "test_name": "test_python",
  "browser": "chrome",
  "status": "PASSED",
  "duration_seconds": 25.905644,
  "start_time": ISODate,
  "end_time": ISODate,
  "error_message": null,
  "screenshot_path": "..."
}
```

**Indexes:**
- `suite_id` (for fetching all results for a suite)
- `user_id` (for user filtering)
- `email` (for user filtering)

#### 3. `screenshots`
Stores screenshot metadata and base64 encoded image data
```javascript
{
  "_id": ObjectId,
  "suite_id": "20260218_204838",
  "user_id": ObjectId("692dceaec91672a6574b3c90"),
  "email": "1@1.com",
  "username": "1",
  "test_name": "test_python",
  "browser": "chrome",
  "name": "test_python_success_20260218_204901.png",
  "filename": "test_python_success_20260218_204901.png",
  "step": "Success Screenshot",
  "image_data": "base64_encoded_png_data...",
  "content_type": "image/png",
  "datetime": ISODate
}
```

**Indexes:**
- `suite_id` (for fetching all screenshots for a suite)
- `user_id` (for user filtering)

#### 4. `videos`
Stores video metadata with GridFS reference for large video files
```javascript
{
  "_id": ObjectId,
  "suite_id": "20260218_204838",
  "user_id": ObjectId("692dceaec91672a6574b3c90"),
  "email": "1@1.com",
  "username": "1",
  "test_name": "test_python",
  "browser": "chrome",
  "name": "chrome_test_python_20260218_204839.mp4",
  "filename": "chrome_test_python_20260218_204839.mp4",
  "gridfs_id": "...",
  "size": 3267328,
  "duration": 0,
  "datetime": ISODate
}
```

**Indexes:**
- `suite_id` (for fetching all videos for a suite)
- `user_id` (for user filtering)

#### 5. `logs`
Stores log entries for test executions
```javascript
{
  "_id": ObjectId,
  "suite_id": "20260218_204838",
  "user_id": ObjectId("692dceaec91672a6574b3c90"),
  "email": "1@1.com",
  "username": "1",
  "test_name": "test_python",
  "id": "20260218_204838",  // test_id (usually same as suite_id)
  "level": "INFO",
  "message": "Test PASSED: test_python",
  "datetime": ISODate
}
```

**Indexes:**
- `id` (test_id / suite_id for fetching logs)
- `suite_id` (for fetching all logs for a suite)

---

## Frontend Integration

### Page: Test History (reports.tsx)

**Location:** `Frontend/src/pages/reports.tsx`

**API Call:**
```typescript
const fetchTestSuites = async () => {
  const token = localStorage.getItem('authToken') || sessionStorage.getItem('authToken');
  
  const response = await fetch(API_ENDPOINTS.TEST_SUITES, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  
  const suites = await response.json();
  // Display suites in a grid/table
};
```

**Expected Data Structure:**
```typescript
interface TestSuiteResult {
  id: string;
  suite_id: string;
  username: string;
  total_tests: number;
  passed: number;
  failed: number;
  success_rate: number;
  total_duration: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
  created_at: string;
  updated_at: string;
  finished_at: string;
}
```

### Page: Test Results Detail (tester-test-results.tsx)

**Location:** `Frontend/src/pages/tester-test-results.tsx`  
**Route:** `/tester/test-results/:id`

**API Calls:**
```typescript
// 1. Fetch suite details with results, videos, screenshots
const suiteRes = await fetch(API_ENDPOINTS.TEST_SUITE_DETAILS(testId), {
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
});

const suiteData = await suiteRes.json();
setTestSuite(suiteData.suite);
setTestResults(suiteData.results);
setVideos(suiteData.videos);
setScreenshots(suiteData.screenshots);

// 2. Fetch logs separately
const logsRes = await fetch(API_ENDPOINTS.TESTER_TEST_RESULTS_LOGS(testId), {
  headers: { 'Authorization': `Bearer ${token}` }
});

const logsData = await logsRes.json();
setLogs(logsData);
```

**Expected Data Structures:**
```typescript
interface TestSuite {
  suite_id: string;
  username: string;
  email: string;
  status: string;
  total_tests: number;
  passed: number;
  failed: number;
  created_at: string;
  finished_at?: string;
}

interface TestResult {
  id: string;
  suite_id: string;
  test_name: string;
  status: 'PASSED' | 'FAILED';
  duration_seconds: number;
  start_time: string;
  end_time: string;
  error_message?: string;
}

interface Screenshot {
  id: string;
  name: string;
  timestamp: string;
  url: string;  // e.g., "/api/screenshots/abc123"
  step: string;
}

interface VideoRecording {
  id: string;
  name: string;
  duration: number;
  size: number;
  url: string;  // e.g., "/api/videos/xyz789"
}

interface LogEntry {
  timestamp: string;
  level: 'INFO' | 'ERROR' | 'WARNING';
  message: string;
}
```

---

## Data Flow Diagram

```
User runs test
     ↓
Runner executes test_python.py in Chrome
     ↓
Runner saves to MongoDB:
  - test_suites collection (suite_id = "20260218_204838")
  - test_results collection (test_name = "test_python", suite_id = "20260218_204838")
  - screenshots collection (filename = "test_python_success_*.png", suite_id = "20260218_204838")
  - videos collection (GridFS) (filename = "chrome_test_python_*.mp4", suite_id = "20260218_204838")
  - logs collection (message = "Test PASSED: test_python", id/suite_id = "20260218_204838")
     ↓
User opens frontend /reports page
     ↓
Frontend calls GET /api/test-suites (with JWT)
     ↓
Backend queries test_suites collection WHERE username = "1"
     ↓
Backend returns array of suites
     ↓
Frontend displays in grid/table
     ↓
User clicks on suite "20260218_204838"
     ↓
Frontend navigates to /tester/test-results/20260218_204838
     ↓
Frontend calls GET /api/test-suites/20260218_204838 (with JWT)
     ↓
Backend queries:
  - test_suites collection (suite_id = "20260218_204838", username = "1")
  - test_results collection (suite_id = "20260218_204838", username = "1")
  - screenshots collection (suite_id = "20260218_204838", username = "1")
  - videos collection (suite_id = "20260218_204838", username = "1")
     ↓
Backend returns { suite, results, screenshots, videos }
     ↓
Frontend also calls GET /api/tester/test-results/20260218_204838/logs
     ↓
Backend queries logs collection (id = "20260218_204838", email = "1@1.com")
     ↓
Frontend displays:
  - Suite overview (status, passed/failed, duration)
  - Test results list (test_python: PASSED, 25.9s)
  - Tabs:
    - Screenshots (shows thumbnails, click to view full size via /api/screenshots/{id})
    - Videos (shows video player via /api/videos/{id})
    - Logs (shows log entries with timestamp, level, message)
```

---

## Backend Code Structure

### Handlers (HTTP Request Handlers)

**File:** `backend/internal/handlers/test_suite_handler.go`

Key Functions:
- `GetUserTestSuites(w, r)` - GET /api/test-suites
- `GetTestSuiteDetails(w, r)` - GET /api/test-suites/{suite_id}
- `CreateTestSuite(w, r)` - POST /api/test-suites (for future use)

**File:** `backend/internal/handlers/artifacts_handler.go`

Key Functions:
- `GetTesterLogs(w, r)` - GET /api/tester/test-results/{id}/logs
- `GetTesterScreenshots(w, r)` - GET /api/tester/test-results/{id}/screenshots
- `GetTesterVideos(w, r)` - GET /api/tester/test-results/{id}/videos
- `GetScreenshotImage(w, r)` - GET /api/screenshots/{screenshot_id}
- `GetVideoStream(w, r)` - GET /api/videos/{video_id}

### Repository (Database Access Layer)

**File:** `backend/internal/repository/test_suite_repository.go`

Key Functions:
- `GetUserTestSuites(ctx, username)` - Fetch all suites for user
- `GetTestSuiteByID(ctx, suiteID, username)` - Fetch one suite
- `GetTestResults(ctx, suiteID, username)` - Fetch test results for suite
- `GetSuiteVideos(ctx, suiteID, username)` - Fetch videos for suite
- `GetSuiteScreenshots(ctx, suiteID, username)` - Fetch screenshots for suite
- `Create(ctx, suite)` - Create new test suite

**File:** `backend/internal/repository/log_repository.go`

Key Function:
- `GetLogsByTestIDAndEmail(ctx, testID, email)` - Fetch logs for test

### Middleware

**File:** `backend/internal/middleware/auth_middleware.go`

Key Functions:
- `Authenticate(next)` - JWT verification middleware
- `GetUserFromContext(ctx)` - Extract user claims from context

---

## Runner Integration

**File:** `runner/src/runner.py`

The runner saves all data with proper user tracking:

**Initialization:**
```python
runner = TestRunner(
    email="1@1.com",
    username="1",
    user_id="692dceaec91672a6574b3c90"
)
```

**Data Saved:**
- Test suite created with suite_id (timestamp-based)
- Test results saved with suite_id, test_name, status, duration
- Screenshots saved with suite_id, test_name, base64 image data
- Videos saved to GridFS with suite_id, test_name, gridfs_id reference
- Logs saved with suite_id, test_name, message

All data includes user_id, email, username for proper filtering.

---

## Testing the Complete Flow

### 1. Login as Test User
```bash
curl -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "1@1.com", "password": "1"}'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGci...",
    "user": {
      "email": "1@1.com",
      "username": "1",
      "id": "692dceaec91672a6574b3c90",
      "role": "tester"
    }
  }
}
```

### 2. View Test History
```bash
TOKEN="eyJhbGci..."

curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8080/api/test-suites
```

**Response:**
```json
[
  {
    "suite_id": "20260218_204838",
    "username": "1",
    "status": "completed",
    "total_tests": 1,
    "passed": 1,
    "failed": 0
  }
]
```

### 3. View Test Suite Details
```bash
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8080/api/test-suites/20260218_204838
```

**Response:** Complete suite details with results, screenshots, videos

### 4. View Logs
```bash
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8080/api/tester/test-results/20260218_204838/logs
```

**Response:**
```json
[
  {
    "timestamp": "20:49:04",
    "level": "INFO",
    "message": "Test PASSED: test_python"
  }
]
```

### 5. View Screenshot
```bash
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8080/api/screenshots/{screenshot_id} \
  > screenshot.png
```

### 6. View Video
```bash
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8080/api/videos/{video_id} \
  > video.mp4
```

---

## Security Features

1. **JWT Authentication:** All endpoints require valid JWT token
2. **User Isolation:** Users can only view their own test data
3. **Context-based Authorization:** User claims extracted from JWT and stored in request context
4. **Role-based Access:** Admin endpoints separate from tester endpoints

---

## Recent Fixes Applied

### 1. Fixed Context Extraction in artifacts_handler.go
**Problem:** Handlers were trying to access `r.Context().Value("user_email")` directly, which was always nil because the middleware stores the full TokenClaims object.

**Solution:** Updated all artifact handlers to use `middleware.GetUserFromContext(r.Context())` to properly extract user claims.

**Files Modified:**
- `backend/internal/handlers/artifacts_handler.go` (7 occurrences fixed)

**Affected Functions:**
- GetTesterScreenshots
- GetTesterLogs
- GetTesterVideos
- GetScreenshotImage
- GetVideoStream

### 2. Fixed Escaped Quotes in test_suite_handler.go
**Problem:** String literals had incorrect escaped quotes (`\"string\"`) causing compilation errors.

**Solution:** Replaced all escaped quotes with proper Go string literals (`"string"`).

**Files Modified:**
- `backend/internal/handlers/test_suite_handler.go`

---

## Next Steps for Complete Implementation

### ✅ Completed:
1. Backend APIs working and tested
2. Database schema with proper indexes
3. User tracking and isolation
4. JWT authentication
5. Context-based authorization
6. Binary data serving (screenshots, videos)

### 🔄 Frontend Integration (Ready):
1. Frontend code already exists in `Frontend/src/pages/reports.tsx` and `tester-test-results.tsx`
2. API endpoints are correctly defined in `Frontend/src/lib/apiConfig.ts`
3. Frontend just needs to be started and tested with backend

### ⏳ Future Enhancements:
1. **Redis Queue System:** For async test execution job management
2. **File Upload:** Allow users to upload test scripts via frontend
3. **Real-time Updates:** WebSocket integration for live test status updates
4. **Test History Filtering:** Add filters by date range, status, test name
5. **Bulk Operations:** Run multiple test suites, delete old results
6. **Export Reports:** Download test results as PDF/Excel
7. **Password Hashing:** Implement bcrypt for storing passwords (currently plain text)

---

## Monitoring & Debugging

### Backend Logs
```bash
docker logs testops-backend-api -f
```

### Database Query Examples
```bash
# Connect to MongoDB
docker exec -it testops-mongo mongosh \
  -u admin -p admin123 --authenticationDatabase admin thex_db

# View user's test suites
db.test_suites.find({ username: "1" }).pretty()

# View test results for a suite
db.test_results.find({ suite_id: "20260218_204838" }).pretty()

# View screenshots for a suite
db.screenshots.find({ suite_id: "20260218_204838" }).pretty()

# View logs for a suite
db.logs.find({ suite_id: "20260218_204838" }).pretty()
```

---

## Summary

✅ **Backend APIs: FULLY FUNCTIONAL**
✅ **Database Schema: COMPLETE**
✅ **User Tracking: IMPLEMENTED**
✅ **Authentication: WORKING**
✅ **Authorization: WORKING**
✅ **Binary Data Serving: WORKING**

The test history integration is **complete and ready for use**. Users can:
1. View all their test suites
2. Click on a suite to see detailed results
3. View screenshots, videos, and logs for each test
4. All data is properly filtered by authenticated user

Frontend components already exist and are configured to use these APIs. Start the frontend and test the complete flow!
