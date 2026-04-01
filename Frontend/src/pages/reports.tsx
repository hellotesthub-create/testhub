import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import Layout from "@/components/layout/Layout";
import { GlassCard } from "@/components/ui/glass-card";
import { Badge } from "@/components/ui/badge";
import { Eye, Clock, Chrome, BarChart3, Search, Trash2, AlertTriangle, Loader2, CheckCircle2, XCircle, Globe, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { API_ENDPOINTS } from "@/lib/apiConfig";

interface ApiTestRun {
  id: string;
  run_id: string;
  suite_name: string;
  browsers: string[];
  framework: string;
  total_tests: number;
  passed: number;
  failed: number;
  success_rate: number;
  duration_seconds: number;
  status: string;
  created_at: string;
}

interface TestResult {
  test_name: string;
  browser: string;
  status: string;
  duration_seconds: number;
}

interface RunDetails {
  results: TestResult[];
}

interface TestRun {
  id: string;
  runId: string;
  suite: string;
  browsers: string[];
  framework: string;
  status: "passed" | "failed" | "running" | "cancelled";
  date: string;
  time: string;
  duration: string;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  successRate: number;
}

export default function Reports() {
  const [location] = useLocation();
  const reportRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});
  const [reports, setReports] = useState<TestRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteTestDialogOpen, setDeleteTestDialogOpen] = useState(false);
  const [deleteAllDialogOpen, setDeleteAllDialogOpen] = useState(false);
  const [testToDelete, setTestToDelete] = useState<string | null>(null);

  // Browser tabs state
  const [selectedBrowserTab, setSelectedBrowserTab] = useState<Record<string, string>>({});
  const [runDetailsCache, setRunDetailsCache] = useState<Record<string, RunDetails>>({});
  const [loadingDetails, setLoadingDetails] = useState<Record<string, boolean>>({});

  const getToken = () => localStorage.getItem('authToken') || sessionStorage.getItem('authToken');

  // Fetch run details for browser tab breakdown
  const fetchRunDetails = useCallback(async (runId: string) => {
    if (runDetailsCache[runId] || loadingDetails[runId]) return;

    const token = getToken();
    if (!token) return;

    setLoadingDetails(prev => ({ ...prev, [runId]: true }));
    try {
      const response = await fetch(API_ENDPOINTS.RUN_DETAILS(runId), {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setRunDetailsCache(prev => ({
          ...prev,
          [runId]: { results: data.results || [] }
        }));
      }
    } catch (err) {
      console.error('Error fetching run details:', err);
    } finally {
      setLoadingDetails(prev => ({ ...prev, [runId]: false }));
    }
  }, [runDetailsCache, loadingDetails]);

  // Fetch all test runs
  useEffect(() => {
    const fetchTestRuns = async () => {
      try {
        setLoading(true);
        setError(null);

        const token = getToken();
        if (!token) {
          setError('No authentication token found. Please log in again.');
          setLoading(false);
          return;
        }

        const response = await fetch(API_ENDPOINTS.RUNS, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Failed to fetch test runs: ${response.status} ${errorText}`);
        }

        const data: ApiTestRun[] = await response.json();

        const transformedReports: TestRun[] = data.map(run => {
          const date = new Date(run.created_at);
          const status = run.status === 'cancelled' 
            ? 'cancelled'
            : (run.status === 'completed' || run.status === 'passed')
            ? (run.failed === 0 ? 'passed' : 'failed')
            : (run.status === 'failed') ? 'failed' : 'running';

          const durationSec = run.duration_seconds || 0;
          const durationStr = durationSec >= 60
            ? `${Math.floor(durationSec / 60)}m ${Math.round(durationSec % 60)}s`
            : `${Math.round(durationSec)}s`;

          return {
            id: run.id,
            runId: run.run_id,
            suite: run.suite_name || `Test Run ${run.run_id}`,
            browsers: run.browsers || ['chrome'],
            framework: run.framework || 'selenium',
            status: status as "passed" | "failed" | "running" | "cancelled",
            date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
            time: date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
            duration: durationStr,
            totalTests: run.total_tests,
            passedTests: run.passed,
            failedTests: run.failed,
            successRate: run.success_rate,
          };
        });

        setReports(transformedReports);

        // Initialize browser tabs and prefetch details for all runs
        const initialTabs: Record<string, string> = {};
        transformedReports.forEach(r => { initialTabs[r.id] = "all"; });
        setSelectedBrowserTab(initialTabs);
      } catch (err) {
        console.error('Error fetching test runs:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch test runs');
      } finally {
        setLoading(false);
      }
    };

    fetchTestRuns();
  }, []);

  // Prefetch details for all loaded reports
  useEffect(() => {
    reports.forEach(r => { fetchRunDetails(r.id); });
  }, [reports]);

  const filteredReports = reports.filter(report =>
    report.suite.toLowerCase().includes(searchQuery.toLowerCase()) ||
    report.browsers.some(b => b.toLowerCase().includes(searchQuery.toLowerCase())) ||
    report.status.toLowerCase().includes(searchQuery.toLowerCase()) ||
    report.date.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Get per-browser stats from cached details
  const getBrowserStats = (reportId: string, browser: string) => {
    const details = runDetailsCache[reportId];
    if (!details) return { total: 0, passed: 0, failed: 0, pending: 0, results: [] as TestResult[] };

    const filtered = browser === "all"
      ? details.results
      : details.results.filter(r => r.browser?.toLowerCase() === browser.toLowerCase());

    return {
      total: filtered.length,
      passed: filtered.filter(r => r.status?.toUpperCase() === "PASSED").length,
      failed: filtered.filter(r => r.status?.toUpperCase() === "FAILED").length,
      pending: filtered.filter(r => r.status?.toLowerCase() === "pending").length,
      results: filtered,
    };
  };

  const handleDeleteTest = () => {
    if (testToDelete) {
      setReports(prev => prev.filter(r => r.id !== testToDelete));
      setDeleteTestDialogOpen(false);
      setTestToDelete(null);
    }
  };

  const handleDeleteAll = () => {
    setReports([]);
    setDeleteAllDialogOpen(false);
  };

  const openDeleteTestDialog = (testId: string) => {
    setTestToDelete(testId);
    setDeleteTestDialogOpen(true);
  };

  useEffect(() => {
    const params = new URLSearchParams(location.split('?')[1] || '');
    const testId = params.get('testId');
    if (testId && reportRefs.current[testId]) {
      setTimeout(() => {
        reportRefs.current[testId]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        reportRefs.current[testId]?.classList.add('ring-2', 'ring-green-500', 'ring-offset-2', 'dark:ring-offset-slate-950');
        setTimeout(() => {
          reportRefs.current[testId]?.classList.remove('ring-2', 'ring-green-500', 'ring-offset-2', 'dark:ring-offset-slate-950');
        }, 3000);
      }, 100);
    }
  }, [location]);

  return (
    <Layout>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 sm:gap-0 mb-6 sm:mb-8">
        <div>
          <h1 className="text-xl sm:text-2xl md:text-3xl font-display font-bold text-slate-900 dark:text-white mb-1">History</h1>
          <p className="text-slate-600 dark:text-slate-400 text-xs sm:text-sm md:text-base">View all test execution results and artifacts.</p>
        </div>
        {reports.length > 0 && (
          <Button
            variant="outline"
            className="border-red-300 dark:border-red-500/30 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 w-full sm:w-auto text-sm sm:text-base"
            onClick={() => setDeleteAllDialogOpen(true)}
          >
            <Trash2 className="w-4 h-4 mr-2" /> Delete All
          </Button>
        )}
      </div>

      <GlassCard className="mb-6">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <Badge className="bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-500/30 text-xs sm:text-sm">
              {filteredReports.length} Test Runs
            </Badge>
            <Badge className="bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-300 border-green-200 dark:border-green-500/30 text-xs sm:text-sm">
              {filteredReports.filter(r => r.status === "passed").length} Passed
            </Badge>
            <Badge className="bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-300 border-red-200 dark:border-red-500/30 text-xs sm:text-sm">
              {filteredReports.filter(r => r.status === "failed").length} Failed
            </Badge>
          </div>
          <div className="relative w-full md:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Search by suite, browser, status..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 text-sm sm:text-base bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/10"
            />
          </div>
        </div>
      </GlassCard>

      <div className="space-y-3 sm:space-y-4 md:space-y-6">
        {loading ? (
          <GlassCard className="text-center py-8 sm:py-12">
            <Loader2 className="w-8 h-8 sm:w-12 sm:h-12 mx-auto text-blue-500 dark:text-blue-400 mb-3 sm:mb-4 animate-spin" />
            <h3 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white mb-2">Loading Test History</h3>
            <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400">Fetching your test execution records...</p>
          </GlassCard>
        ) : error ? (
          <GlassCard className="text-center py-8 sm:py-12">
            <AlertTriangle className="w-8 h-8 sm:w-12 sm:h-12 mx-auto text-red-500 dark:text-red-400 mb-3 sm:mb-4" />
            <h3 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white mb-2">Error Loading Test History</h3>
            <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 mb-4">{error}</p>
            <Button onClick={() => window.location.reload()}>Retry</Button>
          </GlassCard>
        ) : filteredReports.length > 0 ? (
          filteredReports.map((report) => {
            const currentTab = selectedBrowserTab[report.id] || "all";
            const stats = getBrowserStats(report.id, currentTab);
            const hasDetails = !!runDetailsCache[report.id];
            const isLoadingDetails = !!loadingDetails[report.id];

            const displayTotal = currentTab === "all" ? report.totalTests : stats.total;
            const displayPassed = currentTab === "all" ? report.passedTests : stats.passed;
            const displayFailed = currentTab === "all" ? report.failedTests : stats.failed;
            const displayRate = displayTotal > 0 ? (displayPassed / displayTotal * 100) : 0;

            return (
              <div key={report.id} ref={(el) => { if (el) reportRefs.current[report.id] = el; }}>
                <GlassCard className="group hover:bg-slate-100 dark:hover:bg-white/5 transition-colors">
                  {/* Header */}
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 sm:gap-4 mb-3 sm:mb-4 md:mb-5 pb-3 sm:pb-4 md:pb-5 border-b border-slate-200 dark:border-white/5">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 md:gap-3 mb-2">
                        <h3 className="text-base sm:text-lg md:text-xl font-semibold text-slate-900 dark:text-white break-words min-w-0">{report.suite}</h3>
                        <Badge className={`${
                          report.status === "passed"
                            ? "bg-green-100 dark:bg-green-500/10 text-green-700 dark:text-green-400 border-green-200 dark:border-green-500/20"
                            : report.status === "running"
                            ? "bg-blue-100 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-500/20"
                            : report.status === "cancelled"
                            ? "bg-slate-100 dark:bg-slate-500/10 text-slate-700 dark:text-slate-400 border-slate-200 dark:border-slate-500/20"
                            : "bg-red-100 dark:bg-red-500/10 text-red-700 dark:text-red-400 border-red-200 dark:border-red-500/20"
                        } border capitalize text-[10px] sm:text-xs shrink-0`}>
                          {report.status}
                        </Badge>
                        <Badge className={`border text-[10px] sm:text-xs shrink-0 ${
                          report.framework === "playwright"
                            ? "bg-violet-100 dark:bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-200 dark:border-violet-500/20"
                            : "bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20"
                        }`}>
                          {report.framework === "playwright" ? <Zap className="w-3 h-3 mr-1 inline" /> : <Globe className="w-3 h-3 mr-1 inline" />}
                          {report.framework === "playwright" ? "Playwright" : "Selenium"}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 sm:gap-3 md:gap-4 text-[10px] sm:text-xs md:text-sm text-slate-600 dark:text-slate-400">
                        <div className="flex items-center gap-1">
                          <Clock className="w-3 h-3 sm:w-3.5 sm:h-3.5 md:w-4 md:h-4" />
                          {report.duration}
                        </div>
                        <span className="break-all">{report.date} at {report.time}</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5 sm:gap-2">
                      <Button
                        variant="ghost" size="sm"
                        className="border border-slate-300 dark:border-white/10 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 text-[10px] sm:text-xs md:text-sm flex-1 sm:flex-none"
                        onClick={() => window.location.href = `/tester/test-results/${report.runId}`}
                      >
                        <Eye className="w-3 h-3 sm:w-3.5 sm:h-3.5 md:w-4 md:h-4 mr-1 sm:mr-1.5 md:mr-2" /> <span className="hidden sm:inline">View Details</span><span className="sm:hidden">View</span>
                      </Button>
                      <Button
                        variant="ghost" size="sm"
                        className="border border-red-300 dark:border-red-500/30 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 text-[10px] sm:text-xs md:text-sm flex-1 sm:flex-none"
                        onClick={() => openDeleteTestDialog(report.id)}
                      >
                        <Trash2 className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-1.5" /> Delete
                      </Button>
                    </div>
                  </div>

                  {/* Browser Tabs */}
                  <div className="mb-3 sm:mb-4">
                    <div className="flex items-center border-b border-slate-200 dark:border-white/10 overflow-x-auto scrollbar-hide -mx-1 px-1">
                      <button
                        onClick={() => setSelectedBrowserTab(prev => ({ ...prev, [report.id]: "all" }))}
                        className={`flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                          currentTab === "all"
                            ? "border-blue-500 text-blue-600 dark:text-blue-400"
                            : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
                        }`}
                      >
                        <BarChart3 className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                        All
                        <Badge variant="secondary" className="ml-1 text-[10px] sm:text-xs px-1 sm:px-1.5 py-0 h-4 sm:h-5 bg-slate-200 dark:bg-slate-700">
                          {report.totalTests}
                        </Badge>
                      </button>

                      {report.browsers.map(browser => {
                        const bStats = getBrowserStats(report.id, browser);
                        return (
                          <button
                            key={browser}
                            onClick={() => {
                              setSelectedBrowserTab(prev => ({ ...prev, [report.id]: browser }));
                              if (!runDetailsCache[report.id]) fetchRunDetails(report.id);
                            }}
                            className={`flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                              currentTab === browser
                                ? browser === 'chrome'
                                  ? "border-blue-500 text-blue-600 dark:text-blue-400"
                                  : "border-orange-500 text-orange-600 dark:text-orange-400"
                                : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
                            }`}
                          >
                            {browser === 'chrome' ? <Chrome className="w-3 h-3 sm:w-3.5 sm:h-3.5" /> : <Globe className="w-3 h-3 sm:w-3.5 sm:h-3.5" />}
                            <span className="capitalize">{browser}</span>
                            {hasDetails && (
                              <Badge variant="secondary" className={`ml-1 text-[10px] sm:text-xs px-1 sm:px-1.5 py-0 h-4 sm:h-5 ${
                                browser === 'chrome'
                                  ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                                  : 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400'
                              }`}>
                                {bStats.total}
                              </Badge>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Loading spinner for details */}
                  {isLoadingDetails && currentTab !== "all" && (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="w-5 h-5 animate-spin text-blue-500 mr-2" />
                      <span className="text-sm text-slate-500">Loading browser details...</span>
                    </div>
                  )}

                  {/* Test Results Summary */}
                  <div className="space-y-2 sm:space-y-3 mb-4 sm:mb-6">
                    <h4 className="text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 sm:gap-2">
                      <BarChart3 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      {currentTab === "all" ? "Test Results Summary" : <span className="capitalize">{currentTab} Results</span>}
                    </h4>
                    <div className="grid grid-cols-3 gap-1.5 sm:gap-2 md:gap-3">
                      <div className="p-2 sm:p-3 rounded-lg bg-slate-100 dark:bg-slate-950/50 border border-slate-200 dark:border-white/5">
                        <p className="text-[10px] sm:text-xs text-slate-600 dark:text-slate-500 mb-0.5 sm:mb-1">Total</p>
                        <p className="text-sm sm:text-base md:text-lg font-semibold text-slate-900 dark:text-white">{displayTotal}</p>
                      </div>
                      <div className="p-2 sm:p-3 rounded-lg bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/20">
                        <p className="text-[10px] sm:text-xs text-green-700 dark:text-green-400 mb-0.5 sm:mb-1">Passed</p>
                        <p className="text-sm sm:text-base md:text-lg font-semibold text-green-900 dark:text-green-300">{displayPassed}</p>
                      </div>
                      <div className="p-2 sm:p-3 rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20">
                        <p className="text-[10px] sm:text-xs text-red-700 dark:text-red-400 mb-0.5 sm:mb-1">Failed</p>
                        <p className="text-sm sm:text-base md:text-lg font-semibold text-red-900 dark:text-red-300">{displayFailed}</p>
                      </div>
                    </div>

                    {/* Per-test breakdown */}
                    {hasDetails && stats.results.length > 0 && (
                      <div className="mt-2 sm:mt-3 space-y-1.5 sm:space-y-2">
                        {stats.results.map((result, idx) => (
                          <div key={idx} className="flex items-center justify-between gap-2 p-2 sm:p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-white/5">
                            <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1">
                              {result.status?.toUpperCase() === "PASSED" ? (
                                <CheckCircle2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-green-500 shrink-0" />
                              ) : result.status?.toUpperCase() === "FAILED" ? (
                                <XCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-red-500 shrink-0" />
                              ) : (
                                <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-500 shrink-0" />
                              )}
                              <span className="text-[10px] sm:text-xs md:text-sm text-slate-700 dark:text-slate-300 font-mono truncate">
                                {result.test_name?.replace(/_\d{8}_\d{6}$/, '') || 'Unknown'}
                              </span>
                              {currentTab === "all" && result.browser && (
                                <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 capitalize ${
                                  result.browser === 'chrome'
                                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                                    : 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400'
                                }`}>
                                  {result.browser}
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 sm:gap-2 md:gap-3 shrink-0">
                              <span className="text-[10px] sm:text-xs text-slate-500 hidden sm:inline">
                                {result.duration_seconds ? `${Math.round(result.duration_seconds)}s` : '-'}
                              </span>
                              <Badge className={`text-[10px] sm:text-xs ${
                                result.status?.toUpperCase() === "PASSED"
                                  ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                                  : result.status?.toUpperCase() === "FAILED"
                                  ? "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400"
                                  : "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400"
                              }`}>
                                {result.status || 'pending'}
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Footer stats */}
                  <div className="flex flex-wrap gap-2 sm:gap-3 md:gap-4 text-[10px] sm:text-xs">
                    <div className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg bg-slate-100 dark:bg-slate-950/50 border border-slate-200 dark:border-white/5 text-slate-700 dark:text-slate-300">
                      <BarChart3 className="w-3 h-3 sm:w-4 sm:h-4" />
                      <span>Rate: {displayRate.toFixed(1)}%</span>
                    </div>
                    <div className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg bg-slate-100 dark:bg-slate-950/50 border border-slate-200 dark:border-white/5 text-slate-700 dark:text-slate-300">
                      <Clock className="w-3 h-3 sm:w-4 sm:h-4" />
                      <span>{report.duration}</span>
                    </div>
                  </div>
                </GlassCard>
              </div>
            );
          })
        ) : (
          <GlassCard className="text-center py-8 sm:py-12">
            <BarChart3 className="w-8 h-8 sm:w-12 sm:h-12 mx-auto text-slate-400 dark:text-slate-600 mb-3 sm:mb-4" />
            <h3 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white mb-2">
              {searchQuery ? "No Matching Test Runs" : "No Test Runs"}
            </h3>
            <p className="text-slate-600 dark:text-slate-400">
              {searchQuery ? `No test runs match "${searchQuery}"` : "There are no test execution records yet."}
            </p>
          </GlassCard>
        )}
      </div>

      <Dialog open={deleteTestDialogOpen} onOpenChange={setDeleteTestDialogOpen}>
        <DialogContent className="bg-white dark:bg-slate-900/95 dark:backdrop-blur-xl border-slate-200 dark:border-white/10 text-slate-900 dark:text-white max-w-[90vw] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-xl flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              Delete Test Run
            </DialogTitle>
            <DialogDescription className="text-slate-600 dark:text-slate-400">
              Are you sure you want to delete this test run? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 mt-6">
            <Button
              className="flex-1 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-700 dark:text-white border border-slate-200 dark:border-white/10"
              onClick={() => setDeleteTestDialogOpen(false)}
            >Cancel</Button>
            <Button className="flex-1 bg-red-600 hover:bg-red-700 text-white" onClick={handleDeleteTest}>
              <Trash2 className="w-4 h-4 mr-2" /> Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteAllDialogOpen} onOpenChange={setDeleteAllDialogOpen}>
        <DialogContent className="bg-white dark:bg-slate-900/95 dark:backdrop-blur-xl border-slate-200 dark:border-white/10 text-slate-900 dark:text-white max-w-[90vw] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-xl flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              Delete All Test Runs
            </DialogTitle>
            <DialogDescription className="text-slate-600 dark:text-slate-400">
              Are you sure you want to delete all {reports.length} test runs? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 mt-6">
            <Button
              className="flex-1 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-700 dark:text-white border border-slate-200 dark:border-white/10"
              onClick={() => setDeleteAllDialogOpen(false)}
            >Cancel</Button>
            <Button className="flex-1 bg-red-600 hover:bg-red-700 text-white" onClick={handleDeleteAll}>
              <Trash2 className="w-4 h-4 mr-2" /> Delete All
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
