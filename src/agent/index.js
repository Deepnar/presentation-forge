import { projectStore } from "../projects/backend.js";
import { createRuntime } from "../../packages/agent/runtime.ts";
import { createProviderRunner } from "../../packages/agent/provider-run.ts";

export async function agentRuntime() {
  return createRuntime(await projectStore());
}

export async function providerRunner(provider) {
  return createProviderRunner(await projectStore(), provider);
}
