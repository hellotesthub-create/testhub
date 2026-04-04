// Test Suite API Service
// Handles all API calls related to test suites, test runs, results, videos, and screenshots

import { API_ENDPOINTS } from './apiConfig';

// ========================================
// Type Definitions - New Schema
// ========================================

/**
 * TestSuite - A collection of test cases (template/definition)
 */
export interface TestSuite {
  id: string;
  suite_name: string;
  description?: string;
  created_by: string;  // Email of creator
  framework: 'selenium' | 'playwright';
  default_browser: string;
  tags?: string[];
  test_count: number;
  created_at: string;
  updated_at: string;
}

/**
 * TestCase - An individual test within a suite
 */
export interface TestCase {
  id: string;
  suite_id: string;
  test_name: string;
  file_path: string;
  description?: string;
  tags?: string[];
  created_at: string;
}

/**
 * TestRun - A single execution of a test suite
 */
export interface TestRun {
  id: string;
  run_id: string;           // Human-readable ID (e.g., 20260220_143052)
  suite_id?: string;
  suite_name: string;
  triggered_by: string;     // Email
  trigger_type: 'manual' | 'github' | 'scheduled';
  browsers: string[];
  start_time?: string;
  end_time?: string;
  duration_seconds: number;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  total_tests: number;
  passed: number;
  failed: number;
  skipped: number;
  success_rate: number;
  email_status?: 'pending' | 'sending' | 'sent' | 'failed';
  email_sent_at?: string;
  email_error?: string;
  created_at: string;
}

/**
 * TestResult - Result of a single test within a run
 */
export interface TestResult {
  id: string;
  run_id: string;           // ObjectID reference to TestRun
  run_id_string: string;    // Human-readable run ID
  test_name: string;
  browser: string;
  status: 'PASSED' | 'FAILED' | 'SKIPPED';
  duration_seconds: number;
  start_time: string;
  end_time: string;
  error_message?: string;
  created_at: string;
}

/**
 * Video artifact
 */
export interface Video {
  id: string;
  result_id?: string;
  run_id?: string;
  run_id_string?: string;
  test_name?: string;
  browser?: string;
  name?: string;
  duration_seconds?: number;
  size_bytes?: number;
  url?: string;
  created_at?: string;
}

/**
 * Screenshot artifact
 */
export interface Screenshot {
  id: string;
  result_id?: string;
  run_id?: string;
  run_id_string?: string;
  test_name?: string;
  browser?: string;
  name?: string;
  step?: string;
  size_bytes?: number;
  url?: string;
  created_at?: string;
}

/**
 * Log entry artifact
 */
export interface Log {
  id: string;
  result_id?: string;
  run_id?: string;
  run_id_string?: string;
  test_name?: string;
  browser?: string;
  level: 'info' | 'warning' | 'error' | 'debug';
  message: string;
  created_at?: string;
}

/**
 * Full run details including results and artifacts
 */
export interface TestRunDetails {
  run: TestRun;
  results: TestResult[];
  videos?: Video[];
  screenshots?: Screenshot[];
  logs?: Log[];
}

// ========================================
// API Functions - New Endpoints
// ========================================

/**
 * Fetch all test suites (definitions) for the authenticated user
 */
export const getUserSuites = async (token: string): Promise<TestSuite[]> => {
  const response = await fetch(API_ENDPOINTS.SUITES, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to fetch suites');
  }

  return response.json();
};

/**
 * Create a new test suite
 */
export const createSuite = async (
  token: string,
  suite: { suite_name: string; description?: string; framework: string; default_browser: string; tags?: string[] }
): Promise<TestSuite> => {
  const response = await fetch(API_ENDPOINTS.SUITES, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(suite),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to create suite');
  }

  return response.json();
};

/**
 * Fetch all test runs for the authenticated user
 */
export const getUserRuns = async (token: string): Promise<TestRun[]> => {
  const response = await fetch(API_ENDPOINTS.RUNS, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to fetch runs');
  }

  return response.json();
};

/**
 * Fetch detailed information about a specific test run
 * Including test results
 */
export const getRunDetails = async (
  token: string,
  runId: string
): Promise<TestRunDetails> => {
  const response = await fetch(API_ENDPOINTS.RUN_DETAILS(runId), {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to fetch run details');
  }

  return response.json();
};

/**
 * Trigger a new test run for a suite
 */
export const triggerRun = async (
  token: string,
  suiteId: string,
  browsers: string[]
): Promise<{ run_id: string; message: string }> => {
  const response = await fetch(API_ENDPOINTS.SUITE_RUN(suiteId), {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ browsers }),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to trigger run');
  }

  return response.json();
};

/**
 * Fetch screenshots for a run
 */
export const getRunScreenshots = async (
  token: string,
  runId: string
): Promise<Screenshot[]> => {
  const response = await fetch(API_ENDPOINTS.RUN_SCREENSHOTS(runId), {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    return [];
  }

  return response.json();
};

/**
 * Fetch videos for a run
 */
export const getRunVideos = async (
  token: string,
  runId: string
): Promise<Video[]> => {
  const response = await fetch(API_ENDPOINTS.RUN_VIDEOS(runId), {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    return [];
  }

  return response.json();
};

/**
 * Fetch logs for a run
 */
export const getRunLogs = async (
  token: string,
  runId: string
): Promise<Log[]> => {
  const response = await fetch(API_ENDPOINTS.RUN_LOGS(runId), {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    return [];
  }

  return response.json();
};

// ========================================
// Legacy Functions (for backward compatibility)
// ========================================

/**
 * @deprecated Use getUserRuns instead - this fetches runs now, not suite definitions
 */
export const getUserTestSuites = async (token: string): Promise<TestRun[]> => {
  return getUserRuns(token);
};

/**
 * @deprecated Use getRunDetails instead
 */
export const getTestSuiteDetails = async (
  token: string,
  suiteId: string
): Promise<TestRunDetails> => {
  return getRunDetails(token, suiteId);
};
