import { projectStore } from "../projects/backend.js";
import { createRuntime } from "../../packages/agent/runtime.ts";

export async function agentRuntime() {
  return createRuntime(await projectStore());
}
