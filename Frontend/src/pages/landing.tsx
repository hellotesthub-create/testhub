import { useState, useEffect, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { ThemeToggle } from "@/components/theme-toggle";
import GridScan from "@/components/GridScan";
import HeroOrbit from "@/components/hero-orbit";
import { CardContainer, CardBody, CardItem } from "@/components/ui/3d-card";
import { CardSpotlight } from "@/components/ui/card-spotlight";
import { NumberTicker } from "@/components/ui/number-ticker";
import { useAuth } from "@/lib/authContext";
import {
  Zap,
  Globe,
  Github,
  ArrowRight,
  Menu,
  X,
  Activity,
  CheckCircle2,
  ShieldCheck,
  Gauge,
  Layers,
} from "lucide-react";
import { TypewriterEffectSmooth } from "@/components/ui/typewriter-effect";

/* Reveal-on-scroll: adds `.is-visible` to every `.reveal` element once seen.
   Honors prefers-reduced-motion via the CSS rule in index.css. */
function useScrollReveal() {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll(".reveal"));
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
}

/* ---- Small shared bits ------------------------------------------------ */

function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-[0.25em] text-primary">
      <span className="h-px w-6 bg-primary/60" />
      {children}
    </span>
  );
}

function PrimaryButton({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-7 font-sans font-semibold text-primary-foreground
                  shadow-lg shadow-primary/30 transition-all duration-300
                  hover:shadow-xl hover:shadow-primary/45 hover:-translate-y-0.5 active:scale-[0.98]
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background
                  ${className}`}
    >
      {children}
    </span>
  );
}

/* A polished window chrome wrapper used for the hero + report previews. */
function WindowChrome({
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
      className={`gradient-ring overflow-hidden rounded-2xl border border-white/10 bg-[hsl(252_30%_8%)] shadow-xl shadow-black/30 transition-colors duration-300 hover:border-primary/40 ${className}`}
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

export default function LandingPage() {
  const { isAuthenticated, user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const [showContent, setShowContent] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useScrollReveal();

  useEffect(() => {
    const timer = setTimeout(() => setShowContent(true), 150);
    return () => clearTimeout(timer);
  }, []);

  // Header is transparent (white text) over the dark hero, and turns into a
  // solid surface once the user scrolls onto the light/dark body sections.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // "Solid" header whenever scrolled or the mobile menu is open.
  const headerSolid = scrolled || mobileMenuOpen;
  const navTextClass = headerSolid
    ? "text-muted-foreground hover:text-foreground"
    : "text-white/75 hover:text-white";

  const navLinks = [
    { href: "#features", label: "Features" },
    { href: "#how-it-works", label: "Live demo" },
    { href: "#integrations", label: "Integrations" },
    { href: "#docs", label: "Docs" },
  ];

  // Ecosystem logos/tools for the trust marquee (logos where we have them).
  const ecosystem: { label: string; src?: string }[] = [
    { label: "GitHub", src: "/githubIcon.png" },
    { label: "Chrome", src: "/chrome.png" },
    { label: "Firefox", src: "/firefox.png" },
    { label: "Selenium", src: "/selenium.png" },
    { label: "Playwright", src: "/Playwright--Streamline-Svg-Logos.png" },
    { label: "Python", src: "/Python--Streamline-Svg-Logos.png" },
    { label: "Java", src: "/Java--Streamline-Svg-Logos.png" },
    { label: "Allure Reporting", src: "/allureReport.png" },
  ];

  // Real integrations for the "Connect your stack" grid.
  const integrations = [
    "GitHub Actions",
    "Slack",
    "Selenium",
    "Playwright",
    "Cypress",
  ];

  return (
    <div className="lm-borders min-h-screen overflow-x-hidden bg-background font-sans text-foreground transition-colors">
      {/* ===================== HEADER (sticky) ===================== */}
      <header
        className={`sticky top-0 z-50 transition-all duration-300 ${
          headerSolid
            ? "border-b border-border/60 bg-background/80 shadow-[0_4px_24px_-12px_hsl(252_40%_30%/0.25)] backdrop-blur-xl dark:shadow-[0_8px_30px_-14px_hsl(252_80%_2%/0.7)]"
            : "border-b border-transparent bg-transparent"
        }`}
      >
        <div className="mx-auto grid h-16 max-w-7xl grid-cols-[auto_1fr_auto] items-center px-4 sm:h-20 sm:px-6">
          <Link href="/">
            <div className="group flex min-w-0 shrink-0 cursor-pointer items-center gap-2.5">
              <img
                src="/logo.png"
                alt="TESTHUB"
                className="h-10 w-10 object-contain transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3 group-hover:drop-shadow-[0_0_12px_hsl(var(--primary)/0.6)] sm:h-11 sm:w-11"
              />
              <span
                className={`font-display text-lg font-bold tracking-wider transition-colors sm:text-2xl ${
                  headerSolid ? "text-foreground" : "text-white"
                }`}
              >
                TESTHUB
              </span>
            </div>
          </Link>

          <nav className="hidden items-center justify-center gap-1 md:flex lg:gap-2">
            {navLinks.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className={`group/nav relative whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-all duration-300 ${
                  headerSolid
                    ? "text-muted-foreground hover:bg-primary/10 hover:text-foreground"
                    : "text-white/75 hover:bg-white/10 hover:text-white"
                }`}
              >
                {l.label}
                <span className="pointer-events-none absolute inset-x-3 bottom-1 h-0.5 origin-center scale-x-0 rounded-full bg-gradient-to-r from-primary to-accent opacity-0 shadow-[0_0_8px_hsl(var(--primary)/0.6)] transition-all duration-300 group-hover/nav:scale-x-100 group-hover/nav:opacity-100" />
              </a>
            ))}
          </nav>

          <div className="flex items-center justify-end gap-3 sm:gap-4">
            {/* Force a white toggle icon while the header is transparent over the dark hero */}
            <div className={headerSolid ? "" : "[&_svg]:!text-white [&_button:hover]:!bg-white/10"}>
              <ThemeToggle />
            </div>
            {isAuthenticated ? (
              <>
                <button
                  onClick={() => setLocation(user?.role === "Admin" ? "/admin" : "/dashboard")}
                  className={`hidden rounded-lg px-3 py-1.5 text-sm font-semibold transition-all duration-300 hover:scale-105 hover:bg-white/10 active:scale-95 md:block ${navTextClass}`}
                >
                  Dashboard
                </button>
                <button onClick={logout}>
                  <PrimaryButton className="h-9 text-sm sm:h-10">Log out</PrimaryButton>
                </button>
              </>
            ) : (
              <>
                <Link href="/auth">
                  <button
                    className={`hidden rounded-lg border border-transparent px-4 py-2 text-sm font-semibold transition-all duration-300 hover:scale-105 hover:border-primary/30 hover:bg-primary/5 hover:text-primary active:scale-95 md:block ${navTextClass}`}
                  >
                    Log in
                  </button>
                </Link>
                <Link href="/auth">
                  <PrimaryButton className="h-9 text-sm font-bold sm:h-10">
                    <span className="hidden sm:inline">Start free</span>
                    <span className="sm:hidden">Start</span>
                  </PrimaryButton>
                </Link>
              </>
            )}

            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className={`rounded-lg p-2 transition-all duration-300 hover:bg-white/10 active:scale-90 md:hidden ${navTextClass}`}
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="border-b border-border/60 bg-background/95 backdrop-blur-xl duration-300 animate-in fade-in slide-in-from-top-2 md:hidden">
            <nav className="flex flex-col gap-1 px-4 py-4">
              {navLinks.map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className="group flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-all duration-200 hover:translate-x-1 hover:bg-primary/10 hover:text-foreground"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-primary opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
                  {l.label}
                </a>
              ))}
            </nav>
          </div>
        )}
      </header>

      {/* ===================== HERO ===================== */}
      <section className="hero-canvas relative -mt-16 flex min-h-screen items-center overflow-hidden sm:-mt-20">
        {/* Layer 0 — GridScan: animated 3D perspective grid + scanning sweep,
            recolored to the THEX palette. Sits behind content (pointer-events
            none) so it never blocks the UI; mouse parallax is tracked globally. */}
        <GridScan
          className="absolute inset-0 z-0"
          style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
          sensitivity={0.55}
          lineThickness={1.8}
          linesColor="#9472F4"
          gridScale={0.1}
          scanColor="#5CC8FF"
          scanOpacity={0.7}
          enablePost
          bloomIntensity={1.2}
          chromaticAberration={0.002}
          noiseIntensity={0.01}
          lineJitter={0.06}
          scanGlow={0.85}
          scanSoftness={2}
          enableWebcam={false}
          showPreview={false}
        />

        {/* Layer 1 — brand glows + legibility scrim + soft fade into the page.
            Left-weighted on desktop so the grid stays bright on the right. */}
        <div className="pointer-events-none absolute inset-0 z-10">
          <span className="aurora-blob aurora-blob--primary left-[-6%] top-[6%] h-64 w-64 mix-blend-screen sm:h-[24rem] sm:w-[24rem]" />
          <span className="aurora-blob aurora-blob--accent right-[4%] top-[18%] h-56 w-56 mix-blend-screen sm:h-[22rem] sm:w-[22rem]" />
          <div className="absolute inset-0 bg-[hsl(252_48%_6%)]/20 sm:bg-gradient-to-r sm:from-[hsl(252_48%_6%)] sm:via-[hsl(252_48%_6%)]/30 sm:to-transparent" />
          <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-b from-transparent to-background" />
        </div>

        {/* Layer 2 — content */}
        <div className="relative z-30 mx-auto grid w-full max-w-7xl grid-cols-1 items-center px-4 pt-28 pb-24 sm:px-6 sm:pt-32 lg:grid-cols-12">
          <div
            className={`col-span-1 flex flex-col items-center text-center transition-all duration-1000 lg:col-span-7 lg:items-start lg:text-left ${
              showContent ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
            }`}
          >
            <TypewriterEffectSmooth
              className="text-shadow-hero text-balance font-display text-[2.6rem] font-bold leading-[1.04] tracking-tight sm:text-6xl lg:text-7xl"
              words={[
                { text: "Test", className: "text-white" },
                { text: "Automation,", className: "text-white" },
                { text: "Massively", className: "text-gradient" },
                { text: "Parallel.", className: "text-gradient" },
              ]}
            />

            <p className="text-shadow-hero text-pretty mt-6 max-w-xl text-base font-medium leading-relaxed text-white/75 sm:text-lg">
              Upload your tests. Execute across Chrome &amp; Firefox simultaneously. Get videos, screenshots, and reports—automatically.
            </p>

            <div className="mt-9 flex w-full flex-col items-center justify-center gap-3 sm:w-auto sm:flex-row sm:gap-4 lg:justify-start">
              <Link href="/auth" className="group w-full sm:w-auto">
                <PrimaryButton className="h-12 w-full text-base sm:h-14 sm:w-auto sm:px-9 sm:text-lg">
                  Run your first suite
                  <ArrowRight className="h-5 w-5 transition-transform duration-300 group-hover:translate-x-1" />
                </PrimaryButton>
              </Link>
              <a
                href="#docs"
                className="group inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/[0.03] px-7 text-base font-semibold text-white backdrop-blur-sm transition-all duration-300 hover:scale-[1.02] hover:border-white/45 hover:bg-white/10 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:h-14 sm:w-auto sm:px-9 sm:text-lg"
              >
                <Github className="h-5 w-5 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-6" />
                View on GitHub
              </a>
            </div>

            {/* Honest, specific proof — not vanity numbers */}
            <div className="mt-10 flex flex-wrap items-center justify-center gap-2 font-mono text-sm text-white/60 lg:justify-start">
              {[
                { Icon: Zap, label: "Parallel by default", cls: "text-primary" },
                { Icon: Globe, label: "Chrome & Firefox", cls: "text-sky-300" },
                { Icon: ShieldCheck, label: "MIT licensed", cls: "text-emerald-400" },
              ].map(({ Icon, label, cls }) => (
                <span
                  key={label}
                  className="group flex items-center gap-2 rounded-full px-3 py-1.5 transition-all duration-300 hover:bg-white/[0.06] hover:text-white/90"
                >
                  <Icon className={`h-4 w-4 ${cls} transition-transform duration-300 group-hover:scale-110`} />
                  {label}
                </span>
              ))}
            </div>
          </div>

          {/* Right column — integration hub: TestHub logo orbited by the stack */}
          <div className="mt-14 flex items-center justify-center lg:col-span-5 lg:mt-0">
            <HeroOrbit />
          </div>
        </div>
      </section>

      {/* ===================== TRUST STRIP ===================== */}
      <section className="relative z-20 border-y border-border/60 bg-muted/30 py-8">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <p className="mb-6 text-center font-mono text-xs uppercase tracking-[0.25em] text-muted-foreground">
            Works with the languages and frameworks you already use
          </p>
          <div className="marquee-track group relative overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_12%,#000_88%,transparent)]">
            <div className="marquee flex w-max items-center gap-10 sm:gap-14">
              {[...ecosystem, ...ecosystem].map((item, i) => (
                <span
                  key={i}
                  className="flex shrink-0 items-center gap-2.5 whitespace-nowrap font-display text-base font-semibold tracking-wide text-muted-foreground/70 transition-colors hover:text-foreground sm:text-lg"
                >
                  {item.src && (
                    <img 
                      src={item.src} 
                      alt="" 
                      className={`object-contain opacity-80 ${
                        item.label === "Allure Reporting" 
                          ? "h-16 w-16 sm:h-[4.5rem] sm:w-[4.5rem] -ml-4 -mr-3" 
                          : "h-6 w-6 sm:h-7 sm:w-7"
                      }`} 
                    />
                  )}
                  {item.label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ===================== FEATURES ===================== */}
      <section id="features" className="section-glow relative z-20 overflow-hidden bg-gradient-to-b from-background via-background to-muted/40 py-20 sm:py-24 md:py-28">
        <div className="dot-pattern pointer-events-none absolute inset-0" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
          <div className="reveal mx-auto mb-12 max-w-2xl text-center sm:mb-16">
            <Eyebrow>Why TESTHUB</Eyebrow>
            <h2 className="mt-4 text-balance font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl md:text-[2.75rem]">
              Everything you need to ship with confidence
            </h2>
            <p className="mt-4 text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
              One framework, real browsers, and reports anyone on the team can act on.
            </p>
          </div>

          <div className="grid auto-rows-fr grid-cols-1 gap-5 md:grid-cols-6">
            {[
              {
                icon: Zap,
                title: "Run every suite in parallel",
                desc: "Fan tests out across Chrome and Firefox at the same time. No queues, no waiting — green builds land minutes sooner.",
                span: "md:col-span-4",
                watermark: "/parallel.png",
              },
              {
                icon: Activity,
                title: "See exactly what happened",
                desc: "Every run is captured as HD video plus step screenshots, automatically.",
                span: "md:col-span-2",
              },
              {
                icon: Layers,
                title: "Python & Java, natively",
                desc: "Bring your existing Selenium scripts — full compatibility, zero glue code.",
                span: "md:col-span-2",
              },
              {
                icon: Globe,
                title: "Real Chrome & Firefox",
                desc: "Tests run on actual browser engines, not headless approximations.",
                span: "md:col-span-2",
              },
              {
                icon: ShieldCheck,
                title: "Open source & CI-native",
                desc: "MIT-licensed. Trigger from GitHub Actions, Jenkins, or your own runner.",
                span: "md:col-span-2",
              },
            ].map((feature, i) => (
              <CardSpotlight
                key={i}
                className={`reveal reveal-delay-${(i % 5) + 1} card-3d group/card flex flex-col rounded-2xl bg-gradient-to-b from-card to-muted/40 p-7 dark:to-[hsl(252_30%_7%)] sm:p-8 ${feature.span}`}
              >
                {feature.watermark && (
                  <img
                    src={feature.watermark}
                    alt=""
                    className="pointer-events-none absolute right-5 top-1/2 hidden h-52 w-52 -translate-y-1/2 object-contain opacity-40 transition-opacity duration-500 group-hover/card:opacity-60 sm:block"
                  />
                )}
                <div className="mb-6 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary/15 to-accent/10 text-primary shadow-sm ring-1 ring-primary/20 transition-all duration-500 group-hover/card:scale-110 group-hover/card:-rotate-6 group-hover/card:from-primary group-hover/card:to-accent group-hover/card:text-primary-foreground group-hover/card:shadow-lg group-hover/card:shadow-primary/40">
                  <feature.icon className="h-6 w-6" />
                </div>
                <h3 className="mb-2.5 font-display text-xl font-bold text-foreground transition-colors duration-300 group-hover/card:text-primary">
                  {feature.title}
                </h3>
                <p className="max-w-md text-pretty leading-relaxed text-muted-foreground">{feature.desc}</p>
              </CardSpotlight>
            ))}
          </div>
        </div>
      </section>

      {/* ===================== SEE IT IN ACTION ===================== */}
      <section id="how-it-works" className="section-glow-cyan relative z-20 overflow-hidden bg-muted/30 py-20 sm:py-24 md:py-28">
        <div className="dot-pattern pointer-events-none absolute inset-0" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
          <div className="reveal mx-auto mb-12 max-w-2xl text-center sm:mb-16">
            <Eyebrow>How it works</Eyebrow>
            <h2 className="mt-4 text-balance font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl md:text-[2.75rem]">
              Upload, Execute, Get Results
            </h2>
            <p className="mt-4 text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
              Three simple steps: upload your tests, let TESTHUB run them in parallel, and get complete visibility with videos and screenshots.
            </p>
          </div>

          <div className="reveal grid grid-cols-1 items-stretch gap-6 lg:grid-cols-5">
            {/* Live monitor terminal */}
            <CardContainer containerClassName="block h-full py-0 lg:col-span-3" className="h-full w-full">
              <CardBody className="h-full w-full">
                <WindowChrome title="live-monitor.log" className="h-full">
                  <pre className="overflow-x-auto px-5 py-5 font-mono text-[13px] leading-relaxed text-white/80 sm:text-sm">
                    <span className="text-emerald-400">▸ Running login test on Chrome…</span>{"\n"}
                    <span className="text-sky-300">▸ Executing payment flow…</span>{"\n"}
                    <span className="text-emerald-400">✓ Screenshot captured (342ms)</span>{"\n"}
                    <span className="text-emerald-400">✓ All validations passed</span>{"\n"}
                    <span className="text-white/40">  total time: 2.45s</span>{"\n\n"}
                    <span className="text-sky-300">▸ Spawning firefox worker…</span>{"\n"}
                    <span className="text-emerald-400">✓ Suite complete</span>
                    <span className="live-pulse ml-2 inline-block h-2 w-2 rounded-full bg-emerald-400 align-middle" />
                  </pre>
                </WindowChrome>
              </CardBody>
            </CardContainer>

            {/* Report summary card */}
            <CardContainer containerClassName="block h-full py-0 lg:col-span-2" className="h-full w-full">
              <CardBody className="card-3d group/card relative flex h-full w-full flex-col justify-between rounded-2xl bg-gradient-to-b from-card to-muted/40 p-7 dark:to-[hsl(252_30%_7%)] sm:p-8">
                <CardItem as="div" translateZ={40} className="w-full">
                  <h3 className="font-display text-xl font-bold text-foreground">E-Commerce Flow</h3>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">Chrome v120 · Firefox v121</p>

                  <div className="mt-6 space-y-3 font-mono text-sm">
                    <div className="flex items-center gap-2 text-foreground">
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      <span className="text-emerald-600 dark:text-emerald-400">12 / 12 tests passed</span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Gauge className="h-4 w-4 text-amber-500" />
                      1 slow test detected
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Layers className="h-4 w-4 text-sky-500" />
                      2 browsers in parallel
                    </div>
                  </div>
                </CardItem>

                <CardItem as="div" translateZ={20} className="mt-7 grid w-full grid-cols-2 gap-3 border-t border-border pt-6">
                  <div>
                    <div className="font-display text-2xl font-bold text-foreground">
                      <NumberTicker value={2.45} decimals={2} suffix="s" />
                    </div>
                    <div className="font-mono text-xs text-muted-foreground">total time</div>
                  </div>
                  <div>
                    <div className="font-display text-2xl font-bold text-emerald-500">
                      <NumberTicker value={100} suffix="%" />
                    </div>
                    <div className="font-mono text-xs text-muted-foreground">pass rate</div>
                  </div>
                </CardItem>
              </CardBody>
            </CardContainer>
          </div>
        </div>
      </section>

      {/* ===================== INTEGRATIONS ===================== */}
      <section id="integrations" className="section-glow relative z-20 overflow-hidden bg-gradient-to-b from-muted/40 via-background to-background py-20 sm:py-24 md:py-28">
        <div className="dot-pattern pointer-events-none absolute inset-0" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
          <div className="reveal max-w-2xl">
            <Eyebrow>Integrations</Eyebrow>
            <h2 className="mt-4 text-balance font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl md:text-[2.75rem]">
              Drops into the pipeline you already have
            </h2>
            <p className="mt-4 text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
              Trigger suites from CI, push results to your tracker, and get alerts where your team
              already works — no rip-and-replace.
            </p>
          </div>

          <div className="reveal mt-10 flex flex-wrap gap-3 sm:gap-4">
            {integrations.map((tool, i) => (
              <div
                key={i}
                className="sheen rounded-xl border border-border bg-card px-5 py-3 font-medium text-foreground/80 transition-all duration-300 hover:-translate-y-1 hover:border-primary/50 hover:bg-primary/5 hover:text-foreground hover:shadow-lg hover:shadow-primary/20"
              >
                {tool}
              </div>
            ))}
          </div>

          <div className="reveal mt-12 flex flex-col items-start justify-between gap-4 border-t border-border pt-8 sm:flex-row sm:items-center">
            <h3 className="font-display text-xl font-bold text-foreground sm:text-2xl">Built to be yours</h3>
            <div className="flex flex-wrap gap-x-8 gap-y-2 font-mono text-sm uppercase tracking-wider text-muted-foreground">
              {["Open source", "MIT licensed", "Self-hostable"].map((tag, i) => (
                <span key={i} className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ===================== CTA ===================== */}
      <section className="relative z-20 bg-background px-4 pb-20 sm:px-6 sm:pb-24 md:pb-28">
        <div className="border-beam reveal relative mx-auto max-w-7xl overflow-hidden rounded-3xl bg-gradient-to-br from-primary via-primary to-accent p-8 text-center shadow-2xl shadow-primary/30 sm:p-12 md:p-16">
          {/* texture + glow */}
          <div className="grid-overlay pointer-events-none absolute inset-0 opacity-40" />
          <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 -left-10 h-64 w-64 rounded-full bg-accent/40 blur-3xl" />
          <div className="relative">
            <h2 className="text-balance font-display text-3xl font-bold tracking-tight text-white sm:text-4xl md:text-5xl">
              Ship your next green build with TESTHUB
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-pretty text-base text-white/85 sm:text-lg">
              Free and open source. Run it in the cloud or self-host in minutes — no credit card, no lock-in.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
              <Link href="/auth" className="w-full sm:w-auto">
                <button className="btn-shimmer group inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-8 py-4 text-base font-bold text-primary shadow-lg shadow-black/10 transition-all duration-300 hover:-translate-y-0.5 hover:scale-[1.03] hover:shadow-2xl active:scale-95 sm:w-auto sm:text-lg">
                  Run your first suite
                  <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
                </button>
              </Link>
              <a
                href="#docs"
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/40 px-8 py-4 text-base font-semibold text-white transition-all duration-300 hover:scale-[1.02] hover:bg-white/10 active:scale-95 sm:w-auto sm:text-lg"
              >
                <Github className="h-5 w-5" />
                Star on GitHub
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ===================== FOOTER ===================== */}
      <footer className="relative z-20 border-t border-border bg-muted/30 py-12 sm:py-14">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mb-8 grid grid-cols-2 gap-8 md:grid-cols-4">
            <div className="col-span-2 md:col-span-1">
              <div className="group flex w-fit cursor-pointer items-center gap-2">
                <img
                  src="/logo.png"
                  alt=""
                  className="h-8 w-8 object-contain transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3"
                />
                <span className="font-display text-lg font-bold tracking-wider text-foreground">TESTHUB</span>
              </div>
              <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted-foreground">
                Building the next generation of automated testing for engineering teams.
              </p>
            </div>

            {[
              { title: "Platform", links: ["Features", "Pricing", "Security"] },
              { title: "Resources", links: ["Documentation", "Blog", "Community"] },
              { title: "Legal", links: ["Privacy", "Terms", "Contact"] },
            ].map((col, i) => (
              <div key={i}>
                <h4 className="mb-4 font-display text-sm font-bold tracking-wider text-foreground">{col.title}</h4>
                <ul className="space-y-2.5 text-sm text-muted-foreground">
                  {col.links.map((link, j) => (
                    <li key={j}>
                      <a
                        href="#"
                        className="inline-block transition-all duration-200 hover:translate-x-1 hover:text-foreground"
                      >
                        {link}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="flex flex-col items-center justify-between gap-4 border-t border-border pt-8 text-sm text-muted-foreground sm:flex-row">
            <p>&copy; 2026 TESTHUB · Open source under the MIT License.</p>
            <div className="flex gap-2">
              {["Twitter", "GitHub", "Discord"].map((s) => (
                <a
                  key={s}
                  href="#"
                  className="rounded-lg px-3 py-1.5 transition-all duration-300 hover:-translate-y-0.5 hover:bg-primary/10 hover:text-foreground"
                >
                  {s}
                </a>
              ))}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
