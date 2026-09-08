import { createHash } from "node:crypto";
import path from "node:path";
import { CONFIG, BRAND, REFERENCE } from "./paths.js";

export function tenantId(email) {
  const normalized = String(email ?? "").trim().toLowerCase();
  if (!normalized) return null;
  return createHash("sha256").update(normalized).digest("hex").slice(0, 16);
}

export function userIdentityFile(email) {
  const id = tenantId(email);
  return id ? path.join(CONFIG, "identities", `${id}.yaml`) : null;
}

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

export function userReferenceDir(email) {
  const id = tenantId(email);
  return id ? path.join(REFERENCE, "users", id) : null;
}

export function resolveBrandPath(rel, root) {
  if (!rel) return null;
  if (path.isAbsolute(rel)) return rel;
  const normalized = String(rel).replace(/\\/g, "/");
  if (normalized === "brand" || normalized.startsWith("brand/")) {
    return path.join(BRAND, normalized.slice("brand".length).replace(/^\//, ""));
  }
  return path.join(root, normalized);
}
