import { api } from "../api.js";

/**
 * The user's saved briefing formats, shared across surfaces. Settings edits
 * presets without a chat open; the briefing's "Use a saved format?" list must
 * see those edits the moment the modal closes. A tiny pub/sub cache is the
 * same pattern as modelMode — Settings writes through it, ChatView subscribes.
 */
let cache = [];
const listeners = new Set();

export const presetsStore = {
  get: () => cache,
  set: (list) => {
    cache = Array.isArray(list) ? list : [];
    listeners.forEach((fn) => fn(cache));
  },
  subscribe: (fn) => {
    listeners.add(fn);
    fn(cache);
    return () => listeners.delete(fn);
  },
  /** Pull the server's list and publish it. Returns the list. */
  refresh: async () => {
    const r = await api.presets();
    presetsStore.set(r.presets ?? []);
    return r.presets ?? [];
  },
};
