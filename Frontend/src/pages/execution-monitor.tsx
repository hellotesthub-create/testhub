import Layout from "@/components/layout/Layout";
import { Badge } from "@/components/ui/badge";
import { CardSpotlight } from "@/components/ui/card-spotlight";
import { NumberTicker } from "@/components/ui/number-ticker";
import { Eyebrow, WindowChrome, StatTile } from "@/components/ui/page-primitives";
import { Pause, RotateCcw, Terminal } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function ExecutionMonitor() {
  const steps = [
    { id: 1, name: "Initialize Browser", status: "completed", time: "0.8s" },
    { id: 2, name: "Navigate to /login", status: "completed", time: "1.2s" },
    { id: 3, name: "Input Credentials", status: "completed", time: "0.5s" },
    { id: 4, name: "Submit Form", status: "running", time: "..." },
    { id: 5, name: "Verify Dashboard", status: "pending", time: "-" },
    { id: 6, name: "Check User Profile", status: "pending", time: "-" },
  ];

  const logs = [
    { time: "10:42:01", level: "INFO", msg: "Starting Test Suite: Auth Flow" },
    { time: "10:42:02", level: "INFO", msg: "Browser context initialized" },
    { time: "10:42:03", level: "DEBUG", msg: "Navigating to https://staging.app.com/login" },
    { time: "10:42:04", level: "INFO", msg: "Page loaded successfully" },
    { time: "10:42:05", level: "INFO", msg: "Found selector #email-input" },
  ];

  const completed = steps.filter((s) => s.status === "completed").length;

  return (
    <Layout>
      {/* ===================== HEADER ===================== */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Eyebrow>Live execution</Eyebrow>
          <div className="mt-3 flex items-center gap-3">
            <h1 className="font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Running <span className="text-gradient">Auth Flow</span>
            </h1>
            <Badge className="border-primary/50 bg-primary/15 text-primary hover:bg-primary/20">
              <span className="live-pulse mr-1.5 inline-block h-2 w-2 rounded-full bg-emerald-400 align-middle" />
              RUNNING
            </Badge>
          </div>
          <p className="mt-1 font-mono text-sm text-muted-foreground">Session ID: #EXE-8829-XJ</p>
        </div>
        <div className="flex gap-2">
          <button className="sheen rounded-xl border border-border bg-card p-2.5 text-muted-foreground transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/50 hover:text-primary">
            <Pause className="h-5 w-5" />
          </button>
          <button className="sheen rounded-xl border border-border bg-card p-2.5 text-muted-foreground transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/50 hover:text-primary">
            <RotateCcw className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* ===================== LIVE STATS ===================== */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatTile label="steps done" value={<><NumberTicker value={completed} /> / {steps.length}</>} accent="emerald" />
        <StatTile label="elapsed" value={<NumberTicker value={2.5} decimals={1} suffix="s" />} />
        <StatTile label="pass rate" value={<NumberTicker value={100} suffix="%" />} accent="emerald" />
        <StatTile label="browsers" value={<NumberTicker value={2} />} accent="sky" />
      </div>

      {/* ===================== MAIN GRID ===================== */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Main Viewport (Browser Preview) */}
        <div className="flex flex-col gap-6 lg:col-span-2">
          <WindowChrome title="live-stream · staging.app.com/login" className="flex min-h-[24rem] flex-1 flex-col">
            <div className="relative flex flex-1 items-center justify-center bg-[hsl(252_30%_5%)]">
              <div className="text-center">
                <div className="mx-auto mb-4 h-16 w-16 animate-spin rounded-full border-4 border-primary border-t-transparent opacity-70" />
                <p className="font-mono text-sm text-white/50">Live Stream Active</p>
              </div>
            </div>
          </WindowChrome>

          <WindowChrome title="console.log" className="h-64">
            <div className="flex items-center gap-2 border-b border-white/5 px-5 py-3 font-mono text-xs font-semibold uppercase tracking-wider text-white/50">
              <Terminal className="h-4 w-4 text-accent" /> Console Output
            </div>
            <ScrollArea className="h-[calc(100%-3rem)] px-3 py-3 font-mono text-xs">
              <div className="space-y-1">
                {logs.map((log, i) => (
                  <div key={i} className="flex gap-3 rounded px-2 py-1 hover:bg-white/5">
                    <span className="text-white/35">{log.time}</span>
                    <span
                      className={
                        log.level === "INFO"
                          ? "text-sky-300"
                          : log.level === "DEBUG"
                          ? "text-white/40"
                          : "text-red-400"
                      }
                    >
                      {log.level}
                    </span>
                    <span className="text-white/75">{log.msg}</span>
                  </div>
                ))}
                <div className="flex animate-pulse gap-3 px-2 py-1">
                  <span className="text-white/30">10:42:06</span>
                  <span className="text-sky-300">INFO</span>
                  <span className="text-white/75">Typing into input[name="password"]…</span>
                </div>
              </div>
            </ScrollArea>
          </WindowChrome>
        </div>

        {/* Timeline Sidebar */}
        <CardSpotlight className="card-3d flex h-full flex-col rounded-2xl bg-gradient-to-b from-card to-muted/40 p-7 dark:to-[hsl(252_30%_7%)]">
          <h3 className="mb-6 font-display text-lg font-bold text-foreground">Execution Timeline</h3>
          <div className="relative space-y-8 border-l border-border pl-4">
            {steps.map((step) => (
              <div key={step.id} className="relative">
                <div
                  className={`absolute -left-[21px] top-1 h-3 w-3 rounded-full border-2 ${
                    step.status === "completed"
                      ? "border-emerald-500 bg-emerald-500 shadow-[0_0_10px_#22c55e]"
                      : step.status === "running"
                      ? "animate-pulse border-primary bg-primary shadow-[0_0_10px_hsl(var(--primary))]"
                      : "border-border bg-card"
                  }`}
                />
                <div className="flex items-start justify-between">
                  <div>
                    <p className={`text-sm font-medium ${step.status === "pending" ? "text-muted-foreground" : "text-foreground"}`}>
                      {step.name}
                    </p>
                    <p className="text-xs capitalize text-muted-foreground">{step.status}</p>
                  </div>
                  <span className="font-mono text-xs text-muted-foreground">{step.time}</span>
                </div>
              </div>
            ))}
          </div>
        </CardSpotlight>
      </div>
    </Layout>
  );
}
