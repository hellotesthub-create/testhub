import Layout from "@/components/layout/Layout";
import { toast } from "sonner";
import { GlassCard } from "@/components/ui/glass-card";
import { NeonButton } from "@/components/ui/neon-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Upload, Play, FileCode, X, CheckCircle2, Loader2, Eye,
  FlaskConical, Rocket, AlertCircle, Clock, XCircle, Code2, StopCircle, RefreshCw,
  Github, Search, FolderGit2
} from "lucide-react";
import { BrandIcon } from "@/lib/brandAssets";
import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/authContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { API_ENDPOINTS } from "@/lib/apiConfig";

interface UploadedFile {
  name: string;
  size: string;
  type: string;
  file: File;
}

interface GitHubFileEntry {
  name: string;
  path: string;
  size: number;
  download_url: string;
  language: string;
  selected: boolean;
}

interface ScriptExecution {
  name: string;
  browser: string;
  status: "pending" | "running" | "passed" | "failed" | "cancelled";
  progress: number;
  message: string;
  startTime?: number;
  endTime?: number;
  duration?: string;
}

const formatDuration = (seconds: number): string => {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs.toString().padStart(2, '0')}s`;
};

export default function TestLab() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  
  // Create Test Suite state
  const [suiteName, setSuiteName] = useState("");
  const [selectedBrowsers, setSelectedBrowsers] = useState<string[]>([]);
  const [sendCompletionEmail, setSendCompletionEmail] = useState(true);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [selectedLanguage, setSelectedLanguage] = useState<"python" | "java" | "both">("python");
  const [selectedFramework, setSelectedFramework] = useState<"selenium" | "playwright">("selenium");
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Execution Center state
  const [isRunning, setIsRunning] = useState(false);
  const [, setSuiteReady] = useState(false);
  const [scriptExecutions, setScriptExecutions] = useState<ScriptExecution[]>([]);
  const [overallProgress, setOverallProgress] = useState(0);
  const [, setExecutionPhase] = useState<"idle" | "uploading" | "running" | "completed">("idle");
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [completedSuiteId, setCompletedSuiteId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const cancelledRef = useRef(false);

  // GitHub fetch state
  const [scriptSource, setScriptSource] = useState<"upload" | "github">("upload");
  const [githubRepoURL, setGithubRepoURL] = useState("");
  const [githubFiles, setGithubFiles] = useState<GitHubFileEntry[]>([]);
  const [githubFetching, setGithubFetching] = useState(false);
  const [githubError, setGithubError] = useState<string | null>(null);

  // Live 1-second timer to tick duration for running scripts
  // Only ticks once startTime is set from the backend's start_time
  useEffect(() => {
    if (!isRunning) return;
    const timer = setInterval(() => {
      setScriptExecutions(prev => prev.map(script => {
        if (script.status !== "running" || !script.startTime) return script;
        const elapsed = Math.floor((Date.now() - script.startTime) / 1000);
        return { ...script, duration: elapsed >= 1 ? formatDuration(elapsed) : undefined };
      }));
    }, 1000);
    return () => clearInterval(timer);
  }, [isRunning]);

  const toggleBrowser = (browser: string) => {
    setSelectedBrowsers(prev => 
      prev.includes(browser) 
        ? prev.filter(b => b !== browser)
        : [...prev, browser]
    );
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      const newFiles: UploadedFile[] = Array.from(files)
        .filter(file => {
          const ext = file.name.split(".").pop()?.toLowerCase();
          if (selectedLanguage === "python") return ext === "py";
          if (selectedLanguage === "java") return ext === "java";
          return ext === "py" || ext === "java"; // both
        })
        .map(file => ({
          name: file.name,
          size: formatFileSize(file.size),
          type: getFileType(file.name),
          file: file,
        }));
      setUploadedFiles(prev => [...prev, ...newFiles]);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Get allowed file extensions based on selected language
  const getAllowedExtensions = (): string => {
    if (selectedLanguage === "python") return ".py";
    if (selectedLanguage === "java") return ".java";
    return ".py,.java";
  };

  // Handle language change — clear uploaded files if language changes
  const handleLanguageChange = (lang: "python" | "java" | "both") => {
    if (lang !== selectedLanguage) {
      setSelectedLanguage(lang);
      setUploadedFiles([]); // Clear files when language changes
    }
  };

  // Fetch test scripts from a GitHub repository
  const handleGitHubFetch = async () => {
    if (!githubRepoURL.trim()) return;
    setGithubFetching(true);
    setGithubError(null);
    setGithubFiles([]);

    try {
      const token = localStorage.getItem("authToken") || sessionStorage.getItem("authToken");
      if (!token) {
        setGithubError("Not authenticated");
        return;
      }

      const res = await fetch(API_ENDPOINTS.GITHUB_FETCH, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ repo_url: githubRepoURL.trim() }),
      });

      if (!res.ok) {
        const errText = await res.text();
        setGithubError(errText || "Failed to fetch from GitHub");
        return;
      }

      const data = await res.json();
      const files: GitHubFileEntry[] = (data.files || []).map((f: any) => ({
        ...f,
        selected: true,
      }));

      if (files.length === 0) {
        setGithubError("No test scripts (.py or .java) found in this repository/path");
        return;
      }

      setGithubFiles(files);

      // Auto-detect language from file extensions
      const hasPy = files.some((f: GitHubFileEntry) => f.name.endsWith(".py"));
      const hasJava = files.some((f: GitHubFileEntry) => f.name.endsWith(".java"));
      if (hasPy && hasJava) {
        setSelectedLanguage("both");
      } else if (hasJava) {
        setSelectedLanguage("java");
      } else {
        setSelectedLanguage("python");
      }

      // Auto-select both browsers
      setSelectedBrowsers(["chrome", "firefox"]);

    } catch (err) {
      setGithubError("Network error. Could not reach the server.");
    } finally {
      setGithubFetching(false);
    }
  };

  const toggleGithubFile = (index: number) => {
    setGithubFiles(prev => {
      const updated = prev.map((f, i) => i === index ? { ...f, selected: !f.selected } : f);

      // Auto-detect language from selected files
      const selected = updated.filter(f => f.selected);
      const hasPy = selected.some(f => f.name.endsWith(".py"));
      const hasJava = selected.some(f => f.name.endsWith(".java"));
      if (hasPy && hasJava) setSelectedLanguage("both");
      else if (hasJava) setSelectedLanguage("java");
      else setSelectedLanguage("python");

      return updated;
    });
  };

  const selectedGithubFiles = githubFiles.filter(f => f.selected);

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  const getFileType = (fileName: string): string => {
    const ext = fileName.split(".").pop()?.toLowerCase();
    if (ext === "py") return "Python";
    if (ext === "js") return "JavaScript";
    if (ext === "java") return "Java";
    return "Script";
  };

  const removeFile = (index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  };

  // Check if suite is ready for execution
  const hasFiles = scriptSource === "upload" ? uploadedFiles.length > 0 : selectedGithubFiles.length > 0;
  const isSuiteReady = suiteName.trim() && selectedBrowsers.length > 0 && hasFiles;

  // Execute the test suite
  const executeTests = async () => {
    if (!isSuiteReady) return;

    setIsRunning(true);
    setExecutionPhase("uploading");
    setOverallProgress(0);
    cancelledRef.current = false;
    setCancelling(false);
    
    // Initialize script status — one entry per file x browser combination
    const fileList = scriptSource === "upload" 
      ? uploadedFiles.map(f => f.name)
      : selectedGithubFiles.map(f => f.name);
    const initialExecutions: ScriptExecution[] = [];
    for (const fileName of fileList) {
      for (const browser of selectedBrowsers) {
        initialExecutions.push({
          name: fileName,
          browser,
          status: "pending" as const,
          progress: 0,
          message: "Queued for execution"
        });
      }
    }
    setScriptExecutions(initialExecutions);
    
    try {
      // Step 1: Upload and submit
      setOverallProgress(5);
      
      const formData = new FormData();
      formData.append("suite_name", suiteName);
      formData.append("browsers", JSON.stringify(selectedBrowsers));
      formData.append("language", selectedLanguage);
      formData.append("framework", selectedFramework);
      formData.append("username", user?.username || "");
      formData.append("email", user?.email || "");
      formData.append("user_id", user?.id || "");
      formData.append("send_email_on_completion", String(sendCompletionEmail));

      if (scriptSource === "upload") {
        uploadedFiles.forEach((fileObj) => {
          formData.append(`test_files`, fileObj.file);
        });
      } else {
        // Send GitHub file URLs for backend to download
        const ghFiles = selectedGithubFiles.map(f => ({
          name: f.name,
          download_url: f.download_url,
        }));
        formData.append("github_files", JSON.stringify(ghFiles));
      }

      const token = localStorage.getItem("authToken") || sessionStorage.getItem("authToken");
      if (!token) {
        throw new Error("No authentication token found. Please login again.");
      }

      setOverallProgress(10);

      const response = await fetch(`${API_ENDPOINTS.TEST_SUITES}/run`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Failed to start test execution");
      }

      const result = await response.json();
      const runId = result.run_id || result.id;
      // suite_id available in result.suite_id if needed
      
      if (!runId) {
        throw new Error("No run ID returned from server");
      }
      
      setCompletedSuiteId(runId);
      setExecutionPhase("running");
      setOverallProgress(15);

      // Set all scripts to running (no startTime yet — timer starts when backend reports start_time)
      setScriptExecutions(prev => prev.map(script => ({
        ...script,
        status: "running",
        progress: 10,
        message: "Initializing browser...",
        startTime: undefined,
        endTime: undefined,
        duration: undefined
      })));

      // Poll for test completion with per-script status
      let attempts = 0;
      const maxAttempts = 120;
      let allCompleted = false;

      while (attempts < maxAttempts && !allCompleted) {
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Check if cancelled
        if (cancelledRef.current) {
          allCompleted = true;
          break;
        }

        try {
          const statusResponse = await fetch(API_ENDPOINTS.RUN_DETAILS(runId), {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });

          if (statusResponse.ok) {
            const statusData = await statusResponse.json();
            const suiteStatus = statusData.run?.status || statusData.status;
            const results = statusData.results || [];
            
            // Update per-script status based on results (match by file basename + browser)
            setScriptExecutions(prev => {
              return prev.map(script => {
                const scriptBaseName = script.name.replace('.py', '').replace('.js', '').replace('.java', '').replace('.ts', '');
                // Match result by BOTH test_name prefix AND browser
                const result = results.find((r: any) => {
                  const nameMatch = r.test_name === script.name || 
                    r.test_name === scriptBaseName ||
                    r.test_name?.startsWith(scriptBaseName + '_') ||
                    r.test_name?.startsWith(scriptBaseName);
                  const browserMatch = r.browser?.toLowerCase() === script.browser.toLowerCase();
                  return nameMatch && browserMatch;
                });
                
                if (result) {
                  const status = result.status?.toLowerCase();
                  const isTerminal = status === "passed" || status === "success" || status === "failed" || status === "error" || status === "cancelled";
                  const mappedStatus = status === "passed" || status === "success" ? "passed" as const : 
                            status === "cancelled" ? "cancelled" as const :
                            status === "failed" || status === "error" ? "failed" as const : "running" as const;

                  // Use backend start_time if available (accurate), otherwise keep frontend estimate
                  const backendStart = result.start_time ? new Date(result.start_time).getTime() : null;
                  const actualStartTime = backendStart || script.startTime;

                  // For terminal results, use backend's duration_seconds (matches results page exactly)
                  // For running results, compute from backend start_time
                  let duration: string | undefined;
                  if (isTerminal && result.duration_seconds) {
                    duration = formatDuration(Math.round(result.duration_seconds));
                  } else {
                    const elapsed = actualStartTime ? Math.floor((Date.now() - actualStartTime) / 1000) : 0;
                    duration = elapsed >= 1 ? formatDuration(elapsed) : undefined;
                  }

                  return {
                    ...script,
                    status: mappedStatus,
                    progress: isTerminal ? 100 : script.progress,
                    message: status === "passed" || status === "success" ? "Test passed!" : 
                            status === "cancelled" ? "Cancelled by user" :
                            status === "failed" || status === "error" ? "Test failed" : "Executing...",
                    startTime: actualStartTime,
                    endTime: isTerminal ? (script.endTime || Date.now()) : script.endTime,
                    duration
                  };
                }
                
                // Still running - update progress animation
                const elapsed = script.startTime ? Math.floor((Date.now() - script.startTime) / 1000) : 0;
                const animatedProgress = Math.min(90, 10 + (elapsed * 2));
                return {
                  ...script,
                  progress: animatedProgress,
                  message: getRunningMessage(elapsed),
                  duration: elapsed >= 1 ? formatDuration(elapsed) : undefined
                };
              });
            });

            // Calculate overall progress — count only terminal (passed/failed) results
            const terminalCount = results.filter((r: any) => {
              const s = r.status?.toLowerCase();
              return s === "passed" || s === "success" || s === "failed" || s === "error" || s === "cancelled";
            }).length;
            const totalFileCount = scriptSource === "upload" ? uploadedFiles.length : selectedGithubFiles.length;
            const totalExpected = totalFileCount * selectedBrowsers.length;
            const progressPercent = 15 + (terminalCount / totalExpected) * 80;
            setOverallProgress(Math.min(95, progressPercent));

            // Check if all done
            if (suiteStatus === "completed" || suiteStatus === "passed" || suiteStatus === "failed" || suiteStatus === "cancelled") {
              allCompleted = true;
              setOverallProgress(100);
              setExecutionPhase("completed");

              // If cancelled, update script statuses and mark ref
              if (suiteStatus === "cancelled") {
                cancelledRef.current = true;
                setScriptExecutions(prev => prev.map(script => 
                  script.status === "running" || script.status === "pending"
                    ? { ...script, status: "cancelled" as const, progress: 100, message: "Cancelled by user" }
                    : script
                ));
                setIsRunning(false);
                // Delay dialog so cancelled state renders first
                setTimeout(() => setShowSuccessDialog(true), 300);
              }
            }
          }
        } catch (pollError) {
          console.warn("Status poll error:", pollError);
        }
        
        attempts++;
      }

      if (!allCompleted) {
        setOverallProgress(100);
        setExecutionPhase("completed");
      }

      // If cancelled via handleCancelRun, it will show the dialog itself
      if (!cancelledRef.current) {
        await new Promise(resolve => setTimeout(resolve, 500));
        setShowSuccessDialog(true);
        setIsRunning(false);
      }

    } catch (error) {
      console.error("Test execution error:", error);
      setScriptExecutions(prev => prev.map(script => ({
        ...script,
        status: "failed",
        progress: 100,
        message: "Execution failed"
      })));
      setExecutionPhase("idle");
      setIsRunning(false);
      toast.error("Failed to execute tests. Please try again.");
    }
  };

  const getRunningMessage = (seconds: number): string => {
    if (seconds < 5) return "Initializing browser...";
    if (seconds < 10) return "Loading test page...";
    if (seconds < 20) return "Executing test steps...";
    if (seconds < 40) return "Running assertions...";
    if (seconds < 60) return "Capturing screenshots...";
    return "Processing results...";
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "passed":
        return <CheckCircle2 className="w-5 h-5 text-emerald-500" />;
      case "failed":
        return <XCircle className="w-5 h-5 text-red-500" />;
      case "cancelled":
        return <StopCircle className="w-5 h-5 text-slate-400" />;
      case "running":
        return <Loader2 className="w-5 h-5 text-primary animate-spin" />;
      default:
        return <Clock className="w-5 h-5 text-slate-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "passed": return "bg-emerald-500";
      case "failed": return "bg-red-500";
      case "cancelled": return "bg-slate-400";
      case "running": return "bg-gradient-to-r from-primary to-accent";
      default: return "bg-slate-400";
    }
  };

  const handleViewResults = () => {
    setShowSuccessDialog(false);
    if (completedSuiteId) {
      setLocation(`/tester/test-results/${completedSuiteId}`);
    } else {
      setLocation("/history");
    }
  };

  const handleCreateNew = () => {
    setShowSuccessDialog(false);
    setSuiteName("");
    setSelectedBrowsers([]);
    setSendCompletionEmail(true);
    setUploadedFiles([]);
    setSelectedLanguage("python");
    setSelectedFramework("selenium");
    setScriptExecutions([]);
    setSuiteReady(false);
    setOverallProgress(0);
    setExecutionPhase("idle");
    setCompletedSuiteId(null);
    cancelledRef.current = false;
    setGithubFiles([]);
    setGithubError(null);
    setGithubRepoURL("");
    setScriptSource("upload");
  };

  const handleClearExecution = () => {
    setScriptExecutions([]);
    setOverallProgress(0);
    setExecutionPhase("idle");
    setCompletedSuiteId(null);
    cancelledRef.current = false;
  };

  // Cancel a running test
  const handleCancelRun = async () => {
    if (!completedSuiteId || cancelling) return;
    setCancelling(true);
    cancelledRef.current = true;

    try {
      const token = localStorage.getItem("authToken") || sessionStorage.getItem("authToken");
      if (!token) return;

      const res = await fetch(API_ENDPOINTS.CANCEL_RUN(completedSuiteId), {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        setScriptExecutions(prev => prev.map(script =>
          script.status === "running" || script.status === "pending"
            ? { ...script, status: "cancelled" as const, progress: 100, message: "Cancelled by user" }
            : script
        ));
        setOverallProgress(100);
        setExecutionPhase("completed");
        setIsRunning(false);
        // Delay showing dialog so React processes the cancelled state first
        setTimeout(() => setShowSuccessDialog(true), 300);
      }
    } catch (err) {
      console.error("Failed to cancel run:", err);
    } finally {
      setCancelling(false);
    }
  };

  const passedCount = scriptExecutions.filter(s => s.status === "passed").length;
  const failedCount = scriptExecutions.filter(s => s.status === "failed").length;
  const cancelledCount = scriptExecutions.filter(s => s.status === "cancelled").length;
  const runningCount = scriptExecutions.filter(s => s.status === "running").length;

  return (
    <Layout>
      {/* Page Header */}
      <div className="flex items-center justify-between mb-4 sm:mb-6 md:mb-8">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="p-1.5 sm:p-2.5 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 border border-primary/30 shadow-[0_0_20px_-6px_hsl(var(--primary)/0.5)]">
            <FlaskConical className="w-5 h-5 sm:w-6 sm:h-6 md:w-8 md:h-8 text-primary" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl md:text-3xl font-display font-bold tracking-tight">
              <span className="text-gradient">Test Lab</span>
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground hidden sm:block">Configure, execute, and monitor your automated tests</p>
          </div>
        </div>
      </div>

      <div className="space-y-4 sm:space-y-6 md:space-y-8">
        {/* ==================== SECTION 1: CREATE TEST SUITE ==================== */}
        <div>
          <div className="flex items-center gap-2 mb-3 sm:mb-4">
            <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-primary/15 ring-1 ring-primary/30 flex items-center justify-center">
              <span className="text-primary font-bold text-xs sm:text-sm">1</span>
            </div>
            <h2 className="text-base sm:text-lg md:text-xl font-semibold text-slate-900 dark:text-white">Create Test Suite</h2>
            {isSuiteReady && (
              <CheckCircle2 className="w-5 h-5 text-green-500 ml-2" />
            )}
          </div>

          <div className="max-w-3xl mx-auto mb-3 sm:mb-4 md:mb-6">
            <GlassCard>
              <h3 className="text-sm sm:text-base md:text-lg font-semibold text-slate-900 dark:text-white mb-3 sm:mb-4">Test Framework</h3>
              <div className="flex rounded-lg border border-slate-300 dark:border-white/10 overflow-hidden">
                <button
                  onClick={() => !isRunning && setSelectedFramework("selenium")}
                  disabled={isRunning}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-3 text-sm font-medium transition-all ${
                    selectedFramework === "selenium"
                      ? "bg-green-500/20 text-green-600 dark:text-green-400 border-r border-slate-300 dark:border-white/10"
                      : "text-slate-500 hover:bg-slate-50 dark:hover:bg-white/5 border-r border-slate-300 dark:border-white/10"
                  } ${isRunning ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  <BrandIcon kind="framework" name="selenium" className="w-4 h-4" />
                  Selenium
                </button>
                <button
                  onClick={() => !isRunning && setSelectedFramework("playwright")}
                  disabled={isRunning}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-3 text-sm font-medium transition-all ${
                    selectedFramework === "playwright"
                      ? "bg-violet-500/20 text-violet-600 dark:text-violet-400"
                      : "text-slate-500 hover:bg-slate-50 dark:hover:bg-white/5"
                  } ${isRunning ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  <BrandIcon kind="framework" name="playwright" className="w-4 h-4" />
                  Playwright
                </button>
              </div>
              <p className="text-xs text-slate-400 mt-2">
                {selectedFramework === "selenium"
                  ? "Selenium Grid - tests run on remote browser nodes"
                  : "Playwright - tests run with bundled browsers (faster startup)"}
              </p>
            </GlassCard>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4 md:gap-6">
            {/* Suite Configuration */}
            <GlassCard>
              <h3 className="text-sm sm:text-base md:text-lg font-semibold text-slate-900 dark:text-white mb-3 sm:mb-4">Suite Configuration</h3>
              <div className="space-y-2">
                <Label htmlFor="suite-name" className="text-slate-900 dark:text-white">Suite Name</Label>
                <Input 
                  id="suite-name"
                  placeholder="e.g., Login & Checkout Flow"
                  value={suiteName}
                  onChange={(e) => setSuiteName(e.target.value)}
                  disabled={isRunning}
                  className="bg-slate-50 dark:bg-slate-950/50 border-slate-300 dark:border-white/10 text-slate-900 dark:text-white"
                />
              </div>
            </GlassCard>

            {/* Language Selection */}
            <GlassCard>
              <h3 className="text-sm sm:text-base md:text-lg font-semibold text-foreground mb-3 sm:mb-4">
                <span className="flex items-center gap-2">
                  <Code2 className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
                  Language
                </span>
              </h3>
              <div className="space-y-2">
                {([
                  { id: "python", label: "Python", ext: ".py", icons: ["python"] },
                  { id: "java", label: "Java", ext: ".java", icons: ["java"] },
                  { id: "both", label: "Both", ext: ".py, .java", icons: ["python", "java"] },
                ] as const).map((opt) => {
                  const selected = selectedLanguage === opt.id;
                  return (
                    <div
                      key={opt.id}
                      className={`group flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all duration-300 ${
                        selected
                          ? "border-primary/60 bg-primary/10 shadow-[0_0_18px_-6px_hsl(var(--primary)/0.5)]"
                          : "border-border hover:border-primary/30 hover:bg-primary/[0.04]"
                      }`}
                      onClick={() => !isRunning && handleLanguageChange(opt.id)}
                    >
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors ${
                        selected ? "border-primary" : "border-muted-foreground/40 group-hover:border-primary/50"
                      }`}>
                        {selected && <div className="w-2 h-2 rounded-full bg-primary" />}
                      </div>
                      <div className="flex items-center -space-x-1">
                        {opt.icons.map((ic) => (
                          <span
                            key={ic}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-card ring-1 ring-border"
                          >
                            <BrandIcon kind="language" name={ic} className="h-4 w-4" />
                          </span>
                        ))}
                      </div>
                      <span className="text-sm font-medium text-foreground">{opt.label}</span>
                      <span className="text-xs text-muted-foreground ml-auto font-mono">{opt.ext}</span>
                    </div>
                  );
                })}
              </div>
            </GlassCard>

            {/* Browser Selection */}
            <GlassCard>
              <h3 className="text-sm sm:text-base md:text-lg font-semibold text-slate-900 dark:text-white mb-3 sm:mb-4">Select Browsers</h3>
              <div className="space-y-2">
                <div 
                  className="flex items-center gap-3 p-3 rounded-lg border border-slate-300 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/5 cursor-pointer"
                  onClick={() => !isRunning && toggleBrowser("chrome")}
                >
                  <Checkbox checked={selectedBrowsers.includes("chrome")} disabled={isRunning} />
                  <BrandIcon kind="browser" name="chrome" className="w-6 h-6" />
                  <span className="text-sm text-slate-900 dark:text-white">Chrome</span>
                </div>
                <div 
                  className="flex items-center gap-3 p-3 rounded-lg border border-slate-300 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/5 cursor-pointer"
                  onClick={() => !isRunning && toggleBrowser("firefox")}
                >
                  <Checkbox checked={selectedBrowsers.includes("firefox")} disabled={isRunning} />
                  <BrandIcon kind="browser" name="firefox" className="w-6 h-6" />
                  <span className="text-sm text-slate-900 dark:text-white">Firefox</span>
                </div>
              </div>
            </GlassCard>

            {/* Script Upload */}
            <GlassCard>
              <h3 className="text-sm sm:text-base md:text-lg font-semibold text-slate-900 dark:text-white mb-2 sm:mb-3">Test Scripts</h3>
              
              {/* Source Toggle: Upload vs GitHub */}
              <div className="flex rounded-lg border border-slate-300 dark:border-white/10 overflow-hidden mb-4">
                <button
                  onClick={() => { if (!isRunning) { setScriptSource("upload"); setGithubFiles([]); setGithubError(null); } }}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors ${
                    scriptSource === "upload"
                      ? "bg-blue-500/20 text-blue-600 dark:text-blue-400 border-r border-slate-300 dark:border-white/10"
                      : "text-slate-500 hover:bg-slate-50 dark:hover:bg-white/5 border-r border-slate-300 dark:border-white/10"
                  }`}
                >
                  <Upload className="w-3.5 h-3.5" /> Upload
                </button>
                <button
                  onClick={() => { if (!isRunning) { setScriptSource("github"); setUploadedFiles([]); } }}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors ${
                    scriptSource === "github"
                      ? "bg-purple-500/20 text-purple-600 dark:text-purple-400"
                      : "text-slate-500 hover:bg-slate-50 dark:hover:bg-white/5"
                  }`}
                >
                  <Github className="w-3.5 h-3.5" /> GitHub
                </button>
              </div>

              {/* Upload Mode */}
              {scriptSource === "upload" && (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept={getAllowedExtensions()}
                    onChange={handleFileSelect}
                    className="hidden"
                    id="script-upload"
                    disabled={isRunning}
                  />
                  <label
                    htmlFor="script-upload"
                    className={`block p-4 rounded-lg border-2 border-dashed border-slate-300 dark:border-white/10 hover:border-blue-500/50 transition-all cursor-pointer text-center ${isRunning ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <Upload className="w-6 h-6 mx-auto mb-2 text-slate-400" />
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      Click to upload ({getAllowedExtensions()})
                    </p>
                  </label>
                  
                  {uploadedFiles.length > 0 && (
                    <div className="mt-3 space-y-1 max-h-32 overflow-y-auto">
                      {uploadedFiles.map((file, index) => (
                        <div key={index} className="flex items-center gap-2 p-2 rounded bg-slate-50 dark:bg-slate-950/50 text-sm">
                          <FileCode className="w-4 h-4 text-blue-500 flex-shrink-0" />
                          <span className="flex-1 truncate text-slate-900 dark:text-white">{file.name}</span>
                          <button onClick={() => removeFile(index)} className="text-slate-400 hover:text-red-500" disabled={isRunning}>
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {/* GitHub Mode */}
              {scriptSource === "github" && (
                <div className="space-y-3">
                  <div>
                    <Input
                      placeholder="https://github.com/owner/repo"
                      value={githubRepoURL}
                      onChange={(e) => setGithubRepoURL(e.target.value)}
                      disabled={isRunning || githubFetching}
                      className="bg-slate-50 dark:bg-slate-950/50 border-slate-300 dark:border-white/10 text-slate-900 dark:text-white text-sm"
                    />
                  </div>
                  <Button
                    onClick={handleGitHubFetch}
                    disabled={!githubRepoURL.trim() || isRunning || githubFetching}
                    size="sm"
                    className="w-full bg-purple-600 hover:bg-purple-700 text-white"
                  >
                    {githubFetching ? (
                      <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Fetching...</>
                    ) : (
                      <><Search className="w-3.5 h-3.5 mr-1.5" /> Fetch Scripts</>
                    )}
                  </Button>

                  {githubError && (
                    <div className="p-2 rounded bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-500/30">
                      <p className="text-xs text-red-600 dark:text-red-400 flex items-start gap-1.5">
                        <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                        {githubError}
                      </p>
                    </div>
                  )}

                  {githubFiles.length > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs text-slate-400">
                          {selectedGithubFiles.length}/{githubFiles.length} selected
                        </span>
                        <span className="text-xs text-slate-500">
                          <FolderGit2 className="w-3 h-3 inline mr-1" />
                          {githubRepoURL.split("/").slice(-1)[0]}
                        </span>
                      </div>
                      <div className="space-y-1 max-h-40 overflow-y-auto">
                        {githubFiles.map((file, index) => (
                          <div
                            key={index}
                            onClick={() => !isRunning && toggleGithubFile(index)}
                            className={`flex items-center gap-2 p-2 rounded text-sm cursor-pointer transition-colors ${
                              file.selected
                                ? "bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-500/30"
                                : "bg-slate-50 dark:bg-slate-950/50 border border-transparent hover:bg-slate-100 dark:hover:bg-slate-800/50"
                            }`}
                          >
                            <Checkbox checked={file.selected} className="pointer-events-none" />
                            <FileCode className={`w-3.5 h-3.5 flex-shrink-0 ${file.language === "java" ? "text-orange-500" : "text-blue-500"}`} />
                            <span className="flex-1 truncate text-slate-900 dark:text-white text-xs">{file.name}</span>
                            <span className="text-[10px] text-slate-400">{file.language}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </GlassCard>
          </div>
        </div>

        {/* ==================== SECTION 2: EXECUTION CENTER ==================== */}
        <div>
          <div className="flex items-center gap-2 mb-3 sm:mb-4">
            <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-accent/15 ring-1 ring-accent/30 flex items-center justify-center">
              <span className="text-accent font-bold text-xs sm:text-sm">2</span>
            </div>
            <h2 className="text-base sm:text-lg md:text-xl font-semibold text-slate-900 dark:text-white">Execution Center</h2>
            <Rocket className="w-4 h-4 sm:w-5 sm:h-5 text-cyan-400 ml-1" />
          </div>

          <GlassCard className="relative overflow-hidden">
            {/* Background gradient when running */}
            {isRunning && (
              <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 via-cyan-500/5 to-purple-500/5 animate-pulse" />
            )}
            
            <div className="relative">
              {/* Execution Controls */}
              <div className="flex flex-col sm:flex-row flex-wrap items-start sm:items-center justify-between gap-3 sm:gap-4 mb-4 sm:mb-6">
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4 w-full sm:w-auto">
                  <NeonButton 
                    neonColor="cyan"
                    disabled={!isSuiteReady || isRunning}
                    onClick={executeTests}
                    className="px-4 sm:px-8 w-full sm:w-auto text-sm sm:text-base"
                  >
                    {isRunning ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Executing...
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4 mr-2" /> Run Test Suite
                      </>
                    )}
                  </NeonButton>

                  {isRunning && (
                    <Button
                      onClick={handleCancelRun}
                      disabled={cancelling}
                      variant="destructive"
                      className="px-4 sm:px-6 w-full sm:w-auto text-sm sm:text-base"
                    >
                      {cancelling ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <StopCircle className="w-4 h-4 mr-2" />
                      )}
                      {cancelling ? "Cancelling..." : "Cancel Run"}
                    </Button>
                  )}

                  <div className="flex items-start gap-2 rounded-lg border border-slate-300 dark:border-white/10 p-2.5 w-full sm:w-auto">
                    <Checkbox
                      checked={sendCompletionEmail}
                      onCheckedChange={(checked) => setSendCompletionEmail(checked === true)}
                      disabled={isRunning}
                      className="mt-0.5"
                    />
                    <div>
                      <p className="text-xs sm:text-sm font-medium text-slate-900 dark:text-white">Send completion email</p>
                      <p className="text-[11px] sm:text-xs text-slate-600 dark:text-slate-400">Includes summary, logs and report attachment.</p>
                    </div>
                  </div>
                  
                  {!isSuiteReady && (
                    <div className="flex items-center gap-1.5 sm:gap-2 text-amber-500 text-xs sm:text-sm">
                      <AlertCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                      <span>Complete suite configuration above</span>
                    </div>
                  )}
                </div>

                {/* Execution Stats */}
                {(isRunning || scriptExecutions.length > 0) && (
                  <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs sm:text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400">Tests:</span>
                      <span className="font-mono text-white">{uploadedFiles.length * selectedBrowsers.length}</span>
                    </div>
                    {runningCount > 0 && (
                      <div className="flex items-center gap-2">
                        <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
                        <span className="text-blue-400">{runningCount} running</span>
                      </div>
                    )}
                    {passedCount > 0 && (
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-green-500" />
                        <span className="text-green-400">{passedCount} passed</span>
                      </div>
                    )}
                    {failedCount > 0 && (
                      <div className="flex items-center gap-2">
                        <XCircle className="w-4 h-4 text-red-500" />
                        <span className="text-red-400">{failedCount} failed</span>
                      </div>
                    )}
                    {cancelledCount > 0 && (
                      <div className="flex items-center gap-2">
                        <StopCircle className="w-4 h-4 text-slate-400" />
                        <span className="text-slate-400">{cancelledCount} cancelled</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Overall Progress */}
              {isRunning && (
                <div className="card-3d mb-5 sm:mb-6 rounded-2xl border border-border bg-gradient-to-b from-card to-muted/40 p-4 sm:p-5 dark:to-[hsl(252_30%_7%)]">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="relative flex h-2.5 w-2.5">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
                      </span>
                      <span className="font-display text-sm font-semibold text-foreground">Overall Progress</span>
                    </div>
                    <span className="font-mono text-lg font-bold text-gradient">{Math.round(overallProgress)}%</span>
                  </div>

                  {/* Gradient progress bar with glow + shimmer */}
                  <div className="relative h-3 w-full overflow-hidden rounded-full bg-muted dark:bg-slate-800">
                    <div
                      className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-primary to-accent shadow-[0_0_14px_hsl(var(--primary)/0.6)] transition-all duration-500 ease-out"
                      style={{ width: `${overallProgress}%` }}
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/35 to-transparent animate-shimmer" />
                    </div>
                  </div>

                  {/* Live counts */}
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-xs">
                    <span className="text-muted-foreground">{passedCount + failedCount + cancelledCount}/{scriptExecutions.length} done</span>
                    <span className="flex items-center gap-1 text-primary"><span className="h-1.5 w-1.5 rounded-full bg-primary" />{runningCount} running</span>
                    <span className="flex items-center gap-1 text-emerald-500"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />{passedCount} passed</span>
                    <span className="flex items-center gap-1 text-red-500"><span className="h-1.5 w-1.5 rounded-full bg-red-500" />{failedCount} failed</span>
                  </div>
                </div>
              )}

              {/* Per-Script Progress Bars */}
              {scriptExecutions.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium text-slate-400 uppercase tracking-wider">
                      Parallel Test Execution {isRunning && <span className="text-primary">(Live)</span>}
                    </h4>
                    {!isRunning && scriptExecutions.length > 0 && (
                      <Button
                        onClick={handleClearExecution}
                        variant="ghost"
                        size="sm"
                        className="text-slate-400 hover:text-white hover:bg-slate-700/50 text-xs gap-1.5"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        Reset
                      </Button>
                    )}
                  </div>
                  
                  <div className="grid gap-2 sm:gap-3">
                    {scriptExecutions.map((script, index) => (
                      <div 
                        key={index} 
                        className={`p-2.5 sm:p-3 md:p-4 rounded-lg border transition-all ${
                          script.status === "running"
                            ? "bg-primary/10 border-primary/30"
                            : script.status === "passed"
                            ? "bg-emerald-500/10 border-emerald-500/30"
                            : script.status === "failed"
                            ? "bg-red-500/10 border-red-500/30"
                            : script.status === "cancelled"
                            ? "bg-slate-500/10 border-slate-400/30"
                            : "bg-slate-500/10 border-slate-500/30"
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-2 mb-2">
                          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                            {getStatusIcon(script.status)}
                            <div className="min-w-0">
                              <p className="text-xs sm:text-sm md:text-base font-medium text-slate-900 dark:text-white truncate">
                                {script.name}
                                <span className="ml-1.5 sm:ml-2 text-[10px] sm:text-xs font-normal px-1.5 sm:px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 capitalize">{script.browser}</span>
                              </p>
                              <p className="text-[10px] sm:text-xs text-slate-500 truncate">{script.message}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 sm:gap-3 shrink-0 self-end sm:self-auto">
                            {script.duration && (
                              <span className={`text-[10px] sm:text-xs font-mono flex items-center gap-1 ${
                                script.status === "running" ? "text-primary" : "text-slate-400"
                              }`}>
                                <Clock className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                                {script.duration}
                              </span>
                            )}
                            <span className={`text-[10px] sm:text-xs font-medium px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full ${
                              script.status === "passed" ? "bg-emerald-500/20 text-emerald-400" :
                              script.status === "failed" ? "bg-red-500/20 text-red-400" :
                              script.status === "cancelled" ? "bg-slate-500/20 text-slate-400" :
                              script.status === "running" ? "bg-primary/15 text-primary" :
                              "bg-slate-500/20 text-slate-400"
                            }`}>
                              {script.status.toUpperCase()}
                            </span>
                          </div>
                        </div>
                        
                        {/* Individual Progress Bar */}
                        <div className="relative h-2 bg-slate-700 rounded-full overflow-hidden">
                          <div 
                            className={`absolute inset-y-0 left-0 transition-all duration-500 rounded-full ${getStatusColor(script.status)}`}
                            style={{ width: `${script.progress}%` }}
                          />
                          {script.status === "running" && (
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Empty State */}
              {!isRunning && scriptExecutions.length === 0 && (
                <div className="text-center py-8 sm:py-12 text-slate-500">
                  <Rocket className="w-8 h-8 sm:w-12 sm:h-12 mx-auto mb-3 sm:mb-4 opacity-30" />
                  <p className="text-sm sm:text-base md:text-lg">Ready to Execute</p>
                  <p className="text-xs sm:text-sm mt-1">Configure your test suite above and click "Run Test Suite"</p>
                </div>
              )}
            </div>
          </GlassCard>
        </div>
      </div>

      {/* Success Dialog */}
      <Dialog open={showSuccessDialog} onOpenChange={setShowSuccessDialog}>
        <DialogContent className="max-w-[90vw] sm:max-w-md bg-white dark:bg-slate-900 border-slate-200 dark:border-white/10">
          <DialogHeader>
            <div className={`flex items-center justify-center w-16 h-16 mx-auto mb-4 rounded-full ${
              cancelledCount > 0 && failedCount === 0 
                ? "bg-slate-100 dark:bg-slate-800/30" 
                : "bg-green-100 dark:bg-green-900/30"
            }`}>
              {cancelledCount > 0 && failedCount === 0 
                ? <StopCircle className="w-8 h-8 text-slate-500 dark:text-slate-400" />
                : <CheckCircle2 className="w-8 h-8 text-green-600 dark:text-green-400" />
              }
            </div>
            <DialogTitle className="text-center text-slate-900 dark:text-white text-xl">
              {cancelledCount > 0 && failedCount === 0 ? "Test Execution Cancelled" : "Test Execution Completed!"}
            </DialogTitle>
            <DialogDescription className="text-center text-slate-600 dark:text-slate-400">
              <span className="block mb-2">Suite: "{suiteName}"</span>
              <span className="flex items-center justify-center gap-4 mt-3">
                {passedCount > 0 && <span className="text-green-500">{passedCount} passed</span>}
                {failedCount > 0 && <span className="text-red-500">{failedCount} failed</span>}
                {cancelledCount > 0 && <span className="text-slate-500">{cancelledCount} cancelled</span>}
              </span>
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex flex-col gap-3 mt-6">
            <Button 
              onClick={handleViewResults}
              className="w-full bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white"
            >
              <Eye className="w-4 h-4 mr-2" />
              View Results
            </Button>
            <Button 
              onClick={handleCreateNew}
              variant="outline"
              className="w-full border-slate-300 dark:border-white/10"
            >
              Create New Test Suite
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Shimmer animation style */}
      <style>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        .animate-shimmer {
          animation: shimmer 1.5s infinite;
        }
      `}</style>
    </Layout>
  );
}
