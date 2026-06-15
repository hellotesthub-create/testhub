import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GlassCard } from "@/components/ui/glass-card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  Image,
  RefreshCw,
  ExternalLink,
} from "lucide-react";
import { apiConfig } from "@/lib/apiConfig";
import { useLocation } from "wouter";
import Layout from "@/components/layout/Layout";

interface HistoryItem {
  id: string;
  result_id: string;
  run_id?: string;
  test_case_id: string;
  step_name: string;
  framework: string;
  browser: string;
  status: "PASSED" | "FAILED" | "BASELINE_CREATED" | "DIMENSION_MISMATCH" | "ERROR";
  difference_percentage: number;
  threshold: number;
  baseline_path: string;
  current_path: string;
  diff_path: string | null;
  created_at: string;
  approved_at?: string;
}

const STATUS_CONFIG = {
  PASSED: {
    label: "Passed",
    className: "bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-300",
    icon: CheckCircle,
  },
  FAILED: {
    label: "Failed",
    className: "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300",
    icon: XCircle,
  },
  BASELINE_CREATED: {
    label: "Baseline Set",
    className: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300",
    icon: Image,
  },
  DIMENSION_MISMATCH: {
    label: "Size Mismatch",
    className: "bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300",
    icon: AlertTriangle,
  },
  ERROR: {
    label: "Error",
    className: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300",
    icon: AlertTriangle,
  },
};

const SUMMARY_STATUSES = [
  "PASSED",
  "FAILED",
  "BASELINE_CREATED",
  "DIMENSION_MISMATCH",
] as const;

const SUMMARY_CARD_STYLES: Record<
  (typeof SUMMARY_STATUSES)[number],
  { glow: string; icon: string; ring: string }
> = {
  PASSED: {
    glow: "bg-green-500/10 dark:bg-green-500/20",
    icon: "text-green-600 dark:text-green-400",
    ring: "ring-green-500",
  },
  FAILED: {
    glow: "bg-red-500/10 dark:bg-red-500/20",
    icon: "text-red-600 dark:text-red-400",
    ring: "ring-red-500",
  },
  BASELINE_CREATED: {
    glow: "bg-blue-500/10 dark:bg-blue-500/20",
    icon: "text-blue-600 dark:text-blue-400",
    ring: "ring-blue-500",
  },
  DIMENSION_MISMATCH: {
    glow: "bg-orange-500/10 dark:bg-orange-500/20",
    icon: "text-orange-600 dark:text-orange-400",
    ring: "ring-orange-500",
  },
};

