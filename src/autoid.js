
export const AUTO_PROVIDER = "auto";

export const LEGACY_AUTO_PROVIDER = "tcet-auto";

export const AUTO_KEY_ENV = "FORGE_AUTO_API_KEY";
export const LEGACY_AUTO_KEY_ENV = "FORGE_TCET_API_KEY";

export const AUTO_PROVIDER_IDS = [AUTO_PROVIDER, LEGACY_AUTO_PROVIDER];

export const isAutoProviderId = (id) => AUTO_PROVIDER_IDS.includes(String(id ?? ""));

export function pickAutoProvider(providers = {}) {
  for (const id of AUTO_PROVIDER_IDS) {
    if (providers?.[id]) return { id, spec: providers[id] };
  }
  return null;
}
