import { useEffect, useRef, useState } from 'react';

interface Node {
  label: string;
  type: string;
  color: string;
  icon: string;
  iconSrc?: string;
  iconImg?: HTMLImageElement;
  iconBounds?: { sx: number; sy: number; sw: number; sh: number };
  x: number;
  y: number;
  baseX: number;
  baseY: number;
  speed: number;
  phase: number;
  pulse: number;
  pulseSpeed: number;
  size: number;
}

const TestAutomationNetwork = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const isDarkRef = useRef(true);

  useEffect(() => {
    const updateDimensions = () => {
      setDimensions({
        width: window.innerWidth,
        height: window.innerHeight
      });
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);

    // Observe theme changes via ref (no re-render)
    const checkTheme = () => { isDarkRef.current = document.documentElement.classList.contains('dark'); };
    checkTheme();
    const observer = new MutationObserver(checkTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    return () => {
      window.removeEventListener('resize', updateDimensions);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;

    // Feature nodes for the testing platform - same colors in both modes
    const nodes: Node[] = [
      { label: 'Test Hub', type: 'hub', color: '#a78bfa', icon: '', iconSrc: '/logo.png' },
      { label: 'Parallel Testing', type: 'feature', color: '#3b82f6', icon: '', iconSrc: '/parallel.png' },
      { label: 'GitHub', type: 'feature', color: '#7dd3fc', icon: '', iconSrc: '/githubIcon.png' },
      { label: 'Chrome', type: 'browser', color: '#3b82f6', icon: '', iconSrc: '/chrome.png' },
      { label: 'Firefox', type: 'browser', color: '#f59e0b', icon: '', iconSrc: '/firefox.png' },
      { label: 'Reports', type: 'feature', color: '#f0b27a', icon: '', iconSrc: '/report.png' }
    ] as Node[];

    const getImageVisibleBounds = (img: HTMLImageElement) => {
      const width = img.naturalWidth || img.width;
      const height = img.naturalHeight || img.height;
      if (!width || !height) {
        return { sx: 0, sy: 0, sw: width || 1, sh: height || 1 };
      }

      const offscreen = document.createElement('canvas');
      offscreen.width = width;
      offscreen.height = height;
      const offCtx = offscreen.getContext('2d');
      if (!offCtx) {
        return { sx: 0, sy: 0, sw: width, sh: height };
      }

      offCtx.drawImage(img, 0, 0, width, height);
      const { data } = offCtx.getImageData(0, 0, width, height);

      let minX = width;
      let minY = height;
      let maxX = -1;
      let maxY = -1;

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const alpha = data[(y * width + x) * 4 + 3];
          if (alpha > 8) {
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
          }
        }
      }

      if (maxX < minX || maxY < minY) {
        return { sx: 0, sy: 0, sw: width, sh: height };
      }

      return {
        sx: minX,
        sy: minY,
        sw: Math.max(1, maxX - minX + 1),
        sh: Math.max(1, maxY - minY + 1),
      };
    };

    // Preload icon images
    let imagesLoaded = 0;
    const totalImages = nodes.filter(n => n.iconSrc).length;
    nodes.forEach(node => {
      if (node.iconSrc) {
        const img = new Image();
        img.src = node.iconSrc;
        img.onload = () => {
          node.iconImg = img;
          node.iconBounds = getImageVisibleBounds(img);
          imagesLoaded++;
        };
        img.onerror = () => {
          imagesLoaded++;
        };
      }
    });

    // Adjust center position based on screen size - ALWAYS keep network on the RIGHT
    const isMobile = dimensions.width < 768;
    const isTablet = dimensions.width >= 768 && dimensions.width < 1024;
    
    // Position network on the right side for all screen sizes
    let centerX;
    let networkRadius;
    
    if (isMobile) {
      // Mobile: Network on right half
      centerX = dimensions.width * 0.65; // 65% from left = right side
      networkRadius = Math.min(dimensions.width, dimensions.height) * 0.18;
    } else if (isTablet) {
      // Tablet: Network more to the right
      centerX = dimensions.width * 0.68; // 68% from left
      networkRadius = Math.min(dimensions.width, dimensions.height) * 0.22;
    } else {
      // Desktop: Network clearly on right side
      centerX = dimensions.width * 0.70; // 70% from left = right side
      networkRadius = Math.min(dimensions.width, dimensions.height) * 0.25;
    }
    
    const centerY = dimensions.height / 2;

    // Position nodes in circular pattern
    nodes.forEach((node, i) => {
      if (i === 0) {
        // Center hub
        node.x = centerX;
        node.y = centerY;
        node.baseX = centerX;
        node.baseY = centerY;
      } else {
        const angle = ((i - 1) / (nodes.length - 1)) * Math.PI * 2 - Math.PI / 2;
        node.x = centerX + Math.cos(angle) * networkRadius;
        node.y = centerY + Math.sin(angle) * networkRadius;
        node.baseX = node.x;
        node.baseY = node.y;
      }
      node.speed = 0.15 + Math.random() * 0.25;
      node.phase = Math.random() * Math.PI * 2;
      node.pulse = Math.random() * Math.PI * 2;
      node.pulseSpeed = 0.015 + Math.random() * 0.02;
      node.size = i === 0 ? (isMobile ? 32 : 40) : (isMobile ? 26 : 32);
    });

    // Background particles - reduce on mobile
    const particles: any[] = [];
    const numParticles = isMobile ? 60 : 120;
    for (let i = 0; i < numParticles; i++) {
      particles.push({
        x: Math.random() * dimensions.width,
        y: Math.random() * dimensions.height,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        radius: 1 + Math.random() * 2.5,
        opacity: 0.3 + Math.random() * 0.4,
        pulsePhase: Math.random() * Math.PI * 2,
        pulseSpeed: 0.015 + Math.random() * 0.025,
        color: ['#3b82f6', '#a78bfa', '#7dd3fc', '#60a5fa'][Math.floor(Math.random() * 4)]
      });
    }

    // Data packets flowing through network
    const dataPackets: any[] = [];

    // Orbiting particles around nodes
    const orbitParticles: any[] = [];
    nodes.forEach((_node, i) => {
      if (i === 0) return;
      for (let j = 0; j < 3; j++) {
        orbitParticles.push({
          nodeIndex: i,
          angle: (j / 3) * Math.PI * 2,
          speed: 0.02 + Math.random() * 0.02,
          distance: 45 + Math.random() * 10,
          size: 2 + Math.random() * 1
        });
      }
    });

    let animationId: number;

    const animate = () => {
      // Read current theme from ref each frame
      const dark = isDarkRef.current;

      // Create trail effect - theme aware
      ctx.fillStyle = dark ? 'rgba(0, 0, 0, 0.12)' : 'rgba(255, 255, 255, 0.18)';
      ctx.fillRect(0, 0, dimensions.width, dimensions.height);

      // Draw background particles
      particles.forEach((p: any) => {
        p.x += p.vx;
        p.y += p.vy;

        if (p.x < 0 || p.x > dimensions.width) p.vx *= -1;
        if (p.y < 0 || p.y > dimensions.height) p.vy *= -1;

        p.pulsePhase += p.pulseSpeed;
        const pulseOpacity = p.opacity * (0.6 + Math.sin(p.pulsePhase) * 0.4);

        // Draw particle with glow
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius * 3);
        gradient.addColorStop(0, p.color + Math.floor(pulseOpacity * 255).toString(16).padStart(2, '0'));
        gradient.addColorStop(1, p.color + '00');
        ctx.fillStyle = gradient;
        ctx.fill();
      });

      // Update node positions
      nodes.forEach((node, i) => {
        if (i === 0) return; // Hub stays centered
        node.phase += node.speed * 0.008;
        const offsetX = Math.cos(node.phase) * 15;
        const offsetY = Math.sin(node.phase) * 15;
        node.x = node.baseX + offsetX;
        node.y = node.baseY + offsetY;
      });

      // Draw connections with animated gradient
      nodes.forEach((node, i) => {
        if (i === 0) return;
        
        const hub = nodes[0];

        // Animated gradient
        const gradient = ctx.createLinearGradient(node.x, node.y, hub.x, hub.y);
        const alpha = 0.4 + Math.sin(Date.now() * 0.001 + i) * 0.25;
        gradient.addColorStop(0, node.color + Math.floor(alpha * 255).toString(16).padStart(2, '0'));
        gradient.addColorStop(0.5, dark ? '#ffffff40' : '#64748b50');
        gradient.addColorStop(1, hub.color + Math.floor(alpha * 255).toString(16).padStart(2, '0'));
        
        ctx.beginPath();
        ctx.moveTo(node.x, node.y);
        ctx.lineTo(hub.x, hub.y);
        ctx.strokeStyle = gradient;
        ctx.lineWidth = 2.5;
        ctx.stroke();

        // Create data packets
        if (Math.random() < 0.012) {
          dataPackets.push({
            startX: node.x,
            startY: node.y,
            targetX: hub.x,
            targetY: hub.y,
            progress: 0,
            speed: 0.012 + Math.random() * 0.018,
            color: node.color,
            life: 1,
            reverse: Math.random() > 0.5
          });
        }
      });

      // Update and draw data packets
      for (let i = dataPackets.length - 1; i >= 0; i--) {
        const packet = dataPackets[i];
        packet.progress += packet.speed;
        packet.life -= 0.006;

        if (packet.progress >= 1 || packet.life <= 0) {
          dataPackets.splice(i, 1);
          continue;
        }

        const prog = packet.reverse ? 1 - packet.progress : packet.progress;
        const x = packet.startX + (packet.targetX - packet.startX) * prog;
        const y = packet.startY + (packet.targetY - packet.startY) * prog;

        // Packet with intense glow
        const glowGradient = ctx.createRadialGradient(x, y, 0, x, y, 15);
        glowGradient.addColorStop(0, packet.color);
        glowGradient.addColorStop(0.3, packet.color + 'aa');
        glowGradient.addColorStop(1, packet.color + '00');
        ctx.beginPath();
        ctx.arc(x, y, 15, 0, Math.PI * 2);
        ctx.fillStyle = glowGradient;
        ctx.fill();

        // Core
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fillStyle = dark ? '#ffffff' : '#1e293b';
        ctx.fill();
      }

      // Draw orbiting particles
      orbitParticles.forEach((op: any) => {
        op.angle += op.speed;
        const node = nodes[op.nodeIndex];
        const x = node.x + Math.cos(op.angle) * op.distance;
        const y = node.y + Math.sin(op.angle) * op.distance;

        ctx.beginPath();
        ctx.arc(x, y, op.size, 0, Math.PI * 2);
        ctx.fillStyle = node.color + 'cc';
        ctx.fill();
      });

      // Draw nodes
      nodes.forEach((node: any, i: number) => {
        node.pulse += node.pulseSpeed;
        const pulseSize = 1 + Math.sin(node.pulse) * 0.2;

        // Outer glow
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.size * 1.8 * pulseSize, 0, Math.PI * 2);
        const outerGlow = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, node.size * 1.8 * pulseSize);
        outerGlow.addColorStop(0, node.color + '55');
        outerGlow.addColorStop(0.5, node.color + '22');
        outerGlow.addColorStop(1, node.color + '00');
        ctx.fillStyle = outerGlow;
        ctx.fill();

        // Main node circle with gradient
        const nodeGradient = ctx.createRadialGradient(
          node.x - node.size * 0.3, node.y - node.size * 0.3, 0,
          node.x, node.y, node.size
        );
        nodeGradient.addColorStop(0, node.color + 'ff');
        nodeGradient.addColorStop(1, node.color + 'dd');
        
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.size, 0, Math.PI * 2);
        ctx.fillStyle = nodeGradient;
        ctx.fill();

        // Bright border
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.size, 0, Math.PI * 2);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.5;
        ctx.stroke();

        // Draw icon image or fallback emoji
        if (node.iconImg) {
          const imgSize = i === 0 ? node.size * 1.2 : node.label === 'GitHub' ? node.size * 1.22 : node.size * 1.0;
          const bounds = node.iconBounds || {
            sx: 0,
            sy: 0,
            sw: node.iconImg.naturalWidth || node.iconImg.width,
            sh: node.iconImg.naturalHeight || node.iconImg.height,
          };
          ctx.save();
          ctx.beginPath();
          ctx.arc(node.x, node.y, node.size * 0.78, 0, Math.PI * 2);
          ctx.clip();
          ctx.drawImage(
            node.iconImg,
            bounds.sx,
            bounds.sy,
            bounds.sw,
            bounds.sh,
            node.x - imgSize / 2,
            node.y - imgSize / 2,
            imgSize,
            imgSize
          );
          ctx.restore();
        } else if (node.icon) {
          ctx.fillStyle = '#ffffff';
          ctx.font = `bold ${i === 0 ? (isMobile ? 20 : 24) : (isMobile ? 16 : 20)}px Arial`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(node.icon, node.x, node.y);
        }

        // Label with shadow - adjust font size for mobile
        ctx.shadowColor = dark ? 'rgba(0, 0, 0, 0.8)' : 'rgba(0, 0, 0, 0.3)';
        ctx.shadowBlur = 10;
        ctx.fillStyle = dark ? '#ffffff' : '#1e293b';
        ctx.font = `bold ${i === 0 ? (isMobile ? 13 : 16) : (isMobile ? 11 : 14)}px Arial`;
        ctx.fillText(node.label, node.x, node.y + node.size + (isMobile ? 20 : 25));
        ctx.shadowBlur = 0;
      });

      animationId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      if (animationId) {
        cancelAnimationFrame(animationId);
      }
    };
  }, [dimensions]);

  return (
    <div className="relative w-full h-screen bg-gradient-to-br from-slate-50 via-blue-100/50 to-slate-50 dark:from-black dark:via-slate-950 dark:to-black overflow-hidden">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 animate-in fade-in duration-1000"
      />
      
      {/* Radial gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-white/40 dark:to-black/40 pointer-events-none" />
    </div>
  );
};

export default TestAutomationNetwork;
