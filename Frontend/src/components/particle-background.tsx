import { useEffect, useRef } from 'react';

export const ParticleBackground = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    // Theme detection
    let isDark = document.documentElement.classList.contains('dark');
    const observer = new MutationObserver(() => {
      isDark = document.documentElement.classList.contains('dark');
      // Re-assign particle colors on theme change
      particles.forEach(p => {
        const colors = isDark ? darkColors : lightColors;
        p.color = colors[Math.floor(Math.random() * colors.length)];
      });
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    const darkColors = ['#3b82f6', '#2563eb', '#60a5fa', '#93c5fd', '#bfdbfe', '#dbeafe', '#ffffff', '#94a3b8'];
    const lightColors = ['#2563eb', '#1d4ed8', '#3b82f6', '#1e40af', '#60a5fa', '#93c5fd', '#475569', '#334155'];

    // Particle array
    const particles: Array<{
      x: number;
      y: number;
      vx: number;
      vy: number;
      size: number;
      color: string;
      opacity: number;
    }> = [];

    const initialColors = isDark ? darkColors : lightColors;

    // Create particles
    const particleCount = 80;
    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.8,
        vy: (Math.random() - 0.5) * 0.8,
        size: Math.random() * 2 + 1,
        color: initialColors[Math.floor(Math.random() * initialColors.length)],
        opacity: Math.random() * 0.6 + 0.4
      });
    }

    const animate = () => {
      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Update and draw particles
      particles.forEach((particle) => {
        // Update position
        particle.x += particle.vx;
        particle.y += particle.vy;

        // Wrap around screen
        if (particle.x < 0) particle.x = canvas.width;
        if (particle.x > canvas.width) particle.x = 0;
        if (particle.y < 0) particle.y = canvas.height;
        if (particle.y > canvas.height) particle.y = 0;

        // Draw particle glow effect
        const glowSize = particle.size * 3;
        for (let i = glowSize; i > 0; i -= 2) {
          ctx.globalAlpha = (particle.opacity * (1 - i / glowSize)) * 0.3;
          ctx.fillStyle = particle.color;
          ctx.beginPath();
          ctx.arc(particle.x, particle.y, i, 0, Math.PI * 2);
          ctx.fill();
        }

        // Draw core particle
        ctx.globalAlpha = particle.opacity;
        ctx.fillStyle = particle.color;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        ctx.fill();
      });

      ctx.globalAlpha = 1;
      requestAnimationFrame(animate);
    };

    animate();

    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      observer.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-10"
      style={{ opacity: 0.8 }}
    />
  );
};
