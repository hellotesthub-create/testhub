import Layout from "@/components/layout/Layout";
import { GlassCard } from "@/components/ui/glass-card";
import { CardSpotlight } from "@/components/ui/card-spotlight";
import { NumberTicker } from "@/components/ui/number-ticker";
import { Eyebrow } from "@/components/ui/page-primitives";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Clock, CheckCircle2, XCircle, Zap, PlayCircle, Calendar } from "lucide-react";
import { BrandIcon } from "@/lib/brandAssets";
import { useAuth } from "@/lib/authContext";
import { getUserRuns, TestRun } from "@/lib/testSuiteApi";
import { useState, useEffect } from "react";
import { useLocation } from "wouter";

export default function TesterDashboard() {
  console.log('[Dashboard] Component rendering - START');
  
  const { token, user } = useAuth();
  console.log('[Dashboard] After useAuth - token:', token ? 'EXISTS' : 'NULL', 'user:', user);
  
  const [, setLocation] = useLocation();
  const [testRuns, setTestRuns] = useState<TestRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  console.log('[Dashboard] State - loading:', loading, 'error:', error, 'testRuns count:', testRuns.length);

  useEffect(() => {
    const fetchTestRuns = async () => {
      console.log('[Dashboard] Starting to fetch test runs...');
      console.log('[Dashboard] Token:', token ? `${token.substring(0, 20)}...` : 'NO TOKEN');
      console.log('[Dashboard] User:', user);
      
      if (!token) {
        console.log('[Dashboard] No token found, skipping fetch');
        setLoading(false);
        return;
      }

      try {
        console.log('[Dashboard] Fetching runs...');
        const runs = await getUserRuns(token);
        console.log('[Dashboard] Received runs:', runs);
        
        // Handle null or undefined response (no test runs yet)
        if (!runs || !Array.isArray(runs)) {
          console.log('[Dashboard] No test runs found, setting empty array');
          setTestRuns([]);
        } else {
          setTestRuns(runs);
        }
        
        setError(null); // Clear any previous errors
      } catch (err) {
        console.error('[Dashboard] Error fetching runs:', err);
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        setError('Failed to load test runs: ' + errorMessage);
        console.error('[Dashboard] Error details:', err);
        setTestRuns([]); // Set empty array on error
      } finally {
        console.log('[Dashboard] Setting loading to false');
        setLoading(false);
      }
    };

    fetchTestRuns();
  }, [token]);

  // Calculate statistics from real data
  const totalExecutions = testRuns.length;
  const passedTests = testRuns.reduce((sum, run) => sum + run.passed, 0);
  const failedTests = testRuns.reduce((sum, run) => sum + run.failed, 0);
  const totalTests = passedTests + failedTests;
  const passRate = totalTests > 0 ? ((passedTests / totalTests) * 100).toFixed(1) : 0;
  const avgDuration = testRuns.length > 0
    ? (testRuns.reduce((sum, run) => sum + run.duration_seconds, 0) / testRuns.length).toFixed(1)
    : 0;

  // Format duration from seconds to readable format
  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const minutes = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${minutes}m ${secs}s`;
  };

  // Format date
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  // Show loading state
  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground text-lg">Loading dashboard...</p>
          </div>
        </div>
      </Layout>
    );
  }

  // Show error state
  if (error) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <GlassCard className="max-w-md">
            <div className="text-center p-6">
              <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
                Error Loading Dashboard
              </h2>
              <p className="text-slate-600 dark:text-slate-400 mb-4">{error}</p>
              <Button onClick={() => window.location.reload()}>
                Retry
              </Button>
            </div>
          </GlassCard>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div>
        <Eyebrow>Overview</Eyebrow>
        <h1 className="mt-3 text-3xl sm:text-4xl font-display font-bold tracking-tight text-foreground mb-1">
          Welcome back, <span className="text-gradient">{user?.username || "Tester"}</span>
        </h1>
        <p className="text-muted-foreground">
          Here's your test execution summary
        </p>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        {[
          { label: "Total Runs", icon: Zap, glow: "bg-primary/15", iconCls: "text-primary", sub: "Test suite executions", subCls: "text-muted-foreground", value: <NumberTicker value={totalExecutions} /> },
          { label: "Pass Rate", icon: CheckCircle2, glow: "bg-emerald-500/15", iconCls: "text-emerald-500", sub: `${passedTests} passed / ${totalTests} total`, subCls: "text-emerald-600 dark:text-emerald-400", value: <NumberTicker value={Number(passRate)} decimals={1} suffix="%" /> },
          { label: "Failed Tests", icon: XCircle, glow: "bg-red-500/15", iconCls: "text-red-500", sub: "Across all runs", subCls: "text-red-600 dark:text-red-400", value: <NumberTicker value={failedTests} /> },
          { label: "Avg Duration", icon: Clock, glow: "bg-accent/15", iconCls: "text-accent", sub: "Per test suite", subCls: "text-muted-foreground", value: <NumberTicker value={Number(avgDuration)} decimals={1} suffix="s" /> },
        ].map((kpi, i) => (
          <CardSpotlight
            key={i}
            className="card-3d relative overflow-hidden rounded-2xl border border-border bg-gradient-to-b from-card to-muted/40 p-5 sm:p-6 dark:to-[hsl(252_30%_7%)]"
          >
            <div className={`absolute -right-6 -top-6 w-24 h-24 rounded-full blur-2xl ${kpi.glow}`} />
            <div className="relative flex items-center justify-between mb-3 sm:mb-4">
              <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">{kpi.label}</span>
              <span className={`inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 ring-1 ring-primary/20 ${kpi.iconCls}`}>
                <kpi.icon className="w-4 h-4" />
              </span>
            </div>
            <div className="relative text-3xl sm:text-4xl font-bold font-display text-foreground">
              {loading ? '...' : kpi.value}
            </div>
            <div className={`relative text-xs sm:text-sm mt-2 ${kpi.subCls}`}>
              {kpi.sub}
            </div>
          </CardSpotlight>
        ))}
      </div>

      {/* Recent Test Runs */}
      <GlassCard>
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Recent Test Runs</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              Your latest test suite executions
            </p>
          </div>
          <Button onClick={() => setLocation('/test-lab')} className="gap-2">
            <PlayCircle className="w-4 h-4" />
            Run New Test
          </Button>
        </div>

        {loading && (
          <div className="text-center py-8 text-slate-600 dark:text-slate-400">
            Loading test suites...
          </div>
        )}

        {error && (
          <div className="text-center py-8 text-red-600 dark:text-red-400">
            {error}
          </div>
        )}

        {!loading && !error && testRuns.length === 0 && (
          <div className="text-center py-8 text-slate-600 dark:text-slate-400">
            No test runs found. Run your first test to get started!
          </div>
        )}

        {!loading && !error && testRuns.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-900 dark:text-white">
                    Run ID
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-900 dark:text-white">
                    Status
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-900 dark:text-white">
                    Browsers
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-900 dark:text-white">
                    Tests
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-900 dark:text-white">
                    Duration
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-900 dark:text-white">
                    Time
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-900 dark:text-white">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {testRuns.map((run) => (
                  <tr
                    key={run.id}
                    className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                  >
                    <td className="py-3 px-4 text-sm font-mono text-slate-700 dark:text-slate-300">
                      {run.run_id}
                    </td>
                    <td className="py-3 px-4">
                      {run.status === 'completed' && run.failed === 0 ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full text-xs font-medium">
                          <CheckCircle2 className="w-3 h-3" />
                          Passed
                        </span>
                      ) : run.status === 'failed' || run.failed > 0 ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-full text-xs font-medium">
                          <XCircle className="w-3 h-3" />
                          Failed
                        </span>
                      ) : run.status === 'cancelled' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-slate-100 dark:bg-slate-900/30 text-slate-600 dark:text-slate-400 rounded-full text-xs font-medium">
                          <XCircle className="w-3 h-3" />
                          Cancelled
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-primary/10 dark:bg-primary/20 text-primary rounded-full text-xs font-medium">
                          <Clock className="w-3 h-3" />
                          Running
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex flex-wrap gap-1">
                        {(run.browsers && run.browsers.length > 0 ? run.browsers : ['chrome']).map((browser) => (
                          <Badge 
                            key={browser}
                            className={`text-xs ${
                              browser === 'chrome' 
                                ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-500/20'
                                : browser === 'firefox'
                                ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-500/20'
                                : 'bg-slate-100 dark:bg-slate-900/30 text-slate-700 dark:text-slate-400 border-slate-200 dark:border-slate-500/20'
                            } border`}
                          >
                            <BrandIcon kind="browser" name={browser} className="w-3.5 h-3.5 mr-1 inline" />
                            {browser}
                          </Badge>
                        ))}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-700 dark:text-slate-300">
                      <span className="text-green-600 dark:text-green-400">{run.passed}</span> /{' '}
                      <span className="text-red-600 dark:text-red-400">{run.failed}</span> /{' '}
                      {run.total_tests}
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-700 dark:text-slate-300">
                      {formatDuration(run.duration_seconds)}
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-500 dark:text-slate-400">
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {formatDate(run.created_at)}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setLocation(`/tester/test-results/${run.run_id}`)}
                      >
                        View Details
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>
    </Layout>
  );
}
