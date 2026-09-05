/**
 * What the free tier is CALLED, in one place.
 *
 * The tier was named for the institution that happened to supply its gateway:
 * the provider id was the literal `tcet-auto`, the key was
 * `FORGE_TCET_API_KEY`, and a `kind: "tcet"` reached a label in the browser.
 * That is fine while the only users are at that college and wrong the moment
 * anyone else is invited — an operator pointing Auto at their own endpoint
 * ends up with a config, an env var and a UI string all naming somebody else's
 * institution.
 *
 * Nothing about the tier is institutional. It is "the shared key the operator
 * pays for, rate-limited per user", which is a ROLE. So the role is the name.
 *
 * The old names are still read everywhere the new ones are, because a
 * deployment that already has `FORGE_TCET_API_KEY` in its compose file and
 * `tcet-auto` rows in its database must keep working across the upgrade
 * without anyone editing anything. `src/db.js` migrates the rows; this module
 * is what lets both spellings resolve in the meantime, and it is the only
 * place either string appears.
 */

/** The provider id, the `auto_events.provider` value, and the `global_keys`
 *  row key. */
export const AUTO_PROVIDER = "auto";

/** What it used to be. Read, never written. */
export const LEGACY_AUTO_PROVIDER = "tcet-auto";

/** The environment variable holding the shared key, and its predecessor. */
export const AUTO_KEY_ENV = "FORGE_AUTO_API_KEY";
export const LEGACY_AUTO_KEY_ENV = "FORGE_TCET_API_KEY";

/** Both spellings, for a lookup that has to accept either. */
export const AUTO_PROVIDER_IDS = [AUTO_PROVIDER, LEGACY_AUTO_PROVIDER];

/** Whether a provider id names the shared tier, under either spelling. */
export const isAutoProviderId = (id) => AUTO_PROVIDER_IDS.includes(String(id ?? ""));

/**
 * The first of several provider ids present in a map — new name first, so an
 * install that has migrated stops consulting the old one, and one that has not
 * still resolves.
 */
export function pickAutoProvider(providers = {}) {
  for (const id of AUTO_PROVIDER_IDS) {
    if (providers?.[id]) return { id, spec: providers[id] };
  }
  return null;
}
