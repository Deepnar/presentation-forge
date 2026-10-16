import schemaJson from "./scene.schema.json" with { type: "json" };
import { Ajv, type ValidateFunction } from "ajv";

let compiled: ValidateFunction | null = null;

// Browser builds replace this module with static code from the same schema;
// validation results and error formatting remain owned by scene.ts.
export function sceneValidator(): ValidateFunction {
  if (!compiled) compiled = new Ajv({ allErrors: true, strict: false }).compile(schemaJson);
  return compiled;
}
