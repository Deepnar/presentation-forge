import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv";
import standalone from "ajv/dist/standalone/index.js";

const model = fileURLToPath(new URL("../../packages/model/", import.meta.url));
const boundary = path.join(model, "scene-validator.ts");
const schema = path.join(model, "scene.schema.json");
const virtualId = "\0forge-scene-validator";

export function browserSceneValidatorSource() {
  const ajv = new Ajv({ allErrors: true, strict: false, code: { source: true, esm: true } });
  const validate = ajv.compile(JSON.parse(readFileSync(schema, "utf8")));
  let source = standalone(ajv, validate);
  source = source.replace(/const (\w+) = require\("(ajv\/dist\/runtime\/[a-zA-Z0-9_-]+)"\)\.default;/g, (_match, name, module) =>
    `import * as ${name}Module from "${module}.js"; const ${name} = ${name}Module.default?.default ?? ${name}Module.default;`);
  if (/\brequire\s*\(|\beval\s*\(|\bnew Function\b/.test(source)) throw new Error("scene validator contains a runtime code-generation dependency");
  return `${source}\nexport function sceneValidator() { return validate; }\n`;
}

export function sceneValidatorPlugin() {
  return {
    name: "forge-static-scene-validator",
    enforce: "pre",
    resolveId(source, importer) {
      if (importer && path.resolve(path.dirname(importer.split("?")[0]), source) === boundary) return virtualId;
    },
    load(id) {
      if (id !== virtualId) return;
      this.addWatchFile(schema);
      return browserSceneValidatorSource();
    },
    handleHotUpdate(context) {
      if (context.file !== schema) return;
      const module = context.server.moduleGraph.getModuleById(virtualId);
      if (module) context.server.moduleGraph.invalidateModule(module);
      context.server.ws.send({ type: "full-reload" });
      return [];
    },
  };
}
