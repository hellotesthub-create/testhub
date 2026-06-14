import { Link } from "wouter";
import { Home, ArrowLeft } from "lucide-react";
import { PageShell, PrimaryButton } from "@/components/ui/page-primitives";

export default function NotFound() {
  return (
    <PageShell className="flex items-center justify-center" glow="cyan">
      <div className="mx-auto flex max-w-md flex-col items-center px-6 py-16 text-center">
        <Link href="/">
          <img
            src="/logo.png"
            alt="TESTHUB"
            className="mb-6 h-16 w-16 cursor-pointer object-contain drop-shadow-[0_0_18px_hsl(var(--primary)/0.5)] transition-transform duration-300 hover:scale-110 hover:rotate-3"
          />
        </Link>

        <p className="font-mono text-xs font-semibold uppercase tracking-[0.25em] text-primary">
          Error 404
        </p>
        <h1 className="mt-3 font-display text-6xl font-bold tracking-tight">
          <span className="text-gradient">Page not found</span>
        </h1>
        <p className="mt-4 text-pretty leading-relaxed text-muted-foreground">
          The page you're looking for doesn't exist or may have been moved. Let's get you back on track.
        </p>

        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
          <Link href="/">
            <PrimaryButton className="h-12 px-7">
              <Home className="h-5 w-5" /> Back to home
            </PrimaryButton>
          </Link>
          <button
            onClick={() => window.history.back()}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-border bg-card px-7 font-semibold text-foreground transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/50 hover:bg-primary/5"
          >
            <ArrowLeft className="h-5 w-5" /> Go back
          </button>
        </div>
      </div>
    </PageShell>
  );
}
