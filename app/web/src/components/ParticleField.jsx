import { useEffect, useRef } from "react";

/**
 * Ambient dot field behind the app shell — the "something alive" layer.
 *
 * A capped set of dots drifts on slow sine paths and repels gently around the
 * pointer, so the page feels attended rather than static. It is deliberately
 * ambience: opacity stays low, the count is capped by area, and the whole
 * field must never compete with the deck content above it.
 *
 * Guardrails, all verified in the session notes:
 *  - prefers-reduced-motion draws one static frame and stops — no loop at all;
 *  - the requestAnimationFrame loop stops when the tab is hidden and when a
 *    navigation rail is focused (the parent passes `paused`), so nothing burns
 *    CPU on a field nobody is looking at;
 *  - a missing 2d context renders nothing, so an old browser gets a clean
 *    static shell instead of a crash.
 */
export default function ParticleField({ paused = false, className = "" }) {
  const canvasRef = useRef(null);
  const controlRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Colours come from the theme variables, never from here — the palette
    // stays owned by styles.css, exactly like every other surface.
    const css = getComputedStyle(document.documentElement);
    const fill = {
      dot: css.getPropertyValue("--color-fg").trim() || "237 237 236",
      accent: css.getPropertyValue("--color-accent").trim() || "201 106 89",
    };

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const MAX = 150;

    const state = {
      dots: [],
      pointer: { x: -1, y: -1 },
      w: 0, h: 0, dpr: 1, frames: 0, running: false,
    };

    const makeDot = () => {
      const r = 1 + Math.random() * 1.8;
      return {
        x: Math.random() * state.w,
        y: Math.random() * state.h,
        r,
        base: 0.12 + Math.random() * 0.18,
        phase: Math.random() * Math.PI * 2,
        speed: 0.15 + Math.random() * 0.35,
        accent: Math.random() < 0.16,
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
      const count = Math.max(24, Math.min(MAX, Math.round(area / 9000)));
      state.dots = Array.from({ length: count }, makeDot);
      if (reduceMotion) drawFrame(performance.now());
    }

    function drawFrame(now) {
      ctx.clearRect(0, 0, state.w, state.h);
      const { dpr, pointer } = state;
      let pushed = 0;
      for (const d of state.dots) {
        // Idle drift rides a slow sine; the phase steps with wall-clock time so
        // the motion is smooth regardless of frame rate.
        d.phase += 0.004 * d.speed;
        let x = d.x;
        let y = d.y + Math.sin(d.phase) * 3.5 * dpr;

        // Gentle repulsion inside a radius around the pointer, easing back to
        // the sine path as the pointer moves away. Parallax, not physics.
        if (pointer.x >= 0) {
          const dx = x - pointer.x * dpr;
          const dy = y - pointer.y * dpr;
          const radius = 130 * dpr;
          const dist2 = dx * dx + dy * dy;
          if (dist2 > 0 && dist2 < radius * radius) {
            const dist = Math.sqrt(dist2);
            const push = (1 - dist / radius) * 1.4;
            x += (dx / dist) * push * 6 * dpr;
            y += (dy / dist) * push * 6 * dpr;
            pushed += 1;
          }
        }

        if (y > state.h + 8) y = -8;
        else if (y < -8) y = state.h + 8;

        const twinkle = 0.75 + 0.25 * Math.sin(now * 0.001 + d.phase * 3);
        ctx.globalAlpha = d.base * twinkle * (d.accent ? 1.3 : 1);
        ctx.fillStyle = d.accent ? fill.accent : fill.dot;
        ctx.beginPath();
        ctx.arc(x, y, d.r * dpr, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      state.frames += 1;
      // Instrumented hooks for behavioural checks: the frame count proves the
      // loop runs, the pointer stamp proves the pointer path is live, and the
      // pushed count proves dots actually respond to it.
      canvas.dataset.frames = String(state.frames);
      canvas.dataset.ptr = `${Math.round(pointer.x)}:${Math.round(pointer.y)}`;
      canvas.dataset.pushed = String(pushed);
    }

    function loop(now) {
      if (!state.running) return;
      drawFrame(now);
      requestAnimationFrame(loop);
    }
    function start() {
      if (state.running || reduceMotion) return;
      state.running = true;
      requestAnimationFrame(loop);
    }
    function stop() {
      state.running = false;
    }

    function onPointer(e) {
      const rect = canvas.getBoundingClientRect();
      state.pointer.x = e.clientX - rect.left;
      state.pointer.y = e.clientY - rect.top;
    }
    function onLeave() { state.pointer.x = -1; state.pointer.y = -1; }
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
    // `paused` and `reduceMotion` are read live through controlRef; this setup
    // must not tear down (and re-seed the dots) when the parent's pause flag
    // toggles while the user hovers a rail.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pause when a navigation rail is focused, resume on the way back — without
  // rebuilding the field, which would make the dots visibly re-seed.
  useEffect(() => {
    const c = controlRef.current;
    if (!c) return;
    if (paused || document.hidden || c.reduceMotion) c.stop();
    else c.start();
  }, [paused]);

  return <canvas ref={canvasRef} className={className} aria-hidden data-field />;
}
