import { useEffect } from "react";

/** Nothing may stay hidden longer than this, whatever the observer does. */
const FAILSAFE_MS = 1600;

/**
 * Scroll-reveal for a whole subtree.
 *
 * One observer per section rather than a component per element: the landing
 * has ~70 revealed nodes and a wrapper around each costs a render pass to say
 * "add a class".
 *
 * THE PAGE MUST NEVER STAY BLANK. The displaced start state is real CSS, so
 * anything that stops the observer from firing leaves content invisible rather
 * than merely unanimated — and IntersectionObserver does not fire in a hidden
 * or prerendering tab, which is exactly the state a link-preview bot, a
 * background tab and a headless capture are all in. Three ways out, in order:
 * the observer for the normal case, an immediate reveal when the document is
 * hidden (there is no entrance to watch), and a failsafe timer for everything
 * else. `.js-reveal` itself is set by the pre-paint script, so a page whose
 * script never ran has no start state to be stuck in.
 *
 * Elements are unobserved once they land, so scrolling back up does not replay
 * the entrance; a section that re-animates every pass reads as a glitch.
 */
export function useReveal(ref, deps = []) {
  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    const pending = () => root.querySelectorAll(".reveal:not(.is-in)");
    const showAll = () => pending().forEach((el) => el.classList.add("is-in"));

    const els = pending();
    if (!els.length) return;

    // A hidden document paints nothing, so there is no entrance to stage — and
    // the observer would not fire to end one.
    if (document.hidden || !("IntersectionObserver" in window)) {
      showAll();
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.classList.add("is-in");
          io.unobserve(e.target);
        }
      },
      // Fire slightly before the element is fully in view, or the entrance
      // completes below the fold and only its last frame is ever seen.
      { rootMargin: "0px 0px -8% 0px", threshold: 0.04 },
    );
    els.forEach((el) => io.observe(el));

    const onHide = () => { if (document.hidden) showAll(); };
    document.addEventListener("visibilitychange", onHide);
    const failsafe = setTimeout(showAll, FAILSAFE_MS);

    return () => {
      io.disconnect();
      clearTimeout(failsafe);
      document.removeEventListener("visibilitychange", onHide);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
