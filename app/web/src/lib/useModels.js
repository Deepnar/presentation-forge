import { useEffect, useState } from "react";
import { api } from "../api.js";
import { getModelMode, subscribeModelMode } from "./modelMode.js";

/**
 * The model pickers' data source. Now AUTO (TCET qwen3.6) or CLOUD (BYOK).
 * Header toggle flips every picker without refetch; "auto" default is
 * qwen3.6 when auto key is present.
 */
export function useModels() {
  const [raw, setRaw] = useState({ models: [], default: "", cloud: null, auto: null });
  const [mode, setMode] = useState(getModelMode());

  useEffect(() => {
    api.models()
      .then((r) => setRaw({
        models: r.models ?? [],
        default: r.default ?? "",
        cloud: r.cloud ?? null,
        auto: r.auto ?? null,
      }))
      .catch(() => {});
    return subscribeModelMode(setMode);
  }, []);

  const autoOn = mode === "auto" && Boolean(raw.auto?.models?.length);
  const cloudOn = mode === "cloud" && Boolean(raw.cloud?.models?.length);
  const models = autoOn ? raw.auto.models : cloudOn ? raw.cloud.models : raw.models;
  const defaultModel = autoOn ? raw.auto.models[0] : cloudOn ? raw.cloud.models[0] : raw.default;
  return { models, cloud: raw.cloud, auto: raw.auto, mode, cloudOn, autoOn, defaultModel };
}
