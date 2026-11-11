// The one import request every path into the editor uses for a generated
// deck — finishing a generation, the Open in editor button, the CLI — so
// they all create or reopen the same project instead of each making a copy.
export const EDITOR_IMPORT_REQUEST_ID = "browser-editor-v1";
