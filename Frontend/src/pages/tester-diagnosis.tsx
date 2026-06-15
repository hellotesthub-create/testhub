import { useState, useEffect } from "react";
import { useLocation, useRoute } from "wouter";
import Layout from "@/components/layout/Layout";
import { GlassCard } from "@/components/ui/glass-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, Wrench, Bot, ArrowLeft, CheckCircle2, Search, Code2, RotateCcw, RefreshCw, Image as ImageIcon, Copy, Check, Globe, Monitor, ListChecks } from "lucide-react";
import { API_ENDPOINTS } from "@/lib/apiConfig";

interface DiagnosisResult {
  execution_id: string;
  root_cause: string;
  likely_fix: string;
  confidence: "High" | "Medium" | "Low";
  model_used: string;
  generated_at: string;
  error_category?: string;
  last_successful_step?: string;
  failing_locator?: string;
  failing_line_number?: number;
  failing_code_snippet?: string;
  corrected_code?: string;
  error_trace?: string;
  execution_logs?: string;
  target_url?: string;
  browser?: string;
  framework?: string;
  failure_screenshot_id?: string;
  total_steps_captured?: number;
}

export default function TesterDiagnosis() {
  const [, navigate] = useLocation();
  const [, params] = useRoute("/tester/test-results/:runId/diagnosis/:resultId");
  const resultId = params?.resultId;
  const runId = params?.runId;

  const [diagnosis, setDiagnosis] = useState<DiagnosisResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [rediagnosing, setRediagnosing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const copyCorrectedCode = async () => {
    if (!diagnosis?.corrected_code) return;
    try {
      await navigator.clipboard.writeText(diagnosis.corrected_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  };

  const fetchDiagnosis = async () => {
    if (!resultId) return;
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem("authToken") || sessionStorage.getItem("authToken");
      const response = await fetch(API_ENDPOINTS.RESULT_DIAGNOSIS(resultId), {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!response.ok) {
        throw new Error("Diagnosis not found or unavailable.");
      }
      const data = await response.json();
      setDiagnosis(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load diagnosis.");
      setDiagnosis(null);
    } finally {
      setLoading(false);
    }
  };

  const runRediagnosis = async () => {
    if (!resultId) return;
    setRediagnosing(true);
    setError(null);
    try {
      const token = localStorage.getItem("authToken") || sessionStorage.getItem("authToken");
      const response = await fetch(API_ENDPOINTS.RESULT_DIAGNOSE(resultId), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.message || "Diagnosis service unavailable. Please try again.");
      }
      const data = await response.json();
      setDiagnosis(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run diagnosis.");
    } finally {
      setRediagnosing(false);
    }
  };

  useEffect(() => {
    fetchDiagnosis();
  }, [resultId]);

  const confidenceStyles: Record<string, string> = {
    High: "bg-green-500/20 text-green-700 dark:text-green-400 border-green-500/30",
    Medium: "bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 border-yellow-500/30",
    Low: "bg-slate-500/20 text-slate-700 dark:text-slate-400 border-slate-500/30",
  };

  const getCategoryColor = (cat: string | undefined) => {
    switch (cat) {
      case "LOCATOR_NOT_FOUND": return "bg-rose-500/20 text-rose-700 dark:text-rose-400 border-rose-500/30";
      case "TIMEOUT": return "bg-orange-500/20 text-orange-700 dark:text-orange-400 border-orange-500/30";
      case "ASSERTION_FAILURE": return "bg-purple-500/20 text-purple-700 dark:text-purple-400 border-purple-500/30";
      case "STALE_ELEMENT": return "bg-amber-500/20 text-amber-700 dark:text-amber-400 border-amber-500/30";
      case "FRAME_ERROR": return "bg-blue-500/20 text-blue-700 dark:text-blue-400 border-blue-500/30";
      default: return "bg-slate-500/20 text-slate-700 dark:text-slate-400 border-slate-500/30";
    }
  };

  return (
    <Layout>
      <div className="mb-4 sm:mb-6">
        <Button
          variant="ghost"
          className="mb-4 -ml-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
          onClick={() => navigate("/history")}
        >
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to History
        </Button>
        <h1 className="text-xl sm:text-2xl md:text-3xl font-display font-bold text-slate-900 dark:text-white mb-1 flex items-center gap-2">
          <Bot className="w-6 h-6 md:w-8 md:h-8 text-violet-500" /> AI Diagnosis
        </h1>
        <p className="text-slate-600 dark:text-slate-400 text-xs sm:text-sm md:text-base">
          Detailed breakdown of the script failure.
        </p>
      </div>

      {loading ? (
        <GlassCard className="p-6 space-y-4">
          <Skeleton className="h-6 w-1/3 bg-slate-200 dark:bg-slate-700" />
          <Skeleton className="h-4 w-full bg-slate-200 dark:bg-slate-700" />
          <Skeleton className="h-4 w-2/3 bg-slate-200 dark:bg-slate-700" />
        </GlassCard>
      ) : error || !diagnosis ? (
        <GlassCard className="text-center py-12">
          <AlertTriangle className="w-12 h-12 mx-auto text-red-500 mb-4" />
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">Diagnosis Unavailable</h3>
          <p className="text-slate-600 dark:text-slate-400 mb-4">{error}</p>
          <Button
            variant="outline"
            onClick={runRediagnosis}
            disabled={rediagnosing}
            className="text-blue-600 border-blue-200 hover:bg-blue-50 dark:text-blue-400 dark:border-blue-800/50 dark:hover:bg-blue-900/20"
          >
            {rediagnosing ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <RotateCcw className="w-4 h-4 mr-2" />}
            {rediagnosing ? "Running diagnosis..." : "Run Diagnosis"}
          </Button>
        </GlassCard>
      ) : (
        <div className="space-y-6">
          <GlassCard className="p-6 bg-gradient-to-br from-white to-violet-50 dark:from-slate-900/80 dark:to-violet-950/30 border-violet-200 dark:border-violet-500/20">
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-200 dark:border-white/10">
              <div className="flex flex-col gap-2">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-violet-300">Analysis Results</h2>
                <div className="flex flex-wrap gap-2">
                  {diagnosis.error_category && diagnosis.error_category !== "UNKNOWN" && (
                    <Badge className={`text-xs px-2 py-0.5 border ${getCategoryColor(diagnosis.error_category)}`}>
                      {diagnosis.error_category.replace(/_/g, " ")}
                    </Badge>
                  )}
                  {diagnosis.last_successful_step && (
                    <Badge className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 px-2 py-0.5 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Last step: {diagnosis.last_successful_step}
                    </Badge>
                  )}
                  {typeof diagnosis.total_steps_captured === "number" && diagnosis.total_steps_captured > 0 && (
                    <Badge className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 px-2 py-0.5 flex items-center gap-1">
                      <ListChecks className="w-3.5 h-3.5" /> {diagnosis.total_steps_captured} steps captured
                    </Badge>
                  )}
                  {diagnosis.failing_locator && (
                    <Badge className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 px-2 py-0.5 flex items-center gap-1">
                      <Search className="w-3.5 h-3.5 shrink-0" /> {diagnosis.failing_locator}
                    </Badge>
                  )}
                  {diagnosis.browser && (
                    <Badge className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 px-2 py-0.5 flex items-center gap-1 capitalize">
                      <Monitor className="w-3.5 h-3.5" /> {diagnosis.browser}
                    </Badge>
                  )}
                  {diagnosis.framework && (
                    <Badge className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 px-2 py-0.5 flex items-center gap-1 capitalize">
                      <Code2 className="w-3.5 h-3.5" /> {diagnosis.framework}
                    </Badge>
                  )}
                  {diagnosis.target_url && diagnosis.target_url !== "unknown" && (
                    <Badge className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 px-2 py-0.5 flex items-center gap-1 max-w-[260px] truncate">
                      <Globe className="w-3.5 h-3.5 shrink-0" /> {diagnosis.target_url}
                    </Badge>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 self-start">
                <Badge className={`text-xs px-2 py-1 border ${confidenceStyles[diagnosis.confidence] || confidenceStyles.Low}`}>
                  {diagnosis.confidence} Confidence
                </Badge>
              </div>
            </div>

            <div className="space-y-6">
              <div className="flex items-start gap-3">
                <div className="mt-1 bg-amber-100 dark:bg-amber-500/20 p-2 rounded-lg">
                  <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-amber-300 mb-2">Root Cause</h3>
                  <div className="bg-white dark:bg-slate-950/50 p-4 rounded-lg border border-slate-200 dark:border-white/5 shadow-sm">
                    <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                      {diagnosis.root_cause}
                    </p>
                  </div>
                </div>
              </div>

              {diagnosis.failing_line_number && diagnosis.failing_code_snippet && (
                <div className="flex items-start gap-3">
                  <div className="mt-1 bg-blue-100 dark:bg-blue-500/20 p-2 rounded-lg">
                    <Code2 className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-blue-300 mb-2">
                      Failing Code (Line {diagnosis.failing_line_number})
                    </h3>
                    <div className="bg-slate-50 dark:bg-slate-950 rounded-lg border border-slate-200 dark:border-slate-800 p-4 overflow-x-auto shadow-sm">
                      <pre className="text-xs sm:text-sm text-slate-800 dark:text-slate-300 font-mono leading-relaxed m-0 whitespace-pre">
                        {diagnosis.failing_code_snippet.trim()}
                      </pre>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-start gap-3">
                <div className="mt-1 bg-cyan-100 dark:bg-cyan-500/20 p-2 rounded-lg">
                  <Wrench className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-cyan-300 mb-2">Likely Fix & Recommendations</h3>
                  <div className="bg-white dark:bg-slate-950/50 p-4 rounded-lg border border-slate-200 dark:border-white/5">
                    <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
                      {diagnosis.likely_fix}
                    </p>
                  </div>
                </div>
              </div>

              {/* Corrected Code — the concrete, copy-pasteable change the AI proposes */}
              {diagnosis.corrected_code && (
                <div className="flex items-start gap-3">
                  <div className="mt-1 bg-emerald-100 dark:bg-emerald-500/20 p-2 rounded-lg">
                    <Wrench className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-emerald-300">Suggested Corrected Code</h3>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={copyCorrectedCode}
                        className="h-7 px-2 text-xs text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10"
                      >
                        {copied ? <Check className="w-3.5 h-3.5 mr-1" /> : <Copy className="w-3.5 h-3.5 mr-1" />}
                        {copied ? "Copied" : "Copy"}
                      </Button>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-950 rounded-lg border border-emerald-200 dark:border-emerald-500/20 p-4 overflow-x-auto shadow-sm">
                      <pre className="text-xs sm:text-sm text-emerald-800 dark:text-emerald-300 font-mono leading-relaxed m-0 whitespace-pre">
                        {diagnosis.corrected_code.trim()}
                      </pre>
                    </div>
                  </div>
                </div>
              )}

              {/* Failure Screenshot — the visual evidence the AI analyzed */}
              {diagnosis.failure_screenshot_id && (
                <div className="flex items-start gap-3">
                  <div className="mt-1 bg-violet-100 dark:bg-violet-500/20 p-2 rounded-lg">
                    <ImageIcon className="w-5 h-5 text-violet-600 dark:text-violet-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-violet-300 mb-2">Failure Screenshot</h3>
                    <a
                      href={API_ENDPOINTS.SCREENSHOT_IMAGE(diagnosis.failure_screenshot_id)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block rounded-lg border border-slate-200 dark:border-white/10 overflow-hidden bg-slate-950 hover:border-violet-400 transition-colors"
                    >
                      <img
                        src={API_ENDPOINTS.SCREENSHOT_IMAGE(diagnosis.failure_screenshot_id)}
                        alt="Screenshot at point of failure"
                        className="w-full max-h-[420px] object-contain"
                      />
                    </a>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Captured at the point of failure · click to open full size</p>
                  </div>
                </div>
              )}
            </div>

            {/* Raw evidence — collapsible so the AI's verdict can be audited against ground truth */}
            {(diagnosis.error_trace || diagnosis.execution_logs) && (
              <div className="mt-6 space-y-2">
                {diagnosis.error_trace && (
                  <details className="group rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-950/40">
                    <summary className="cursor-pointer select-none px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-500" /> Full error trace
                    </summary>
                    <pre className="px-4 pb-4 text-xs text-slate-600 dark:text-slate-400 font-mono whitespace-pre-wrap overflow-x-auto max-h-72 overflow-y-auto">
                      {diagnosis.error_trace.trim()}
                    </pre>
                  </details>
                )}
                {diagnosis.execution_logs && (
                  <details className="group rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-950/40">
                    <summary className="cursor-pointer select-none px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2">
                      <Code2 className="w-4 h-4 text-blue-500" /> Execution logs
                    </summary>
                    <pre className="px-4 pb-4 text-xs text-slate-600 dark:text-slate-400 font-mono whitespace-pre-wrap overflow-x-auto max-h-72 overflow-y-auto">
                      {diagnosis.execution_logs.trim()}
                    </pre>
                  </details>
                )}
              </div>
            )}

            <div className="mt-6 pt-4 border-t border-slate-200 dark:border-white/10 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
              <div className="flex flex-wrap items-center gap-4">
                <span>Model: <span className="font-mono">{diagnosis.model_used}</span></span>
                <span>Generated: {new Date(diagnosis.generated_at).toLocaleString()}</span>
              </div>
              <div className="flex items-center gap-2 ml-auto">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={runRediagnosis}
                  disabled={rediagnosing}
                  className="text-blue-600 border-blue-200 hover:bg-blue-50 dark:text-blue-400 dark:border-blue-800/50 dark:hover:bg-blue-900/20"
                >
                  {rediagnosing ? <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5 mr-1.5" />}
                  {rediagnosing ? "Re-diagnosing..." : "Re-diagnose"}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => navigate(`/tester/test-results/${runId}`)}>
                  Go to Run Results
                </Button>
              </div>
            </div>
          </GlassCard>
        </div>
      )}
    </Layout>
  );
}
