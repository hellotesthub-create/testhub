import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";
import {
  Lock, Eye, EyeOff, ArrowRight, ArrowLeft, CheckCircle2, X,
  Loader2, ShieldCheck, Clock, AlertTriangle,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { ParticleBackground } from "@/components/particle-background";
import { API_ENDPOINTS } from "@/lib/apiConfig";
import { isStrongPassword, passwordRequirements, fieldStateClass } from "@/lib/validation";

type Status = "checking" | "valid" | "invalid" | "success";

export default function ResetPasswordPage() {
  const [, setLocation] = useLocation();
  const token = useMemo(
    () => new URLSearchParams(window.location.search).get("token") || "",
    []
  );

  const [status, setStatus] = useState<Status>("checking");
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Validate the token on mount.
  useEffect(() => {
    let cancelled = false;
    if (!token) {
      setStatus("invalid");
      return;
    }
    (async () => {
      try {
        const res = await fetch(API_ENDPOINTS.VALIDATE_RESET_TOKEN(token));
        const data = await res.json();
        if (cancelled) return;
        if (data.valid && data.expires_at) {
          setExpiresAt(new Date(data.expires_at).getTime());
          setStatus("valid");
        } else {
          setStatus("invalid");
        }
      } catch {
        if (!cancelled) setStatus("invalid");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  // Live countdown; flip to expired when it hits zero.
  useEffect(() => {
    if (status !== "valid" || expiresAt == null) return;
    const tick = () => {
      const secs = Math.max(0, Math.round((expiresAt - Date.now()) / 1000));
      setRemaining(secs);
      if (secs <= 0) {
        setStatus("invalid");
        toast.error("This reset link has expired. Please request a new one.");
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [status, expiresAt]);

  // Auto-redirect to login a few seconds after the link is found invalid/expired.
  useEffect(() => {
    if (status !== "invalid") return;
    const id = setTimeout(() => setLocation("/auth"), 5000);
    return () => clearTimeout(id);
  }, [status, setLocation]);

  const checks = passwordRequirements(password);
  const strong = isStrongPassword(password);
  const match = password.length > 0 && password === confirm;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!strong) {
      toast.error("Password does not meet the requirements");
      return;
    }
    if (!match) {
      toast.error("Passwords do not match");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(API_ENDPOINTS.RESET_PASSWORD, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setStatus("success");
        toast.success("Your password has been successfully updated.");
      } else {
        const msg = (data.message || "Reset failed. Please request a new link.") as string;
        toast.error(msg);
        if (/expired|invalid/i.test(msg)) setStatus("invalid");
      }
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const mmss = `${String(Math.floor(remaining / 60)).padStart(2, "0")}:${String(remaining % 60).padStart(2, "0")}`;
  const lowTime = remaining > 0 && remaining <= 60;

  const inputBase =
    "w-full pl-10 pr-10 py-2.5 border rounded-xl focus:outline-none focus:ring-2 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 bg-slate-50 dark:bg-slate-900/50 backdrop-blur-sm transition-all duration-300";

  return (
    <div className="lm-borders min-h-screen flex items-center justify-center relative overflow-hidden bg-gradient-to-br from-[hsl(258_100%_98%)] via-white to-[hsl(199_100%_98%)] dark:from-[hsl(252_30%_6%)] dark:via-[hsl(252_28%_8%)] dark:to-[hsl(252_30%_5%)] transition-colors">
      <ParticleBackground />

      <div className="absolute top-4 sm:top-6 right-4 sm:right-6 z-50">
        <ThemeToggle />
      </div>
      <Link href="/auth">
        <button className="absolute top-4 sm:top-6 left-4 sm:left-6 z-50 rounded-full p-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 transition-colors">
          <X className="w-5 h-5 sm:w-6 sm:h-6" />
        </button>
      </Link>

      <div className="relative z-20 w-full max-w-lg px-4 sm:px-6 animate-in zoom-in-95 duration-300">
        {/* Brand header */}
        <div className="text-center mb-6 sm:mb-8">
          <img
            src="/logo.png"
            alt="TESTHUB"
            className="w-20 h-20 object-contain mx-auto mb-4 drop-shadow-[0_0_18px_hsl(var(--primary)/0.55)]"
          />
          <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight">
            <span className="text-gradient">TESTHUB</span>
          </h1>
          <p className="font-mono text-[10px] sm:text-xs uppercase tracking-[0.25em] text-muted-foreground">
            Reset your password
          </p>
        </div>

        <div className="relative overflow-hidden rounded-3xl border border-border bg-white/80 dark:bg-slate-900/60 backdrop-blur-xl p-6 sm:p-8 shadow-[0_8px_30px_rgb(0,0,0,0.12)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.5)]">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-accent/10 pointer-events-none" />
          <div className="relative">

            {/* ── Checking ─────────────────────────────────────── */}
            {status === "checking" && (
              <div className="py-10 text-center">
                <Loader2 className="w-10 h-10 mx-auto mb-4 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Verifying your reset link…</p>
              </div>
            )}

            {/* ── Expired / invalid ────────────────────────────── */}
            {status === "invalid" && (
              <div className="py-6 text-center animate-in fade-in duration-300">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 dark:bg-red-500/15 mb-4">
                  <AlertTriangle className="w-8 h-8 text-red-500" />
                </div>
                <h2 className="text-xl sm:text-2xl font-bold text-foreground mb-2">Link Expired</h2>
                <p className="text-sm text-muted-foreground mb-6">
                  This password reset link is invalid or has expired (links are valid for 5 minutes).
                  Please request a new one.
                </p>
                <Link href="/auth">
                  <button className="w-full py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-xl transition-all duration-300 hover:shadow-[0_0_20px_hsl(var(--primary)/0.45)] flex items-center justify-center gap-2">
                    <ArrowLeft className="w-4 h-4" /> Back to Login
                  </button>
                </Link>
                <p className="text-xs text-muted-foreground mt-3">Redirecting you to login…</p>
              </div>
            )}

            {/* ── Success ──────────────────────────────────────── */}
            {status === "success" && (
              <div className="py-6 text-center animate-in fade-in zoom-in-95 duration-300">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-500/15 mb-4">
                  <CheckCircle2 className="w-9 h-9 text-emerald-500" />
                </div>
                <h2 className="text-xl sm:text-2xl font-bold text-foreground mb-2">Password updated</h2>
                <p className="text-sm text-muted-foreground mb-6">
                  Your password has been successfully updated. You can now log in with your new password.
                </p>
                <Link href="/auth">
                  <button className="w-full py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-xl transition-all duration-300 hover:shadow-[0_0_20px_hsl(var(--primary)/0.45)] flex items-center justify-center gap-2">
                    Back to Login <ArrowRight className="w-4 h-4" />
                  </button>
                </Link>
              </div>
            )}

            {/* ── Reset form ───────────────────────────────────── */}
            {status === "valid" && (
              <form onSubmit={handleSubmit} className="space-y-4 animate-in fade-in duration-300">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <ShieldCheck className="w-5 h-5 text-primary" />
                    Choose a new password
                  </div>
                  {/* Countdown */}
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-xs font-semibold transition-colors ${
                      lowTime
                        ? "border-red-400/50 bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400"
                        : "border-primary/40 bg-primary/10 text-primary"
                    }`}
                    title="Time remaining before this link expires"
                  >
                    <Clock className="w-3.5 h-3.5" /> {mmss}
                  </span>
                </div>

                {/* New password */}
                <div>
                  <label className="block text-sm font-medium text-slate-900 dark:text-white mb-2">New Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3.5 w-5 h-5 text-slate-400 dark:text-slate-500" />
                    <input
                      type={showPw ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Create a new password"
                      className={`${inputBase} ${fieldStateClass(password, strong)}`}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw(!showPw)}
                      className="absolute right-3 top-3.5 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-400"
                    >
                      {showPw ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                  {password && (
                    <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
                      {checks.map((r) => (
                        <span
                          key={r.label}
                          className={`flex items-center gap-1.5 text-xs transition-colors ${
                            r.ok ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400 dark:text-slate-500"
                          }`}
                        >
                          {r.ok ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> : <X className="w-3.5 h-3.5 shrink-0" />}
                          {r.label}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Confirm password */}
                <div>
                  <label className="block text-sm font-medium text-slate-900 dark:text-white mb-2">Confirm Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3.5 w-5 h-5 text-slate-400 dark:text-slate-500" />
                    <input
                      type={showConfirm ? "text" : "password"}
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      placeholder="Re-enter your new password"
                      className={`${inputBase} ${fieldStateClass(confirm, match)}`}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm(!showConfirm)}
                      className="absolute right-3 top-3.5 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-400"
                    >
                      {showConfirm ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                  {confirm && (
                    <p
                      className={`mt-1 flex items-center gap-1.5 text-xs ${
                        match ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"
                      }`}
                    >
                      {match ? <CheckCircle2 className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                      {match ? "Passwords match" : "Passwords do not match"}
                    </p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={submitting || !strong || !match}
                  className="w-full py-2.5 bg-primary hover:bg-primary/90 disabled:bg-primary/50 disabled:cursor-not-allowed text-primary-foreground font-semibold rounded-xl transition-all duration-300 hover:shadow-[0_0_20px_hsl(var(--primary)/0.45)] flex items-center justify-center gap-2 mt-6"
                >
                  {submitting ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> UPDATING…</>
                  ) : (
                    <>UPDATE PASSWORD <ArrowRight className="w-4 h-4" /></>
                  )}
                </button>

                <Link href="/auth">
                  <button type="button" className="w-full text-center text-sm font-medium text-primary hover:text-primary/80 mt-1">
                    Back to Login
                  </button>
                </Link>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
