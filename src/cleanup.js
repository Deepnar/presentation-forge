import { createHash } from "node:crypto";

/**
 * Which accounts a bulk cleanup may remove, and which it must not.
 *
 * Deleting accounts in bulk is the most destructive thing this admin panel can
 * do, and the failure mode is not "the wrong number" — it is a filter that
 * matched more than the operator read. So the selection is pure and testable,
 * every exclusion is reported with its reason rather than silently dropped, and
 * the caller cannot widen it: the safety rules below are not options.
 *
 * WHY "OWNS NOTHING" IS A RULE AND NOT A CHOICE. `deleteUserAccount` removes
 * the user row and everything that cascades from it — sessions, BYOK keys,
 * prefs, usage. It does NOT remove their decks, and nothing else does either:
 * `meta.owner` would go on naming an account that no longer exists, `canAccessDeck`
 * would show it to nobody but an admin, and the folder would sit on the volume
 * forever. An account that owns a deck therefore has to be dealt with
 * deliberately, one at a time, and this pass will not touch it. On the box this
 * was written for that costs nothing: 110 of 116 accounts owned nothing at all.
 */

/** A brand-new account is not a stale one, whatever else is true of it. */
export const MIN_AGE_DAYS = 7;

/**
 * @param {object} o
 * @param {Array}  o.users        every account, as `listUsers()` returns them
 * @param {Set}    o.deckOwners   emails that own at least one deck
 * @param {Set}    o.usedUserIds  ids with any recorded Auto usage
 * @param {Function} o.idFor      email -> internal id
 * @param {Array}  o.protect      emails that must survive regardless (the caller's own)
 * @param {number} o.olderThanDays age floor; clamped up to MIN_AGE_DAYS
 * @param {string} o.emailPattern optional plain substring, matched case-insensitively
 */
export function selectDeletableAccounts({
  users, deckOwners, usedUserIds, idFor,
  protect = [], olderThanDays = 30, emailPattern = "", now = Date.now(),
}) {
  // A caller asking for a shorter age than the floor gets the floor. The floor
  // is a safety rule, so it may only ever be made stricter.
  const ageDays = Math.max(Number(olderThanDays) || 0, MIN_AGE_DAYS);
  const cutoff = now - ageDays * 24 * 60 * 60 * 1000;
  const needle = String(emailPattern ?? "").trim().toLowerCase();
  const spared = new Set(protect.map((e) => String(e).trim().toLowerCase()));

  const selected = [];
  const skipped = [];
  for (const u of users) {
    const email = String(u.email).trim().toLowerCase();
    const reason = (r) => skipped.push({ email, reason: r });

    // Order matters only for which reason is reported; every check is a veto.
    if (u.admin) { reason("is an admin"); continue; }
    if (spared.has(email)) { reason("is you"); continue; }
    if (deckOwners.has(email)) { reason("owns decks"); continue; }
    const id = idFor(email);
    if (id && usedUserIds.has(id)) { reason("has generated"); continue; }
    const created = Date.parse(u.createdAt ?? "");
    // An unparseable creation date is not evidence of age.
    if (!Number.isFinite(created)) { reason("unknown age"); continue; }
    if (created > cutoff) { reason(`newer than ${ageDays} days`); continue; }
    if (needle && !email.includes(needle)) { reason("does not match the pattern"); continue; }

    selected.push({ email, name: u.name ?? "", createdAt: u.createdAt ?? null });
  }
  selected.sort((a, b) => a.email.localeCompare(b.email));
  return { selected, skipped, criteria: { olderThanDays: ageDays, emailPattern: needle } };
}

/**
 * A token that stands for one exact set of accounts.
 *
 * The confirmation has to authorise the list the operator actually read. Binding
 * it to the set — rather than to the filter that produced it — means anything
 * that changes the set between the preview and the confirm invalidates the
 * token: a signup, a deck created, an account promoted. The operator previews
 * again and reads the new list, which is the whole point of a dry run.
 */
export function selectionToken(selected) {
  const emails = selected.map((s) => s.email).sort();
  return createHash("sha256").update(JSON.stringify(emails)).digest("hex").slice(0, 32);
}

/** The exact words the operator must type. Includes the count, so a stale
 *  phrase cannot approve a larger set than the one that was read. */
export function confirmPhrase(count) {
  return `delete ${count} account${count === 1 ? "" : "s"}`;
}
