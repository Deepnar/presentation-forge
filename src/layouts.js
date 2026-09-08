
import { layouts as core } from "./layouts/core.js";
import { layouts as listsData } from "./layouts/lists-data.js";
import { layouts as processDiagrams } from "./layouts/process-diagrams.js";
import { layouts as special } from "./layouts/special.js";

export { content } from "./layouts/helpers.js";

export const layouts = {
  ...core,
  ...listsData,
  ...processDiagrams,
  ...special,
};
