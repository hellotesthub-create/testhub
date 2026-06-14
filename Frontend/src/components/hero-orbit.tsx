/* 3D "integration hub": the TestHub logo at the center with the tool logos
   orbiting around it on a tilted ring. Each satellite is positioned every
   frame with real depth cues — front satellites are larger/brighter and pass
   IN FRONT of the hub, back ones are smaller/dimmer and pass behind — which
   reads as a genuine 3D orbit. Glowing connector lines track each satellite.
   Honors prefers-reduced-motion (renders a static, evenly-spaced ring). */

import { useEffect, useRef } from "react";

const satellites = [
  { src: "/githubIcon.png", label: "GitHub" },
  { src: "/chrome.png", label: "Chrome" },
  { src: "/firefox.png", label: "Firefox" },
  { src: "/parallel.png", label: "Parallel" },
  { src: "/report.png", label: "Reports" },
];

// Orbit geometry (percent of the square container).
const RX = 40; // horizontal radius
const RY = 19; // vertical radius (smaller → tilted-ring perspective)
const CX = 50;
const CY = 50;

export default function HeroOrbit() {
  const nodeRefs = useRef<(HTMLDivElement | null)[]>([]);
  const lineRefs = useRef<(SVGLineElement | null)[]>([]);

  useEffect(() => {
    const N = satellites.length;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const speed = 0.22; // radians / second
    const start = performance.now();
    let raf = 0;

    const place = (i: number, angle: number) => {
      const x = Math.cos(angle);
      const s = Math.sin(angle); // depth axis
      const px = CX + x * RX;
      const py = CY + s * RY;
      const depth = (s + 1) / 2; // 0 = far/back, 1 = near/front
      const scale = 0.6 + depth * 0.6;
      const opacity = 0.4 + depth * 0.6;

      const node = nodeRefs.current[i];
      if (node) {
        node.style.left = `${px}%`;
        node.style.top = `${py}%`;
        node.style.transform = `translate(-50%, -50%) scale(${scale.toFixed(3)})`;
        node.style.opacity = opacity.toFixed(3);
        node.style.filter = `brightness(${(0.75 + depth * 0.45).toFixed(3)})`;
        node.style.zIndex = String(20 + Math.round(depth * 40)); // hub sits at z-index 30
      }
      const line = lineRefs.current[i];
      if (line) {
        line.setAttribute("x2", px.toFixed(2));
        line.setAttribute("y2", py.toFixed(2));
        line.setAttribute("stroke-opacity", (0.25 + depth * 0.55).toFixed(3));
        line.setAttribute("stroke-width", (0.5 + depth * 0.7).toFixed(2));
      }
    };

    const frame = (now: number) => {
      const t = (now - start) / 1000;
      for (let i = 0; i < N; i++) {
        const angle = -Math.PI / 2 + t * speed + (i * 2 * Math.PI) / N;
        place(i, angle);
      }
      raf = requestAnimationFrame(frame);
    };

    if (reduce) {
      for (let i = 0; i < N; i++) place(i, -Math.PI / 2 + (i * 2 * Math.PI) / N);
    } else {
      raf = requestAnimationFrame(frame);
    }
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[30rem] [perspective:1000px]">
      {/* soft brand glow behind the hub */}
      <div className="pointer-events-none absolute inset-[20%] rounded-full bg-[radial-gradient(circle,hsl(258_90%_62%/0.45),transparent_70%)] blur-2xl" />

      {/* tilted 3D orbit plane — an ellipse ring with a cyan glow */}
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-[50%] border-2 border-[hsl(199_95%_67%/0.55)] shadow-[0_0_34px_-4px_hsl(199_95%_60%/0.5),inset_0_0_30px_-8px_hsl(199_95%_64%/0.45)]"
        style={{ width: `${RX * 2}%`, height: `${RY * 2}%` }}
      />
      {/* inner dashed ellipse for depth */}
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-[50%] border border-dashed border-[hsl(199_95%_72%/0.5)]"
        style={{ width: `${RX * 1.4}%`, height: `${RY * 1.4}%` }}
      />

      {/* glowing data-flow connectors (endpoints updated per frame) */}
      <svg
        viewBox="0 0 100 100"
        className="absolute inset-0 h-full w-full [filter:drop-shadow(0_0_2px_hsl(265_90%_62%/0.8))]"
        fill="none"
        aria-hidden="true"
        style={{ zIndex: 10 }}
      >
        {satellites.map((s, i) => (
          <line
            key={s.label}
            ref={(el) => { lineRefs.current[i] = el; }}
            x1="50"
            y1="50"
            x2="50"
            y2="50"
            stroke="hsl(265 90% 66%)"
            strokeDasharray="2.5 3"
            strokeLinecap="round"
            className="animate-dash-flow"
          />
        ))}
      </svg>

      {/* orbiting tool logos (positioned every frame) */}
      {satellites.map((s, i) => (
        <div
          key={s.label}
          ref={(el) => { nodeRefs.current[i] = el; }}
          className="absolute"
          style={{ left: "50%", top: "50%", willChange: "left, top, transform, opacity" }}
        >
          <div className="flex flex-col items-center gap-1.5">
            <div className="group flex h-16 w-16 items-center justify-center rounded-2xl border border-white/15 bg-white/10 shadow-lg shadow-black/30 backdrop-blur-md transition-transform duration-300 hover:scale-110">
              <img src={s.src} alt={s.label} className="h-9 w-9 object-contain" draggable={false} />
            </div>
            <span className="font-mono text-[11px] font-medium tracking-wide text-white/60">{s.label}</span>
          </div>
        </div>
      ))}

      {/* center hub — fixed circle, sits between back and front satellites (z-index 30) */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ zIndex: 30 }}>
        <div className="relative flex aspect-square h-[5.5rem] w-[5.5rem] flex-col items-center justify-center gap-0.5 rounded-full border border-white/20 bg-white/10 shadow-xl shadow-primary/30 backdrop-blur-md sm:h-24 sm:w-24">
          <img src="/logo.png" alt="TESTHUB" className="h-7 w-7 object-contain sm:h-8 sm:w-8" draggable={false} />
          <span className="font-display text-[9px] font-bold tracking-[0.1em] text-white sm:text-[10px]">TESTHUB</span>
        </div>
      </div>
    </div>
  );
}
