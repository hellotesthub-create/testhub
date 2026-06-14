import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ *
 * Shared landing-style primitives.
 *
 * These were originally defined locally inside landing.tsx. They are
 * extracted here so every page composes the same look (same violet/cyan
 * palette, same glows, same window chrome) without duplicating markup.
 * ------------------------------------------------------------------ */

/** Small uppercase label with a leading rule — used above section titles. */
export function Eyebrow({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-[0.25em] text-primary",
        className
      )}
    >
      <span className="h-px w-6 bg-primary/60" />
      {children}
    </span>
  );
}

/** Primary filled action with the brand glow + lift. */
export function PrimaryButton({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-7 font-sans font-semibold text-primary-foreground",
        "shadow-lg shadow-primary/30 transition-all duration-300",
        "hover:shadow-xl hover:shadow-primary/45 hover:-translate-y-0.5 active:scale-[0.98]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        className
      )}
    >
      {children}
    </span>
  );
}

/** macOS-style window chrome wrapper for terminals, log panes, previews. */
export function WindowChrome({
  title,
  children,
  className = "",
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "gradient-ring overflow-hidden rounded-2xl border border-white/10 bg-[hsl(252_30%_8%)] shadow-xl shadow-black/30 transition-colors duration-300 hover:border-primary/40",
        className
      )}
    >
      <div className="flex items-center gap-2 border-b border-white/10 bg-white/[0.03] px-4 py-3">
        <span className="h-3 w-3 rounded-full bg-red-400/80" />
        <span className="h-3 w-3 rounded-full bg-yellow-400/80" />
        <span className="h-3 w-3 rounded-full bg-emerald-400/80" />
        <span className="ml-3 font-mono text-xs text-white/45">{title}</span>
      </div>
      {children}
    </div>
  );
}

/**
 * Page-level background shell: soft aurora blobs + dot texture + section
 * glow, so any inner page picks up the same ambient look as the landing
 * sections. Content renders above the decorative layers.
 */
export function PageShell({
  children,
  className = "",
  glow = "primary",
}: {
  children: ReactNode;
  className?: string;
  glow?: "primary" | "cyan";
}) {
  return (
    <div
      className={cn(
        "lm-borders relative min-h-screen overflow-x-hidden bg-background font-sans text-foreground",
        glow === "cyan" ? "section-glow-cyan" : "section-glow",
        className
      )}
    >
      {/* decorative ambient layer */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="dot-pattern absolute inset-0 opacity-60" />
        <span className="aurora-blob aurora-blob--primary left-[-8%] top-[-4%] h-72 w-72 mix-blend-screen" />
        <span className="aurora-blob aurora-blob--accent right-[-6%] top-[12%] h-64 w-64 mix-blend-screen" />
      </div>
      {/* content */}
      <div className="relative z-10">{children}</div>
    </div>
  );
}

/** A compact metric tile — pairs with NumberTicker for live/summary stats. */
export function StatTile({
  label,
  value,
  accent = "primary",
  className = "",
}: {
  label: string;
  value: ReactNode;
  accent?: "primary" | "emerald" | "amber" | "sky" | "red";
  className?: string;
}) {
  const valueColor = {
    primary: "text-foreground",
    emerald: "text-emerald-500",
    amber: "text-amber-500",
    sky: "text-sky-500",
    red: "text-red-500",
  }[accent];

  return (
    <div
      className={cn(
        "card-3d rounded-2xl border border-border bg-gradient-to-b from-card to-muted/40 p-5 dark:to-[hsl(252_30%_7%)]",
        className
      )}
    >
      <div className={cn("font-display text-2xl font-bold sm:text-3xl", valueColor)}>{value}</div>
      <div className="mt-1 font-mono text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}
