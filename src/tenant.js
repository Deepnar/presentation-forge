import { createHash } from "node:crypto";
import path from "node:path";
import { CONFIG, BRAND, REFERENCE } from "./paths.js";

/**
 * Per-account storage for the things that used to be one global file.
 *
 * `config/identity.yaml` and `brand/logos` were written for a single-operator
 * install: one institution, one set of marks, one person editing them. On a
 * hosted box every logged-in account could overwrite both, so one user's
 * college appeared on another user's slides. These helpers give each account
 * its own identity file and its own brand directory; the global files stay as
 * the operator's default underneath.
 *
 * The directory name is a hash of the email rather than the email itself:
 * account addresses should not be readable from a directory listing or a
 * rendered asset URL, and a hash needs no path sanitising.
 */

export function tenantId(email) {
  const normalized = String(email ?? "").trim().toLowerCase();
  if (!normalized) return null;
  return createHash("sha256").update(normalized).digest("hex").slice(0, 16);
}

/** Where one account's identity overrides live. */
export function userIdentityFile(email) {
  const id = tenantId(email);
  return id ? path.join(CONFIG, "identities", `${id}.yaml`) : null;
}

/**
 * One account's brand directories, plus the identity-relative paths that point
 * at them. The relative form is what goes into the identity file, so it stays
 * portable across installs the same way the global `brand/generated/...`
 * defaults do.
 */
export function userBrandDirs(email) {
  const id = tenantId(email);
  if (!id) return null;
  return {
    id,
    logos: path.join(BRAND, "users", id, "logos"),
    generated: path.join(BRAND, "users", id, "generated"),
    rel: {
      banner: `brand/users/${id}/generated/banner.png`,
      crest: `brand/users/${id}/generated/crest.png`,
      crest_light: `brand/users/${id}/generated/crest-light.png`,
      watermark: `brand/users/${id}/generated/watermark.png`,
    },
  };
}

/**
 * Where one account's report template lives.
 *
 * The donor is the document a report is graded against — its headers, margins
 * and watermark become the report's — so it is institutional in exactly the way
 * identity and brand marks are. Install-wide, a box serving two colleges puts
 * one college's letterhead on the other's submission.
 *
 * An account with nothing here falls through to the install-wide REFERENCE,
 * which stays the operator's default and the only one the admin panel manages.
 */
export function userReferenceDir(email) {
  const id = tenantId(email);
  return id ? path.join(REFERENCE, "users", id) : null;
}

/**
 * Resolve an identity's asset path to a real file.
 *
 * Identity files address marks as `brand/...` relative paths so they survive
 * being copied between installs. Those must resolve against the *brand root*,
 * not the repo root: a container sets FORGE_BRAND_DIR to a volume outside the
 * image, and joining against ROOT there silently produced a missing-asset
 * warning and chrome with no institutional marks at all.
 */
export function resolveBrandPath(rel, root) {
  if (!rel) return null;
  if (path.isAbsolute(rel)) return rel;
  const normalized = String(rel).replace(/\\/g, "/");
  if (normalized === "brand" || normalized.startsWith("brand/")) {
    return path.join(BRAND, normalized.slice("brand".length).replace(/^\//, ""));
  }
  return path.join(root, normalized);
}
