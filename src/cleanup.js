import { createHash } from "node:crypto";

export const MIN_AGE_DAYS = 7;

export function selectDeletableAccounts({
  users, deckOwners, usedUserIds, idFor,
  protect = [], olderThanDays = 30, emailPattern = "", now = Date.now(),
}) {
  const ageDays = Math.max(Number(olderThanDays) || 0, MIN_AGE_DAYS);
  const cutoff = now - ageDays * 24 * 60 * 60 * 1000;
  const needle = String(emailPattern ?? "").trim().toLowerCase();
  const spared = new Set(protect.map((e) => String(e).trim().toLowerCase()));

  const selected = [];
  const skipped = [];
  for (const u of users) {
    const email = String(u.email).trim().toLowerCase();
    const reason = (r) => skipped.push({ email, reason: r });

    if (u.admin) { reason("is an admin"); continue; }
    if (spared.has(email)) { reason("is you"); continue; }
    if (deckOwners.has(email)) { reason("owns decks"); continue; }
    const id = idFor(email);
    if (id && usedUserIds.has(id)) { reason("has generated"); continue; }
    const created = Date.parse(u.createdAt ?? "");
    if (!Number.isFinite(created)) { reason("unknown age"); continue; }
    if (created > cutoff) { reason(`newer than ${ageDays} days`); continue; }
    if (needle && !email.includes(needle)) { reason("does not match the pattern"); continue; }

    selected.push({ email, name: u.name ?? "", createdAt: u.createdAt ?? null });
  }
  selected.sort((a, b) => a.email.localeCompare(b.email));
  return { selected, skipped, criteria: { olderThanDays: ageDays, emailPattern: needle } };
}

export function selectionToken(selected) {
  const emails = selected.map((s) => s.email).sort();
  return createHash("sha256").update(JSON.stringify(emails)).digest("hex").slice(0, 32);
}

export function confirmPhrase(count) {
  return `delete ${count} account${count === 1 ? "" : "s"}`;
}
