# 🔍 Complete Database Architecture Analysis & Issues

## Current State Assessment: February 19, 2026

---

## ✅ **PART 1: USER AUTHENTICATION DATABASE - WORKING CORRECTLY**

### **Database:** `testops.users` collection

### **Schema:**
```javascript
{
  _id: ObjectId,
  username: String (unique),
  email: String (unique),
  password: String (plain text - SECURITY ISSUE!),
  role: String ("admin" | "tester"),
  picture: String (optional),
  created_at: Date,
  updated_at: Date
}
```

### **Current Data:**
```javascript
// Sample users in database:
{
  username: "admin",
  email: "admin@testops.com",
  password: "admin123",  // ⚠️ Plain text!
  role: "admin"
}

{
  username: "1",
  email: "1@1.com",
  password: "1",  // ⚠️ Plain text!
  role: "tester"
}
```

### **Verification:**
- ✅ Users are being created when signing up
- ✅ Login is working (frontend → backend → database lookup)
- ✅ JWT authentication is working
- ✅ Role-based access control is working
- ✅ Unique indexes on email and username
- ⚠️ **SECURITY ISSUE:** Passwords stored in plain text (no bcrypt hashing)

### **Backend Integration:**
- ✅ File: `backend/internal/handlers/auth_handler.go`
- ✅ Creates users on signup
- ✅ Validates credentials on login
- ✅ Returns JWT token
- ✅ GET /api/auth/me returns user info

### **Frontend Integration:**
- ✅ Signup form creates users
- ✅ Login form authenticates users
- ✅ Google OAuth creates/updates users
- ✅ JWT stored in localStorage/sessionStorage
- ✅ Auto-login on page refresh

### **Conclusion:** ✅ **USER AUTHENTICATION IS WORKING CORRECTLY**
(Except for password hashing security issue)

---

## ⚠️ **PART 2: TEST SUITE DATABASE - MULTIPLE CRITICAL ISSUES**

### **Current Collections:**
1. `test_suites` - Test suite metadata (21 records exist)
2. `test_results` - Individual test results (21 records)
3. `screenshots` - Screenshots from tests (15 records)
4. `videos` - Video recordings (15 records)
5. `logs` - Test execution logs (21 records)

---

## 🚨 **CRITICAL ISSUES IDENTIFIED**

### **ISSUE #1: Username Mismatch (CRITICAL)**

**Problem:**
```javascript
// Actual users in database:
users: [
  { username: "admin", email: "admin@testops.com" },
  { username: "1", email: "1@1.com" }
]

// Test data in test_suites/results/artifacts:
test_suites: [
  { username: "demo_user" }  // ❌ This user doesn't exist!
]

screenshots: [
  { username: "demo_user", email: "demo_user@testops.com" }  // ❌ Fake user!
]
```

**Root Cause:**
```python
# runner/src/runner.py line 53
def __init__(self, email=None, test_id=None, backend_url="http://backend:8080/api", username="demo_user"):
    self.username = username  # ❌ HARDCODED "demo_user"!
```

**Impact:**
- ❌ Test results not associated with real users
- ❌ Users can't see their own test results
- ❌ Admin can't track which user ran which tests
- ❌ No user accountability

**Fix Required:**
Runner must receive actual user email/username from backend API when job is picked up.

---

### **ISSUE #2: No Test Suite Creation Endpoint (CRITICAL)**

**Problem:**
```go
// backend/cmd/api/main.go - Current routes:
GET  /api/test-suites              → List user's test suites
GET  /api/test-suites/:suite_id    → Get suite details

// ❌ MISSING:
POST /api/test-suites              → Create new test suite
```

**Impact:**
- ❌ Frontend can't create test suites
- ❌ No way to trigger test execution from UI
- ❌ User can't upload test scripts
- ❌ Runner creates suites during execution (wrong flow)

**Current Wrong Flow:**
```
User → Frontend → ??? → Runner auto-runs all tests → Creates suite
```

**Correct Flow Should Be:**
```
User → Frontend → POST /api/test-suites → Backend creates suite → 
Redis queue → Runner picks job → Executes specific tests → Updates suite
```

**Fix Required:**
Create POST endpoint to accept test suite creation requests.

---

### **ISSUE #3: Missing Test Scripts Field in Test Suite (CRITICAL)**

**Problem:**
```javascript
// Current test_suites schema:
{
  suite_id: "20251210_134516",
  username: "demo_user",
  total_tests: 1,
  passed: 1,
  failed: 0,
  // ❌ MISSING: Which test scripts were in this suite?
  // ❌ MISSING: test_scripts: ["test_python.py", "test_github.py"]
}
```

