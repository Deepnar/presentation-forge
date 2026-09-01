import { useEffect, useRef, useState } from "react";

/**
 * How far through a pinned scene the reader has scrolled, 0 to 1.
 *
 * A scene is a tall wrapper containing one `position: sticky` frame. The
 * wrapper's height is the scroll budget; the frame holds still while it is
 * spent. This turns that spend into a number, and every scene animates off it
 * — so the whole page moves on one clock instead of each section inventing its
 * own timeline.
 *
 * Sticky rather than a pinned GSAP timeline on purpose: a pin rewrites the
 * document with spacer elements and takes ownership of the scroll, which
 * breaks on resize, on zoom, and under a touch fling. This is the browser
 * doing the same job natively, and it needs no second code path for reduced
 * motion — the position is the scroll, and there is no animation to disable.
 *
 * NOTE: any ancestor with overflow clipping turns itself into a scroll
 * container and the sticky frame will stick to THAT box instead of the
 * viewport, which reads as the scene vanishing and leaving a blank page.
 */
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
    // `deps` is not optional in practice. A scene that returns null until its
    // data arrives has no element on first render, so the effect binds to
    // nothing — and a ref identity never changes, so without a dep that moves
    // when the element finally mounts it never rebinds. The scene then sits at
    // progress 0 forever, which looks exactly like a scene that works but
    // never advances.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, ...deps]);

  return progress;
}

/** Map x from [a,b] onto [0,1], clamped. The scenes' only easing primitive. */
export const span = (x, a, b) => Math.min(1, Math.max(0, (x - a) / (b - a)));

/**
 * Entry transform for an element that has not fully arrived.
 *
 * `t` is 0 (fully out) to 1 (landed). Directions are deliberately varied
 * across a scene: everything rising by the same 18px is the house style of a
 * template, and reads as one block twitching rather than a composition
 * assembling.
 */
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

/**
 * Whether a scene's content is taller than the screen it would be pinned to.
 *
 * A pinned frame is exactly one viewport tall, so anything taller than that is
 * simply cut off — and on a phone every multi-column grid in here stacks and
 * becomes taller than that. When it does, the scene stops pinning and renders
 * as an ordinary section with everything visible: the pin is a way of spending
 * scroll, not a thing worth losing content over.
 *
 * Measured rather than keyed to a breakpoint, because a short desktop window
 * has the same problem as a tall phone and no media query catches both. The
 * measurement is stable across the switch: it reads the content's own natural
 * height, which pinning does not change.
 */
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

/**
 * A viewport too narrow for a scene whose pinned and stacked layouts are
 * genuinely different content.
 *
 * `useTooTall` is the better test where both layouts render the same DOM, but
 * it oscillates when they do not: measuring the stacked layout (taller by
 * construction) would keep the scene stacked forever. A query is stable
 * because it does not depend on what is currently rendered.
 */
export function useNarrow(query = "(max-width: 1023px)") {
  const [narrow, setNarrow] = useState(
    () => typeof window !== "undefined" && window.matchMedia?.(query).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return;
    const on = () => setNarrow(mq.matches);
    on();
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, [query]);
  return narrow;
}
