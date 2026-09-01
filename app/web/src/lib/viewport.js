import { useEffect, useState } from "react";

/**
 * A viewport narrower than the given query.
 *
 * Used where a layout is genuinely different below a width rather than merely
 * reflowed — a sidebar that becomes a drawer, a pinned scene that becomes a
 * stack. Where the two layouts render the same content, measure it instead;
 * a query cannot see a short window and a measurement can.
 */
export function useNarrow(query = "(max-width: 767px)") {
  const [narrow, setNarrow] = useState(
    () => typeof window !== "undefined" && Boolean(window.matchMedia?.(query).matches),
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
