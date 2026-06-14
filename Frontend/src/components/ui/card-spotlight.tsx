import { cn } from "@/lib/utils";
import { motion, useMotionTemplate, useMotionValue } from "framer-motion";
import React, { type ReactNode } from "react";

interface CardSpotlightProps {
  children: ReactNode;
  className?: string;
  /** Glow radius in px. Default 360. */
  radius?: number;
  /** Glow color (any CSS color). Default brand violet. */
  color?: string;
}

/**
 * CardSpotlight — a radial brand glow that follows the cursor inside the card.
 * Lightweight (framer-motion values, no canvas). Wrap any card content with it.
 */
export function CardSpotlight({
  children,
  className,
  radius = 360,
  color = "hsl(258 90% 60% / 0.18)",
}: CardSpotlightProps) {
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const { left, top } = e.currentTarget.getBoundingClientRect();
    mouseX.set(e.clientX - left);
    mouseY.set(e.clientY - top);
  };

  const background = useMotionTemplate`radial-gradient(${radius}px circle at ${mouseX}px ${mouseY}px, ${color}, transparent 70%)`;

  return (
    <div
      onMouseMove={handleMouseMove}
      className={cn("group/spot relative overflow-hidden", className)}
    >
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-px z-0 opacity-0 transition-opacity duration-300 group-hover/spot:opacity-100"
        style={{ background }}
      />
      <div className="relative z-10 h-full">{children}</div>
    </div>
  );
}

export default CardSpotlight;
