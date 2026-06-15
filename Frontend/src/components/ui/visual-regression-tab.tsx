import { useEffect, useMemo, useState } from "react";
import {
  Image,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  PlusCircle,
  ZoomIn,
  X,
  ChevronLeft,
  ChevronRight,
  ArrowUpCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { GlassCard } from "@/components/ui/glass-card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { API_ENDPOINTS } from "@/lib/apiConfig";

type Comparison = {
  id?: string;
  _id?: string;
  status: string;
  difference_percentage: number;
  baseline_path: string;
  current_path: string;
  diff_path?: string | null;
  approved_at?: string;
};

type ViewerImage = { label: string; path: string };

type Props = { resultId: string };

const badgeClass: Record<string, string> = {
  BASELINE_CREATED: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300",
  PASSED: "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300",
  FAILED: "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300",
  DIMENSION_MISMATCH: "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300",
  ERROR: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300",
};

function tokenHeaders() {
  const token = localStorage.getItem("authToken") || sessionStorage.getItem("authToken");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

const VISUAL_ERROR_MESSAGES: Record<string, string> = {
  screenshot_not_found: "No screenshots found for this test result.",
  visual_regression_unavailable: "Visual regression service is unavailable. Try again later.",
  visual_regression_disk_error: "Could not prepare screenshot files for comparison.",
  visual_comparison_save_failed: "Comparison ran but could not be saved.",
  unauthorized: "You are not authorized to run this comparison.",
  result_not_found: "Test result not found.",
};

async function visualRegressionErrorMessage(res: Response): Promise<string> {
  try {
    const data = await res.json();
    if (typeof data?.error === "string") {
      return VISUAL_ERROR_MESSAGES[data.error] ?? `Visual comparison failed (${data.error}).`;
    }
  } catch {
    // ignore parse errors
  }
  return "Visual comparison failed.";
}

function comparisonId(c: Comparison | null): string {
  if (!c) return "";
  return c.id || c._id || "";
}

function canSetBaseline(c: Comparison): boolean {
  if (c.approved_at || c.status === "BASELINE_PROMOTED") return false;
  if (!c.current_path) return false;
  return !["MISSING", "ERROR"].includes(c.status);
}

function imageUrl(path: string, cacheKey: number) {
  return `${API_ENDPOINTS.VISUAL_REGRESSION_IMAGE(path)}&t=${cacheKey}`;
}

export function VisualRegressionTab({ resultId }: Props) {
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [approving, setApproving] = useState(false);
  const [approveSuccess, setApproveSuccess] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [imageCacheKey, setImageCacheKey] = useState(Date.now());

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(API_ENDPOINTS.VISUAL_REGRESSION_COMPARISON(resultId), { headers: tokenHeaders() });
      if (res.status === 404) {
        setComparison(null);
      } else if (res.ok) {
        setComparison(await res.json());
        setImageCacheKey(Date.now());
      } else {
        setError("Unable to load visual comparison.");
      }
    } catch {
      setError("Unable to load visual comparison.");
    }
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, [resultId]);

  const run = async () => {
    setRunning(true);
    setError("");
    setApproveSuccess(false);
    setApproveError(null);
    try {
      const res = await fetch(API_ENDPOINTS.VISUAL_REGRESSION_COMPARE, {
        method: "POST",
        headers: tokenHeaders(),
        body: JSON.stringify({ result_id: resultId }),
      });
      if (!res.ok) {
        setError(await visualRegressionErrorMessage(res));
        return;
      }
      const data: Comparison = await res.json();
      setComparison(data);
      setImageCacheKey(Date.now());
    } catch {
      setError("Visual comparison failed.");
    } finally {
      setRunning(false);
      setLoading(false);
    }
  };

  const handleSetBaseline = async () => {
    const id = comparisonId(comparison);
    if (!comparison || !id) return;
    setApproving(true);
    setApproveError(null);
    setApproveSuccess(false);
    try {
      const res = await fetch(API_ENDPOINTS.VISUAL_REGRESSION_PROMOTE, {
        method: "POST",
        headers: tokenHeaders(),
        body: JSON.stringify({ comparison_id: id }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to set baseline");
      }
      setApproveSuccess(true);
      await load();
    } catch (e: any) {
      setApproveError(e.message ?? "Something went wrong");
    } finally {
      setApproving(false);
    }
  };

  const viewerImages = useMemo<ViewerImage[]>(() => {
    if (!comparison) return [];
    const items: ViewerImage[] = [];
    if (comparison.baseline_path) items.push({ label: "Baseline", path: comparison.baseline_path });
    if (comparison.current_path) items.push({ label: "Current", path: comparison.current_path });
    if (comparison.diff_path) items.push({ label: "Diff", path: comparison.diff_path });
    return items;
  }, [comparison]);

  const openViewer = (index: number) => setViewerIndex(index);
  const closeViewer = () => setViewerIndex(null);
  const navigateViewer = (direction: "prev" | "next") => {
    if (viewerIndex === null || viewerImages.length === 0) return;
    const len = viewerImages.length;
    const idx = direction === "prev" ? (viewerIndex - 1 + len) % len : (viewerIndex + 1) % len;
    setViewerIndex(idx);
  };

  const panels: { label: string; path?: string | null }[] = comparison
    ? [
        { label: "Baseline", path: comparison.baseline_path },
        { label: "Current", path: comparison.current_path },
        { label: "Diff", path: comparison.diff_path },
      ]
    : [];

  const showBaselineAction = comparison && canSetBaseline(comparison) && comparisonId(comparison);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {comparison && (
            <>
              <Badge className={`border ${badgeClass[comparison.status] || badgeClass.ERROR}`}>
                {comparison.status}
              </Badge>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {comparison.difference_percentage.toFixed(2)}% difference
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={load} disabled={running || loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading && !running ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button size="sm" variant="outline" onClick={run} disabled={running || loading}>
            {running ? (
              <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <PlusCircle className="h-4 w-4 mr-1" />
            )}
            {running ? "Running…" : comparison ? "Re-run Comparison" : "Run Comparison"}
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {loading ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Skeleton className="aspect-video w-full" />
          <Skeleton className="aspect-video w-full" />
          <Skeleton className="aspect-video w-full" />
        </div>
      ) : !comparison ? (
        <GlassCard className="text-center py-8 sm:py-12">
          <Image className="w-8 h-8 sm:w-12 sm:h-12 mx-auto text-slate-400 dark:text-slate-600 mb-3 sm:mb-4" />
          <h3 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white mb-2">
            No Visual Comparison Yet
          </h3>
          <p className="text-slate-600 dark:text-slate-400 mb-4 max-w-md mx-auto text-sm">
            Compare this run&apos;s screenshot against the saved baseline to detect UI changes.
          </p>
          <Button onClick={run} disabled={running}>
            {running ? <RefreshCw className="h-4 w-4 mr-1 animate-spin" /> : <PlusCircle className="h-4 w-4 mr-1" />}
            {running ? "Running…" : "Run Visual Comparison"}
          </Button>
        </GlassCard>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {panels.map(({ label, path }) => {
              const viewerIdx = path ? viewerImages.findIndex((img) => img.path === path) : -1;
              return (
                <div key={label} className="min-w-0">
                  <p className="mb-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                    {label}
                    {label === "Diff" && comparison.diff_path && (
                      <span className="ml-1 font-normal text-red-400">— red = changed, gray = same</span>
                    )}
                  </p>
                  {path ? (
                    <GlassCard
                      className="group cursor-pointer overflow-hidden hover:shadow-xl transition-all"
                      onClick={() => viewerIdx >= 0 && openViewer(viewerIdx)}
                    >
                      <div className="aspect-video bg-slate-950 relative overflow-hidden">
                        <img
                          key={`${label}-${imageCacheKey}`}
                          className="h-full w-full object-contain group-hover:scale-105 transition-transform duration-300"
                          src={imageUrl(path, imageCacheKey)}
                          alt={`${label} visual regression`}
                        />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/40">
                          <ZoomIn className="h-8 w-8 text-white opacity-0 transition-opacity group-hover:opacity-100" />
                        </div>
                      </div>
                    </GlassCard>
                  ) : label === "Diff" && comparison.status === "BASELINE_CREATED" ? (
                    <div className="flex aspect-video w-full items-center justify-center rounded-lg border border-dashed border-slate-700 bg-slate-900/50 px-3 text-center text-xs text-slate-500">
                      No diff on first run — baseline was just created
                    </div>
                  ) : (
                    <Skeleton className="aspect-video w-full" />
                  )}
                </div>
              );
            })}
          </div>

          {comparison.diff_path && comparison.status !== "BASELINE_CREATED" && (
            <div className="rounded-lg border border-red-500/20 bg-red-950/20 p-3 sm:p-4 text-xs sm:text-sm">
              <p className="font-medium text-red-400 mb-2">How to read the diff image</p>
              <ul className="list-disc list-inside space-y-1 text-slate-600 dark:text-slate-400">
                <li>
                  <span className="text-red-400 font-medium">Bright red areas</span> are pixels that changed between baseline and current
                </li>
                <li>
                  <span className="text-slate-500">Dark gray areas</span> are unchanged — they match the baseline
                </li>
                <li>
                  Use <span className="font-medium text-slate-700 dark:text-slate-300">Baseline</span> to see the original UI and{" "}
                  <span className="font-medium text-slate-700 dark:text-slate-300">Current</span> to see what it looks like now
                </li>
              </ul>
              {comparison.difference_percentage > 0 && (
                <p className="mt-2 text-slate-500 dark:text-slate-400">
                  {comparison.difference_percentage.toFixed(2)}% of pixels differ
                  {comparison.status === "FAILED" ? " (above the 2% threshold)" : " (within the 2% threshold)"}.
                </p>
              )}
            </div>
          )}

          {showBaselineAction && (
            <div className="rounded-lg border border-slate-200 dark:border-white/10 p-4">
              {approveSuccess ? (
                <Alert className="bg-green-50 border-green-200 dark:bg-green-500/10 dark:border-green-500/20">
                  <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                  <AlertDescription className="text-green-700 dark:text-green-300 text-sm">
                    Baseline updated. Future comparisons will use this screenshot as the golden image.
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-white">Set current as baseline?</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Accept this screenshot as the new golden image for future comparisons.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSetBaseline}
                    disabled={approving}
                    className="shrink-0 border-indigo-200 text-indigo-700 hover:bg-indigo-50 dark:border-indigo-500/30 dark:text-indigo-400 dark:hover:bg-indigo-500/10"
                  >
                    {approving ? (
                      <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                    ) : (
                      <ArrowUpCircle className="h-3 w-3 mr-1" />
                    )}
                    {approving ? "Setting…" : "Set as baseline"}
                  </Button>
                </div>
              )}
              {approveError && (
                <Alert variant="destructive" className="mt-3">
                  <AlertDescription>{approveError}</AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </>
      )}

      <Dialog open={viewerIndex !== null} onOpenChange={closeViewer}>
        <DialogContent className="max-w-[100vw] sm:max-w-[95vw] md:max-w-5xl w-full h-[100dvh] sm:h-[90vh] bg-black/95 border-0 p-0 rounded-none sm:rounded-lg">
          {viewerIndex !== null && viewerImages[viewerIndex] && (
            <div className="relative w-full h-full flex flex-col">
              <div className="absolute top-0 left-0 right-0 z-10 bg-gradient-to-b from-black/80 to-transparent p-3 sm:p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-white min-w-0 flex-1">
                    <p className="font-medium text-xs sm:text-sm md:text-base truncate">
                      {viewerImages[viewerIndex].label}
                    </p>
                    <p className="text-[10px] sm:text-sm text-white/70">
                      {viewerImages[viewerIndex].label === "Diff"
                        ? "Red = changed pixels · Gray = unchanged"
                        : "Visual Regression"}
                    </p>
                  </div>
                  <Button variant="ghost" size="icon" className="text-white hover:bg-white/10" onClick={closeViewer}>
                    <X className="w-5 h-5" />
                  </Button>
                </div>
              </div>

              <div className="flex-1 flex items-center justify-center p-4 pt-16">
                <img
                  src={imageUrl(viewerImages[viewerIndex].path, imageCacheKey)}
                  alt={viewerImages[viewerIndex].label}
                  className="max-w-full max-h-full object-contain"
                />
              </div>

              {viewerImages.length > 1 && (
                <>
                  <div className="absolute top-1/2 left-1.5 sm:left-4 -translate-y-1/2">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-white bg-black/50 hover:bg-black/70 w-8 h-8 sm:w-10 sm:h-10"
                      onClick={() => navigateViewer("prev")}
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </Button>
                  </div>
                  <div className="absolute top-1/2 right-1.5 sm:right-4 -translate-y-1/2">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-white bg-black/50 hover:bg-black/70 w-8 h-8 sm:w-10 sm:h-10"
                      onClick={() => navigateViewer("next")}
                    >
                      <ChevronRight className="w-5 h-5" />
                    </Button>
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3 sm:p-4">
                    <div className="text-center text-white/70 text-xs sm:text-sm">
                      {viewerIndex + 1} / {viewerImages.length} — {viewerImages[viewerIndex].label}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
