import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GlassCard } from "@/components/ui/glass-card";
import { Play, RefreshCw, CheckCircle, XCircle, Image as ImageIcon, AlertTriangle, Layers, Trash2, ArrowUpCircle, ChevronRight, FileCode } from "lucide-react";
import { API_ENDPOINTS } from "@/lib/apiConfig";

type Job = {
  status: string; // none | queued | running | completed | failed
  total?: number;
  completed?: number;
  passed?: number;
  failed?: number;
  baseline_created?: number;
  dimension_mismatch?: number;
  missing?: number;
  errored?: number;
  visual_regression_enabled?: boolean;
};

type Comparison = {
  id: string;
  test_name?: string;
  step_name: string;
  browser: string;
  status: string;
  difference_percentage: number;
  baseline_path: string;
  current_path: string;
  diff_path?: string | null;
  approved_at?: string;
};

const STATUS_BADGE: Record<string, string> = {
  PASSED: "bg-green-500/15 text-green-400 border-green-500/30",
  FAILED: "bg-red-500/15 text-red-400 border-red-500/30",
  BASELINE_CREATED: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  BASELINE_PROMOTED: "bg-indigo-500/15 text-indigo-400 border-indigo-500/30",
  DIMENSION_MISMATCH: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  MISSING: "bg-amber-500/15 text-amber-400 border-amber-500/30",
};

