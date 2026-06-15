import { useState, useEffect, useMemo } from "react";
import { useLocation, useRoute } from "wouter";
import Layout from "@/components/layout/Layout";
import { GlassCard } from "@/components/ui/glass-card";
import { NeonButton } from "@/components/ui/neon-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft, Download, Play, Image as ImageIcon, FileText,
  Video, Clock, Chrome, CheckCircle2, XCircle, AlertCircle,
  ZoomIn, X, ChevronLeft, ChevronRight, Loader2, Globe, Copy, Check, StopCircle, Zap, Bot, RefreshCw, Eye, BarChart3, AlertTriangle, RotateCcw
} from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { API_ENDPOINTS } from "@/lib/apiConfig";
import { VRTRunPanel } from "@/components/ui/vrt-run-panel";


interface Screenshot {
  id: string;
  name: string;
  timestamp: string;
  url: string;
  step: string;
  test_name?: string;
  browser?: string;
  size_bytes?: number;
}

interface LogEntry {
  timestamp: string;
  level: "info" | "warning" | "error";
  message: string;
  test_name?: string;
  browser?: string;
}

interface VideoRecording {
  id: string;
  name: string;
  duration: string;
  size: string;
  url: string;
  test_name?: string;
  browser?: string;
}

interface TestSuite {
  id: string;
  suite_id: string;
  run_id: string;
  username: string;
  browsers: string[];
  total_tests: number;
  passed: number;
  failed: number;
  success_rate: number;
  total_duration: number;
  duration_seconds: number;
  status: string;
  created_at: string;
  updated_at: string;
  framework?: string;
}

interface TestResult {
  id: string;
  suite_id: string;
  run_id?: string;
  test_name: string;
  browser: string;
  status: string;
  duration_seconds: number;
  start_time: string;
  end_time: string;
  error_message?: string;
  error_category?: string;
  has_diagnosis?: boolean;
}

