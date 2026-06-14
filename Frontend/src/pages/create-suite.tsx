import Layout from "@/components/layout/Layout";
import { GlassCard } from "@/components/ui/glass-card";
import { NeonButton } from "@/components/ui/neon-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Upload, Play, FileCode, X, CheckCircle2, Loader2, Eye } from "lucide-react";
import { toast } from "sonner";
import { BrandIcon } from "@/lib/brandAssets";
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

export default function CreateSuite() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const [suiteName, setSuiteName] = useState("");
  const [selectedBrowsers, setSelectedBrowsers] = useState<string[]>([]);
  const [sendCompletionEmail, setSendCompletionEmail] = useState(true);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState("");
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [completedSuiteId, setCompletedSuiteId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const executeTests = async () => {
    if (!suiteName.trim()) {
      toast.error("Please enter a suite name");
      return;
    }
    if (selectedBrowsers.length === 0) {
      toast.error("Please select at least one browser");
      return;
    }
    if (uploadedFiles.length === 0) {
      toast.error("Please upload at least one test script");
      return;
    }

    setIsRunning(true);
    setProgress(0);
    
    try {
      // Step 1: Upload files
      setProgressMessage("Uploading test scripts...");
      setProgress(10);

      const formData = new FormData();
      formData.append("suite_name", suiteName);
      formData.append("browsers", JSON.stringify(selectedBrowsers));
      formData.append("username", user?.username || "");
      formData.append("email", user?.email || "");
      formData.append("user_id", user?.id || "");
      formData.append("send_email_on_completion", String(sendCompletionEmail));

      // Add all files to formData
      uploadedFiles.forEach((fileObj, index) => {
        formData.append(`test_files`, fileObj.file);
      });

      // Get auth token
      const token = localStorage.getItem("authToken") || sessionStorage.getItem("authToken");
      if (!token) {
        throw new Error("No authentication token found. Please login again.");
      }

      setProgress(20);
      setProgressMessage("Submitting tests to runner...");

      // Call backend API to start tests
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
      const suiteId = result.suite_id || result.id;
      
      if (!suiteId) {
        throw new Error("No suite ID returned from server");
      }
      
      setCompletedSuiteId(suiteId);
      setProgress(30);
      setProgressMessage("Tests started. Waiting for completion...");

      // Poll for test completion
      let attempts = 0;
      const maxAttempts = 120; // Max 10 minutes (5s intervals)
      let completed = false;

      while (attempts < maxAttempts && !completed) {
        await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds between polls
        
        try {
          const statusResponse = await fetch(API_ENDPOINTS.TEST_SUITE_DETAILS(suiteId), {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });

          if (statusResponse.ok) {
            const statusData = await statusResponse.json();
            const suiteStatus = statusData.suite?.status || statusData.status;
            
            // Update progress based on status
            if (suiteStatus === "running") {
              // Calculate progress based on completed tests
              const totalTests = statusData.suite?.total_tests || uploadedFiles.length;
              const passed = statusData.suite?.passed || 0;
              const failed = statusData.suite?.failed || 0;
              const completedTests = passed + failed;
              const testProgress = totalTests > 0 ? (completedTests / totalTests) * 60 : 0;
              setProgress(30 + testProgress);
              setProgressMessage(`Running tests... (${completedTests}/${totalTests} completed)`);
            } else if (suiteStatus === "completed" || suiteStatus === "passed" || suiteStatus === "failed") {
              completed = true;
              setProgress(100);
              setProgressMessage("Test execution completed!");
            }
          }
        } catch (pollError) {
          console.warn("Status poll error:", pollError);
          // Continue polling even if one request fails
        }
        
        attempts++;
      }

      if (!completed) {
        // Timeout - tests took too long, but still navigate to results
        setProgress(100);
        setProgressMessage("Tests are still running. You can check the results in History.");
      }

      await new Promise(resolve => setTimeout(resolve, 500));
      setShowSuccessDialog(true);
      setIsRunning(false);

    } catch (error) {
      console.error("Test execution error:", error);
      toast.error("Failed to execute tests. Please try again.");
      setIsRunning(false);
      setProgress(0);
      setProgressMessage("");
    }
  };

  const handleViewResults = () => {
    setShowSuccessDialog(false);
    setLocation("/history");
  };

  const handleCreateNew = () => {
    setShowSuccessDialog(false);
    setSuiteName("");
    setSelectedBrowsers([]);
    setSendCompletionEmail(true);
    setUploadedFiles([]);
    setProgress(0);
    setProgressMessage("");
    setCompletedSuiteId(null);
  };

  return (
    <Layout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-display font-bold text-slate-900 dark:text-white mb-1">Create Test Suite</h1>
          <p className="text-slate-600 dark:text-slate-400">Set up a new automated testing configuration.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          {/* Basic Information */}
          <GlassCard>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-6">Suite Configuration</h3>
            <form className="space-y-6" onSubmit={(e) => e.preventDefault()}>
              <div className="space-y-2">
                <Label htmlFor="suite-name" className="text-slate-900 dark:text-white">Suite Name</Label>
                <Input 
                  id="suite-name"
                  placeholder="e.g., Login & Checkout Flow"
                  value={suiteName}
                  onChange={(e) => setSuiteName(e.target.value)}
                  disabled={isRunning}
                  className="bg-slate-50 dark:bg-slate-950/50 border-slate-300 dark:border-white/10 text-slate-900 dark:text-white placeholder:text-slate-500 dark:placeholder:text-slate-500"
                />
                <p className="text-xs text-slate-600 dark:text-slate-500">A unique name for your test suite</p>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-lg border border-slate-300 dark:border-white/10">
                <Checkbox
                  checked={sendCompletionEmail}
                  onCheckedChange={(checked) => setSendCompletionEmail(checked === true)}
                  disabled={isRunning}
                  className="mt-0.5"
                />
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-white">Email me when this run completes</p>
                  <p className="text-xs text-slate-600 dark:text-slate-500">Report is delivered to your account email.</p>
                </div>
              </div>
            </form>
          </GlassCard>

          {/* Browser Selection */}
          <GlassCard>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-6">Select Browsers</h3>
            <div className="space-y-3">
              <div className="flex items-center gap-3 p-4 rounded-lg border border-slate-300 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors cursor-pointer"
                onClick={() => !isRunning && toggleBrowser("chrome")}>
                <Checkbox 
                  checked={selectedBrowsers.includes("chrome")}
                  onCheckedChange={() => toggleBrowser("chrome")}
                  disabled={isRunning}
                  className="cursor-pointer"
                />
                <div className="flex items-center gap-2 flex-1">
                  <BrandIcon kind="browser" name="chrome" className="w-6 h-6" />
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-white">Chrome</p>
                    <p className="text-xs text-slate-600 dark:text-slate-500">Latest version</p>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 p-4 rounded-lg border border-slate-300 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors cursor-pointer"
                onClick={() => !isRunning && toggleBrowser("firefox")}>
                <Checkbox 
                  checked={selectedBrowsers.includes("firefox")}
                  onCheckedChange={() => toggleBrowser("firefox")}
                  disabled={isRunning}
                  className="cursor-pointer"
                />
                <div className="flex items-center gap-2 flex-1">
                  <BrandIcon kind="browser" name="firefox" className="w-6 h-6" />
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-white">Firefox</p>
                    <p className="text-xs text-slate-600 dark:text-slate-500">Latest version</p>
                  </div>
                </div>
              </div>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-500 mt-4">Selected: {selectedBrowsers.length === 0 ? "None" : selectedBrowsers.join(", ").toUpperCase()}</p>
          </GlassCard>

          {/* Script Upload */}
          <GlassCard>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-6">Upload Test Scripts</h3>
            
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".py,.js,.java"
              onChange={handleFileSelect}
              className="hidden"
              id="script-upload"
            />
            <label
              htmlFor="script-upload"
              className="block p-6 rounded-lg border-2 border-dashed border-slate-300 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/5 hover:border-primary/50 dark:hover:border-primary/50 transition-all cursor-pointer group text-center"
            >
              <Upload className="w-8 h-8 mx-auto mb-3 text-slate-400 group-hover:text-blue-500 dark:group-hover:text-blue-400 transition-colors" />
              <p className="text-sm font-medium text-slate-900 dark:text-white mb-1">Click to upload test scripts</p>
              <p className="text-xs text-slate-600 dark:text-slate-500">Select multiple files (.py, .js, .java)</p>
            </label>

            {uploadedFiles.length > 0 && (
              <div className="mt-4 space-y-2">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">Uploaded Files ({uploadedFiles.length})</p>
                {uploadedFiles.map((file, index) => (
                  <div key={index} className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-white/5">
                    <FileCode className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{file.name}</p>
                      <p className="text-xs text-slate-600 dark:text-slate-500">{file.type} - {file.size}</p>
                    </div>
                    <button
                      onClick={() => removeFile(index)}
                      className="p-1 rounded hover:bg-slate-200 dark:hover:bg-white/10 transition-colors"
                    >
                      <X className="w-4 h-4 text-slate-500 hover:text-red-500" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <p className="text-xs text-slate-600 dark:text-slate-500 mt-4">Supported: Python, JavaScript, Java with Selenium actions</p>
          </GlassCard>
        </div>

        {/* Summary Sidebar */}
        <div className="space-y-6">
          <GlassCard className="sticky top-6">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-6">Execution Summary</h3>
            <div className="space-y-4 mb-6">
              <div className="p-3 rounded-lg bg-slate-100 dark:bg-slate-950/50 border border-slate-200 dark:border-white/5">
                <p className="text-xs text-slate-600 dark:text-slate-500 mb-1">Browsers Selected</p>
                <p className="text-sm font-mono text-blue-600 dark:text-blue-400">
                  {selectedBrowsers.length === 0 ? "None selected" : selectedBrowsers.join(", ").toUpperCase()}
                </p>
              </div>

              <div className="p-3 rounded-lg bg-slate-100 dark:bg-slate-950/50 border border-slate-200 dark:border-white/5">
                <p className="text-xs text-slate-600 dark:text-slate-500 mb-1">Test Scripts</p>
                <p className="text-sm font-mono text-blue-600 dark:text-blue-400">{uploadedFiles.length}</p>
              </div>

              <div className="p-3 rounded-lg bg-slate-100 dark:bg-slate-950/50 border border-slate-200 dark:border-white/5">
                <p className="text-xs text-slate-600 dark:text-slate-500 mb-1">Parallel Executions</p>
                <p className="text-sm font-mono text-green-600 dark:text-green-400">
                  {selectedBrowsers.length * uploadedFiles.length || 0}
                </p>
              </div>

              <div className="p-3 rounded-lg bg-slate-100 dark:bg-slate-950/50 border border-slate-200 dark:border-white/5">
                <p className="text-xs text-slate-600 dark:text-slate-500 mb-1">Est. Duration</p>
                <p className="text-sm font-mono text-purple-600 dark:text-purple-400">~2-5 min</p>
              </div>
            </div>
            
            <div className="space-y-3">
              <NeonButton 
                className="w-full" 
                neonColor="cyan"
                disabled={selectedBrowsers.length === 0 || uploadedFiles.length === 0 || !suiteName.trim() || isRunning}
                onClick={executeTests}
              >
                {isRunning ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Running Tests...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 mr-2" /> Run Test Suite
                  </>
                )}
              </NeonButton>
              <Button 
                variant="outline" 
                className="w-full border-slate-300 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/5"
                disabled={isRunning}
              >
                Save as Draft
              </Button>
            </div>

            {/* Progress Bar */}
            {isRunning && (
              <div className="mt-6 space-y-3">
                <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-500/30">
                  <div className="flex items-center gap-2 mb-3">
                    <Loader2 className="w-4 h-4 text-blue-600 dark:text-blue-400 animate-spin" />
                    <p className="text-sm font-medium text-blue-900 dark:text-blue-300">
                      {progressMessage || "Executing tests..."}
                    </p>
                  </div>
                  <Progress value={progress} className="h-2" />
                  <p className="text-xs text-blue-700 dark:text-blue-400 mt-2 text-right">
                    {progress}%
                  </p>
                </div>
              </div>
            )}
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
              Your test suite "{suiteName}" has been executed successfully. 
              All results and artifacts have been saved.
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
    </Layout>
  );
}
