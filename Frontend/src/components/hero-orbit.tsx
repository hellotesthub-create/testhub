/* Lightweight, no-WebGL "integration hub": the TestHub logo at the center with
   the tool logos orbiting around it, joined by glowing data-flow connectors.
   The whole rotor (lines + logos) revolves; each logo counter-spins so it
   stays upright and readable. */

type Satellite = {
  src: string;
  label: string;
  /** position on the ring, as left/top percentages */
  x: number;
  y: number;
};

// 5 logos evenly spaced (72° apart) on a ring ~38% from the center.
const satellites: Satellite[] = [
  { src: "/githubIcon.png", label: "GitHub", x: 50, y: 12 },
  { src: "/chrome.png", label: "Chrome", x: 86, y: 38 },
  { src: "/firefox.png", label: "Firefox", x: 72, y: 81 },
  { src: "/parallel.png", label: "Parallel", x: 28, y: 81 },
  { src: "/report.png", label: "Reports", x: 14, y: 38 },
];

export default function HeroOrbit() {
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[30rem]">
      {/* soft brand glow behind the hub */}
      <div className="pointer-events-none absolute inset-[18%] rounded-full bg-[radial-gradient(circle,hsl(258_90%_62%/0.4),transparent_70%)] blur-2xl" />

      {/* decorative rings — GridScan cyan/blue (#5CC8FF), clearly visible with
          a soft blue glow. */}
      <div className="absolute inset-[8%] rounded-full border-2 border-[hsl(199_95%_67%/0.6)] shadow-[0_0_30px_-2px_hsl(199_95%_60%/0.5),inset_0_0_26px_-6px_hsl(199_95%_64%/0.45)]" />
      <div className="animate-orbit-rev absolute inset-[22%] rounded-full border-2 border-dashed border-[hsl(199_95%_72%/0.75)]" />

      {/* ROTOR — connector lines + logos revolve together */}
      <div className="animate-orbit-slow absolute inset-0">
        {/* connector lines (bright purple, glowing) with flowing dashes */}
        <svg
          viewBox="0 0 100 100"
          className="absolute inset-0 h-full w-full [filter:drop-shadow(0_0_2px_hsl(265_90%_62%/0.8))]"
          fill="none"
          aria-hidden="true"
        >
          {satellites.map((s) => (
            <line
              key={s.label}
              x1="50"
              y1="50"
              x2={s.x}
              y2={s.y}
              stroke="hsl(265 90% 66%)"
              strokeWidth="0.9"
              strokeOpacity="0.85"
              strokeDasharray="2.5 3"
              strokeLinecap="round"
              className="animate-dash-flow"
            />
          ))}
        </svg>

        {/* orbiting tool logos (counter-spin keeps them upright) */}
        {satellites.map((s) => (
          <div
            key={s.label}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${s.x}%`, top: `${s.y}%` }}
          >
            <div className="animate-orbit-cc flex flex-col items-center gap-1.5">
              <div className="group flex h-14 w-14 items-center justify-center rounded-2xl border border-white/15 bg-white/10 shadow-lg shadow-black/30 backdrop-blur-md transition-all duration-300 hover:scale-110 hover:border-primary/50 sm:h-16 sm:w-16">
                <img src={s.src} alt={s.label} className="h-8 w-8 object-contain sm:h-9 sm:w-9" />
              </div>
              <span className="font-mono text-[11px] font-medium tracking-wide text-white/55">{s.label}</span>
            </div>
          </div>
        ))}
      </div>

      {/* center hub (stays fixed) — logo + TESTHUB label inside the box */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <div className="relative flex flex-col items-center justify-center gap-1.5 rounded-2xl border border-white/20 bg-white/10 px-5 py-4 shadow-xl shadow-primary/30 backdrop-blur-md">
          <img src="/logo.png" alt="TESTHUB" className="h-12 w-12 object-contain sm:h-14 sm:w-14" />
          <span className="font-display text-xs font-bold tracking-[0.15em] text-white sm:text-sm">TESTHUB</span>
        </div>
      </div>
    </div>
  );
}