function authHeaders() {
  const token = localStorage.getItem("authToken") || sessionStorage.getItem("authToken");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

const imgUrl = (path: string, cacheKey?: number) => {
  const base = API_ENDPOINTS.VISUAL_REGRESSION_IMAGE(path);
  return cacheKey ? `${base}&t=${cacheKey}` : base;
};

function comparisonId(c: Comparison): string {
  return c.id || (c as { _id?: string })._id || "";
}

function canSetBaseline(c: Comparison): boolean {
  if (c.approved_at || c.status === "BASELINE_PROMOTED") return false;
  if (!c.current_path) return false;
  return !["MISSING", "ERROR"].includes(c.status);
}

function ComparisonCard({
  comparison: c,
  onPromote,
  promoting,
  imageCacheKey,
}: {
  comparison: Comparison;
  onPromote: (id: string) => void;
  promoting: string | null;
  imageCacheKey: number;
}) {
  const id = comparisonId(c);
  const showBaselineAction = canSetBaseline(c);

  return (
    <GlassCard className="p-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-xs text-slate-300 font-medium truncate">
          {c.step_name} · {c.browser}
        </span>
        <div className="flex items-center gap-2 shrink-0">
          <Badge className={`text-[10px] border ${STATUS_BADGE[c.status] || STATUS_BADGE.MISSING}`}>
            {c.status}
            {c.difference_percentage > 0 ? ` · ${c.difference_percentage.toFixed(2)}%` : ""}
          </Badge>
          {c.status === "PASSED" ? (
            <CheckCircle className="h-3.5 w-3.5 text-green-400" />
          ) : c.status === "FAILED" || c.status === "DIMENSION_MISMATCH" ? (
            <XCircle className="h-3.5 w-3.5 text-red-400" />
          ) : null}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {[
          { l: "Baseline", p: c.baseline_path },
          { l: "Current", p: c.current_path },
          { l: "Diff", p: c.diff_path },
        ].map(({ l, p }) => (
          <div key={l} className="min-w-0">
            <p className="text-[10px] text-slate-500 mb-0.5">{l}</p>
            {p ? (
              <a href={imgUrl(p, imageCacheKey)} target="_blank" rel="noopener noreferrer">
                <img
                  src={imgUrl(p, imageCacheKey)}
                  alt={l}
                  className="w-full aspect-video object-contain bg-slate-950 rounded border border-white/10"
                />
              </a>
            ) : (
              <div className="w-full aspect-video rounded border border-dashed border-slate-700 bg-slate-900/50 flex items-center justify-center text-[10px] text-slate-600">
                —
              </div>
            )}
          </div>
        ))}
      </div>
      {showBaselineAction && id && (
        <div className="mt-2 flex justify-end">
          <Button
            size="sm"
            variant="outline"
            disabled={promoting === id}
            onClick={() => onPromote(id)}
            className="text-indigo-300 border-indigo-500/30 hover:bg-indigo-500/10"
          >
            {promoting === id ? (
              <RefreshCw className="h-3.5 w-3.5 mr-1 animate-spin" />
            ) : (
              <ArrowUpCircle className="h-3.5 w-3.5 mr-1" />
            )}
            Set as baseline
          </Button>
        </div>
      )}
      {c.approved_at && (
        <p className="mt-1.5 text-[10px] text-indigo-400/80">Baseline updated</p>
      )}
    </GlassCard>
  );
}

export function VRTRunPanel({ runId }: { runId: string }) {
  const [job, setJob] = useState<Job | null>(null);
  const [comparisons, setComparisons] = useState<Comparison[]>([]);
  const [triggering, setTriggering] = useState(false);
  const [promoting, setPromoting] = useState<string | null>(null);
  const [promotingAll, setPromotingAll] = useState(false);
  const [imageCacheKey, setImageCacheKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const toggleGroup = (name: string) => setExpanded((e) => ({ ...e, [name]: !e[name] }));

  const loadComparisons = useCallback(async () => {
    const cres = await fetch(API_ENDPOINTS.VRT_RUN_COMPARISONS(runId), { headers: authHeaders() });
    if (cres.ok) {
      setComparisons(await cres.json());
      setImageCacheKey(Date.now());
    }
  }, [runId]);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(API_ENDPOINTS.VRT_RUN_STATUS(runId), { headers: authHeaders() });
      if (!res.ok) return;
      const data: Job = await res.json();
      setJob(data);
      if (data.status === "completed" || data.status === "failed") {
        await loadComparisons();
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      }
    } catch {
      /* transient */
    }
  }, [runId, loadComparisons]);

  useEffect(() => {
    fetchStatus();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchStatus]);

  const startPolling = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(fetchStatus, 2000);
  };

  const deleteHistory = async () => {
    if (!window.confirm("Delete all visual regression history for this run? Baselines are kept.")) return;
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    try {
      const res = await fetch(API_ENDPOINTS.VRT_RUN_DELETE(runId), { method: "DELETE", headers: authHeaders() });
      if (!res.ok) throw new Error("Failed to delete history");
      setJob({ status: "none" });
      setComparisons([]);
      setError(null);
    } catch (e: any) {
      setError(e.message ?? "Failed to delete");
    }
  };

  const trigger = async () => {
    setTriggering(true);
    setError(null);
    setComparisons([]);
    try {
      const res = await fetch(API_ENDPOINTS.VRT_RUN_TRIGGER(runId), { method: "POST", headers: authHeaders() });
      if (!res.ok) throw new Error("Failed to start visual regression");
      setJob({ status: "queued" });
      startPolling();
    } catch (e: any) {
      setError(e.message ?? "Failed to start");
    } finally {
      setTriggering(false);
    }
  };

  const promote = async (comparisonId: string) => {
    setPromoting(comparisonId);
    setError(null);
    try {
      const res = await fetch(API_ENDPOINTS.VISUAL_REGRESSION_PROMOTE, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ comparison_id: comparisonId }),
      });
      if (!res.ok) throw new Error("Failed to set baseline");
      await loadComparisons();
    } catch (e: any) {
      setError(e.message ?? "Failed to set baseline");
    } finally {
      setPromoting(null);
    }
  };

  const promoteAll = async () => {
    const ids = comparisons.filter(canSetBaseline).map(comparisonId).filter(Boolean);
    if (ids.length === 0) return;
    if (!window.confirm(`Set current screenshot as baseline for ${ids.length} comparison${ids.length === 1 ? "" : "s"}?`)) return;

    setPromotingAll(true);
    setError(null);
    try {
      const res = await fetch(API_ENDPOINTS.VISUAL_REGRESSION_PROMOTE_ALL, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ comparison_ids: ids }),
      });
      if (!res.ok) throw new Error("Failed to set all baselines");
      const data = await res.json();
      if (data.failed > 0) {
        setError(`Set ${data.promoted} baseline(s); ${data.failed} failed.`);
      }
      await loadComparisons();
    } catch (e: any) {
      setError(e.message ?? "Failed to set all baselines");
    } finally {
      setPromotingAll(false);
    }
  };

  const running = job?.status === "queued" || job?.status === "running";
  const total = job?.total ?? 0;
  const completed = job?.completed ?? 0;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const baselineEligibleCount = comparisons.filter(canSetBaseline).length;

  // Group comparisons by the executed script file so the user sees a list of
  // file names first, then expands one to view its screenshot comparisons.
  const groups = useMemo(() => {
    const map = new Map<string, Comparison[]>();
    for (const c of comparisons) {
      const key = c.test_name || "Unknown script";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    }
    return Array.from(map.entries()).map(([name, items]) => ({
      name,
      items,
      passed: items.filter((c) => c.status === "PASSED").length,
      failed: items.filter((c) => c.status === "FAILED" || c.status === "DIMENSION_MISMATCH").length,
      baseline: items.filter((c) => c.status === "BASELINE_CREATED").length,
    }));
  }, [comparisons]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-violet-400" />
          <span className="text-sm font-semibold text-slate-200">Visual Regression</span>
          {job && job.status !== "none" && (
            <Badge className="text-[10px] capitalize bg-violet-500/15 text-violet-300 border-violet-500/30">
              {job.status}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {job && job.status !== "none" && !running && (
            <Button
              size="sm"
              variant="outline"
              onClick={deleteHistory}
              className="text-red-400 border-red-500/30 hover:bg-red-500/10 hover:text-red-300"
            >
              <Trash2 className="h-4 w-4 mr-1" /> Delete history
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={trigger} disabled={triggering || running}>
            {running ? <RefreshCw className="h-4 w-4 mr-1 animate-spin" /> : <Play className="h-4 w-4 mr-1" />}
            {running ? "Processing…" : job && job.status !== "none" ? "Re-run VRT" : "Run Visual Regression"}
          </Button>
        </div>
      </div>

      {error && (
        <div className="text-xs text-red-400 flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" /> {error}
        </div>
      )}

      {running && (
        <div>
          <div className="flex justify-between text-xs text-slate-400 mb-1">
            <span>Comparing screenshots…</span>
            <span>
              {completed} / {total || "?"} {total > 0 ? `(${pct}%)` : ""}
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
            <div className="h-full bg-violet-500 transition-all duration-500" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      {job && job.status !== "none" && (
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {[
            { label: "Total", value: job.total ?? 0, cls: "text-slate-300" },
            { label: "Passed", value: job.passed ?? 0, cls: "text-green-400" },
            { label: "Failed", value: job.failed ?? 0, cls: "text-red-400" },
            { label: "Baselines", value: job.baseline_created ?? 0, cls: "text-blue-400" },
            { label: "Missing", value: job.missing ?? 0, cls: "text-amber-400" },
            { label: "Size diff", value: job.dimension_mismatch ?? 0, cls: "text-orange-400" },
          ].map((s) => (
            <GlassCard key={s.label} className="p-2 text-center">
              <div className={`text-xl font-bold ${s.cls}`}>{s.value}</div>
              <div className="text-[10px] uppercase tracking-wide text-slate-500">{s.label}</div>
            </GlassCard>
          ))}
        </div>
      )}

      {(!job || job.status === "none") && !running && (
        <GlassCard className="text-center py-8">
          <ImageIcon className="h-8 w-8 mx-auto text-slate-600 mb-2" />
          <p className="text-sm text-slate-400">No visual regression has run for this test run yet.</p>
          <p className="text-xs text-slate-500 mt-1">
            Click “Run Visual Regression” to compare every screenshot against its baseline.
          </p>
        </GlassCard>
      )}

      {comparisons.length > 0 && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold text-slate-300">
              {groups.length} script{groups.length === 1 ? "" : "s"} · {comparisons.length} comparison{comparisons.length === 1 ? "" : "s"}
            </p>
            {baselineEligibleCount > 0 && (
              <Button
                size="sm"
                variant="outline"
                disabled={promotingAll || promoting !== null}
                onClick={promoteAll}
                className="text-indigo-300 border-indigo-500/30 hover:bg-indigo-500/10"
              >
                {promotingAll ? (
                  <RefreshCw className="h-3.5 w-3.5 mr-1 animate-spin" />
                ) : (
                  <ArrowUpCircle className="h-3.5 w-3.5 mr-1" />
                )}
                Set all as baseline ({baselineEligibleCount})
              </Button>
            )}
          </div>
          {groups.map((g) => {
            const isOpen = !!expanded[g.name];
            return (
              <GlassCard key={g.name} className="p-0 overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleGroup(g.name)}
                  className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-white/5 transition-colors text-left"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <ChevronRight className={`h-4 w-4 text-slate-400 shrink-0 transition-transform ${isOpen ? "rotate-90" : ""}`} />
                    <FileCode className="h-4 w-4 text-violet-400 shrink-0" />
                    <span className="text-sm font-medium text-slate-200 truncate">{g.name}</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Badge className="text-[10px] bg-slate-700/50 text-slate-300 border-slate-600">{g.items.length} shots</Badge>
                    {g.failed > 0 && <Badge className={`text-[10px] border ${STATUS_BADGE.FAILED}`}>{g.failed} failed</Badge>}
                    {g.passed > 0 && <Badge className={`text-[10px] border ${STATUS_BADGE.PASSED}`}>{g.passed} passed</Badge>}
                    {g.baseline > 0 && <Badge className={`text-[10px] border ${STATUS_BADGE.BASELINE_CREATED}`}>{g.baseline} baseline</Badge>}
                  </div>
                </button>
                {isOpen && (
                  <div className="px-3 pb-3 pt-1 space-y-3 border-t border-white/10">
                    {g.items.map((c) => (
                      <ComparisonCard
                        key={comparisonId(c) || `${c.step_name}-${c.browser}`}
                        comparison={c}
                        onPromote={promote}
                        promoting={promoting}
                        imageCacheKey={imageCacheKey}
                      />
                    ))}
                  </div>
                )}
              </GlassCard>
            );
          })}
        </div>
      )}
    </div>
  );
}
