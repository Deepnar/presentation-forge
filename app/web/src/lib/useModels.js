import { useEffect, useState } from "react";
import { api } from "../api.js";
import { getModelMode, subscribeModelMode } from "./modelMode.js";

export function anonymizeModel(name) {
  if (!name) return name;
  const n = String(name).toLowerCase();
  if (n.includes("qwen") || n.includes("tcet") || n === "auto") return "Forge";
  return name;
}

/**
 * The model pickers' data source. Now AUTO (Forge hosted) or CLOUD (BYOK).
 * Header toggle flips every picker without refetch; "auto" default is
 * the hosted model when the gateway key is present.
 */
export function useModels() {
  const [raw, setRaw] = useState({ models: [], default: "", cloud: null, auto: null, hosted: false });
  const [mode, setMode] = useState(getModelMode());

  useEffect(() => {
    api.models()
      .then((r) => setRaw({
        models: r.models ?? [],
        default: r.default ?? "",
        cloud: r.cloud ?? null,
        auto: r.auto ?? null,
        hosted: Boolean(r.hosted),
      }))
      .catch(() => {});
    return subscribeModelMode(setMode);
  }, []);

  const autoOn = mode === "auto" && Boolean(raw.auto?.models?.length);
  const cloudOn = mode === "cloud" && Boolean(raw.cloud?.models?.length);
  // Hosted has no local Ollama — raw.models is always [] there, so the
  // fallback to raw.models naturally hides the local list.
  const models = autoOn ? raw.auto.models : cloudOn ? raw.cloud.models : raw.models;
  const rawDefault = autoOn ? raw.auto.models[0] : cloudOn ? raw.cloud.models[0] : raw.default;
  const defaultModel = anonymizeModel(rawDefault);
  return { models, cloud: raw.cloud, auto: raw.auto, mode, cloudOn, autoOn, hosted: raw.hosted, defaultModel, rawDefault };
}
