// A project's speaker script (F7): the words a presenter says for each
// slide, written by the deck script's own writer from the project's
// research (its source-of-truth files, its slides, its other files) and
// returned per slide for the editor to put into the slides' notes — one
// undoable step, so the script lives where a presenter reads it.
// Notes the person wrote themselves are left alone unless they ask.
import { projectStore } from "./backend.js";
import { projectReportInputs, slideText } from "./report.js";
import { writeSlideScript } from "../ai/script.js";
import { chatJSON } from "../ai/ollama.js";

const refuse = (code, message) => Object.assign(new Error(message), { code });

// The legacy writer reads a deck slide; a scene becomes one that says what
// the audience sees, and whether it is a transition or a content slide.
function deckSlide(scene) {
  const { title, body } = slideText(scene);
  const divider = scene.recipeId === "divider";
  return { type: divider ? "section" : "content", headline: title || undefined, ...(body ? { text: body } : {}) };
}

// `scenes` is the deck as the editor has it (unsaved edits included);
// without it the stored project. Yields { slideId, words } or
// { slideId, skipped, reason } per slide, in order.
export async function* writeProjectScript({ owner = null, admin = false, id, scenes = null, overwrite = false, model, signal, chat } = {}) {
  const store = await projectStore();
  const { doc } = await store.getProject({ owner, admin, id });
  if (!doc) throw refuse("not-found", "no such project");
  const deck = Array.isArray(scenes) && scenes.length ? scenes : doc.scenes;
  const { inputs } = await projectReportInputs({ owner, admin, id, model });
  const slides = deck.map(deckSlide);
  const title = doc.title;
  for (const [i, scene] of deck.entries()) {
    if (signal?.aborted) return;
    if (scene.notesEdited && scene.notes?.trim() && !overwrite) {
      yield { slideId: scene.id, skipped: true, reason: "your own notes" };
      continue;
    }
    if (!slides[i].headline && !slides[i].text) {
      yield { slideId: scene.id, skipped: true, reason: "no words on the slide" };
      continue;
    }
    try {
      const words = await writeSlideScript({
        deck: { title, slides }, plan: { sections: [] }, slide: slides[i], index: i,
        presenter: null, research: inputs.research, model, signal, chat: chat ?? chatJSON,
      });
      yield { slideId: scene.id, words: String(words).slice(0, 20000) };
    } catch (err) {
      if (signal?.aborted) return;
      yield { slideId: scene.id, skipped: true, reason: err.message.slice(0, 120) };
    }
  }
}
