import { useEffect } from "react";

const FAILSAFE_MS = 1600;

export function useReveal(ref, deps = []) {
  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    const pending = () => root.querySelectorAll(".reveal:not(.is-in)");
    const showAll = () => pending().forEach((el) => el.classList.add("is-in"));

    const els = pending();
    if (!els.length) return;

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
