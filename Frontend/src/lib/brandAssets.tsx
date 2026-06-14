import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ *
 * Brand asset map — points logical keys (browser / framework /
 * language) at the real PNG logos shipped in `public/`. Centralised so
 * every page renders the same artwork instead of placeholder icons.
 * ------------------------------------------------------------------ */

export const browserLogo: Record<string, string> = {
  chrome: "/chrome.png",
  firefox: "/firefox.png",
};

export const frameworkLogo: Record<string, string> = {
  selenium: "/selenium.png",
  playwright: "/Playwright--Streamline-Svg-Logos.png",
};

export const languageLogo: Record<string, string> = {
  python: "/Python--Streamline-Svg-Logos.png",
  java: "/Java--Streamline-Svg-Logos.png",
};

/**
 * Renders a brand logo for the given key, falling back to `null` when no
 * artwork is mapped (callers can then keep their lucide icon as a backup).
 */
export function BrandIcon({
  kind,
  name,
  className = "",
}: {
  kind: "browser" | "framework" | "language";
  name: string | undefined;
  className?: string;
}) {
  if (!name) return null;
  const map = kind === "browser" ? browserLogo : kind === "framework" ? frameworkLogo : languageLogo;
  const src = map[name.toLowerCase()];
  if (!src) return null;
  return <img src={src} alt={name} className={cn("object-contain", className)} loading="lazy" />;
}
