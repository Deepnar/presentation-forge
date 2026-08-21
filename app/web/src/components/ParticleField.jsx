import { useEffect, useRef } from "react";

/**
 * Ambient constellation field — richer than before.
 * - 2x more dots, variable sizes, twinkle + size pulse
 * - Nearby dots link with faint lines (constellation)
 * - Velocity-based drift (vx/vy) + sine wander, not just sine
 * - Strong reactive repulsion: push, scale, brighten on hover
 * - Mouse trail: emit short-lived sparkles
 * - Pause/resume, reduce-motion, visibility guards kept
 */
export default function ParticleField({ paused = false, boost = 1, className = "" }) {
  const canvasRef = useRef(null);
  const controlRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const css = getComputedStyle(document.documentElement);
    const fill = {
      dot: css.getPropertyValue("--color-fg").trim() || "#475569",
      accent: css.getPropertyValue("--color-accent").trim() || "#6D5BFF",
      line: css.getPropertyValue("--color-line-strong").trim() || "#D1D5E0",
    };
    const hexToRgb = (h) => {
      const s = h.replace("#", "").trim();
      if (s.length < 6) return "100 100 100";
      const r = parseInt(s.slice(0, 2), 16), g = parseInt(s.slice(2, 4), 16), b = parseInt(s.slice(4, 6), 16);
      return `${r} ${g} ${b}`;
    };
    const accentRgb = hexToRgb(fill.accent);
    const dotRgb = hexToRgb(fill.dot);

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const MAX = 560;
    const FRAME_MS = 1000 / 60;

    const state = {
      dots: [],
      trails: [],
      pointer: { x: -1, y: -1, vx: 0, vy: 0, px: -1, py: -1 },
      w: 0, h: 0, dpr: 1, frames: 0, running: false, last: 0,
    };

    const makeDot = () => {
      const r = 0.7 + Math.random() * 1.8;
      return {
        x: Math.random() * state.w,
        y: Math.random() * state.h,
        vx: (Math.random() - 0.5) * 0.35,
        vy: (Math.random() - 0.5) * 0.35,
        r,
        baseR: r,
        base: (0.14 + Math.random() * 0.32) * boost,
        phase: Math.random() * Math.PI * 2,
        fx: 0.08 + Math.random() * 0.22,
        fy: 0.06 + Math.random() * 0.18,
        ax: 10 + Math.random() * 22,
        ay: 10 + Math.random() * 22,
        accent: Math.random() < 0.28,
        tw: Math.random() * Math.PI * 2,
      };
    };

    function resize() {
      const rect = canvas.getBoundingClientRect();
      state.dpr = Math.min(window.devicePixelRatio || 1, 2);
      state.w = Math.max(1, Math.round(rect.width * state.dpr));
      state.h = Math.max(1, Math.round(rect.height * state.dpr));
      canvas.width = state.w;
      canvas.height = state.h;
      const area = rect.width * rect.height;
      const count = Math.max(80, Math.min(MAX, Math.round(area / 2400)));
      state.dots = Array.from({ length: count }, makeDot);
      state.trails = [];
      if (reduceMotion) drawFrame(performance.now());
    }

    function drawFrame(now) {
      ctx.clearRect(0, 0, state.w, state.h);
      const { dpr, pointer } = state;
      let pushed = 0;
      const pts = [];

      for (const d of state.dots) {
        d.phase += 0.0032;
        d.tw += 0.008;
        // velocity + sine wander
        d.x += d.vx * dpr + Math.sin(d.phase * d.fx * 2.1) * 0.18;
        d.y += d.vy * dpr + Math.sin(d.phase * d.fy * 2.1 + 1.1) * 0.18;
        // wrap softly
        if (d.x < -20) d.x = state.w + 20;
        if (d.x > state.w + 20) d.x = -20;
        if (d.y < -20) d.y = state.h + 20;
        if (d.y > state.h + 20) d.y = -20;

        let x = d.x, y = d.y;
        let scale = 1, bright = 1;
        if (pointer.x >= 0) {
          const dx = x - pointer.x * dpr;
          const dy = y - pointer.y * dpr;
          const radius = 220 * dpr;
          const dist2 = dx * dx + dy * dy;
          if (dist2 > 0 && dist2 < radius * radius) {
            const dist = Math.sqrt(dist2);
            const t = 1 - dist / radius;
            const push = t * t * 1.8;
            x += (dx / dist) * push * 22 * dpr;
            y += (dy / dist) * push * 22 * dpr;
            scale = 1 + t * 1.6;
            bright = 1 + t * 1.1;
            pushed += 1;
          }
          // repulse velocity a bit
          if (dist2 < (120 * dpr) ** 2) {
            d.vx += (dx / (Math.sqrt(dist2) || 1)) * 0.002;
            d.vy += (dy / (Math.sqrt(dist2) || 1)) * 0.002;
            d.vx = Math.max(-0.9, Math.min(0.9, d.vx));
            d.vy = Math.max(-0.9, Math.min(0.9, d.vy));
          }
        }

        pts.push({ x, y, s: scale, b: bright, d });

        const twinkle = 0.65 + 0.35 * Math.sin(now * 0.0012 + d.tw * 1.7);
        const pulse = 0.92 + 0.08 * Math.sin(now * 0.0009 + d.phase);
        const r = d.r * dpr * pulse * scale;
        ctx.globalAlpha = Math.min(1, d.base * twinkle * bright * (d.accent ? 1.35 : 1));
        ctx.fillStyle = d.accent ? `rgb(${accentRgb})` : `rgb(${dotRgb})`;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        // soft glow for accents
        if (d.accent) {
          ctx.globalAlpha *= 0.18;
          ctx.beginPath();
          ctx.arc(x, y, r * 2.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // constellation lines — denser, stronger near pointer
      ctx.globalAlpha = 1;
      if (pts.length < 360) {
        for (let i = 0; i < pts.length; i++) {
          for (let j = i + 1; j < pts.length; j++) {
            const a = pts[i], b = pts[j];
            const dx = a.x - b.x, dy = a.y - b.y;
            const d2 = dx * dx + dy * dy;
            const lim = (140 * dpr) ** 2;
            if (d2 < lim) {
              const t = 1 - Math.sqrt(d2) / (140 * dpr);
              if (t > 0.3 && (Math.random() < 0.16 || a.b > 1.1 || b.b > 1.1)) {
                ctx.globalAlpha = t * 0.13 * boost;
                ctx.strokeStyle = `rgb(${dotRgb})`;
                ctx.lineWidth = 0.7 * dpr;
                ctx.beginPath();
                ctx.moveTo(a.x, a.y);
                ctx.lineTo(b.x, b.y);
                ctx.stroke();
              }
            }
          }
        }
      }

      // mouse trail sparkles — slightly sparser to avoid overload with denser field
      if (pointer.x >= 0 && (Math.abs(pointer.vx) > 0.6 || Math.abs(pointer.vy) > 0.6)) {
        if (Math.random() < 0.4) {
          state.trails.push({ x: pointer.x * dpr, y: pointer.y * dpr, life: 0.9, vx: (Math.random() - 0.5) * 1.4, vy: (Math.random() - 0.5) * 1.4 });
        }
      }
      for (let i = state.trails.length - 1; i >= 0; i--) {
        const t = state.trails[i];
        t.life -= 0.05;
        if (t.life <= 0) { state.trails.splice(i, 1); continue; }
        t.x += t.vx; t.y += t.vy; t.vy += 0.07;
        ctx.globalAlpha = t.life * 0.6;
        ctx.fillStyle = `rgb(${accentRgb})`;
        ctx.beginPath();
        ctx.arc(t.x, t.y, 1.7 * dpr * t.life, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalAlpha = 1;
      state.frames += 1;
      canvas.dataset.frames = String(state.frames);
      canvas.dataset.ptr = `${Math.round(pointer.x)}:${Math.round(pointer.y)}`;
      canvas.dataset.pushed = String(pushed);
    }

    function loop(now) {
      if (!state.running) return;
      if (now - state.last >= FRAME_MS) {
        drawFrame(now);
        state.last = now;
      }
      requestAnimationFrame(loop);
    }
    function start() {
      if (state.running || reduceMotion) return;
      state.running = true;
      requestAnimationFrame(loop);
    }
    function stop() { state.running = false; }

    function onPointer(e) {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left, y = e.clientY - rect.top;
      state.pointer.vx = x - state.pointer.px;
      state.pointer.vy = y - state.pointer.py;
      state.pointer.px = x; state.pointer.py = y;
      state.pointer.x = x; state.pointer.y = y;
    }
    function onLeave() { state.pointer.x = -1; state.pointer.y = -1; state.pointer.vx = 0; state.pointer.vy = 0; }
    function onVisibility() {
      if (document.hidden) stop();
      else if (paused) stop();
      else start();
    }

    resize();
    if (!reduceMotion && !paused) start();
    controlRef.current = { start, stop, reduceMotion };
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("mousemove", onPointer);
    window.addEventListener("mouseleave", onLeave);
    window.addEventListener("blur", stop);
    window.addEventListener("focus", onVisibility);
    return () => {
      stop();
      controlRef.current = null;
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("mousemove", onPointer);
      window.removeEventListener("mouseleave", onLeave);
      window.removeEventListener("blur", stop);
      window.removeEventListener("focus", onVisibility);
    };
  }, []);

  useEffect(() => {
    const c = controlRef.current;
    if (!c) return;
    if (paused || document.hidden || c.reduceMotion) c.stop();
    else c.start();
  }, [paused]);

  return <canvas ref={canvasRef} className={className} aria-hidden data-field />;
}
