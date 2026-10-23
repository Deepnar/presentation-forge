// Regenerate schema-backed TypeScript types for packages/model.
// JSON Schema is the source of truth; AJV validates at runtime; these
// files provide compile-time types only. Do not hand-edit the outputs.
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compile } from "json-schema-to-typescript";

const ROOT = new URL("..", import.meta.url);

function banner(schemaPath) {
  return `/* DO NOT EDIT — generated from ${schemaPath} by tools/v2-types.mjs.
 * JSON Schema is the source of truth; AJV owns runtime validation. */`;
}

export async function generateTypes({ write = true } = {}) {
  const targets = [
    { schema: "packages/agent/turn-submission.schema.json", out: "packages/agent/turn-submission.generated.ts", name: "TurnSubmission" },
    { schema: "packages/agent/turn-header.schema.json", out: "packages/agent/turn-header.generated.ts", name: "TurnHeader" },
    { schema: "packages/agent/turn-record.schema.json", out: "packages/agent/turn-record.generated.ts", name: "TurnRecord" },
    { schema: "packages/agent/turn-proposal.schema.json", out: "packages/agent/turn-proposal.generated.ts", name: "TurnProposal" },
    { schema: "packages/agent/turn-attempt.schema.json", out: "packages/agent/turn-attempt.generated.ts", name: "TurnAttempt" },
    { schema: "packages/agent/search-request.schema.json", out: "packages/agent/search-request.generated.ts", name: "SearchRequest" },
    { schema: "packages/agent/provider-run-request.schema.json", out: "packages/agent/provider-run-request.generated.ts", name: "ProviderRunRequest" },
    { schema: "packages/agent/conversation-request.schema.json", out: "packages/agent/conversation-request.generated.ts", name: "ConversationRequest" },
    { schema: "packages/agent/receipt.schema.json", out: "packages/agent/receipt.generated.ts", name: "RunReceipt" },
    { schema: "packages/agent/run-plan.schema.json", out: "packages/agent/run-plan.generated.ts", name: "RunPlan" },
    { schema: "packages/agent/run.schema.json", out: "packages/agent/run.generated.ts", name: "RunRecord" },
    { schema: "packages/tools/result.schema.json", out: "packages/tools/result.generated.ts", name: "ToolResult" },
    { schema: "packages/tools/request.schema.json", out: "packages/tools/request.generated.ts", name: "ToolRequest" },
    { schema: "packages/model/intent.schema.json", out: "packages/model/intent.generated.ts", name: "DeckIntent" },
    { schema: "packages/model/scene.schema.json", out: "packages/model/scene.generated.ts", name: "SlideScene" },
    { schema: "packages/model/project.schema.json", out: "packages/model/project.generated.ts", name: "Project" },
    { schema: "packages/model/artifact.schema.json", out: "packages/model/artifact.generated.ts", name: "Artifact" },
    { schema: "packages/model/file.schema.json", out: "packages/model/file.generated.ts", name: "FileRef" },
    { schema: "packages/model/source.schema.json", out: "packages/model/source.generated.ts", name: "SourceRef" },
    { schema: "packages/model/report.schema.json", out: "packages/model/report.generated.ts", name: "ReportSpec" },
    { schema: "packages/model/design.schema.json", out: "packages/model/design.generated.ts", name: "DesignSystem" },
  ];
  const results = [];
  for (const t of targets) {
    const schema = JSON.parse(await readFile(new URL(t.schema, ROOT), "utf8"));
    const ts = await compile(schema, t.name, {
      bannerComment: banner(t.schema),
      // Ignore schema maxItems for tuple-union generation (verified against
      // installed json-schema-to-typescript 15.0.1: maxItems -1 deletes the
      // schema maximum before generation but preserves minItems). Maximum
      // lengths stay enforced by AJV at runtime; the generated types keep
      // useful non-empty shapes without giant unions.
      maxItems: -1,
    });
    results.push({ ...t, ts: ts.endsWith("\n") ? ts : ts + "\n" });
    if (write) await writeFile(path.join(new URL(ROOT).pathname, t.out), results.at(-1).ts);
  }
  return results;
}

const run = process.argv[1] ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) : false;
if (run) {
  await generateTypes();
  console.log("v2 types generated");
}
