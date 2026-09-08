import { useEffect, useRef, useState } from "react";

export function useSceneProgress(ref, deps = []) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const r = el.getBoundingClientRect();
      const travel = r.height - window.innerHeight;
      if (travel <= 0) { setProgress(0); return; }
      setProgress(Math.min(1, Math.max(0, -r.top / travel)));
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(measure); };
    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(frame);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, ...deps]);

  return progress;
}

export const span = (x, a, b) => Math.min(1, Math.max(0, (x - a) / (b - a)));

export function entry(t, from = "up", distance = 44) {
  const d = (1 - t) * distance;
  const axis = {
    up: `translate3d(0, ${d}px, 0)`,
    down: `translate3d(0, ${-d}px, 0)`,
    left: `translate3d(${d}px, 0, 0)`,
    right: `translate3d(${-d}px, 0, 0)`,
    scale: `scale(${0.94 + 0.06 * t})`,
  }[from] ?? `translate3d(0, ${d}px, 0)`;
  return { opacity: t, transform: axis };
}

export function useTooTall(ref, deps = []) {
  const [tooTall, setTooTall] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setTooTall(el.scrollHeight > window.innerHeight - 24);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    window.addEventListener("resize", check);
    return () => { ro.disconnect(); window.removeEventListener("resize", check); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, ...deps]);
  return tooTall;
}
