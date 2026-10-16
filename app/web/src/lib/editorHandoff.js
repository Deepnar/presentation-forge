export const EDITOR_IMPORT_REQUEST_ID = "browser-editor-v1";

export function handoffError(error) {
  let message;
  switch (error.code) {
    case "import-source-changed": message = "The original deck has changed since its editable copy was created. Open the saved copy from Projects; your edits have been kept."; break;
    case "import-target-deleted": message = "The editable copy was deleted. The original deck is still available."; break;
    case "source-incomplete":
    case "source-changed": message = "The deck is still being finalized or changed. Wait for it to finish, then try again."; break;
    default:
      if (error.status === 401) message = "Sign in again to open this deck in the editor.";
      else if (error.status === 403) message = error.message || "This account cannot open this deck in the editor.";
      else if (error.status === 404) message = "This deck is unavailable to this account.";
      else if (error.status === 422) message = "This deck cannot be opened in the editor yet. The original deck is unchanged.";
      else if (error.status === 503) message = "Project storage is unavailable. Try again later; the original deck is unchanged.";
      else message = "The editable project could not be opened. Try again safely, or use the original deck.";
  }
  const details = Array.isArray(error.errors) ? error.errors.flatMap(item => {
    if (typeof item === "string") return [item.slice(0, 1000)];
    return typeof item?.reason === "string" ? [`${typeof item.path === "string" ? `${item.path}: ` : ""}${item.reason}`.slice(0, 1000)] : [];
  }) : [];
  return { message, details };
}

// The receipt is durable on the server; local state only owns this view's work.
export function createEditorHandoff({ slug, mode, request, navigate, current = () => true, update = () => {}, invalidated = () => {} }) {
  let live = true, flight = null;
  const active = () => {
    if (!live) return false;
    if (current()) return true;
    live = false; invalidated(); return false;
  };
  return {
    open() {
      if (!active()) return Promise.resolve(false);
      if (flight) return flight;
      update({ status: "opening" });
      flight = Promise.resolve().then(async () => {
        if (!active()) return false;
        try {
          const result = await request(slug, { requestId: EDITOR_IMPORT_REQUEST_ID, mode: mode === true || mode === "dark" ? "dark" : "light" });
          if (!active()) return false;
          if (typeof result?.project?.id !== "string" || !result.project.id) throw new Error("missing project identity");
          const opened = await navigate(result.project.id);
          if (active()) update({ status: "idle", message: opened ? "" : "Your editable project is available from Projects. Navigation was cancelled." });
          return !!opened;
        } catch (error) {
          if (active()) update({ status: "error", ...handoffError(error) });
          return false;
        } finally { flight = null; }
      });
      return flight;
    },
    dispose() { live = false; },
  };
}
