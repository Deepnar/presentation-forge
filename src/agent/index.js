import { projectStore } from "../projects/backend.js";
import { createRuntime } from "../../packages/agent/runtime.ts";
import { createProviderRunner } from "../../packages/agent/provider-run.ts";

export async function agentRuntime() {
  return createRuntime(await projectStore());
}

export async function providerRunner(provider) {
  return createProviderRunner(await projectStore(), provider);
}

export async function turnService() {
  const { createTurnService } = await import("../../packages/agent/turns.ts");
  return createTurnService(await projectStore());
}

export async function turnWorker(provider) {
  const { createTurnWorker } = await import("../../packages/agent/turn-worker.ts");
  return createTurnWorker(await projectStore(), provider);
}

export async function turnDiscovery() {
  const { createTurnDiscovery } = await import('../../packages/agent/turn-discovery.ts');
  return createTurnDiscovery(await projectStore());
}

export async function turnPickup() {
  const { autoHostEnabled } = await import('./auto-host-policy.js');
  if (!autoHostEnabled()) throw Object.assign(new Error('Host pickup is disabled.'), { code: 'host-disabled' });
  const { createAutoHostPickup } = await import('./host-pickup.js');
  return createAutoHostPickup(await projectStore());
}