export default function VisualRegressionHistory() {
  const [, setLocation] = useLocation();
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [refreshing, setRefreshing] = useState(false);

  const fetchHistory = useCallback(async () => {
    try {
      setError(null);
      const token = localStorage.getItem("authToken") || sessionStorage.getItem("authToken");
      const res = await fetch(`${apiConfig.baseUrl}/visual-regression/history`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!res.ok) throw new Error("Failed to load history");
      const data: HistoryItem[] = await res.json();
      setItems(data);
    } catch {
      setError("Could not load visual regression history. Check your connection.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchHistory();
  };

  const filtered = items.filter((item) => {
    const term = search.toLowerCase();
    const matchSearch =
      item.test_case_id.toLowerCase().includes(term) ||
      item.step_name.toLowerCase().includes(term) ||
      item.browser.toLowerCase().includes(term);
    const matchStatus =
      statusFilter === "ALL" || item.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
              Visual Regression History
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              All visual comparisons across your test runs
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing || loading}
          >
            <RefreshCw
              className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        </div>

        {/* Error */}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {loading ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-24 w-full rounded-xl" />
              ))}
            </div>
            <div className="flex gap-3">
              <Skeleton className="h-10 w-80" />
              <Skeleton className="h-10 w-48" />
            </div>
            <Skeleton className="h-64 w-full" />
          </div>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {SUMMARY_STATUSES.map((s) => {
                const count = items.filter((i) => i.status === s).length;
                const cfg = STATUS_CONFIG[s];
                const cardStyle = SUMMARY_CARD_STYLES[s];
                const Icon = cfg.icon;
                const isActive = statusFilter === s;
                return (
                  <GlassCard
                    key={s}
                    variant="interactive"
                    className={`relative overflow-hidden p-4 sm:p-5 ${
                      isActive ? `ring-2 ${cardStyle.ring}` : ""
                    }`}
                    onClick={() => setStatusFilter(s === statusFilter ? "ALL" : s)}
                  >
                    <div
                      className={`absolute -right-6 -top-6 w-24 h-24 rounded-full blur-xl ${cardStyle.glow}`}
                    />
                    <div className="relative flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-slate-600 dark:text-slate-400 uppercase tracking-wide">
                        {cfg.label}
                      </span>
                      <Icon className={`h-4 w-4 sm:h-5 sm:w-5 ${cardStyle.icon}`} />
                    </div>
                    <div className="relative text-2xl sm:text-3xl font-bold font-display text-slate-900 dark:text-white">
                      {count}
                    </div>
                  </GlassCard>
                );
              })}
            </div>

            {/* Filters */}
            <div className="flex gap-3 items-center flex-wrap">
              <Input
                placeholder="Search by test case, step or browser..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="max-w-sm"
              />
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-52">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Statuses</SelectItem>
                  <SelectItem value="PASSED">Passed</SelectItem>
                  <SelectItem value="FAILED">Failed</SelectItem>
                  <SelectItem value="BASELINE_CREATED">Baseline Created</SelectItem>
                  <SelectItem value="DIMENSION_MISMATCH">Dimension Mismatch</SelectItem>
                  <SelectItem value="ERROR">Error</SelectItem>
                </SelectContent>
              </Select>
              <span className="text-sm text-slate-500">
                {filtered.length} result{filtered.length !== 1 ? "s" : ""}
              </span>
            </div>

            {/* Results table */}
            <GlassCard className="p-0 overflow-hidden">
              {filtered.length === 0 ? (
                <div className="text-center py-16 text-slate-500 dark:text-slate-400">
                    <Image className="h-10 w-10 mx-auto mb-3 opacity-30" />
                    <p className="font-medium">No comparisons found</p>
                    <p className="text-sm mt-1">
                      Run a visual comparison from a test result to see it here.
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col min-w-full">
                    <div className="grid grid-cols-12 gap-4 px-4 py-3 bg-slate-100/50 dark:bg-slate-800/50 border-b text-sm font-medium text-slate-600 dark:text-slate-300">
                      <div className="col-span-3">Test Case</div>
                      <div className="col-span-3">Step</div>
                      <div className="col-span-1">Browser</div>
                      <div className="col-span-2">Status</div>
                      <div className="col-span-1">Diff %</div>
                      <div className="col-span-2 text-right">Run At</div>
                    </div>
                    {filtered.map((item) => {
                      const cfg = STATUS_CONFIG[item.status] ?? STATUS_CONFIG.ERROR;
                      const Icon = cfg.icon;
                      return (
                        <div
                          key={item.id}
                          className="grid grid-cols-12 gap-4 px-4 py-3 items-center border-b last:border-0 hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors text-sm"
                        >
                          <div className="col-span-3 font-mono text-xs truncate" title={item.test_case_id}>
                            {item.test_case_id}
                          </div>
                          <div className="col-span-3 text-slate-600 dark:text-slate-400 truncate" title={item.step_name}>
                            {item.step_name}
                          </div>
                          <div className="col-span-1 capitalize truncate">{item.browser}</div>
                          <div className="col-span-2">
                            <span
                              className={`inline-flex items-center gap-1 text-[10px] sm:text-xs px-2 py-1 rounded-full font-medium border ${cfg.className} truncate`}
                            >
                              <Icon className="h-3 w-3 shrink-0" />
                              <span className="truncate">{cfg.label}</span>
                            </span>
                          </div>
                          <div className="col-span-1 font-mono text-xs">
                            {item.status === "BASELINE_CREATED"
                              ? "—"
                              : `${item.difference_percentage.toFixed(2)}%`}
                          </div>
                          <div className="col-span-2 text-right flex items-center justify-end gap-3 text-slate-500 text-xs">
                            <span className="hidden lg:inline">{formatDate(item.created_at)}</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 lg:h-8 lg:w-auto lg:px-2 lg:py-1 shrink-0"
                              onClick={() => {
                                const navId = item.run_id || item.result_id;
                                setLocation(`/tester/test-results/${navId}`);
                              }}
                            >
                              <ExternalLink className="h-4 w-4 lg:h-3 lg:w-3 lg:mr-1" />
                              <span className="hidden lg:inline">View</span>
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
            </GlassCard>
          </>
        )}
      </div>
    </Layout>
  );
}
