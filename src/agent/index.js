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
