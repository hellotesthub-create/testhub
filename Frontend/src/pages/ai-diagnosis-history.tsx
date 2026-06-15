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
  Bot,
  RefreshCw,
  Trash2,
  ExternalLink,
  ShieldCheck,
  ShieldAlert,
  ShieldQuestion,
} from "lucide-react";
import { API_ENDPOINTS } from "@/lib/apiConfig";
import { useLocation } from "wouter";
import Layout from "@/components/layout/Layout";

interface DiagnosisItem {
  id: string;
  execution_id: string;
  run_id: string;
  test_name: string;
  browser: string;
  error_category: string;
  confidence: "High" | "Medium" | "Low" | string;
  model_used: string;
  root_cause: string;
  generated_at: string;
}

const CONFIDENCE_BADGE: Record<string, string> = {
  High: "bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-300",
  Medium: "bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300",
  Low: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300",
};

const CATEGORY_BADGE = (cat: string) => {
  switch (cat) {
    case "LOCATOR_NOT_FOUND": return "bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300";
    case "TIMEOUT": return "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300";
    case "ASSERTION_FAILURE": return "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300";
    case "STALE_ELEMENT": return "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300";
    case "FRAME_ERROR": return "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300";
    default: return "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400";
  }
};

export default function AIDiagnosisHistory() {
  const [, setLocation] = useLocation();
  const [items, setItems] = useState<DiagnosisItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [confFilter, setConfFilter] = useState("ALL");

  const authHeaders = () => {
    const token = localStorage.getItem("authToken") || sessionStorage.getItem("authToken");
    return { Authorization: `Bearer ${token}` };
  };

  const fetchHistory = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch(API_ENDPOINTS.DIAGNOSIS_HISTORY, { headers: authHeaders() });
      if (!res.ok) throw new Error();
      setItems(await res.json());
    } catch {
      setError("Could not load AI diagnosis history. Check your connection.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  const handleRefresh = () => { setRefreshing(true); fetchHistory(); };

  const deleteOne = async (id: string) => {
    const prev = items;
    setItems((cur) => cur.filter((i) => i.id !== id));
    try {
      const res = await fetch(API_ENDPOINTS.DIAGNOSIS_DELETE(id), { method: "DELETE", headers: authHeaders() });
      if (!res.ok) throw new Error();
    } catch {
      setItems(prev);
      setError("Could not delete that diagnosis.");
    }
  };

  const clearAll = async () => {
    if (!window.confirm("Delete ALL AI diagnosis history?")) return;
    try {
      const res = await fetch(API_ENDPOINTS.DIAGNOSIS_HISTORY, { method: "DELETE", headers: authHeaders() });
      if (!res.ok) throw new Error();
      setItems([]);
      setError(null);
    } catch {
      setError("Could not clear history.");
    }
  };

  const view = (item: DiagnosisItem) => {
    if (item.run_id) setLocation(`/tester/test-results/${item.run_id}/diagnosis/${item.execution_id}`);
  };

  const filtered = items.filter((item) => {
    const term = search.toLowerCase();
    const matchSearch =
      (item.test_name || "").toLowerCase().includes(term) ||
      (item.error_category || "").toLowerCase().includes(term) ||
      (item.root_cause || "").toLowerCase().includes(term) ||
      (item.browser || "").toLowerCase().includes(term);
    const matchConf = confFilter === "ALL" || item.confidence === confFilter;
    return matchSearch && matchConf;
  });

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

  const counts = {
    total: items.length,
    High: items.filter((i) => i.confidence === "High").length,
    Medium: items.filter((i) => i.confidence === "Medium").length,
    Low: items.filter((i) => i.confidence === "Low").length,
  };

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
              <Bot className="h-6 w-6 text-violet-500" /> AI Diagnosis History
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Every AI failure diagnosis across your test runs
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing || loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={clearAll}
              disabled={loading || items.length === 0}
              className="text-red-500 border-red-500/30 hover:bg-red-500/10 hover:text-red-400"
            >
              <Trash2 className="h-4 w-4 mr-2" /> Clear all
            </Button>
          </div>
        </div>

        {error && (
          <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>
        )}

        {loading ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
            </div>
            <Skeleton className="h-64 w-full" />
          </div>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "Total", value: counts.total, icon: Bot, glow: "bg-violet-500/10", ic: "text-violet-500", k: "ALL" },
                { label: "High Confidence", value: counts.High, icon: ShieldCheck, glow: "bg-green-500/10", ic: "text-green-500", k: "High" },
                { label: "Medium", value: counts.Medium, icon: ShieldAlert, glow: "bg-yellow-500/10", ic: "text-yellow-500", k: "Medium" },
                { label: "Low", value: counts.Low, icon: ShieldQuestion, glow: "bg-slate-500/10", ic: "text-slate-400", k: "Low" },
              ].map((s) => {
                const Icon = s.icon;
                const active = confFilter === s.k;
                return (
                  <GlassCard
                    key={s.label}
                    variant="interactive"
                    className={`relative overflow-hidden p-4 sm:p-5 ${active ? "ring-2 ring-violet-500" : ""}`}
                    onClick={() => setConfFilter(s.k === confFilter ? "ALL" : s.k)}
                  >
                    <div className={`absolute -right-6 -top-6 w-24 h-24 rounded-full blur-xl ${s.glow}`} />
                    <div className="relative flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-slate-600 dark:text-slate-400 uppercase tracking-wide">{s.label}</span>
                      <Icon className={`h-4 w-4 sm:h-5 sm:w-5 ${s.ic}`} />
                    </div>
                    <div className="relative text-2xl sm:text-3xl font-bold font-display text-slate-900 dark:text-white">{s.value}</div>
                  </GlassCard>
                );
              })}
            </div>

            {/* Filters */}
            <div className="flex gap-3 items-center flex-wrap">
              <Input
                placeholder="Search by test, category, browser…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="max-w-sm"
              />
              <Select value={confFilter} onValueChange={setConfFilter}>
                <SelectTrigger className="w-48"><SelectValue placeholder="All confidence" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Confidence</SelectItem>
                  <SelectItem value="High">High</SelectItem>
                  <SelectItem value="Medium">Medium</SelectItem>
                  <SelectItem value="Low">Low</SelectItem>
                </SelectContent>
              </Select>
              <span className="text-sm text-slate-500">{filtered.length} result{filtered.length !== 1 ? "s" : ""}</span>
            </div>

            {/* Table */}
            <GlassCard className="p-0 overflow-hidden">
              {filtered.length === 0 ? (
                <div className="text-center py-16 text-slate-500 dark:text-slate-400">
                  <Bot className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p className="font-medium">No diagnoses found</p>
                  <p className="text-sm mt-1">Run an AI diagnosis on a failed test result to see it here.</p>
                </div>
              ) : (
                <div className="flex flex-col min-w-full">
                  <div className="grid grid-cols-12 gap-4 px-4 py-3 bg-slate-100/50 dark:bg-slate-800/50 border-b text-sm font-medium text-slate-600 dark:text-slate-300">
                    <div className="col-span-4">Test Case</div>
                    <div className="col-span-2">Category</div>
                    <div className="col-span-2">Confidence</div>
                    <div className="col-span-2">Model</div>
                    <div className="col-span-2 text-right">Actions</div>
                  </div>
                  {filtered.map((item) => (
                    <div
                      key={item.id}
                      className="grid grid-cols-12 gap-4 px-4 py-3 items-center border-b last:border-0 hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors text-sm"
                    >
                      <div className="col-span-4 min-w-0">
                        <p className="font-medium text-slate-800 dark:text-slate-200 truncate">{item.test_name || "—"}</p>
                        <p className="text-xs text-slate-500 truncate">{item.browser} · {formatDate(item.generated_at)}</p>
                      </div>
                      <div className="col-span-2">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold border ${CATEGORY_BADGE(item.error_category)}`}>
                          {(item.error_category || "UNKNOWN").replace(/_/g, " ")}
                        </span>
                      </div>
                      <div className="col-span-2">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold border ${CONFIDENCE_BADGE[item.confidence] || CONFIDENCE_BADGE.Low}`}>
                          {item.confidence}
                        </span>
                      </div>
                      <div className="col-span-2 font-mono text-xs text-slate-500 truncate">{item.model_used}</div>
                      <div className="col-span-2 flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => view(item)} disabled={!item.run_id}>
                          <ExternalLink className="h-4 w-4 lg:mr-1" />
                          <span className="hidden lg:inline">View</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          title="Delete this diagnosis"
                          className="h-8 w-8 p-0 text-slate-500 hover:text-red-500 hover:bg-red-500/10"
                          onClick={() => deleteOne(item.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </GlassCard>
          </>
        )}
      </div>
    </Layout>
  );
}
