import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, Wrench, Bot, RefreshCw, RotateCcw, CheckCircle2, Search, Code2 } from "lucide-react";
import { API_ENDPOINTS } from "@/lib/apiConfig";

// ─── Types ──────────────────────────────────────────────────────

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
}

interface AIDiagnosisCardProps {
  resultId: string;
  status: string;
  initialDiagnosis?: DiagnosisResult | null;
}

// ─── Component ──────────────────────────────────────────────────

export function AIDiagnosisCard({
  resultId,
  status,
  initialDiagnosis = null,
}: AIDiagnosisCardProps) {
  const [diagnosis, setDiagnosis] = useState<DiagnosisResult | null>(initialDiagnosis);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Only render on FAILED results
  if (!status || status.toUpperCase() !== "FAILED") {
    return null;
  }

  const fetchDiagnosis = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem("authToken") || sessionStorage.getItem("authToken");
      if (!token) {
        setError("Authentication required");
        return;
      }

      const response = await fetch(API_ENDPOINTS.RESULT_DIAGNOSE(resultId), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(
          errData.message || `Diagnosis failed (status ${response.status})`
        );
      }

      const data: DiagnosisResult = await response.json();
      setDiagnosis(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Diagnosis unavailable, try again"
      );
    } finally {
      setLoading(false);
    }
  };

  // ─── Confidence badge colors ──────────────────────────────────
  const confidenceStyles: Record<string, string> = {
    High: "bg-green-500/20 text-green-400 border-green-500/30",
    Medium: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    Low: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  };

  const getCategoryColor = (cat: string | undefined) => {
    switch (cat) {
      case "LOCATOR_NOT_FOUND": return "bg-rose-500/20 text-rose-400 border-rose-500/30";
      case "TIMEOUT": return "bg-orange-500/20 text-orange-400 border-orange-500/30";
      case "ASSERTION_FAILURE": return "bg-purple-500/20 text-purple-400 border-purple-500/30";
      case "STALE_ELEMENT": return "bg-amber-500/20 text-amber-400 border-amber-500/30";
      case "FRAME_ERROR": return "bg-blue-500/20 text-blue-400 border-blue-500/30";
      default: return "bg-slate-500/20 text-slate-400 border-slate-500/30";
    }
  };

  // ─── Loading state ────────────────────────────────────────────
  if (loading) {
    return (
      <Card className="mt-3 bg-slate-900/60 border-blue-500/20 overflow-hidden">
        <CardContent className="p-3 sm:p-4 space-y-3">
          <div className="flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-blue-400 animate-spin" />
            <span className="text-xs sm:text-sm text-blue-300 font-medium">
              Analyzing failure with AI...
            </span>
          </div>
          <Skeleton className="h-4 w-3/4 bg-slate-700" />
          <Skeleton className="h-4 w-1/2 bg-slate-700" />
          <Skeleton className="h-3 w-1/3 bg-slate-700" />
        </CardContent>
      </Card>
    );
  }

  // ─── Error state ──────────────────────────────────────────────
  if (error) {
    return (
      <div className="mt-3">
        <Alert className="bg-red-950/30 border-red-500/20 text-red-300">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between gap-2">
            <span className="text-xs sm:text-sm">{error}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={fetchDiagnosis}
              className="text-red-400 hover:text-red-300 hover:bg-red-500/10 shrink-0 text-xs h-7 px-2"
            >
              <RotateCcw className="w-3 h-3 mr-1" />
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // ─── No diagnosis yet — show trigger button ───────────────────
  if (!diagnosis) {
    return (
      <div className="mt-2">
        <Button
          variant="outline"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            fetchDiagnosis();
          }}
          className="text-[10px] sm:text-xs h-7 px-2 sm:px-3 bg-violet-500/10 border-violet-500/30 text-violet-400 hover:bg-violet-500/20 hover:text-violet-300 hover:border-violet-500/50 transition-all"
        >
          <Bot className="w-3 h-3 mr-1 sm:mr-1.5" />
          Diagnose with AI
        </Button>
      </div>
    );
  }

  // ─── Diagnosis result ─────────────────────────────────────────
  return (
    <Card
      className="mt-3 bg-gradient-to-br from-slate-900/80 to-violet-950/30 border-violet-500/20 overflow-hidden"
      onClick={(e) => e.stopPropagation()}
    >
      <CardHeader className="pb-2 pt-3 px-3 sm:px-4">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-xs sm:text-sm font-semibold text-violet-300 flex items-center gap-1.5">
            <Bot className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            AI Diagnosis
          </CardTitle>
          <Badge className="text-[9px] sm:text-[10px] bg-violet-500/15 text-violet-400 border-violet-500/30 px-1.5 py-0">
            AI Analyzed
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="px-3 sm:px-4 pb-3 space-y-3">
        {/* Context Badges */}
        <div className="flex flex-wrap gap-2 mb-1">
          {diagnosis.error_category && diagnosis.error_category !== "UNKNOWN" && (
            <Badge className={`text-[10px] px-1.5 py-0 border ${getCategoryColor(diagnosis.error_category)}`}>
              {diagnosis.error_category.replace(/_/g, " ")}
            </Badge>
          )}
          {diagnosis.last_successful_step && (
            <Badge className="text-[10px] bg-slate-800 text-slate-300 border-slate-700 px-1.5 py-0 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Last step: {diagnosis.last_successful_step}
            </Badge>
          )}
          {diagnosis.failing_locator && (
            <Badge className="text-[10px] bg-slate-800 text-slate-300 border-slate-700 px-1.5 py-0 flex items-center gap-1 max-w-[200px] truncate">
              <Search className="w-3 h-3 shrink-0" /> {diagnosis.failing_locator}
            </Badge>
          )}
        </div>

        {/* Root Cause */}
        <div className="flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="text-[10px] sm:text-xs font-semibold text-amber-300 mb-0.5">Root Cause</p>
            <p className="text-[10px] sm:text-xs text-slate-300 leading-relaxed">{diagnosis.root_cause}</p>
          </div>
        </div>

        {/* Code Snippet */}
        {diagnosis.failing_line_number && diagnosis.failing_code_snippet && (
          <div className="flex items-start gap-2">
            <Code2 className="w-3.5 h-3.5 text-blue-400 mt-0.5 shrink-0" />
            <div className="min-w-0 w-full">
              <p className="text-[10px] sm:text-xs font-semibold text-blue-300 mb-0.5">
                Failing Code (Line {diagnosis.failing_line_number})
              </p>
              <div className="bg-slate-950 rounded border border-slate-800 p-2 overflow-x-auto">
                <pre className="text-[9px] sm:text-[10px] text-slate-300 font-mono leading-relaxed m-0 whitespace-pre">
                  {diagnosis.failing_code_snippet.trim()}
                </pre>
              </div>
            </div>
          </div>
        )}

        {/* Likely Fix */}
        <div className="flex items-start gap-2">
          <Wrench className="w-3.5 h-3.5 text-cyan-400 mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="text-[10px] sm:text-xs font-semibold text-cyan-300 mb-0.5">Likely Fix</p>
            <p className="text-[10px] sm:text-xs text-slate-300 leading-relaxed">{diagnosis.likely_fix}</p>
          </div>
        </div>

        {/* Footer: Confidence + Model + Timestamp + Re-diagnose */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 pt-1 border-t border-white/5">
          <Badge
            className={`text-[9px] sm:text-[10px] px-1.5 py-0 border ${
              confidenceStyles[diagnosis.confidence] || confidenceStyles.Low
            }`}
          >
            {diagnosis.confidence} Confidence
          </Badge>
          <span className="text-[9px] sm:text-[10px] text-slate-500 font-mono">
            {diagnosis.model_used}
          </span>
          <span className="text-[9px] sm:text-[10px] text-slate-600">
            {new Date(diagnosis.generated_at).toLocaleString()}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              fetchDiagnosis();
            }}
            className="ml-auto text-[10px] h-6 px-2 text-slate-500 hover:text-violet-400 hover:bg-violet-500/10"
          >
            <RotateCcw className="w-3 h-3 mr-1" />
            Re-diagnose
          </Button>
        </div>

        {/* Disclaimer */}
        <p className="text-[9px] text-slate-600 italic">
          AI-generated suggestion — verify before applying.
        </p>
      </CardContent>
    </Card>
  );
}