**Impact:**
- ❌ Can't tell which scripts were supposed to run
- ❌ Can't re-run the same test suite
- ❌ Can't show user which scripts they selected
- ❌ No way to track "user wants to run 3 scripts together"

**Fix Required:**
Add `test_scripts` array field to test_suites schema.

---

### **ISSUE #4: Missing Browsers Field (HIGH PRIORITY)**

**Problem:**
```javascript
// Current test_suites schema doesn't have:
{
  // ❌ MISSING: browsers: ["chrome", "firefox"]
}
```

**Impact:**
- ❌ Can't track which browser was used
- ❌ Can't show user "Test ran on Chrome"
- ❌ Can't filter results by browser
- ❌ Future feature: Run same test on multiple browsers

**Fix Required:**
Add `browsers` array field to test_suites schema.

---

### **ISSUE #5: No Status Tracking During Execution (MEDIUM)**

**Problem:**
```javascript
// Test suite status values:
status: "completed"  // Only this exists in database

// ❌ MISSING statuses:
// "pending"   - Suite created, waiting in queue
// "running"   - Currently executing
// "failed"    - Execution failed
// "cancelled" - User cancelled
```

**Impact:**
- ❌ Frontend can't show "Test is running..."
- ❌ No real-time status updates
- ❌ Can't distinguish between "not started" and "in progress"

**Fix Required:**
Implement proper status lifecycle: pending → running → completed/failed.

---

### **ISSUE #6: Missing User ID Field (MEDIUM)**

**Problem:**
```javascript
// Test suites only have username:
{
  username: "demo_user"  // Just a string
  // ❌ MISSING: user_id: ObjectId("...")
}
```

**Impact:**
- ❌ If username changes, test history is broken
- ❌ Harder to query all suites by user
- ❌ No referential integrity with users collection

**Fix Required:**
Add `user_id` field referencing users._id.

---

### **ISSUE #7: Inconsistent Email vs Username Usage**

**Problem:**
```javascript
// test_suites uses username:
{ username: "demo_user" }

// screenshots/videos/logs use BOTH:
{ username: "demo_user", email: "demo_user@testops.com" }

// ❌ Which one is source of truth?
```

**Impact:**
- ❌ Confusion in queries
- ❌ Data duplication
- ❌ Inconsistent filtering

**Fix Required:**
Standardize on user_id + email (email is unique and immutable).

---

### **ISSUE #8: No Test Suite - User Relationship Index**

**Problem:**
```javascript
// MongoDB indexes:
db.test_suites.createIndex({ "username": 1 })  // ✅ Exists
db.test_suites.createIndex({ "suite_id": 1 })  // ✅ Exists

// ❌ MISSING: Compound index for common queries
// db.test_suites.createIndex({ "user_id": 1, "created_at": -1 })
```

**Impact:**
- ⚠️ Slower queries when fetching user's recent test suites
- ⚠️ Full collection scan for sorted user queries

**Fix Required:**
Add compound index on user_id + created_at.

---

### **ISSUE #9: No Test Script Upload Storage**

**Problem:**
- User uploads test scripts on frontend
- ❌ Scripts not stored anywhere in database
- ❌ Scripts not uploaded to backend
- ❌ Runner expects scripts to exist in `/app/testscripts/`

**Current Reality:**
```bash
# Runner has these hardcoded scripts:
/app/testscripts/
  test_python.py
  test_github.py
  test_wikipedia.py
  test_demoqa.py
  test_example.py
  test_fail_demo.py
```

**Impact:**
- ❌ Users can't upload their own test scripts
- ❌ File upload on frontend doesn't work
- ❌ All users share same test scripts

**Fix Required:**
1. Store test scripts in MongoDB GridFS or as base64 in test_suites
2. Add upload endpoint: POST /api/test-suites/upload-script
3. Runner downloads scripts from database before executing

---

### **ISSUE #10: Test Results Don't Link to User**

**Problem:**
```javascript
// test_results schema:
{
  suite_id: "20251210_134516",
  test_name: "test_python",
  username: "demo_user",  // ❌ Hardcoded fake user
  // ❌ MISSING: user_id, email
}
```

**Impact:**
- ❌ Test results orphaned from real users
- ❌ Can't filter results by authenticated user

**Fix Required:**
Add user_id and email fields to test_results.

---

## 📊 **CURRENT VS REQUIRED DATABASE SCHEMA**

