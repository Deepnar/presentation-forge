import { api } from "../api.js";

let cache = [];
let loaded = false;
const listeners = new Set();

export const presetsStore = {
  get: () => cache,
  isLoaded: () => loaded,
  set: (list) => {
    cache = Array.isArray(list) ? list : [];
    loaded = true;
    listeners.forEach((fn) => fn(cache));
  },
  subscribe: (fn) => {
    listeners.add(fn);
    fn(cache);
    return () => listeners.delete(fn);
  },
  refresh: async () => {
    const r = await api.presets();
    presetsStore.set(r.presets ?? []);
    return r.presets ?? [];
  },
};
