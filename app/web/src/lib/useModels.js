import { useEffect, useState } from "react";
import { api } from "../api.js";
import { getModelMode, subscribeModelMode } from "./modelMode.js";

/**
 * The model pickers' data source. Fetches the grouped local+cloud model list
 * once, then filters it to the active mode (LOCAL/CLOUD) reactively — so the
 * header toggle takes effect in every picker without each one re-fetching. The
 * "auto" default also follows the mode: the author role's local default in
 * LOCAL mode, the cloud provider's first model in CLOUD mode.
 */
export function useModels() {
  const [raw, setRaw] = useState({ models: [], default: "", cloud: null });
  const [mode, setMode] = useState(getModelMode());

  useEffect(() => {
    api.models()
      .then((r) => setRaw({
        models: r.models ?? [],
        default: r.default ?? "",
        cloud: r.cloud ?? null,
      }))
      .catch(() => {});
    return subscribeModelMode(setMode);
  }, []);

  const cloudOn = mode === "cloud" && Boolean(raw.cloud?.models?.length);
  const models = cloudOn ? raw.cloud.models : raw.models;
  const defaultModel = cloudOn ? raw.cloud.models[0] : raw.default;
  return { models, cloud: raw.cloud, mode, cloudOn, defaultModel };
}