### **❌ CURRENT (Incomplete):**
```javascript
// test_suites collection:
{
  _id: ObjectId,
  suite_id: String,
  username: String,  // ❌ Hardcoded "demo_user"
  total_tests: Number,
  passed: Number,
  failed: Number,
  success_rate: Number,
  total_duration: Number,
  status: String,  // Only "completed"
  json_report_path: String,
  created_at: Date,
  updated_at: Date,
  finished_at: Date
}
```

### **✅ REQUIRED (Complete):**
```javascript
// test_suites collection (FIXED):
{
  _id: ObjectId,
  suite_id: String (unique),
  user_id: ObjectId,  // ✅ Reference to users._id
  email: String,  // ✅ User's email
  username: String,  // ✅ User's username
  
  // ✅ NEW: Test configuration
  test_scripts: [  // ✅ Which scripts to run
    {
      filename: "test_python.py",
      content: "<base64 encoded script>",  // or GridFS file_id
      uploaded_at: Date
    }
  ],
  browsers: ["chrome", "firefox"],  // ✅ Which browsers
  
  // Execution results
  total_tests: Number,
  passed: Number,
  failed: Number,
  success_rate: Number,
  total_duration: Number,
  
  // ✅ IMPROVED: Status lifecycle
  status: String,  // "pending" | "running" | "completed" | "failed" | "cancelled"
  
  json_report_path: String,
  created_at: Date,
  updated_at: Date,
  started_at: Date,  // ✅ When execution started
  finished_at: Date
}
```

---

## 🔧 **REQUIRED FIXES (Priority Order)**

### **FIX #1: Create Backend Test Suite Endpoint (CRITICAL)**

**File:** `backend/internal/handlers/test_suite_handler.go`

```go
// Add this method:
func (h *TestSuiteHandler) CreateTestSuite(w http.ResponseWriter, r *http.Request) {
    // Get authenticated user
    claims, ok := middleware.GetUserFromContext(r.Context())
    if !ok {
        http.Error(w, "Unauthorized", http.StatusUnauthorized)
        return
    }
    
    var req struct {
        TestScripts []string `json:"test_scripts"`  // ["test_python.py"]
        Browsers    []string `json:"browsers"`       // ["chrome"]
    }
    
    json.NewDecoder(r.Body).Decode(&req)
    
    // Create test suite in database
    suiteID := time.Now().Format("20060102_150405")
    suite := models.TestSuite{
        SuiteID:     suiteID,
        UserID:      claims.UserID,
        Email:       claims.Email,
        Username:    claims.Username,
        TestScripts: req.TestScripts,
        Browsers:    req.Browsers,
        Status:      "pending",
        CreatedAt:   time.Now(),
    }
    
    h.testSuiteRepo.Create(r.Context(), &suite)
    
    // TODO: Push job to Redis queue
    
    w.WriteHeader(http.StatusCreated)
    json.NewEncoder(w).Encode(suite)
}
```

**Route:** `backend/cmd/api/main.go`
```go
api.HandleFunc("/test-suites", authMiddleware.Authenticate(testSuiteHandler.CreateTestSuite)).Methods("POST", "OPTIONS")
```

---

### **FIX #2: Update Test Suite Model**

**File:** `backend/internal/models/test_suite.go`

```go
type TestScript struct {
    Filename   string    `json:"filename" bson:"filename"`
    Content    string    `json:"content,omitempty" bson:"content"`  // Base64 or GridFS ID
    UploadedAt time.Time `json:"uploaded_at" bson:"uploaded_at"`
}

type TestSuite struct {
    ID            primitive.ObjectID `json:"id" bson:"_id,omitempty"`
    SuiteID       string             `json:"suite_id" bson:"suite_id"`
    UserID        primitive.ObjectID `json:"user_id" bson:"user_id"`        // ✅ NEW
    Email         string             `json:"email" bson:"email"`            // ✅ NEW
    Username      string             `json:"username" bson:"username"`
    TestScripts   []TestScript       `json:"test_scripts" bson:"test_scripts"` // ✅ NEW
    Browsers      []string           `json:"browsers" bson:"browsers"`      // ✅ NEW
    TotalTests    int                `json:"total_tests" bson:"total_tests"`
    Passed        int                `json:"passed" bson:"passed"`
    Failed        int                `json:"failed" bson:"failed"`
    SuccessRate   float64            `json:"success_rate" bson:"success_rate"`
    TotalDuration float64            `json:"total_duration" bson:"total_duration"`
    Status        string             `json:"status" bson:"status"`  // pending, running, completed, failed
    JSONReportPath string            `json:"json_report_path" bson:"json_report_path"`
    CreatedAt     time.Time          `json:"created_at" bson:"created_at"`
    UpdatedAt     time.Time          `json:"updated_at" bson:"updated_at"`
    StartedAt     *time.Time         `json:"started_at,omitempty" bson:"started_at,omitempty"` // ✅ NEW
    FinishedAt    *time.Time         `json:"finished_at,omitempty" bson:"finished_at,omitempty"`
}
```

