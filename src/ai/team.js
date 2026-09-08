
export function presentingNames(identity) {
  const members = identity?.team?.members ?? [];
  const named = members.filter((m) => m.name?.trim());
  const presenting = named.filter((m) => m.presenting);
  return (presenting.length ? presenting : named).map((m) => m.name.trim());
}

export function teamSize(identity) {
  const members = identity?.team?.members ?? [];
  return members.filter((m) => m.name?.trim()).length || 1;
}

export function targetSections(identity, { min = 3, max = 8 } = {}) {
  return Math.min(max, Math.max(min, teamSize(identity)));
}

export const DIVIDER_TYPES = new Set(["title", "section", "chapter", "closing", "epigraph"]);

export const FRONT_MATTER_TYPES = new Set(["agenda"]);

export function distributePresenters(slides, members, { slidesPerMember = null } = {}) {
  const names = (members ?? []).map(String).filter(Boolean);
  const out = new Array(slides.length).fill(null);
  if (!names.length) return out;

  const order = [];
  const bySection = new Map();
  for (let i = 0; i < slides.length; i++) {
    if (DIVIDER_TYPES.has(slides[i].type)) continue;
    const sec = slides[i].section ?? 0;
    if (!bySection.has(sec)) { bySection.set(sec, []); order.push(sec); }
    bySection.get(sec).push(i);
  }
  if (!order.length) return out;

  const n = names.length;
  const sizes = order.map((sec) => bySection.get(sec).length);
  const total = sizes.reduce((a, b) => a + b, 0);

  if (order.length > n) {
    const targets = slidesPerMember
      ? names.map(() => slidesPerMember)
      : balancedTargets(total, n);
    let m = 0;
    let run = 0;
    for (let i = 0; i < order.length; i++) {
      if (m < n - 1 && run > 0 && run + sizes[i] > targets[m]) { m++; run = 0; }
      const name = names[m];
      for (const idx of bySection.get(order[i])) out[idx] = name;
      run += sizes[i];
    }
  } else if (order.length === n && !slidesPerMember) {
    order.forEach((sec, i) => {
      for (const idx of bySection.get(sec)) out[idx] = names[i];
    });
  } else {
    const targets = balancedTargets(total, n);
    let m = 0;
    let run = 0;
    for (const idx of contentOrder(bySection, order)) {
      if (m < n - 1 && run > 0 && run >= targets[m]) { m++; run = 0; }
      out[idx] = names[m];
      run++;
    }
  }
  return out;
}

function balancedTargets(total, n) {
  const base = Math.floor(total / n);
  const rem = total % n;
  return Array.from({ length: n }, (_, i) => (i < rem ? base + 1 : base));
}

function contentOrder(bySection, order) {
  return order.flatMap((sec) => bySection.get(sec));
}

export function assignPresenters(deck, identity, slidesPerMember = null) {
  for (const s of deck.slides) {
    if (DIVIDER_TYPES.has(s.type)) delete s.presenter;
  }
  const presenters = presentingNames(identity);
  const assignment = distributePresenters(deck.slides, presenters, { slidesPerMember });
  for (let i = 0; i < deck.slides.length; i++) {
    if (assignment[i]) deck.slides[i].presenter = assignment[i];
  }
  return deck;
}