export default function TesterTestResults() {
  const [, navigate] = useLocation();
  const [, params] = useRoute("/tester/test-results/:id");
  const testId = params?.id;

  const [selectedImage, setSelectedImage] = useState<Screenshot | null>(null);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [activeTab, setActiveTab] = useState<"screenshots" | "visual" | "logs" | "videos">("screenshots");
  const [activeMainTab, setActiveMainTab] = useState<"all" | "failed">("all");
  const [diagnosingIds, setDiagnosingIds] = useState<Set<string>>(new Set());
  const [selectedVideo, setSelectedVideo] = useState<VideoRecording | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);

  const handleRunDiagnosis = async (resultId: string) => {
    setDiagnosingIds(prev => new Set(prev).add(resultId));
    try {
      const token = localStorage.getItem('authToken') || sessionStorage.getItem('authToken');
      const response = await fetch(API_ENDPOINTS.RESULT_DIAGNOSE(resultId), {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      });
      if (response.ok) {
        setTestResults(prev => prev.map(r => r.id === resultId ? { ...r, has_diagnosis: true } : r));
      } else {
        alert("Failed to run diagnosis.");
      }
    } catch (err) {
      console.error(err);
      alert("Error running diagnosis.");
    } finally {
      setDiagnosingIds(prev => {
        const next = new Set(prev);
        next.delete(resultId);
        return next;
      });
    }
  };

  // Browser tab + script + language filter
  const [selectedBrowser, setSelectedBrowser] = useState<string>("all");
  const [selectedScript, setSelectedScript] = useState<string>("all");
  const [selectedLanguage, setSelectedLanguage] = useState<string>("all");

  // API State
  const [testSuite, setTestSuite] = useState<TestSuite | null>(null);
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [screenshots, setScreenshots] = useState<Screenshot[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [videos, setVideos] = useState<VideoRecording[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const downloadArtifact = async (url: string, filename: string) => {
    try {
      const token = localStorage.getItem('authToken') || sessionStorage.getItem('authToken');
      const response = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!response.ok) {
        throw new Error(`Download failed: ${response.status}`);
      }

      const blob = await response.blob();
      const objectUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(objectUrl);
    } catch (downloadError) {
      console.error('Artifact download failed:', downloadError);
      alert('Download failed. Please try again.');
    }
  };

  // Derived: unique browsers from results
  const uniqueBrowsers = useMemo(() => {
    const browsers = new Set<string>();
    if (testSuite?.browsers) testSuite.browsers.forEach(b => browsers.add(b));
    testResults.forEach(r => { if (r.browser) browsers.add(r.browser); });
    return Array.from(browsers).sort();
  }, [testResults, testSuite]);

  // Derived: unique script names (clean display name -> raw name mapping)
  const uniqueScripts = useMemo(() => {
    const scripts = new Set<string>();
    testResults.forEach(r => { if (r.test_name) scripts.add(r.test_name); });
    return Array.from(scripts).sort();
  }, [testResults]);

  // Helper: detect language from test name (now checks file extension first)
  const detectLanguage = (testName: string): string => {
    if (!testName) return "unknown";
    // Check file extension first (most reliable — test_name now includes extension)
    if (testName.endsWith(".py")) return "python";
    if (testName.endsWith(".java")) return "java";
    // Fallback: heuristic for legacy results without extension
    const cleaned = testName.replace(/_\d{8}_\d{6}$/, '');
    if (cleaned.startsWith("test_") || cleaned.endsWith("_test")) return "python";
    if (/^[A-Z]/.test(cleaned) || cleaned.endsWith("Test")) return "java";
    if (cleaned.includes("_")) return "python";
    return "java";
  };

  // Derived: unique languages present in results
  const uniqueLanguages = useMemo(() => {
    const langs = new Set<string>();
    testResults.forEach(r => { if (r.test_name) langs.add(detectLanguage(r.test_name)); });
    return Array.from(langs).sort();
  }, [testResults]);

  // Helper: clean test name for display — strip timestamp but preserve file extension
  const cleanTestName = (name: string) => {
    // Extract extension if present (e.g., .py, .java)
    const extMatch = name.match(/\.(py|java)$/);
    const ext = extMatch ? extMatch[0] : '';
    // Remove extension, strip timestamp, then re-add extension
    const withoutExt = ext ? name.slice(0, -ext.length) : name;
    const cleaned = withoutExt.replace(/_\d{8}_\d{6}$/, '');
    return cleaned + ext;
  };

  // Clean video filename for display: "firefox_test_github_20260221_195500_20260221_195507_329745.mp4"  "firefox_test_github"
  const cleanVideoName = (name: string) => {
    return name
      .replace(/\.mp4$/i, '')           // Remove extension
      .replace(/_\d{8}_\d{6}/g, '')     // Remove all timestamp patterns (YYYYMMDD_HHMMSS)
      .replace(/_\d{4,}$/g, '')          // Remove trailing microseconds
      .replace(/_+$/, '');               // Remove trailing underscores
  };

  // Filtered data based on selected browser + language + script
  const filteredResults = useMemo(() => {
    return testResults.filter(r => {
      if (selectedBrowser !== "all" && r.browser?.toLowerCase() !== selectedBrowser.toLowerCase()) return false;
      if (selectedLanguage !== "all" && detectLanguage(r.test_name) !== selectedLanguage) return false;
      if (selectedScript !== "all" && r.test_name !== selectedScript) return false;
      return true;
    });
  }, [testResults, selectedBrowser, selectedLanguage, selectedScript]);

  const filteredScreenshots = useMemo(() => {
    return screenshots.filter(s => {
      if (selectedBrowser !== "all" && s.browser && s.browser.toLowerCase() !== selectedBrowser.toLowerCase()) return false;
      if (selectedLanguage !== "all" && s.test_name && detectLanguage(s.test_name) !== selectedLanguage) return false;
      if (selectedScript !== "all" && s.test_name) {
        // Strip extension and timestamp from both sides for base-name matching
        const scriptBase = selectedScript.replace(/\.(py|java)$/, '').replace(/_\d{8}_\d{6}$/, '');
        const testBase = s.test_name.replace(/\.(py|java)$/, '').replace(/_\d{8}_\d{6}$/, '');
        if (!testBase.startsWith(scriptBase)) return false;
      }
      return true;
    });
  }, [screenshots, selectedBrowser, selectedLanguage, selectedScript]);

  const filteredLogs = useMemo(() => {
    return logs.filter(l => {
      if (selectedBrowser !== "all" && l.browser && l.browser.toLowerCase() !== selectedBrowser.toLowerCase()) return false;
      if (selectedLanguage !== "all" && l.test_name && detectLanguage(l.test_name) !== selectedLanguage) return false;
      if (selectedScript !== "all" && l.test_name) {
        const scriptBase = selectedScript.replace(/\.(py|java)$/, '').replace(/_\d{8}_\d{6}$/, '');
        const testBase = l.test_name.replace(/\.(py|java)$/, '').replace(/_\d{8}_\d{6}$/, '');
        if (!testBase.startsWith(scriptBase)) return false;
      }
      return true;
    });
  }, [logs, selectedBrowser, selectedLanguage, selectedScript]);

  const filteredVideos = useMemo(() => {
    return videos.filter(v => {
      if (selectedBrowser !== "all" && v.browser && v.browser.toLowerCase() !== selectedBrowser.toLowerCase()) return false;
      if (selectedLanguage !== "all" && v.test_name && detectLanguage(v.test_name) !== selectedLanguage) return false;
      if (selectedScript !== "all" && v.test_name) {
        const scriptBase = selectedScript.replace(/\.(py|java)$/, '').replace(/_\d{8}_\d{6}$/, '');
        const testBase = v.test_name.replace(/\.(py|java)$/, '').replace(/_\d{8}_\d{6}$/, '');
        if (!testBase.startsWith(scriptBase)) return false;
      }
      return true;
    });
  }, [videos, selectedBrowser, selectedLanguage, selectedScript]);

  // Fetch data
  useEffect(() => {
    const fetchData = async () => {
      if (!testId) return;
      setLoading(true);
      setError(null);
      const token = localStorage.getItem('authToken') || sessionStorage.getItem('authToken');
      if (!token) { setError('No authentication token found'); setLoading(false); return; }

      try {
        const res = await fetch(API_ENDPOINTS.TEST_SUITE_DETAILS(testId), {
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
        });
        if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
        const data = await res.json();

        setTestSuite(data.run || data.suite || null);
        setTestResults(data.results || []);
        setVideos(data.videos || []);
        setScreenshots(data.screenshots || []);
        setLogs(data.logs || []);

        if (!data.run && !data.suite) throw new Error('Run data not found');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load test results');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [testId]);

  // Image viewer
  const openImageViewer = (screenshot: Screenshot, index: number) => {
    setSelectedImage(screenshot);
    setCurrentImageIndex(index);
  };
  const closeImageViewer = () => setSelectedImage(null);
  const navigateImage = (direction: "prev" | "next") => {
    const len = filteredScreenshots.length;
    const idx = direction === "prev" ? (currentImageIndex - 1 + len) % len : (currentImageIndex + 1) % len;
    setCurrentImageIndex(idx);
    setSelectedImage(filteredScreenshots[idx]);
  };

  const getLevelColor = (level: string) => {
    switch (level) {
      case "error": return "text-red-600 dark:text-red-400";
      case "warning": return "text-yellow-600 dark:text-yellow-400";
      default: return "text-slate-600 dark:text-slate-400";
    }
  };
  const getLevelIcon = (level: string) => {
    switch (level) {
      case "error": return <XCircle className="w-4 h-4" />;
      case "warning": return <AlertCircle className="w-4 h-4" />;
      default: return <CheckCircle2 className="w-4 h-4" />;
    }
  };

  const getCategoryBadgeClass = (category?: string) => {
    switch (category) {
      case "LOCATOR_NOT_FOUND":
        return "bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-500/20";
      case "TIMEOUT":
        return "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-500/20";
      case "ASSERTION_FAILURE":
        return "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-500/20";
      case "STALE_ELEMENT":
        return "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/20";
      case "FRAME_ERROR":
        return "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-500/20";
      default:
        return "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700";
    }
  };

  const formatCategory = (category?: string) => (category || "UNKNOWN").replace(/_/g, " ");

  const handleCopyLogs = async () => {
    try {
      const logText = filteredLogs.map(log => {
        const browserTag = log.browser ? `[${log.browser}]` : '';
        return `${log.timestamp} ${browserTag} [${log.level.toUpperCase()}] ${log.message}`;
      }).join('\n');
      
      await navigator.clipboard.writeText(logText);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error('Failed to copy logs:', err);
    }
  };

  const handleCancelRun = async () => {
    if (!testId || cancelling) return;
    setCancelling(true);
    try {
      const token = localStorage.getItem('authToken') || sessionStorage.getItem('authToken');
      if (!token) return;
      const res = await fetch(API_ENDPOINTS.CANCEL_RUN(testId), {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
      });
      if (res.ok) {
        // Refresh data to show updated statuses
        const refreshRes = await fetch(API_ENDPOINTS.TEST_SUITE_DETAILS(testId), {
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
        });
        if (refreshRes.ok) {
          const data = await refreshRes.json();
          setTestSuite(data.run || data.suite || null);
          setTestResults(data.results || []);
          setVideos(data.videos || []);
          setScreenshots(data.screenshots || []);
          setLogs(data.logs || []);
        }
      }
    } catch (err) {
      console.error('Failed to cancel run:', err);
    } finally {
      setCancelling(false);
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    try { const d = new Date(dateString); return isNaN(d.getTime()) ? 'N/A' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
    catch { return 'N/A'; }
  };
  const formatTime = (dateString?: string) => {
    if (!dateString) return 'N/A';
    try { const d = new Date(dateString); return isNaN(d.getTime()) ? 'N/A' : d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }); }
    catch { return 'N/A'; }
  };
  const formatTimePrecise = (dateString?: string) => {
    if (!dateString) return 'N/A';
    try { const d = new Date(dateString); return isNaN(d.getTime()) ? 'N/A' : d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }); }
    catch { return 'N/A'; }
  };

  const getStatus = () => {
    if (!testSuite) return 'running';
    if (testSuite.status === 'cancelled') return 'cancelled';
    if (testSuite.status === 'completed') return testSuite.failed === 0 ? 'passed' : 'failed';
    return testSuite.status;
  };

  const failedScripts = useMemo(() => filteredResults.filter(r => r.status?.toUpperCase() === "FAILED"), [filteredResults]);

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <Loader2 className="w-12 h-12 mx-auto text-blue-500 animate-spin mb-4" />
            <p className="text-slate-600 dark:text-slate-400">Loading test results...</p>
          </div>
        </div>
      </Layout>
    );
  }

  if (error || !testSuite) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <AlertCircle className="w-12 h-12 mx-auto text-red-500 mb-4" />
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">Error Loading Test Results</h3>
            <p className="text-slate-600 dark:text-slate-400 mb-4">{error || 'Test suite not found'}</p>
            <Button onClick={() => navigate("/history")}>Back to History</Button>
          </div>
        </div>
      </Layout>
    );
  }

  const status = getStatus();
  const duration = testSuite.total_duration ? Math.round(testSuite.total_duration) : (testSuite.duration_seconds ? Math.round(testSuite.duration_seconds) : 0);

  return (
    <Layout>
      {/* Header */}
      <div className="mb-4 sm:mb-6">
        <Button
          variant="ghost"
          className="mb-4 -ml-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
          onClick={() => navigate("/history")}
        >
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to History
        </Button>

        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-2">
              <h1 className="text-lg sm:text-xl md:text-2xl lg:text-3xl font-display font-bold text-slate-900 dark:text-white break-words">
                Test Run {testSuite.suite_id || testSuite.run_id}
              </h1>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge className={`${
                  status === "passed"
                    ? "bg-green-100 dark:bg-green-500/10 text-green-700 dark:text-green-400 border-green-200 dark:border-green-500/20"
                    : status === "failed"
                    ? "bg-red-100 dark:bg-red-500/10 text-red-700 dark:text-red-400 border-red-200 dark:border-red-500/20"
                    : status === "cancelled"
                    ? "bg-slate-100 dark:bg-slate-500/10 text-slate-700 dark:text-slate-400 border-slate-200 dark:border-slate-500/20"
                    : "bg-yellow-100 dark:bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-200 dark:border-yellow-500/20"
                } border capitalize text-[10px] sm:text-xs`}>
                  {status}
                </Badge>
                <Badge className={`border text-[10px] sm:text-xs ${
                  testSuite.framework === "playwright"
                    ? "bg-violet-100 dark:bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-200 dark:border-violet-500/20"
                    : "bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20"
                }`}>
                  {testSuite.framework === "playwright" ? <Zap className="w-3 h-3 mr-1 inline" /> : <Globe className="w-3 h-3 mr-1 inline" />}
                  {testSuite.framework === "playwright" ? "Playwright" : "Selenium"}
                </Badge>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-[10px] sm:text-xs md:text-sm text-slate-600 dark:text-slate-400">
              {uniqueBrowsers.map(b => (
                <Badge key={b} className={`text-[10px] sm:text-xs border ${
                  b === 'chrome'
                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-500/20'
                    : 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-500/20'
                }`}>
                  {b === 'chrome' ? <Chrome className="w-3 h-3 mr-1" /> : <Globe className="w-3 h-3 mr-1" />}
                  {b}
                </Badge>
              ))}
              <div className="flex items-center gap-1">
                <Clock className="w-3 h-3 sm:w-3.5 sm:h-3.5" /> {duration}s
              </div>
              <span className="truncate">{formatDate(testSuite.created_at)} at {formatTime(testSuite.created_at)}</span>
            </div>
          </div>
          <div className="flex flex-col xs:flex-row sm:flex-row gap-2 w-full lg:w-auto shrink-0">
            {(testSuite.status === "pending" || testSuite.status === "running") && (
              <Button
                onClick={handleCancelRun}
                disabled={cancelling}
                variant="destructive"
                className="w-full sm:w-auto text-sm"
              >
                {cancelling ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <StopCircle className="w-4 h-4 mr-2" />
                )}
                {cancelling ? "Cancelling..." : "Cancel Run"}
              </Button>
            )}
            <NeonButton onClick={() => alert("Downloading all your test artifacts...")} neonColor="blue" className="w-full lg:w-auto text-sm">
              <Download className="w-4 h-4 mr-2" /> Download All Artifacts
            </NeonButton>
          </div>
        </div>
      </div>

      {/* Test Results with Browser Tabs & Script Buttons */}
      <GlassCard className="mb-4 sm:mb-6 p-3 sm:p-4 md:p-6">
        <h3 className="text-sm sm:text-base md:text-lg font-semibold text-slate-900 dark:text-white mb-3 sm:mb-4">
          Test Results ({filteredResults.length} {filteredResults.length === 1 ? 'test' : 'tests'})
        </h3>

        {/* Browser Tabs */}
        {uniqueBrowsers.length > 0 && (
          <div className="flex items-center border-b border-slate-200 dark:border-white/10 mb-3 sm:mb-4 overflow-x-auto scrollbar-hide -mx-1 px-1">
            <button
              onClick={() => { setSelectedBrowser("all"); setSelectedLanguage("all"); setSelectedScript("all"); }}
              className={`flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                selectedBrowser === "all"
                  ? "border-blue-500 text-blue-600 dark:text-blue-400"
                  : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
              }`}
            >
              All Browsers
              <Badge variant="secondary" className="ml-1 text-[10px] sm:text-xs px-1 sm:px-1.5 py-0 h-4 sm:h-5 bg-slate-200 dark:bg-slate-700">
                {testResults.length}
              </Badge>
            </button>
            {uniqueBrowsers.map(browser => {
              const count = testResults.filter(r => r.browser?.toLowerCase() === browser.toLowerCase()).length;
              return (
                <button
                  key={browser}
                  onClick={() => { setSelectedBrowser(browser); setSelectedLanguage("all"); setSelectedScript("all"); }}
                  className={`flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                    selectedBrowser === browser
                      ? browser === 'chrome'
                        ? "border-blue-500 text-blue-600 dark:text-blue-400"
                        : "border-orange-500 text-orange-600 dark:text-orange-400"
                      : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
                  }`}
                >
                  {browser === 'chrome' ? <Chrome className="w-3 h-3 sm:w-3.5 sm:h-3.5" /> : <Globe className="w-3 h-3 sm:w-3.5 sm:h-3.5" />}
                  <span className="capitalize">{browser}</span>
                  <Badge variant="secondary" className={`ml-1 text-[10px] sm:text-xs px-1 sm:px-1.5 py-0 h-4 sm:h-5 ${
                    browser === 'chrome'
                      ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                      : 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400'
                  }`}>
                    {count}
                  </Badge>
                </button>
              );
            })}
          </div>
        )}

        {/* Language Filter */}
        {uniqueLanguages.length > 1 && (
          <div className="flex flex-wrap gap-1.5 sm:gap-2 mb-3 sm:mb-4">
            <button
              onClick={() => { setSelectedLanguage("all"); setSelectedScript("all"); }}
              className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-[10px] sm:text-xs font-medium transition-all border active:scale-95 ${
                selectedLanguage === "all"
                  ? "bg-violet-600 text-white border-violet-600 shadow-md"
                  : "bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700"
              }`}
            >
              All Languages
              <span className="ml-1.5 text-[10px] opacity-80">({testResults.filter(r => selectedBrowser === "all" || r.browser?.toLowerCase() === selectedBrowser.toLowerCase()).length})</span>
            </button>
            {uniqueLanguages.map(lang => {
              const count = testResults.filter(r =>
                detectLanguage(r.test_name) === lang &&
                (selectedBrowser === "all" || r.browser?.toLowerCase() === selectedBrowser.toLowerCase())
              ).length;
              return (
                <button
                  key={lang}
                  onClick={() => { setSelectedLanguage(lang); setSelectedScript("all"); }}
                  className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-[10px] sm:text-xs font-medium transition-all border flex items-center gap-1 sm:gap-1.5 active:scale-95 ${
                    selectedLanguage === lang
                      ? lang === "python"
                        ? "bg-emerald-600 text-white border-emerald-600 shadow-md"
                        : "bg-orange-600 text-white border-orange-600 shadow-md"
                      : "bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700"
                  }`}
                >
                  <span className="capitalize">{lang}</span>
                  <span className={`ml-0.5 text-[10px] font-mono ${
                    selectedLanguage === lang ? "opacity-90" : "opacity-50"
                  }`}>{lang === "python" ? ".py" : ".java"}</span>
                  <span className={`text-[10px] ${
                    selectedLanguage === lang ? "opacity-80" : "opacity-60"
                  }`}>({count})</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Script Name Buttons */}
        {uniqueScripts.length > 0 && (
          <div className="flex flex-wrap gap-1.5 sm:gap-2 mb-3 sm:mb-4">
            <button
              onClick={() => setSelectedScript("all")}
              className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-[10px] sm:text-xs font-medium transition-all border active:scale-95 ${
                selectedScript === "all"
                  ? "bg-blue-600 text-white border-blue-600 shadow-md"
                  : "bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700"
              }`}
            >
              All Scripts
            </button>
            {uniqueScripts.filter(script => selectedLanguage === "all" || detectLanguage(script) === selectedLanguage).map(script => {
              const scriptResults = testResults.filter(r => r.test_name === script && (selectedBrowser === "all" || r.browser?.toLowerCase() === selectedBrowser.toLowerCase()));
              const hasPassed = scriptResults.some(r => r.status?.toUpperCase() === "PASSED");
              const hasFailed = scriptResults.some(r => r.status?.toUpperCase() === "FAILED");
              return (
                <button
                  key={script}
                  onClick={() => setSelectedScript(script)}
                  className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-[10px] sm:text-xs font-medium transition-all border flex items-center gap-1 sm:gap-1.5 active:scale-95 ${
                    selectedScript === script
                      ? "bg-blue-600 text-white border-blue-600 shadow-md"
                      : "bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700"
                  }`}
                >
                  {selectedScript !== script && (
                    hasFailed ? <XCircle className="w-3 h-3 text-red-500" /> : hasPassed ? <CheckCircle2 className="w-3 h-3 text-green-500" /> : <Clock className="w-3 h-3 text-blue-500" />
                  )}
                  {cleanTestName(script)}
                </button>
              );
            })}
          </div>
        )}

        {/* Main Tabs: All Scripts | Failed Scripts */}
        <div className="flex border-b border-slate-200 dark:border-white/10 mb-6 gap-2">
          <button
            onClick={() => setActiveMainTab("all")}
            className={`px-4 py-2 border-b-2 font-medium text-sm transition-colors flex items-center gap-2 ${
              activeMainTab === "all"
                ? "border-blue-500 text-blue-600 dark:text-blue-400"
                : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300"
            }`}
          >
            <BarChart3 className="w-4 h-4" /> All Scripts
          </button>
          <button
            onClick={() => setActiveMainTab("failed")}
            className={`px-4 py-2 border-b-2 font-medium text-sm transition-colors flex items-center gap-2 ${
              activeMainTab === "failed"
                ? "border-red-500 text-red-600 dark:text-red-400"
                : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300"
            }`}
          >
            <AlertTriangle className="w-4 h-4" /> Failed Scripts
          </button>
        </div>

        {activeMainTab === "all" ? (
          /* Results Grid */
          filteredResults.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2 sm:gap-3">
              {filteredResults.map((result, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedScript(result.test_name)}
                  className={`p-3 sm:p-4 rounded-lg border text-left transition-all active:scale-[0.98] ${
                    selectedScript === result.test_name
                      ? "bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-500/30 ring-1 ring-blue-400"
                      : "bg-slate-50 dark:bg-slate-950/50 border-slate-200 dark:border-white/5 hover:border-slate-300 dark:hover:border-white/10"
                  }`}
                >
                  <div className="flex items-start gap-2 sm:gap-3">
                    {result.status?.toUpperCase() === "PASSED" ? (
                      <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 text-green-500 mt-0.5 flex-shrink-0" />
                    ) : result.status?.toUpperCase() === "FAILED" ? (
                      <XCircle className="w-4 h-4 sm:w-5 sm:h-5 text-red-500 mt-0.5 flex-shrink-0" />
                    ) : result.status?.toUpperCase() === "CANCELLED" ? (
                      <StopCircle className="w-4 h-4 sm:w-5 sm:h-5 text-slate-500 mt-0.5 flex-shrink-0" />
                    ) : (
                      <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-blue-500 mt-0.5 flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs sm:text-sm font-medium text-slate-900 dark:text-white mb-1 truncate">
                        {cleanTestName(result.test_name)}
                      </p>
                      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mb-1">
                        {result.browser && (
                          <Badge className={`text-[10px] px-1.5 py-0 border ${
                            result.browser === 'chrome'
                              ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-500/20'
                              : 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-500/20'
                          }`}>
                            {result.browser}
                          </Badge>
                        )}
                        {uniqueLanguages.length > 1 && (
                          <Badge className={`text-[10px] px-1.5 py-0 border ${
                            detectLanguage(result.test_name) === 'python'
                              ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20'
                              : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/20'
                          }`}>
                            {detectLanguage(result.test_name)}
                          </Badge>
                        )}
                        {result.status?.toUpperCase() === "FAILED" && (
                          <Badge className={`text-[10px] px-1.5 py-0 border ${getCategoryBadgeClass(result.error_category)}`}>
                            {formatCategory(result.error_category)}
                          </Badge>
                        )}
                      </div>
                      <p className="text-[10px] sm:text-xs text-slate-600 dark:text-slate-400">
                        Duration: {Math.round(result.duration_seconds)}s
                      </p>
                      <div className="flex flex-col gap-0.5 mt-1">
                        <p className="text-[9px] sm:text-[10px] font-mono text-cyan-600 dark:text-cyan-400">
                          Start: {formatTimePrecise(result.start_time)}
                        </p>
                        <p className="text-[9px] sm:text-[10px] font-mono text-amber-600 dark:text-amber-400">
                          End: {formatTimePrecise(result.end_time)}
                        </p>
                      </div>
                      {result.error_message && (
                        <p className="text-[10px] sm:text-xs text-red-600 dark:text-red-400 mt-1 line-clamp-2">{result.error_message}</p>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-slate-600 dark:text-slate-400">
              <p>No test results match the current filters.</p>
            </div>
          )
        ) : (
          /* Failed Scripts List */
          failedScripts.length > 0 ? (
            <div className="space-y-3 sm:space-y-4 mb-8">
              {failedScripts.map((script, idx) => {
                const isDiagnosing = diagnosingIds.has(script.id);
                return (
                  <GlassCard key={idx} className="group hover:bg-slate-100 dark:hover:bg-white/5 transition-colors p-4">
                    <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <XCircle className="w-5 h-5 text-red-500" />
                          <h4 className="text-base font-semibold text-slate-900 dark:text-white truncate">
                            {cleanTestName(script.test_name) || 'Unknown'}
                          </h4>
                          {script.browser && (
                            <Badge variant="secondary" className={`text-xs capitalize ${
                              script.browser === 'chrome'
                                ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                                : 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400'
                            }`}>
                              {script.browser}
                            </Badge>
                          )}
                          <Badge className={`text-xs px-2 py-0.5 border ${getCategoryBadgeClass(script.error_category)}`}>
                            {formatCategory(script.error_category)}
                          </Badge>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600 dark:text-slate-400">
                          <span>Duration: {Math.round(script.duration_seconds)}s</span>
                          {script.error_message && (
                            <>
                              <span>•</span>
                              <span className="truncate max-w-[200px] sm:max-w-[300px] text-red-600 dark:text-red-400">{script.error_message}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {script.has_diagnosis ? (
                          <>
                            <Button 
                              variant="outline" 
                              className="bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-100 dark:bg-violet-900/20 dark:text-violet-300 dark:border-violet-800/50 dark:hover:bg-violet-900/40"
                              onClick={() => window.location.href = `/tester/test-results/${testId}/diagnosis/${script.id}`}
                            >
                              <Eye className="w-4 h-4 mr-2" /> View Diagnosis
                            </Button>
                            <Button 
                              variant="outline" 
                              onClick={() => handleRunDiagnosis(script.id)}
                              disabled={isDiagnosing}
                              className="text-blue-600 border-blue-200 hover:bg-blue-50 dark:text-blue-400 dark:border-blue-800/50 dark:hover:bg-blue-900/20"
                            >
                              {isDiagnosing ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <RotateCcw className="w-4 h-4 mr-2" />}
                              {isDiagnosing ? "Re-diagnosing..." : "Re-diagnose"}
                            </Button>
                          </>
                        ) : (
                          <Button 
                            variant="outline" 
                            onClick={() => handleRunDiagnosis(script.id)}
                            disabled={isDiagnosing}
                            className="text-blue-600 border-blue-200 hover:bg-blue-50 dark:text-blue-400 dark:border-blue-800/50 dark:hover:bg-blue-900/20"
                          >
                            {isDiagnosing ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Bot className="w-4 h-4 mr-2" />}
                            {isDiagnosing ? "Diagnosing..." : "Run Diagnosis"}
                          </Button>
                        )}
                      </div>
                    </div>
                  </GlassCard>
                );
              })}
            </div>
          ) : (
            <GlassCard className="text-center py-8 sm:py-12 mb-8">
              <CheckCircle2 className="w-8 h-8 sm:w-12 sm:h-12 mx-auto text-green-500 mb-3 sm:mb-4" />
              <h3 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white mb-2">
                No Failed Scripts
              </h3>
              <p className="text-slate-600 dark:text-slate-400">
                Great job! There are no failed scripts that match your current filters.
              </p>
            </GlassCard>
          )
        )}
      </GlassCard>

      {/* Artifact Tabs: Screenshots / Logs / Videos / Visual Regression */}
      <div className="flex gap-0 mb-4 sm:mb-6 border-b border-slate-200 dark:border-white/10 overflow-x-auto scrollbar-hide">
        <button
          onClick={() => setActiveTab("screenshots")}
          className={`px-2.5 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm font-medium transition-colors relative whitespace-nowrap ${
            activeTab === "screenshots" ? "text-blue-600 dark:text-blue-400" : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
          }`}
        >
          <div className="flex items-center gap-1.5 sm:gap-2">
            <ImageIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> <span className="hidden xs:inline">Screenshots</span><span className="xs:hidden">Shots</span> ({filteredScreenshots.length})
          </div>
          {activeTab === "screenshots" && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 dark:bg-blue-400" />}
        </button>
        <button
          onClick={() => setActiveTab("logs")}
          className={`px-2.5 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm font-medium transition-colors relative whitespace-nowrap ${
            activeTab === "logs" ? "text-blue-600 dark:text-blue-400" : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
          }`}
        >
          <div className="flex items-center gap-1.5 sm:gap-2">
            <FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> Logs ({filteredLogs.length})
          </div>
          {activeTab === "logs" && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 dark:bg-blue-400" />}
        </button>
        <button
          onClick={() => setActiveTab("videos")}
          className={`px-2.5 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm font-medium transition-colors relative whitespace-nowrap ${
            activeTab === "videos" ? "text-blue-600 dark:text-blue-400" : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
          }`}
        >
          <div className="flex items-center gap-1.5 sm:gap-2">
            <Video className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> Videos ({filteredVideos.length})
          </div>
          {activeTab === "videos" && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 dark:bg-blue-400" />}
        </button>
        <button
          onClick={() => setActiveTab("visual")}
          className={`px-2.5 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm font-medium transition-colors relative whitespace-nowrap ${
            activeTab === "visual" ? "text-blue-600 dark:text-blue-400" : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
          }`}
        >
          <div className="flex items-center gap-1.5 sm:gap-2">
            <BarChart3 className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> <span className="hidden sm:inline">Visual Regression</span><span className="sm:hidden">Visual</span>
          </div>
          {activeTab === "visual" && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 dark:bg-blue-400" />}
        </button>
      </div>

      {/* Active filter indicator */}
      {(selectedBrowser !== "all" || selectedScript !== "all" || selectedLanguage !== "all") && (
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mb-3 sm:mb-4 text-[10px] sm:text-xs text-slate-500 dark:text-slate-400">
          <span>Filtered by:</span>
          {selectedBrowser !== "all" && (
            <Badge className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600">
              {selectedBrowser}
            </Badge>
          )}
          {selectedLanguage !== "all" && (
            <Badge className={`text-[10px] border ${
              selectedLanguage === "python"
                ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20"
                : "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/20"
            }`}>
              {selectedLanguage === "python" ? ".py" : ".java"}
            </Badge>
          )}
          {selectedScript !== "all" && (
            <Badge className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600">
              {cleanTestName(selectedScript)}
            </Badge>
          )}
          <button onClick={() => { setSelectedBrowser("all"); setSelectedScript("all"); setSelectedLanguage("all"); }} className="text-blue-500 hover:text-blue-400 underline">
            Clear filters
          </button>
        </div>
      )}

      {/* Screenshots Tab */}
      {activeTab === "screenshots" && (
        filteredScreenshots.length === 0 ? (
          <GlassCard className="text-center py-8 sm:py-12">
            <ImageIcon className="w-8 h-8 sm:w-12 sm:h-12 mx-auto text-slate-400 dark:text-slate-600 mb-3 sm:mb-4" />
            <h3 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white mb-2">No Screenshots</h3>
            <p className="text-slate-600 dark:text-slate-400">
              {screenshots.length > 0 ? "No screenshots match the current filters." : "No screenshots were captured during this test."}
            </p>
          </GlassCard>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2 sm:gap-3 md:gap-4">
            {filteredScreenshots.map((screenshot, index) => (
              <GlassCard
                key={screenshot.id}
                className="group cursor-pointer hover:shadow-xl transition-all overflow-hidden"
                onClick={() => openImageViewer(screenshot, index)}
              >
                <div className="aspect-video bg-slate-100 dark:bg-slate-900 relative overflow-hidden">
                  <img
                    src={API_ENDPOINTS.SCREENSHOT_IMAGE(screenshot.id)}
                    alt={screenshot.name}
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.style.display = 'none';
                      const parent = target.parentElement;
                      if (parent && !parent.querySelector('.fallback-icon')) {
                        const div = document.createElement('div');
                        div.className = 'fallback-icon absolute inset-0 flex items-center justify-center';
                        div.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" class="text-slate-400"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>';
                        parent.appendChild(div);
                      }
                    }}
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                    <ZoomIn className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </div>
                <div className="p-2 sm:p-3">
                  <p className="text-[10px] sm:text-xs font-medium text-slate-900 dark:text-white mb-1 truncate">{screenshot.name}</p>
                  <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mb-1">
                    {screenshot.test_name && (
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 truncate">{cleanTestName(screenshot.test_name)}</span>
                    )}
                    {screenshot.browser && (
                      <Badge className={`text-[10px] px-1.5 py-0 border ${
                        screenshot.browser === 'chrome'
                          ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-500/20'
                          : 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-500/20'
                      }`}>
                        {screenshot.browser}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400">Step: {screenshot.step}</p>
                  <p className="text-xs text-slate-500">{screenshot.timestamp}</p>
                </div>
              </GlassCard>
            ))}
          </div>
        )
      )}

      {/* Logs Tab */}
      {activeTab === "logs" && (
        filteredLogs.length === 0 ? (
          <GlassCard className="text-center py-8 sm:py-12">
            <FileText className="w-8 h-8 sm:w-12 sm:h-12 mx-auto text-slate-400 dark:text-slate-600 mb-3 sm:mb-4" />
            <h3 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white mb-2">No Logs</h3>
            <p className="text-slate-600 dark:text-slate-400">
              {logs.length > 0 ? "No logs match the current filters." : "No logs were captured during this test."}
            </p>
          </GlassCard>
        ) : (
          <GlassCard className="p-3 sm:p-4 md:p-6">
            <div className="mb-3 sm:mb-4 flex justify-end gap-1.5 sm:gap-2">
              <Button 
                variant="outline" 
                size="sm"
                onClick={handleCopyLogs}
                className={`text-xs sm:text-sm ${copySuccess ? "border-green-500 text-green-600 dark:text-green-400" : ""}`}
              >
                {copySuccess ? (
                  <><Check className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5 sm:mr-2" /> <span className="hidden sm:inline">Copied!</span><span className="sm:hidden"></span></>
                ) : (
                  <><Copy className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5 sm:mr-2" /> <span className="hidden sm:inline">Copy Logs</span><span className="sm:hidden">Copy</span></>
                )}
              </Button>
              <Button variant="outline" size="sm" className="text-xs sm:text-sm"><Download className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5 sm:mr-2" /> <span className="hidden sm:inline">Download Logs</span><span className="sm:hidden">Save</span></Button>
            </div>
            <div className="bg-slate-900 dark:bg-black rounded-lg p-2 sm:p-3 md:p-4 font-mono text-[10px] sm:text-xs md:text-sm max-h-[350px] sm:max-h-[450px] md:max-h-[600px] overflow-y-auto overflow-x-auto">
              {filteredLogs.map((log, index) => (
                <div key={index} className="flex items-start gap-1.5 sm:gap-2 md:gap-3 py-0.5 sm:py-1 hover:bg-white/5 min-w-0">
                  <span className="text-slate-500 text-[9px] sm:text-[10px] md:text-xs shrink-0 w-14 sm:w-16 md:w-20 truncate">{log.timestamp}</span>
                  {log.browser && (
                    <span className={`text-[9px] sm:text-[10px] md:text-xs shrink-0 px-0.5 sm:px-1 rounded ${
                      log.browser === 'chrome' ? 'text-blue-400 bg-blue-950/50' : 'text-orange-400 bg-orange-950/50'
                    }`}>{log.browser}</span>
                  )}
                  <span className={`shrink-0 [&>svg]:w-3 [&>svg]:h-3 sm:[&>svg]:w-3.5 sm:[&>svg]:h-3.5 md:[&>svg]:w-4 md:[&>svg]:h-4 ${getLevelColor(log.level)}`}>{getLevelIcon(log.level)}</span>
                  <span className={`${getLevelColor(log.level)} flex-1 break-all sm:break-normal`}>{log.message}</span>
                </div>
              ))}
            </div>
          </GlassCard>
        )
      )}

      {/* Videos Tab */}
      {activeTab === "videos" && (
        filteredVideos.length === 0 ? (
          <GlassCard className="text-center py-8 sm:py-12">
            <Video className="w-8 h-8 sm:w-12 sm:h-12 mx-auto text-slate-400 dark:text-slate-600 mb-3 sm:mb-4" />
            <h3 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white mb-2">No Videos</h3>
            <p className="text-slate-600 dark:text-slate-400">
              {videos.length > 0 ? "No videos match the current filters." : "No videos were captured during this test."}
            </p>
          </GlassCard>
        ) : (
          <div className="space-y-2 sm:space-y-3 md:space-y-4">
            {filteredVideos.map((video, index) => (
              <GlassCard key={index} className="p-3 sm:p-4 md:p-6">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-3">
                  <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1 overflow-hidden w-full">
                    <div className="w-10 h-10 sm:w-12 sm:h-12 md:w-16 md:h-16 bg-slate-100 dark:bg-slate-900 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Video className="w-5 h-5 sm:w-6 sm:h-6 md:w-8 md:h-8 text-slate-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mb-1">
                        <h3 className="text-xs sm:text-sm md:text-base font-medium text-slate-900 dark:text-white truncate max-w-[180px] sm:max-w-none" title={video.name}>{cleanVideoName(video.name)}</h3>
                        {video.browser && (
                          <Badge className={`text-[10px] px-1.5 py-0 border shrink-0 ${
                            video.browser === 'chrome'
                              ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-500/20'
                              : 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-500/20'
                          }`}>
                            {video.browser}
                          </Badge>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-2 sm:gap-x-3 gap-y-0.5 sm:gap-y-1 text-[10px] sm:text-xs text-slate-600 dark:text-slate-400">
                        {video.test_name && <span className="truncate max-w-[140px] sm:max-w-none">Script: {cleanTestName(video.test_name)}</span>}
                        {video.test_name && <span className="hidden sm:inline">&bull;</span>}
                        <span>Duration: {video.duration}</span>
                        <span className="hidden sm:inline">&bull;</span>
                        <span>Size: {video.size}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1.5 sm:gap-2 shrink-0 w-full sm:w-auto">
                    <Button variant="outline" size="sm" className="flex-1 sm:flex-none text-xs sm:text-sm" onClick={() => setSelectedVideo(video)}>
                      <Play className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5 sm:mr-2" /> Play
                    </Button>
                    <Button variant="outline" size="sm" className="flex-1 sm:flex-none text-xs sm:text-sm" onClick={() => {
                      const videoUrl = video.id
                        ? `${API_ENDPOINTS.VIDEO_STREAM(video.id)}?download=1`
                        : `${video.url}?download=1`;
                      void downloadArtifact(videoUrl, video.name || 'video.mp4');
                    }}>
                      <Download className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5 sm:mr-2" /> <span className="hidden sm:inline">Download</span><span className="sm:hidden">Save</span>
                    </Button>
                  </div>
                </div>
              </GlassCard>
            ))}
          </div>
        )
      )}

      {/* Visual Regression Tab */}
      {activeTab === "visual" && (
        <div className="space-y-6">
          {/* Automatic, run-level visual regression (every script/screenshot, parallel) */}
          {testId && <VRTRunPanel runId={testId} />}
        </div>
      )}

      {/* Image Viewer Dialog */}
      <Dialog open={!!selectedImage} onOpenChange={closeImageViewer}>
        <DialogContent className="max-w-[100vw] sm:max-w-[95vw] md:max-w-5xl w-full h-[100dvh] sm:h-[90vh] bg-black/95 border-0 p-0 rounded-none sm:rounded-lg">
          <div className="relative w-full h-full flex flex-col">
            <div className="absolute top-0 left-0 right-0 z-10 bg-gradient-to-b from-black/80 to-transparent p-3 sm:p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="text-white min-w-0 flex-1">
                  <p className="font-medium text-xs sm:text-sm md:text-base truncate">{selectedImage?.name}</p>
                  <p className="text-[10px] sm:text-sm text-white/70 truncate">{selectedImage?.step}</p>
                </div>
                <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                  <Button variant="ghost" size="icon" className="text-white hover:bg-white/10"
                    onClick={() => {
                      if (!selectedImage?.id) return;
                      const screenshotUrl = `${API_ENDPOINTS.SCREENSHOT_IMAGE(selectedImage.id)}?download=1`;
                      void downloadArtifact(screenshotUrl, selectedImage.name || 'screenshot.png');
                    }}>
                    <Download className="w-5 h-5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="text-white hover:bg-white/10" onClick={closeImageViewer}>
                    <X className="w-5 h-5" />
                  </Button>
                </div>
              </div>
            </div>

            <div className="flex-1 flex items-center justify-center p-4">
              <img
                src={selectedImage?.id ? API_ENDPOINTS.SCREENSHOT_IMAGE(selectedImage.id) : ''}
                alt={selectedImage?.name}
                className="max-w-full max-h-full object-contain"
              />
            </div>

            <div className="absolute top-1/2 left-1.5 sm:left-4 -translate-y-1/2">
              <Button variant="ghost" size="icon" className="text-white bg-black/50 hover:bg-black/70 w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12" onClick={() => navigateImage("prev")}>
                <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6" />
              </Button>
            </div>
            <div className="absolute top-1/2 right-1.5 sm:right-4 -translate-y-1/2">
              <Button variant="ghost" size="icon" className="text-white bg-black/50 hover:bg-black/70 w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12" onClick={() => navigateImage("next")}>
                <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6" />
              </Button>
            </div>

            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3 sm:p-4">
              <div className="text-center text-white/70 text-xs sm:text-sm">
                {currentImageIndex + 1} / {filteredScreenshots.length}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Video Player Dialog */}
      <Dialog open={!!selectedVideo} onOpenChange={() => setSelectedVideo(null)}>
        <DialogContent className="max-w-[100vw] sm:max-w-[95vw] md:max-w-4xl w-full bg-slate-900/95 dark:bg-black/95 border-slate-700 dark:border-white/10 p-0 rounded-none sm:rounded-lg">
          <div className="relative">
            <div className="absolute top-0 left-0 right-0 z-10 bg-gradient-to-b from-black/80 to-transparent p-3 sm:p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="text-white min-w-0 flex-1">
                  <p className="font-medium text-xs sm:text-sm md:text-base truncate">{selectedVideo ? cleanVideoName(selectedVideo.name) : ''}</p>
                  <p className="text-[10px] sm:text-sm text-white/70">Duration: {selectedVideo?.duration} | Size: {selectedVideo?.size}</p>
                </div>
                <Button variant="ghost" size="icon" className="text-white hover:bg-white/10" onClick={() => setSelectedVideo(null)}>
                  <X className="w-5 h-5" />
                </Button>
              </div>
            </div>
            <div className="p-2 sm:p-4 pt-16 sm:pt-20">
              <video controls className="w-full rounded-md sm:rounded-lg" src={selectedVideo?.id ? API_ENDPOINTS.VIDEO_STREAM(selectedVideo.id) : ''} autoPlay>
                Your browser does not support the video tag.
              </video>
            </div>
            <div className="p-2 sm:p-4 bg-gradient-to-t from-black/80 to-transparent">
              <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm" onClick={() => {
                if (selectedVideo?.id) {
                  const videoUrl = `${API_ENDPOINTS.VIDEO_STREAM(selectedVideo.id)}?download=1`;
                  void downloadArtifact(videoUrl, selectedVideo.name || 'video.mp4');
                }
              }}>
                <Download className="w-4 h-4 mr-2" /> Download Video
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