---

### **FIX #3: Update Runner to Use Real User**

**File:** `runner/src/runner.py`

```python
# BEFORE (line 53):
def __init__(self, email=None, test_id=None, backend_url="http://backend:8080/api", username="demo_user"):
    self.username = username  # ❌ HARDCODED!

# AFTER:
def __init__(self, email=None, test_id=None, backend_url="http://backend:8080/api", username=None, user_id=None):
    if not email or not username:
        raise ValueError("email and username are required!")  # ✅ ENFORCE!
    
    self.email = email
    self.username = username
    self.user_id = user_id
```

**When queue worker picks job:**
```python
# queue_worker.py
job = {
    "suite_id": "20251210_134516",
    "script": "test_python.py",
    "email": "1@1.com",  # ✅ Real user email
    "username": "1",     # ✅ Real username
    "user_id": "692dceaec91672a6574b3c90"  # ✅ Real user ID
}

runner = TestRunner(
    email=job["email"],
    username=job["username"],
    user_id=job["user_id"],
    test_id=job["suite_id"]
)
```

---

### **FIX #4: Update Database Initialization**

**File:** `database-microservice/init-mongo.js`

```javascript
// Add to test_suites indexes:
print('Creating compound index on user_id+created_at for test_suites...');
db.test_suites.createIndex({ "user_id": 1, "created_at": -1 });

print('Creating index on email for test_suites...');
db.test_suites.createIndex({ "email": 1 });

print('Creating index on status for test_suites...');
db.test_suites.createIndex({ "status": 1 });
```

---

### **FIX #5: Update Database Service in Runner**

**File:** `runner/src/database_service.py`

```python
def create_test_suite(self, suite_data: dict) -> str:
    # BEFORE: Uses self.username (hardcoded "demo_user")
    suite_data['username'] = self.username  # ❌

    # AFTER: Receives user data from job
    if not hasattr(self, 'email') or not self.email:
        logger.error("❌ Cannot create test suite: No user email!")
        return None
    
    suite_data['email'] = self.email          # ✅
    suite_data['username'] = self.username    # ✅
    suite_data['user_id'] = self.user_id      # ✅
```

---

## 📋 **VERIFICATION CHECKLIST**

After implementing fixes, verify:

### **User Authentication:**
- [ ] Sign up creates user in database
- [ ] Login returns JWT token
- [ ] JWT is valid and contains user info
- [ ] Protected routes require JWT
- [ ] User data persists across sessions

### **Test Suite Creation:**
- [ ] POST /api/test-suites creates suite with status="pending"
- [ ] Suite has user_id, email, username
- [ ] Suite has test_scripts array
- [ ] Suite has browsers array
- [ ] Job is pushed to Redis queue (future)

### **Test Execution:**
- [ ] Runner receives real user credentials
- [ ] Test suite status changes to "running"
- [ ] Test results link to correct user
- [ ] Screenshots link to correct user
- [ ] Videos link to correct user
- [ ] Logs link to correct user
- [ ] Test suite status changes to "completed"

### **Frontend Display:**
- [ ] User sees only their own test suites
- [ ] Test suite shows which scripts were run
- [ ] Test suite shows which browser was used
- [ ] Results page shows correct user's data
- [ ] Screenshots are viewable
- [ ] Videos are viewable

---

## 🎯 **SUMMARY**

### **What's Working:**
✅ User authentication (signup, login, JWT)  
✅ Data is being saved to MongoDB  
✅ Test results, screenshots, videos, logs are stored  

### **What's Broken:**
❌ Test suites use fake "demo_user" instead of real users  
❌ No backend endpoint to create test suites  
❌ No test_scripts field in test suites  
❌ No browsers field in test suites  
❌ Frontend can't trigger test execution  
❌ Users can't see their own test results  

### **Critical Path to Fix:**
1. Add POST /api/test-suites endpoint
2. Update TestSuite model (add test_scripts, browsers, user_id, email)
3. Update runner to accept and use real user credentials
4. Update database service to use real user data
5. Add new MongoDB indexes
6. Test end-to-end flow

**Estimated Fix Time:** 4-6 hours for all fixes
