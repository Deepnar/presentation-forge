// Trusted host code hydrates canonical engines; this is never a model-facing tool.
export { createDocument } from "../model/engine.ts";
export type { SlideScene } from "../model/scene.generated.ts";
export type { SourceRef } from '../model/source.generated.ts';
export { webSourceId } from '../model/source-identity.ts';
