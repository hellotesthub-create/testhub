import Layout from "@/components/layout/Layout";
import { GlassCard } from "@/components/ui/glass-card";
import { NeonButton } from "@/components/ui/neon-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  Upload, Play, Chrome, FileCode, X, CheckCircle2, Loader2, Eye, 
  FlaskConical, Rocket, AlertCircle, Clock, XCircle
} from "lucide-react";
import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/authContext";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { API_ENDPOINTS } from "@/lib/apiConfig";

interface UploadedFile {
  name: string;
  size: string;
  type: string;
  file: File;
}

interface ScriptExecution {
  name: string;
  browser: string;
  status: "pending" | "running" | "passed" | "failed";
  progress: number;
  message: string;
  startTime?: number;
  duration?: string;
}

export default function TestLab() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  
  // Create Test Suite state
  const [suiteName, setSuiteName] = useState("");
  const [selectedBrowsers, setSelectedBrowsers] = useState<string[]>([]);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Execution Center state
  const [isRunning, setIsRunning] = useState(false);
  const [, setSuiteReady] = useState(false);
  const [scriptExecutions, setScriptExecutions] = useState<ScriptExecution[]>([]);
  const [overallProgress, setOverallProgress] = useState(0);
  const [, setExecutionPhase] = useState<"idle" | "uploading" | "running" | "completed">("idle");
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [completedSuiteId, setCompletedSuiteId] = useState<string | null>(null);

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
      const newFiles: UploadedFile[] = Array.from(files).map(file => ({
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
  const isSuiteReady = suiteName.trim() && selectedBrowsers.length > 0 && uploadedFiles.length > 0;

  // Execute the test suite
  const executeTests = async () => {
    if (!isSuiteReady) return;

    setIsRunning(true);
    setExecutionPhase("uploading");
    setOverallProgress(0);
    
    // Initialize script status — one entry per file × browser combination
    const initialExecutions: ScriptExecution[] = [];
    for (const file of uploadedFiles) {
      for (const browser of selectedBrowsers) {
        initialExecutions.push({
          name: file.name,
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
      formData.append("username", user?.username || "");
      formData.append("email", user?.email || "");
      formData.append("user_id", user?.id || "");

      uploadedFiles.forEach((fileObj) => {
        formData.append(`test_files`, fileObj.file);
      });

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

      // Set all scripts to running
      setScriptExecutions(prev => prev.map(script => ({
        ...script,
        status: "running",
        progress: 10,
        message: "Initializing browser...",
        startTime: Date.now()
      })));

      // Poll for test completion with per-script status
      let attempts = 0;
      const maxAttempts = 120;
      let allCompleted = false;

      while (attempts < maxAttempts && !allCompleted) {
        await new Promise(resolve => setTimeout(resolve, 3000));
        
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
                const scriptBaseName = script.name.replace('.py', '').replace('.js', '').replace('.java', '');
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
                  const isTerminal = status === "passed" || status === "success" || status === "failed" || status === "error";
                  const elapsed = script.startTime ? Math.floor((Date.now() - script.startTime) / 1000) : 0;
                  return {
                    ...script,
                    status: status === "passed" || status === "success" ? "passed" : 
                            status === "failed" || status === "error" ? "failed" : "running",
                    progress: isTerminal ? 100 : script.progress,
                    message: status === "passed" || status === "success" ? "Test passed!" : 
                            status === "failed" || status === "error" ? "Test failed" : "Executing...",
                    duration: `${elapsed}s`
                  };
                }
                
                // Still running - update progress animation
                const elapsed = script.startTime ? Math.floor((Date.now() - script.startTime) / 1000) : 0;
                const animatedProgress = Math.min(90, 10 + (elapsed * 2));
                return {
                  ...script,
                  progress: animatedProgress,
                  message: getRunningMessage(elapsed),
                  duration: `${elapsed}s`
                };
              });
            });

            // Calculate overall progress — count only terminal (passed/failed) results
            const terminalCount = results.filter((r: any) => {
              const s = r.status?.toLowerCase();
              return s === "passed" || s === "success" || s === "failed" || s === "error";
            }).length;
            const totalExpected = uploadedFiles.length * selectedBrowsers.length;
            const progressPercent = 15 + (terminalCount / totalExpected) * 80;
            setOverallProgress(Math.min(95, progressPercent));

            // Check if all done
            if (suiteStatus === "completed" || suiteStatus === "passed" || suiteStatus === "failed") {
              allCompleted = true;
              setOverallProgress(100);
              setExecutionPhase("completed");
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

      await new Promise(resolve => setTimeout(resolve, 500));
      setShowSuccessDialog(true);
      setIsRunning(false);

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
      alert("Failed to execute tests. Please try again.");
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
        return <CheckCircle2 className="w-5 h-5 text-green-500" />;
      case "failed":
        return <XCircle className="w-5 h-5 text-red-500" />;
      case "running":
        return <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />;
      default:
        return <Clock className="w-5 h-5 text-slate-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "passed": return "bg-green-500";
      case "failed": return "bg-red-500";
      case "running": return "bg-blue-500";
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
    setUploadedFiles([]);
    setScriptExecutions([]);
    setSuiteReady(false);
    setOverallProgress(0);
    setExecutionPhase("idle");
    setCompletedSuiteId(null);
  };

  const passedCount = scriptExecutions.filter(s => s.status === "passed").length;
  const failedCount = scriptExecutions.filter(s => s.status === "failed").length;
  const runningCount = scriptExecutions.filter(s => s.status === "running").length;

  return (
    <Layout>
      {/* Page Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-gradient-to-br from-purple-500/20 to-cyan-500/20 border border-purple-500/30">
            <FlaskConical className="w-8 h-8 text-purple-400" />
          </div>
          <div>
            <h1 className="text-3xl font-display font-bold text-slate-900 dark:text-white">Test Lab</h1>
            <p className="text-slate-600 dark:text-slate-400">Configure, execute, and monitor your automated tests</p>
          </div>
        </div>
      </div>

      <div className="space-y-8">
        {/* ==================== SECTION 1: CREATE TEST SUITE ==================== */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center">
              <span className="text-blue-400 font-bold">1</span>
            </div>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Create Test Suite</h2>
            {isSuiteReady && (
              <CheckCircle2 className="w-5 h-5 text-green-500 ml-2" />
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Suite Configuration */}
            <GlassCard>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Suite Configuration</h3>
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

            {/* Browser Selection */}
            <GlassCard>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Select Browsers</h3>
              <div className="space-y-2">
                <div 
                  className="flex items-center gap-3 p-3 rounded-lg border border-slate-300 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/5 cursor-pointer"
                  onClick={() => !isRunning && toggleBrowser("chrome")}
                >
                  <Checkbox checked={selectedBrowsers.includes("chrome")} disabled={isRunning} />
                  <Chrome className="w-5 h-5 text-blue-500" />
                  <span className="text-sm text-slate-900 dark:text-white">Chrome</span>
                </div>
                <div 
                  className="flex items-center gap-3 p-3 rounded-lg border border-slate-300 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/5 cursor-pointer"
                  onClick={() => !isRunning && toggleBrowser("firefox")}
                >
                  <Checkbox checked={selectedBrowsers.includes("firefox")} disabled={isRunning} />
                  <Chrome className="w-5 h-5 text-orange-500" />
                  <span className="text-sm text-slate-900 dark:text-white">Firefox</span>
                </div>
              </div>
            </GlassCard>

            {/* Script Upload */}
            <GlassCard>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Test Scripts</h3>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".py,.js,.java"
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
                <p className="text-sm text-slate-600 dark:text-slate-400">Click to upload (.py, .js, .java)</p>
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
            </GlassCard>
          </div>
        </div>

        {/* ==================== SECTION 2: EXECUTION CENTER ==================== */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-full bg-cyan-500/20 flex items-center justify-center">
              <span className="text-cyan-400 font-bold">2</span>
            </div>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Execution Center</h2>
            <Rocket className="w-5 h-5 text-cyan-400 ml-1" />
          </div>

          <GlassCard className="relative overflow-hidden">
            {/* Background gradient when running */}
            {isRunning && (
              <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 via-cyan-500/5 to-purple-500/5 animate-pulse" />
            )}
            
            <div className="relative">
              {/* Execution Controls */}
              <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                <div className="flex items-center gap-4">
                  <NeonButton 
                    neonColor="cyan"
                    disabled={!isSuiteReady || isRunning}
                    onClick={executeTests}
                    className="px-8"
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
                  
                  {!isSuiteReady && (
                    <div className="flex items-center gap-2 text-amber-500 text-sm">
                      <AlertCircle className="w-4 h-4" />
                      <span>Complete suite configuration above</span>
                    </div>
                  )}
                </div>

                {/* Execution Stats */}
                {(isRunning || scriptExecutions.length > 0) && (
                  <div className="flex items-center gap-4 text-sm">
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
                  </div>
                )}
              </div>

              {/* Overall Progress */}
              {isRunning && (
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-slate-400">Overall Progress</span>
                    <span className="text-sm font-mono text-cyan-400">{Math.round(overallProgress)}%</span>
                  </div>
                  <Progress value={overallProgress} className="h-2" />
                </div>
              )}

              {/* Per-Script Progress Bars */}
              {scriptExecutions.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-sm font-medium text-slate-400 uppercase tracking-wider">
                    Parallel Test Execution {isRunning && <span className="text-blue-400">(Live)</span>}
                  </h4>
                  
                  <div className="grid gap-3">
                    {scriptExecutions.map((script, index) => (
                      <div 
                        key={index} 
                        className={`p-4 rounded-lg border transition-all ${
                          script.status === "running" 
                            ? "bg-blue-500/10 border-blue-500/30" 
                            : script.status === "passed"
                            ? "bg-green-500/10 border-green-500/30"
                            : script.status === "failed"
                            ? "bg-red-500/10 border-red-500/30"
                            : "bg-slate-500/10 border-slate-500/30"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-3">
                            {getStatusIcon(script.status)}
                            <div>
                              <p className="font-medium text-slate-900 dark:text-white">
                                {script.name}
                                <span className="ml-2 text-xs font-normal px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 capitalize">{script.browser}</span>
                              </p>
                              <p className="text-xs text-slate-500">{script.message}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            {script.duration && (
                              <span className="text-xs font-mono text-slate-400">{script.duration}</span>
                            )}
                            <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                              script.status === "passed" ? "bg-green-500/20 text-green-400" :
                              script.status === "failed" ? "bg-red-500/20 text-red-400" :
                              script.status === "running" ? "bg-blue-500/20 text-blue-400" :
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
                <div className="text-center py-12 text-slate-500">
                  <Rocket className="w-12 h-12 mx-auto mb-4 opacity-30" />
                  <p className="text-lg">Ready to Execute</p>
                  <p className="text-sm mt-1">Configure your test suite above and click "Run Test Suite"</p>
                </div>
              )}
            </div>
          </GlassCard>
        </div>
      </div>

      {/* Success Dialog */}
      <Dialog open={showSuccessDialog} onOpenChange={setShowSuccessDialog}>
        <DialogContent className="sm:max-w-md bg-white dark:bg-slate-900 border-slate-200 dark:border-white/10">
          <DialogHeader>
            <div className="flex items-center justify-center w-16 h-16 mx-auto mb-4 rounded-full bg-green-100 dark:bg-green-900/30">
              <CheckCircle2 className="w-8 h-8 text-green-600 dark:text-green-400" />
            </div>
            <DialogTitle className="text-center text-slate-900 dark:text-white text-xl">
              Test Execution Completed!
            </DialogTitle>
            <DialogDescription className="text-center text-slate-600 dark:text-slate-400">
              <span className="block mb-2">Suite: "{suiteName}"</span>
              <span className="flex items-center justify-center gap-4 mt-3">
                <span className="text-green-500">{passedCount} passed</span>
                <span className="text-red-500">{failedCount} failed</span>
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
