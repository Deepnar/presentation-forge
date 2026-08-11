/** Human-friendly timestamps for the shell — relative time plus coarse date
 *  grouping for the sidebar. Full dates stay available as title tooltips. */

export function relative(ts) {
  const diff = Date.now() - new Date(ts).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return "yesterday";
  return `${d} d ago`;
}

export function dateGroup(ts) {
  const t = new Date(ts);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const deckStart = new Date(t.getFullYear(), t.getMonth(), t.getDate());
  const days = Math.round((todayStart - deckStart) / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return "This week";
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  if (deckStart >= monthStart) return "This month";
  return "Earlier";
}
