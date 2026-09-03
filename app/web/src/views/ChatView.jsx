import { forwardRef, useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { Button, Panel, Spinner, Badge, inputCls } from "../components/ui.jsx";
import ThemeMiniCard from "../components/ThemeMiniCard.jsx";
import SlideSelectPanel from "../components/SlideSelectPanel.jsx";
import Lightbox from "../components/Lightbox.jsx";
import { ChevronDown, DocIcon, LayersIcon, PanelLeftOpen, SparkleIcon } from "../components/icons.jsx";
import { useModels, anonymizeModel } from "../lib/useModels.js";
import { progressLabel } from "../lib/progress.js";
import { BRIEFING_QUESTIONS, REPORT_QUESTIONS, PRESET_KEYS, questionsFor, initialBriefing, suggestTitle, echoAnswer, applyPresetToBriefing, effectiveBriefStep, presetPayload, briefingAnsweredText, tierQuestions, optionalAnswered, briefTier, stepForTier, isAnswered } from "../lib/briefing.js";
import { runs } from "../lib/runs.js";
import { deckContext } from "../lib/deckContext.js";
import { presetsStore } from "../lib/presets.js";
import { parseSlashCommand, SLASH_HELP, looksLikeSlash } from "../lib/slash.js";

const DENSITIES = [
  { id: "sparse", note: "few words, mostly visuals" },
  { id: "balanced", note: "a sentence or two per point" },
  { id: "dense", note: "fuller sentences, more per slide" },
];
const SLIDE_COUNTS = [0, 8, 12, 16, 20];
const PER_MEMBER = [null, 1, 2, 3];
const DECK_SUGGESTIONS = [
  "Green hydrogen: how electrolysis technologies compare",
  "Real-time ray tracing and the future of rasterisation",
  "Mechanical keyboards: ergonomics of typing",
];

function phaseOf(chat, effStep, questions) {
  const briefingOpen = briefTier(chat.kind, chat.briefStep) !== "done";
  if (chat.kind === "report") {
    if (chat.produced) return "record";
    if (!chat.topic) return "greeting";
    return briefingOpen ? "briefing" : "summary";
  }
  if (chat.produced) return "editing"; // the deck exists — the thread edits it
  if (chat.plan) return "outline";
  if (!chat.topic) return "greeting";
  return briefingOpen ? "briefing" : "summary";
}

/**
 * The sidebar row's name. The deck title wins once the briefing has one (the
 * user can edit it on the title card); before that the topic's first sentence
 * names the chat so the list reads as "about what", never as "New chat".
 */
function chatName(title, topic) {
  // The deck title wins once the briefing has one; an EMPTY title must still
  // fall back to the topic — ?? treats "" as a real value and would leave a
  // report chat named "New chat" forever.
  const t = String((title ?? "").trim() || (topic ?? "").trim()).replace(/\s+/g, " ").trim();
  if (!t) return "New chat";
  return t.length > 48 ? `${t.slice(0, 45).trimEnd()}…` : t;
}

/**
 * The chat window IS the app. A message thread with the input bar at the
 * bottom, like Claude/ChatGPT: send a topic, the assistant asks the deck-briefing
 * questions one at a time (each with a default and a choose/type affordance),
 * then a summary card with "Plan the deck" — the ONLY trigger of research and
 * planning. The outline comes back in the thread with a plain-language card per
 * slide, approve streams the generation, and "Open the deck" lands on it.
 *
 * Nothing before "Plan the deck" touches the network: adding a team member is
 * a pure local state change, verified by the CDP flow in the handoff.
 */
export default function ChatView({
  chat, identity, onChatChanged, onOpenDeck, onOpenReport, onDeckChanged,
  leftOpen, onToggleLeft, onOpenSettings, unverified = false,
}) {
  const [themes, setThemes] = useState([]);
  const [types, setTypes] = useState({});
  const [presets, setPresets] = useState(presetsStore.get());
  const [input, setInput] = useState("");
  const [freeHint, setFreeHint] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState(chat.error ?? "");
  const [job, setJob] = useState(null);
  const [draftPlan, setDraftPlan] = useState(null);
  const [presetSaveState, setPresetSaveState] = useState({ status: "idle" });
  const { models, auto, mode: modelMode, cloudOn, hosted, defaultModel } = useModels();
  // Whichever mode is selected, is it actually able to run? Hosted has no
  // Ollama to fall back to, so an unconfigured mode is a dead end rather than
  // a slow path, and that is the only case worth interrupting anyone about.
  const needsKey = modelMode === "auto" ? !auto?.keySet : !cloudOn;

  /** Flip Auto <-> Cloud. Route first, then the client store, so a failed
   *  write does not leave the picker claiming a mode the server never took. */
  async function switchMode() {
    const next = modelMode === "cloud" ? "auto" : "cloud";
    const { setModelMode } = await import("../lib/modelMode.js");
    try { await api.cloudRoute(next); } catch { return; }
    setModelMode(next);
    if (next === "auto") {
      setModel("");
      persist({ ...chat, model: undefined, updatedAt: new Date().toISOString() });
    }
  }
  const [model, setModel] = useState(chat.model ?? "");
  // The slide-selection panel: the deck's content + previews (fetched when the
  // deck is ready), which slides the user has picked, and the enlarged slide.
  const [deckData, setDeckData] = useState(null); // { slides:[{type,headline}], thumbs:[] }
  const [selected, setSelected] = useState(() => new Set(chat.selectedSlides ?? []));
  const [openIndex, setOpenIndex] = useState(null); // enlarged slide in the panel
  const [punching, setPunching] = useState(false);
  const [swapping, setSwapping] = useState(false);
  const [swapOpen, setSwapOpen] = useState(false); // the type-picker modal
  // The deck's generation-run state (server-reported): whether a run is live,
  // how many slides are written, and whether a complete-but-unfinalised deck
  // needs the finalize pass. This is what lets a reload offer "resume" or
  // "finalize" instead of only a fresh run.
  const [deckRun, setDeckRun] = useState(null);
  const [panelOpen, setPanelOpen] = useState(() => {
    try { return localStorage.getItem("forge.panelOpen") !== "0"; } catch { return true; }
  });
  const autoAttachedRef = useRef(false);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const chatRef = useRef(chat);

  useEffect(() => {
    try { localStorage.setItem("forge.panelOpen", panelOpen ? "1" : "0"); } catch {}
  }, [panelOpen]);
  useEffect(() => {
    const onToggle = () => setPanelOpen((v) => !v);
    window.addEventListener("forge:togglePanel", onToggle);
    return () => window.removeEventListener("forge:togglePanel", onToggle);
  }, []);

  useEffect(() => { chatRef.current = chat; }, [chat]);

  // A generation started while this chat was open keeps running after the view
  // unmounts — the server pipeline persists plan/deck as it goes and the run
  // lives in the module-level registry. On re-entry, adopt the live run so the
  // user sees it working (or its persisted result) instead of a stale briefing.
  useEffect(() => {
    const run = runs.get(chat.id);
    if (!run) return;
    if (run.finished) { runs.end(chat.id); return; }
    setBusy(true);
    setStatus(run.status);
    const onPatch = (patch) => { setBusy(true); if (patch.status != null) setStatus(patch.status); };
    runs.subscribe(chat.id, onPatch);
    return () => runs.unsubscribe(chat.id, onPatch);
  }, [chat.id]);

  useEffect(() => {
    api.themes().then((r) => setThemes(r.themes)).catch(() => {});
    api.types().then((r) => setTypes(r.descriptions ?? {})).catch(() => {});
    // Presets are shared with Settings — an edit there is live here.
    presetsStore.refresh().then((list) => setPresets(list)).catch(() => {});
    return presetsStore.subscribe(setPresets);
  }, []);

  useEffect(() => { setDraftPlan(chat.plan); }, [chat.plan]);

  // Poll the deck's run state whenever the chat is between a plan and a
  // produced deck — a dropped SSE leaves the run alive server-side, and this is
  // how a reload finds it. Refreshed while a run is active so it flips to
  // "finalize"/"ready" the moment the writer finishes without the user touching
  // anything.
  useEffect(() => {
    if (!chat.deckSlug || chat.produced) { setDeckRun(null); return; }
    let live = true;
    const poll = () => {
      api.deck(chat.deckSlug)
        .then((r) => { if (live) setDeckRun(r.run ?? null); })
        .catch(() => {});
    };
    poll();
    const id = setInterval(poll, 3000);
    return () => { live = false; clearInterval(id); };
  }, [chat.deckSlug, chat.produced, busy, chat.turns?.length]);

  // Reconnect: a run that is live server-side (a reload dropped our SSE, the
  // pipeline kept going) is re-attached once automatically, so the refresh
  // resumes watching instead of starting a fresh generation.
  useEffect(() => {
    if (!deckRun?.active || autoAttachedRef.current) return;
    autoAttachedRef.current = true;
    resumeRun();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deckRun?.active]);

  // Fetch the deck's content + previews when the deck is ready (and after each
  // turn, so the panel reflects the latest render). Selection is kept in the
  // chat itself so it survives navigation; the focused slide from the deck
  // view's lightbox is adopted as a starting selection.
  useEffect(() => {
    if (!chat.produced || !chat.deckSlug) return;
    let live = true;
    api.deck(chat.deckSlug)
      .then((r) => {
        if (!live) return;
        const stamp = Date.now();
        setDeckData({
          slides: r.deck?.slides ?? [],
          plates: (r.slides ?? []).map((s) => `${s}?t=${stamp}`),
          thumbs: (r.thumbs ?? []).map((s) => `${s}?t=${stamp}`),
        });
        const f = deckContext.focusedSlide(chat.deckSlug);
        if (f != null && selected.size === 0) setOpenIndex(f.index);
      })
      .catch(() => {});
    return () => { live = false; };
    // selected.size is intentionally not a dep: adopting focus only on first load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat.produced, chat.deckSlug, chat.turns?.length]);

  // Persist the selection onto the chat so re-entering the thread restores it.
  useEffect(() => {
    const saved = chatRef.current.selectedSlides ?? [];
    const same = saved.length === selected.size && saved.every((i) => selected.has(i));
    if (chatRef.current.produced && chatRef.current.deckSlug && !same) {
      persist({ ...chatRef.current, selectedSlides: [...selected] });
    }
    // persist() writes through onChatChanged which re-renders; only run on
    // selection change, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [chat, status, busy, themes.length]);

  const questions = questionsFor(chat.kind);
  const phase = phaseOf(chat, effectiveBriefStep(chat.briefing ?? {}, chat.briefStep, questions), questions);

  const themeLabel = (name) => {
    if (!name) return "Default (warm-humanist)";
    return themes.find((t) => t.name === name)?.label ?? name;
  };

  const presetById = (id) => presets.find((p) => p.id === id) ?? null;
  const presetLabel = (id) => presetById(id)?.name ?? id;

  function persist(updated) {
    onChatChanged(updated);
  }

  /**
   * Where the briefing starts. "Use a saved format, or start fresh?" has
   * exactly one answer until the account has saved one, so on a new account
   * the first thing the product ever asks is a question that cannot be
   * answered two ways. Skip it — but only once the list has actually been
   * fetched, since an empty cache is also what "still loading" looks like,
   * and hiding a real choice is the worse of the two mistakes.
   */
  function firstBriefStep() {
    // Always the required tier. This used to return 1 to step over the preset
    // question on an account with none, and 1 is now the OPTIONAL tier — the
    // briefing opened on "anything else?" having asked nothing. tierQuestions()
    // drops the preset field itself when there is nothing to choose from, so
    // the skip has no work left to do here.
    return stepForTier(chat.kind, "required");
  }

  /** Topic sent → the briefing begins. Title is pre-suggested, editable. */
  function sendTopic(text) {
    const title = suggestTitle(text);
    const briefing = initialBriefing(identity);
    persist({
      ...chat,
      topic: text,
      title: chatName(title, text),
      briefing: { ...briefing, title },
      briefStep: firstBriefStep(),
      updatedAt: new Date().toISOString(),
    });
  }

  /** A briefing field touched inside a tier form: store it, stay put. The
   *  form owns when to move on, not the field. */
  function patchBriefing(patch) {
    const briefing = { ...(chat.briefing ?? {}), ...patch };
    persist({
      ...chat,
      title: patch.title ? chatName(patch.title, chat.topic) : chat.title,
      briefing,
      updatedAt: new Date().toISOString(),
    });
  }

  /** Leave a tier. `required` hands over to `optional`; `optional` to the summary. */
  function finishTier(tier) {
    persist({ ...chat, briefStep: stepForTier(chat.kind, tier === "required" ? "optional" : "done"), updatedAt: new Date().toISOString() });
  }

  /** Jump back to an earlier question — later answers are re-asked. */
  function editAt(i) {
    const q = questions[i];
    // Rewinding to a preset-fixed question un-skips it so the user can change
    // the preset's value for this deck without abandoning the whole format.
    const briefing = q && PRESET_KEYS.includes(q.key)
      ? { ...(chat.briefing ?? {}), unskip: [...(chat.briefing?.unskip ?? []), q.key] }
      : (chat.briefing ?? {});
    persist({ ...chat, briefing, briefStep: Math.min(i, questions.length), updatedAt: new Date().toISOString() });
  }

  /**
   * "Use a saved format?" — the briefing's first question. Picking a preset
   * pre-fills the fixed fields (team, guide, academic, theme, density,
   * branding, slides-per-member) and skips those questions; picking none
   * starts a fresh briefing. Either way the walk continues from the title.
   */
  function pickPreset(preset) {
    const briefing = preset
      ? applyPresetToBriefing(chat.briefing ?? {}, { ...preset, id: preset.id })
      : (chat.briefing ?? {});
    persist({
      ...chat,
      briefing: { ...briefing, presetId: preset?.id ?? null },
      briefStep: 1,
      updatedAt: new Date().toISOString(),
    });
  }

  /** Save the current briefing's fixed fields as a named preset. */
  async function saveAsPreset(name) {
    const clean = String(name ?? "").trim();
    if (!clean) return;
    setPresetSaveState({ status: "saving" });
    try {
      const existing = presets.find((p) => p.name.toLowerCase() === clean.toLowerCase());
      const saved = existing
        ? await api.updatePreset(existing.id, { ...presetPayload(chat.briefing ?? {}), name: clean })
        : await api.savePreset({ ...presetPayload(chat.briefing ?? {}), name: clean });
      const list = existing
        ? presets.map((p) => (p.id === saved.preset?.id ? saved.preset : p))
        : [saved.preset, ...presets];
      setPresets(list);
      presetsStore.set(list);
      setPresetSaveState({ status: "saved" });
    } catch (err) {
      setPresetSaveState({ status: "error", message: err.message });
    }
  }

  async function deletePreset(id) {
    try {
      await api.deletePreset(id);
      const list = presets.filter((p) => p.id !== id);
      setPresets(list);
      presetsStore.set(list);
    } catch (err) {
      window.alert(`Could not delete preset: ${err.message}`);
    }
  }

  function densityNote(d) {
    return DENSITIES.find((x) => x.id === d)?.note ?? d;
  }

  /** The ONLY trigger of research/planning. Everything before this was local. */
  function planDeck() {
    const b = chat.briefing ?? {};
    let brief = chat.topic;
    const notes = [];
    if (b.thesis?.trim()) notes.push(`Thesis / takeaway that must land on the final slides: ${b.thesis.trim()}. Every slide must serve this claim and the conclusion must land it.`);
    if (b.density !== "balanced") notes.push(`Keep the slides ${b.density} density — ${densityNote(b.density)}.`);
    if (b.slidesPerMember) notes.push(`Distribute the CONTENT slides (not section dividers) roughly evenly, about ${b.slidesPerMember} per presenting member.`);
    if (b.audience?.trim()) notes.push(`The deck is for: ${b.audience.trim()}. Write to that audience and make sure they leave having absorbed it.`);
    if (b.emphasis?.trim()) notes.push(`Emphasis: ${b.emphasis.trim()}. These parts matter most — give them the most slides and the deepest treatment.`);
    if (b.evidence?.trim()) notes.push(`Figures/sources/constraints to respect — never invent beyond these: ${b.evidence.trim()}`);
    if (notes.length) brief = `${chat.topic}\n\n${notes.join(" ")}`;

    setBusy(true);
    setError("");
    setStatus("Queued…");
    runs.begin(chat.id, { abort: () => {}, status: "Queued…" });
    const j = api.createDeck(
      {
        brief,
        // The full briefing record, explicit — every answered question reaches
        // the planner verbatim ("The user answered: …"), not just the topic.
        briefing: briefingAnsweredText(b, themeLabel),
        maxSlides: b.maxSlides || undefined,
        theme: b.theme || undefined,
        research: b.research,
        researchSource: b.researchSource,
        upload: b.uploadedSource,
        papers: b.papers,
        slidesPerMember: b.slidesPerMember || undefined,
        density: b.density || undefined,
        identity: { academic: b.academic, guide: b.guide, team: b.team, chrome: { branding: b.branding ?? "full" } },
        model: model || undefined,
      },
      {
        status: (p) => { const label = progressLabel(p); setStatus(label); runs.update(chat.id, { status: label }); },
        plan: (d) => {
          runs.update(chat.id, { status: "Outline ready." });
          persist({
            ...chat,
            title: chatName(d.plan.title ?? b.title, chat.topic),
            plan: {
              title: d.plan.title ?? b.title,
              subtitle: d.plan.subtitle ?? "",
              sections: d.plan.sections ?? [],
              slides: d.plan.slides ?? [],
            },
            deckSlug: d.slug,
            deckThumbs: [],
            model: model || undefined,
            error: undefined,
            updatedAt: new Date().toISOString(),
          });
        },
      },
    );
    runs.update(chat.id, { abort: j.abort });
    setJob(j);
    j.promise
      .catch((err) => {
        const msg = err.name === "AbortError" ? "Cancelled." : err.message;
        setError(msg);
        setStatus("");
        persist({ ...chatRef.current, error: msg, updatedAt: new Date().toISOString() });
      })
      .finally(() => { setBusy(false); runs.update(chat.id, { finished: true }); });
  }

  /** Approved outline → the writer streams. Lands on the finished deck. */
  function approve() {
    const plan = draftPlan ?? chat.plan;
    if (!plan?.slides?.length) return;
    const maxSection = Math.max(0, (plan.sections?.length ?? 1) - 1);
    const clean = plan.slides
      .map((s) => ({
        type: s.type ?? "bullets",
        section: Number.isInteger(s.section) ? Math.min(Math.max(0, s.section), maxSection) : null,
        purpose: (s.purpose ?? "").trim(),
      }))
      .filter((s) => s.type && s.purpose);
    if (!clean.length) { setError("Add at least one slide with a purpose."); return; }

    setBusy(true);
    setError("");
    setStatus("Approving…");
    runs.begin(chat.id, { abort: () => {}, status: "Approving…" });
    const j = api.generate(
      chat.deckSlug,
      {
        plan: { title: plan.title, subtitle: plan.subtitle, sections: plan.sections, slides: clean },
        theme: (chat.briefing ?? {}).theme || undefined,
        model: model || undefined,
      },
      {
        status: (p) => { const label = progressLabel(p); setStatus(label); runs.update(chat.id, { status: label }); },
        result: (r) => {
          persist({
            ...chat,
            plan: { title: plan.title, subtitle: plan.subtitle, sections: plan.sections, slides: clean },
            produced: true,
            deckSlug: r.slug ?? chat.deckSlug,
            deckThumbs: (r.thumbs ?? []).slice(0, 8),
            error: undefined,
            updatedAt: new Date().toISOString(),
          });
          onDeckChanged?.();
        },
      },
    );
    runs.update(chat.id, { abort: j.abort });
    setJob(j);
    j.promise
      .catch((err) => {
        const msg = err.name === "AbortError" ? "Cancelled." : err.message;
        setError(msg);
        setStatus("");
        persist({ ...chatRef.current, error: msg, updatedAt: new Date().toISOString() });
      })
      .finally(() => { setBusy(false); runs.update(chat.id, { finished: true }); });
  }

  /** Topic sent → the report briefing begins, like the deck's. */
  function sendReportTopic(text) {
    const title = suggestTitle(text);
    const briefing = initialBriefing(identity);
    persist({
      ...chat,
      topic: text,
      title: chatName(title, text),
      briefing: { ...briefing, title },
      briefStep: firstBriefStep(),
      updatedAt: new Date().toISOString(),
    });
  }

  function runReport(c) {
    setBusy(true);
    setError("");
    setStatus("Queued…");
    const b = c.briefing ?? {};
    let brief = c.topic;
    const notes = [];
    if (b.thesis?.trim()) notes.push(`Thesis: ${b.thesis.trim()}. The report must prove and close on this claim.`);
    if (b.audience?.trim()) notes.push(`For: ${b.audience.trim()}`);
    if (b.emphasis?.trim()) notes.push(`Emphasis: ${b.emphasis.trim()}`);
    if (b.evidence?.trim()) notes.push(`Evidence/constraints to respect — never invent beyond these: ${b.evidence.trim()}`);
    if (notes.length) brief = `${c.topic}\n\n${notes.join(" ")}`;
    const identityPayload = {
      academic: b.academic ?? identity?.academic ?? {},
      guide: b.guide ?? identity?.guide ?? {},
      team: b.team ?? identity?.team ?? {},
      chrome: { branding: b.branding ?? "full" },
    };
    runs.begin(c.id, { abort: () => {}, status: "Queued…" });
    const j = api.createReport(
      {
        brief,
        depth: b.depth ?? "full",
        density: b.density ?? "balanced",
        research: b.research ?? true,
        researchSource: b.researchSource,
        upload: b.uploadedSource,
        papers: b.papers,
        identity: identityPayload,
        model: model || undefined,
      },
      {
        status: (p) => { const label = progressLabel(p); setStatus(label); runs.update(c.id, { status: label }); },
        result: (d) => {
          // Reports auto-name like deck chats: the topic's first sentence first,
          // then the report's title once it lands.
          const named = chatName(d.title, c.topic);
          persist({ ...c, produced: true, deckSlug: d.slug, title: named, error: undefined, updatedAt: new Date().toISOString() });
          onDeckChanged?.();
        },
      },
    );
    runs.update(c.id, { abort: j.abort });
    setJob(j);
    j.promise
      .catch((err) => {
        const msg = err.name === "AbortError" ? "Cancelled." : err.message;
        setError(msg);
        setStatus("");
        persist({ ...chatRef.current, error: msg, updatedAt: new Date().toISOString() });
      })
      .finally(() => { setBusy(false); runs.update(c.id, { finished: true }); });
  }

  function stop() { runs.get(chat.id)?.abort?.() ?? job?.abort(); }

  /**
   * Resume a dropped generation: reconnect to the live server-side run when one
   * exists, otherwise continue writing the checkpointed deck from where it
   * stopped. Either way the result lands the same way approve()'s does.
   */
  function resumeRun() {
    if (!chat.deckSlug || busy) return;
    setBusy(true);
    setError("");
    setStatus("Reconnecting…");
    runs.begin(chat.id, { abort: () => {}, status: "Reconnecting…" });
    const j = api.resumeGenerate(
      chat.deckSlug,
      { model: model || undefined },
      {
        status: (p) => { const label = progressLabel(p); setStatus(label); runs.update(chat.id, { status: label }); },
        result: (r) => {
          persist({
            ...chatRef.current,
            produced: true,
            deckSlug: r.slug ?? chat.deckSlug,
            deckThumbs: (r.thumbs ?? []).slice(0, 8),
            error: undefined,
            updatedAt: new Date().toISOString(),
          });
          onDeckChanged?.();
        },
      },
    );
    runs.update(chat.id, { abort: j.abort });
    setJob(j);
    j.promise
      .catch((err) => {
        const msg = err.name === "AbortError" ? "Cancelled." : err.message;
        setError(msg);
        setStatus("");
        persist({ ...chatRef.current, error: msg, updatedAt: new Date().toISOString() });
      })
      .finally(() => { setBusy(false); runs.update(chat.id, { finished: true }); });
  }

  /** Finalize watchdog: the deck is fully written but the run died before the
   *  post-write pass. Run it without re-writing any slides. */
  function finalizeRun() {
    if (!chat.deckSlug || busy) return;
    setBusy(true);
    setError("");
    setStatus("Finalizing…");
    runs.begin(chat.id, { abort: () => {}, status: "Finalizing…" });
    const j = api.finalizeDeck(
      chat.deckSlug,
      { model: model || undefined },
      {
        status: (p) => { const label = progressLabel(p); setStatus(label); runs.update(chat.id, { status: label }); },
        result: (r) => {
          persist({
            ...chatRef.current,
            produced: true,
            deckSlug: r.slug ?? chat.deckSlug,
            deckThumbs: (r.thumbs ?? []).slice(0, 8),
            error: undefined,
            updatedAt: new Date().toISOString(),
          });
          onDeckChanged?.();
        },
      },
    );
    runs.update(chat.id, { abort: j.abort });
    setJob(j);
    j.promise
      .catch((err) => {
        const msg = err.name === "AbortError" ? "Cancelled." : err.message;
        setError(msg);
        setStatus("");
        persist({ ...chatRef.current, error: msg, updatedAt: new Date().toISOString() });
      })
      .finally(() => { setBusy(false); runs.update(chat.id, { finished: true }); });
  }

  function stopRun() {
    if (!chat.deckSlug) return;
    api.stopGenerate(chat.deckSlug).catch(() => {});
  }

  /**
   * The selection context appended to an edit turn: WHICH slides the user
   * means, by index and content excerpt, so the AI never has to guess from a
   * bare "these slides". When nothing is selected but a slide is enlarged
   * (or was focused in the deck view's lightbox), that single slide is named —
   * "make THIS punchier" resolves against it.
   */
  function selectionContext() {
    const slideText = (s) => {
      if (!s) return "";
      const parts = [s.type];
      if (s.headline) parts.push(`"${s.headline}"`);
      const body = s.bullets?.length
        ? s.bullets.slice(0, 2).join(" | ")
        : s.body?.slice?.(0, 2).join(" | ") || s.cards?.map?.((c) => c.label ?? c.title).slice(0, 2).join(", ") || "";
      if (body) parts.push(`content: ${body}`);
      return parts.join(" — ");
    };
    const chosen = [...selected].sort((a, b) => a - b);
    if (chosen.length > 0) {
      const lines = chosen.map((i) => `  Slide ${i + 1} (index ${i}): ${slideText(deckData?.slides?.[i])}`);
      return `The user selected these slides — the request below applies to EXACTLY these, not to any other slide:\n${lines.join("\n")}`;
    }
    const idx = openIndex ?? deckContext.focusedSlide(chat.deckSlug)?.index ?? null;
    if (idx != null && deckData?.slides?.[idx]) {
      return `The user is referring to the slide currently shown — Slide ${idx + 1} (index ${idx}): ${slideText(deckData.slides[idx])}`;
    }
    return "";
  }

  /**
   * The deck-editing turn. After the deck is produced the SAME thread keeps
   * working: a message here is an instruction to runTurn on deck.yaml (the
   * machinery the deleted chat rail used, still served by /api/decks/:slug/chat).
   * The turn's applied changes and the fresh slide thumbnails land back in the
   * thread, and bumping deckVersion makes the deck view re-fetch if it is open.
   * When slides are selected in the panel, the turn context names them
   * explicitly — "add more content to THIS slide" can no longer drift.
   */
  function sendEditTurn(text) {
    if (!chat.deckSlug) return;
    setBusy(true);
    setError("");
    setStatus("Editing…");
    const ctx = selectionContext();
    const instruction = ctx ? `${ctx}\n\n${text}` : text;
    const userMsg = { role: "user", text, at: new Date().toISOString() };
    persist({
      ...chat,
      turns: [...(chat.turns ?? []), userMsg],
      updatedAt: new Date().toISOString(),
    });
    runs.begin(chat.id, { abort: () => {}, status: "Editing…" });
    const j = api.chatDeck(
      chat.deckSlug,
      {
        instruction,
        model: model || undefined,
        // The same selection the context prose names, as data. The prose tells
        // the model which slides are meant; this is what holds it to them.
        slides: [...selected].sort((a, b) => a - b),
      },
      {
        status: (p) => { const label = progressLabel(p); setStatus(label); runs.update(chat.id, { status: label }); },
        result: (r) => {
          const stamp = Date.now();
          const thumbs = (r.thumbs ?? []).map((s) => `${s}?t=${stamp}`);
          const asstMsg = {
            role: "assistant",
            text: turnSummary(r),
            changes: r.changes ?? [],
            problems: r.problems ?? [],
            thumbs,
            at: new Date().toISOString(),
          };
          const base = chatRef.current;
          persist({
            ...base,
            turns: [...(base.turns ?? []), asstMsg],
            deckThumbs: thumbs,
            error: undefined,
            updatedAt: new Date().toISOString(),
          });
          onDeckChanged?.();
        },
      },
    );
    runs.update(chat.id, { abort: j.abort });
    setJob(j);
    j.promise
      .catch((err) => {
        const msg = err.name === "AbortError" ? "Cancelled." : err.message;
        setError(msg);
        setStatus("");
        persist({ ...chatRef.current, error: msg, updatedAt: new Date().toISOString() });
      })
      .finally(() => { setBusy(false); runs.update(chat.id, { finished: true }); });
  }

  /** Punch up the selected slides — one scoped turn naming exactly them. */
  function punchSelected() {
    if (selected.size === 0 || busy || punching) return;
    const idxs = [...selected].sort((a, b) => a - b);
    const names = idxs.length === 1 ? `slide ${idxs[0] + 1}` : `slides ${idxs.map((i) => i + 1).join(", ")}`;
    setPunching(true);
    setError("");
    api.chatDeck(chat.deckSlug, {
      instruction:
        `Make ${names} punchier — tighten their wording and sharpen the claims. ` +
        `Keep each slide's type and structure; edit only ${names}.`,
      model: model || undefined,
    }, {
      status: (p) => setStatus(progressLabel(p)),
      result: () => onDeckChanged?.(),
    }).promise
      .catch((err) => setError(err.message))
      .finally(() => setPunching(false));
  }

  /** Swap the selected slides to a new type — remap when compatible, scoped
   *  rewrite otherwise, through the same endpoint the deck view's gallery uses. */
  function swapSelected(targetType) {
    if (selected.size === 0 || busy || swapping) return;
    const idxs = [...selected].sort((a, b) => a - b);
    setSwapping(true);
    setError("");
    (async () => {
      for (const i of idxs) {
        const cur = deckData?.slides?.[i]?.type;
        if (cur === targetType) continue;
        await api.convertSlide(chat.deckSlug, i, { type: targetType }, {
          status: (p) => setStatus(progressLabel(p)),
        }).promise;
      }
    })()
      .then(() => { onDeckChanged?.(); setSelected(new Set()); })
      .catch((err) => setError(err.message))
      .finally(() => setSwapping(false));
  }

  /** Flip an empty thread between the two products before a topic is sent. */
  function switchKind(kind) {
    if (chat.topic || kind === chat.kind) return;
    persist({ ...chat, kind, updatedAt: new Date().toISOString() });
  }

  /** Inline note shown for a handled slash command, without a model call. */
  function slashReply(msg) {
    setError("");
    setFreeHint(msg);
  }

  /**
   * Slash commands — parsed BEFORE the turn. A command is a direct action,
   * not an instruction the model must interpret. Returns true when the input
   * was a command (handled or unknown); the caller then skips the turn.
   */
  function handleSlash(text) {
    const parsed = parseSlashCommand(text);
    if (!parsed) {
      // A leading "/" that did not parse is a typo'd command — say so rather
      // than silently running it as a model instruction.
      if (looksLikeSlash(text)) {
        slashReply(`"${text.trim()}" doesn't look like a command. Try /help to see what works.`);
        return true;
      }
      return false;
    }
    const { command, arg, rest } = parsed;
    const b = chat.briefing ?? {};
    const setBriefing = (patch) => {
      persist({ ...chat, briefing: { ...b, ...patch }, updatedAt: new Date().toISOString() });
    };
    switch (command) {
      case "help":
        slashReply(SLASH_HELP.split("\n").join("  ·  "));
        return true;
      case "theme": {
        if (!arg) { slashReply("Pick a theme by name — e.g. /theme swiss-international. The gallery still shows each one live."); return true; }
        const t = themes.find((x) => x.name === arg || (x.label ?? "").toLowerCase() === arg.toLowerCase());
        if (!t) {
          slashReply(`No theme named "${arg}" — try /theme then a name from the gallery (e.g. /theme sci-fi-hud).`);
          return true;
        }
        setBriefing({ theme: t.name });
        slashReply(`Theme set to ${t.label}.`);
        return true;
      }
      case "density": {
        if (!arg) { slashReply("Set density to sparse, balanced or dense — e.g. /density dense."); return true; }
        const d = arg.toLowerCase();
        if (!["sparse", "balanced", "dense"].includes(d)) {
          slashReply(`"${arg}" isn't a density — try sparse, balanced or dense.`);
          return true;
        }
        setBriefing({ density: d });
        slashReply(`Density set to ${d}.`);
        return true;
      }
      case "slides": {
        const n = /^\d+$/.test(arg) ? Number(arg) : null;
        if (n == null) { slashReply("Give a number — e.g. /slides 16."); return true; }
        setBriefing({ maxSlides: n });
        slashReply(`Slide budget set to ${n}.`);
        return true;
      }
      case "papers": {
        setBriefing({ papers: !b.papers });
        slashReply(b.papers ? "Papers pass turned off." : "Papers pass turned on — arXiv + Crossref in the next research run.");
        return true;
      }
      case "report": {
        if (!chat.deckSlug) {
          if (chat.kind === "report") { slashReply("This thread already builds a report."); return true; }
          switchKind("report");
          slashReply("Switched to Report mode — send a topic to start a standalone report.");
          return true;
        }
        // A deck exists — jump to its report view.
        onOpenReport(chat.deckSlug);
        return true;
      }
      default:
        slashReply(`Unknown command /${command}. ${SLASH_HELP.split("\n").slice(0, 3).join("  ·  ")}`);
        return true;
    }
  }

  /** The bottom input bar: topic first, then free-text answers to questions,
   *  then — once the deck exists — deck-editing turns. */
  function send() {
    const text = input.trim();
    if (!text || busy) return;
    // Slash commands are intercepted before the turn — a command is an action,
    // not a model instruction. The rest of the line can still be a message.
    if (handleSlash(text)) {
      setInput("");
      return;
    }
    if (phase === "editing") {
      setInput("");
      setFreeHint("");
      sendEditTurn(text);
      return;
    }
    if (phase === "greeting") {
      setInput("");
      chat.kind === "report" ? sendReportTopic(text) : sendTopic(text);
      return;
    }
    if (phase === "briefing") {
      // The form holds every field, so there is no single question the composer
      // could be answering. Free prose lands on the thesis, which is the field
      // it was always most useful for and the one that most changes the plan —
      // appended rather than replacing, so a second thought is not a deletion.
      const said = text.trim();
      if (!said) return;
      const prev = String(chat.briefing?.thesis ?? "").trim();
      patchBriefing({ thesis: prev ? `${prev} ${said}` : said });
      setInput("");
      setFreeHint("Noted as part of your thesis — the form above has the rest.");
    }
  }

  // Every question that actually carries an answer, not "every question before
  // the cursor". The walk made those the same thing and the tier forms do not:
  // a user can fill the last optional field and leave the first empty. The
  // deck's own briefing record wants what was answered, never a step count.
  const effStep = effectiveBriefStep(chat.briefing ?? {}, chat.briefStep, questions);
  const answered = questions
    .map((q, idx) => ({ ...q, idx }))
    .filter((q) => isAnswered(chat.briefing ?? {}, q.key));

  const placeholder = unverified
    ? "Confirm your email address to start — the link is in your inbox"
    : phase === "greeting"
      ? chat.kind === "report"
        ? "What should the report be about?"
        : "Type a topic — everything else defaults…"
      : phase === "briefing"
        ? "Anything else worth saying about the topic?"
        : phase === "editing"
          ? "Edit the deck — try \u201cmake slide 2 punchier\u201d…"
          : phase === "record"
            ? "The report is ready — this thread is its record."
            : busy
              ? "Working…"
              : "Review the card above…";
  // An unconfirmed account is stopped at the composer rather than after the
  // briefing. The whole briefing runs in the browser, so without this the
  // person answers five questions about a deck the server will refuse to
  // create — the same "fail at the end of the run" the report donor had, spent
  // on their time instead of the server's.
  const inputDisabled = unverified || busy || phase === "summary" || phase === "outline" || phase === "record";
  // The slide-selection panel shows beside the thread once the deck is ready
  // and its content is loaded. ~40% of the row; the chat shifts left. Collapsable.
  const showPanel = phase === "editing" && deckData && deckData.slides.length > 0;
  const showPanelVisible = showPanel && panelOpen;
  const showPanelCollapsed = showPanel && !panelOpen;

  /** The bottom input bar — topic first, then free-text answers to questions,
   *  then — once the deck exists — deck-editing turns. Shared by the greeting
   *  column (centered above the fold) and the pinned footer of a working chat. */
  const composerBar = (
    <div className="surface-well rounded-[var(--radius-lg)] border border-line bg-prompt">
      <div className="flex items-end gap-2 p-3 pb-2">
        <AutoGrowTextarea
          ref={inputRef}
          value={input}
          onChange={(e) => { setInput(e.target.value); setFreeHint(""); }}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          disabled={inputDisabled}
          placeholder={placeholder}
          className="max-h-36 flex-1 resize-none bg-transparent px-2 py-2 text-[15px] leading-relaxed text-fg outline-none placeholder:text-fg-faint/60 disabled:opacity-50"
        />
      </div>

      <div className="flex items-center gap-2 border-t border-line/60 px-3 pb-2.5 pt-2">
        {!chat.topic && (
          <div className="flex items-center gap-0.5 rounded-full bg-panel p-0.5">
            <button
              onClick={() => switchKind("deck")}
              title="A topic becomes a themed presentation (slides + report + script)"
              className={`pill px-2.5 py-1 text-[11.5px] font-medium transition ${chat.kind === "deck" ? "bg-hover text-fg" : "text-fg-faint hover:text-fg-muted"}`}
            >
              <LayersIcon className="h-3 w-3" /> PPT
            </button>
            <button
              onClick={() => switchKind("report")}
              title="A topic becomes a standalone written report"
              className={`pill px-2.5 py-1 text-[11.5px] font-medium transition ${chat.kind === "report" ? "bg-hover text-fg" : "text-fg-faint hover:text-fg-muted"}`}
            >
              <DocIcon className="h-3 w-3" /> Report
            </button>
          </div>
        )}

        <div className="ml-auto flex items-center gap-2">
          {modelMode === "cloud" ? (
            <div className="relative">
              <select
                value={model}
                onChange={(e) => {
                  const v = e.target.value;
                  setModel(v);
                  persist({ ...chat, model: v || undefined, updatedAt: new Date().toISOString() });
                }}
                disabled={inputDisabled}
                title={model ? `Using ${anonymizeModel(model)}` : `Cloud · ${anonymizeModel(models[0]) || "select model"}`}
                className="max-w-[15rem] appearance-none rounded-full border border-line bg-sunken py-1 pl-7 pr-7 text-[12px] text-fg-muted outline-none transition hover:border-line-strong focus:border-accent disabled:opacity-50"
              >
                <option value="">{models[0] ? `Cloud · ${anonymizeModel(models[0])}` : "Cloud"}</option>
                {models.map((m) => (
                  <option key={m} value={m}>
                    {anonymizeModel(m)}
                  </option>
                ))}
              </select>
              <SparkleIcon className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-fg-faint" />
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-fg-faint" />
            </div>
          ) : (
            // The chip IS the switch. It used to be a label with a separate
            // 10px underlined "Switch to Cloud" beside it — two controls for
            // one setting, the weaker of which carried the action.
            <button
              onClick={switchMode}
              disabled={inputDisabled}
              title={`${hosted ? "Auto — the shared Forge gateway" : "Auto — Ollama on this machine"}. Click to use your own key instead.`}
              className="flex items-center gap-1 rounded-full border border-line bg-sunken px-3 py-1 text-[12px] text-fg-muted transition hover:border-line-strong hover:text-fg disabled:opacity-50"
            >
              <SparkleIcon className="h-3 w-3 text-fg-faint" />
              {hosted ? "Auto" : (auto?.kind === "local" ? "Local" : "Auto")}
              {hosted && <span className="hidden sm:inline text-[10px] text-fg-faint">· Forge</span>}
              {!hosted && auto?.kind === "local" && <span className="hidden sm:inline text-[10px] text-fg-faint">· Ollama</span>}
            </button>
          )}
          {modelMode === "cloud" && (
            <button
              onClick={switchMode}
              disabled={inputDisabled}
              title={hosted ? "Back to the shared Forge gateway" : "Back to Ollama on this machine"}
              className="hidden rounded-full px-2 py-1 text-[11px] text-fg-faint transition hover:bg-hover hover:text-fg sm:inline-flex"
            >
              {hosted ? "Use Auto" : "Use Local"}
            </button>
          )}
          {/* Wrapped rather than given `hidden` directly: Button's own base
              class sets inline-flex, and two display utilities on one element
              are resolved by Tailwind's ordering, not by the order they are
              written — so this button stayed visible on a phone and the
              composer showed two send controls at once. */}
          <span className="ml-1 hidden sm:contents">
            <Button variant="primary" onClick={send} disabled={inputDisabled || !input.trim()} title="Send">
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 2 11 13M22 2l-7 20-4-9-9-4Z" />
              </svg>
            </Button>
          </span>
        </div>
      </div>
      <div className="flex justify-end border-t border-line/40 px-3 py-2 sm:hidden">
        <Button variant="primary" onClick={send} disabled={inputDisabled || !input.trim()} title="Send" className="w-full">
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 2 11 13M22 2l-7 20-4-9-9-4Z" />
          </svg>
          Send
        </Button>
      </div>
    </div>
  );

  // The greeting phase is the product's front door: hero + suggestion chips +
  // composer as one vertically centred column, composer above the fold. The
  // scroll viewport is gone, so there is no void between the chips and the bar.
  const greeting = !chat.topic && !chat.produced;

    return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2.5 border-b border-line px-4">
        {/* The sidebar is an off-canvas drawer below 768px, so this is the only
            way back to it. Hidden above that width, where it is a column and
            has its own toggle. */}
        <button
          onClick={onToggleLeft}
          aria-label={leftOpen ? "Close the menu" : "Open the menu"}
          className="-ml-1 grid h-8 w-8 shrink-0 place-items-center rounded-md text-fg-faint transition hover:bg-hover hover:text-fg md:hidden"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold text-fg">{chat.title}</div>
          <div className="truncate text-[10.5px] text-fg-faint">
            {chat.kind === "report" ? "A report on its own" : "Slides, a written report and a speaker script"}
          </div>
        </div>
        {chat.produced && (
          <Badge className="bg-accent/10 text-accent">ready</Badge>
        )}
        {/* "hosted" and "local" are words about the deployment. What a reader
            wants to know is where their topic is being sent. */}
        <Badge
          className={hosted ? "bg-amber/10 text-amber" : "bg-success/10 text-success"}
          title={hosted ? "Runs on a shared model over the network" : "Runs on a model on this machine"}
        >
          {hosted ? "shared model" : "on this machine"}
        </Badge>
      </header>
      {/* ONE prompt for one decision. There were three: this banner, a
          first-run toast in the shell, and an underlined link in the composer
          — three visual languages for the same choice, all on an empty screen.
          The old action was a dead end too: switching to Cloud when Cloud has
          no key either just swapped this banner for the next one. It points at
          the thing that actually fixes it. */}
      {hosted && needsKey && (
        <div className="mx-auto w-full max-w-3xl px-6 pt-3">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-amber/30 bg-amber/10 px-3 py-2 text-[12px] leading-relaxed text-amber">
            <span>
              {modelMode === "auto"
                ? "The shared Auto model has no key on this install."
                : "Cloud runs on your own key, and none is attached yet."}
            </span>
            <button
              onClick={() => onOpenSettings?.()}
              className="font-medium underline underline-offset-2 hover:opacity-80"
            >
              Add one in Settings
            </button>
          </div>
        </div>
      )}

      {greeting ? (
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-6 py-10">
          <div className="m-auto flex w-full max-w-3xl flex-col items-center gap-8">
            <Welcome
              chat={chat}
              org={identity?.institution?.short}
              onFill={(s) => { setInput(s); inputRef.current?.focus(); }}
            />
            <div className="w-full">
              {composerBar}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          <div className="flex min-w-0 flex-1 flex-col">
          <div ref={scrollRef} className="flex-1 overflow-y-auto">
            <div className="mx-auto max-w-3xl space-y-4 px-6 py-8">
          <Welcome
            chat={chat}
            org={identity?.institution?.short}
            onFill={(s) => { setInput(s); inputRef.current?.focus(); }}
          />

          {chat.topic && (
            <Bubble role="user">
              {chat.kind === "report" ? "Report: " : "Topic: "}{chat.topic}
            </Bubble>
          )}

          {!chat.plan && phase !== "briefing" && answered.map((q, i) => (
            <div key={q.key}>
              <Bubble role="assistant">
                <div className="mb-0.5 text-[12px] font-medium uppercase tracking-wider text-fg-faint">{q.ask}</div>
                <div className="text-[15px] text-fg">{echoAnswer(chat.briefing ?? {}, q.key, { themeLabel, presetLabel })}</div>
              </Bubble>
              <div className="mt-0.5 flex justify-start pl-1">
                <button
                  onClick={() => editAt(q.idx)}
                  className="rounded px-1.5 py-0.5 text-[10px] text-fg-faint transition hover:bg-hover hover:text-fg-muted"
                >
                  change
                </button>
              </div>
            </div>
          ))}

          {phase === "editing" && (
            <DeckBriefing
              chat={chat}
              answered={answered}
              echoAnswer={echoAnswer}
              themeLabel={themeLabel}
              presetLabel={presetLabel}
            />
          )}

          {/* The deck-editing turn log — every edit instruction and its applied
              result stays in the thread, alongside the briefing record. */}
          {phase === "editing" && (chat.turns ?? []).map((t, i) =>
            t.role === "user" ? (
              <Bubble key={i} role="user">{t.text}</Bubble>
            ) : (
              <Bubble key={i} role="assistant">
                <div className="text-[15px] leading-relaxed text-fg">{t.text}</div>
                {t.thumbs?.length > 0 && (
                  <div className="mt-2 flex gap-1.5 overflow-x-auto pb-0.5">
                    {t.thumbs.map((src, j) => (
                      <img key={src} src={src} alt={`Slide ${j + 1}`} className="h-14 w-auto shrink-0 rounded border border-line" />
                    ))}
                  </div>
                )}
                {t.problems?.length > 0 && (
                  <div className="mt-2 text-[12px] leading-relaxed text-amber">{t.problems.slice(0, 3).join(" · ")}</div>
                )}
              </Bubble>
            )
          )}

          {phase === "briefing" && briefTier(chat.kind, chat.briefStep) === "required" && (
            <RequiredForm
              key={`${chat.id}-required`}
              chat={chat}
              themes={themes}
              themeLabel={themeLabel}
              presets={presets}
              onPickPreset={pickPreset}
              onDeletePreset={deletePreset}
              onPatch={patchBriefing}
              onDone={() => finishTier("required")}
            />
          )}

          {phase === "briefing" && briefTier(chat.kind, chat.briefStep) === "optional" && (
            <OptionalForm
              key={`${chat.id}-optional`}
              chat={chat}
              themes={themes}
              themeLabel={themeLabel}
              presets={presets}
              onPickPreset={pickPreset}
              onDeletePreset={deletePreset}
              onPatch={patchBriefing}
              onDone={() => finishTier("optional")}
              baseline={{ ...initialBriefing(identity), title: suggestTitle(chat.topic ?? "") }}
            />
          )}

          {phase === "summary" && (
            <Panel className="p-5">
              <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-fg-faint">
                {chat.kind === "report" ? "Your report" : "Your deck"}
              </div>
              <SummaryLine
                chat={chat}
                themeLabel={themeLabel}
              />
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {chat.kind === "report" ? (
                  <Button variant="primary" onClick={() => runReport(chat)} disabled={busy}>
                    {busy ? <Spinner /> : null}
                    Generate the report
                  </Button>
                ) : (
                  <Button variant="primary" onClick={planDeck} disabled={busy}>
                    {busy ? <Spinner /> : null}
                    Plan the deck
                  </Button>
                )}
                <PresetSave
                  onSave={saveAsPreset}
                  state={presetSaveState}
                />
                <span className="text-[11px] text-fg-faint">
                  {/* A plain "&" — these are JS strings, not JSX text, so an
                      HTML entity here is printed rather than decoded. */}
                  {chat.kind === "report"
                    ? "The only thing that starts research & writing."
                    : "The only thing that starts research & planning."}
                </span>
              </div>
            </Panel>
          )}

          {phase === "outline" && deckRun && !busy && !chat.produced && (
            <DeckRunCard
              run={deckRun}
              onResume={resumeRun}
              onFinalize={finalizeRun}
              onStop={stopRun}
              onOpen={() => onOpenDeck(chat.deckSlug)}
            />
          )}

          {phase === "outline" && (
            <OutlineCard
              chat={chat}
              types={types}
              plan={draftPlan ?? chat.plan}
              onPlan={setDraftPlan}
              themeLabel={themeLabel}
              busy={busy}
              onApprove={approve}
            />
          )}

          {(phase === "running" || (busy && (phase === "summary" || phase === "outline" || phase === "editing"))) && (
            <Bubble role="assistant">
              <div className="flex items-center gap-2.5 text-[12px] text-fg-muted">
                <span className="flex items-center gap-1">
                  <span className="typing-dot" /><span className="typing-dot" /><span className="typing-dot" />
                </span>
                {status}
              </div>
              {busy && (
                <div className="mt-2 flex justify-end">
                  <Button size="sm" variant="outline" onClick={stop}>Stop</Button>
                </div>
              )}
            </Bubble>
          )}

          {error && (
            <Bubble role="assistant">
              <div className="text-[12px] leading-relaxed text-amber">{error}</div>
              {chat.kind === "report" && chat.topic && !chat.produced && !busy && (
                <Button size="sm" variant="outline" className="mt-2" onClick={() => runReport(chat)}>Retry</Button>
              )}
              {chat.kind !== "report" && phase === "summary" && !busy && (
                <Button size="sm" variant="outline" className="mt-2" onClick={planDeck}>Retry planning</Button>
              )}
            </Bubble>
          )}

          {(phase === "editing" || phase === "record") && (!chat.turns || chat.turns.length === 0) && (
            <Panel className="p-5">
              <div className="flex items-center gap-2 text-[13px] font-semibold text-fg">
                <svg viewBox="0 0 24 24" className="h-4 w-4 text-accent" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
                {chat.kind === "report" ? "Your report is ready." : `${chat.title} is ready.`}
              </div>
              {phase === "editing" && (
                <div className="mt-1 text-[11.5px] leading-relaxed text-fg-faint">
                  This thread keeps working — type below to edit the deck, and its
                  slides update here after every turn.
                </div>
              )}
              {chat.deckThumbs?.length > 0 && (
                <div className="mt-3 flex gap-1.5 overflow-x-auto pb-0.5">
                  {chat.deckThumbs.map((src, i) => (
                    <img key={src} src={src} alt={`Slide ${i + 1}`} className="h-14 w-auto shrink-0 rounded border border-line" />
                  ))}
                </div>
              )}
              <div className="mt-4">
                <Button variant="primary" onClick={() => (chat.kind === "report" ? onOpenReport(chat.deckSlug) : onOpenDeck(chat.deckSlug))}>
                  Open the {chat.kind === "report" ? "report" : "deck"}
                </Button>
              </div>
            </Panel>
          )}
        </div>
      </div>

      <footer className="shrink-0 border-t border-line px-6 py-4">
        <div className="mx-auto max-w-3xl">
          {composerBar}
          {freeHint && <div className="mt-1.5 px-1 text-[11px] text-amber">{freeHint}</div>}
          <div className="mt-1.5 px-1 text-[10.5px] text-fg-faint">
            {chat.kind === "report"
              ? phase === "record"
                ? "The report is ready — this thread is its record. Open it to read the document."
                : "A report is researched and written from your topic — depth defaults to brief."
              : phase === "briefing" ? "Set what matters in the form above — everything else has a default."
                : phase === "editing" ? "Select slides on the right, then type — the AI knows exactly which you mean."
                  // Never claim local execution on a hosted box: this line ran
                  // unconditionally, so a deployment sending every prompt to the
                  // shared gateway told the user it stayed on their machine. The
                  // header badge two rows up already draws this distinction.
                  : hosted ? "The app does the bulk; you do the final touches — every model call goes to the shared model over the network."
                    : "The app does the bulk; you do the final touches — every model call stays on this machine."}
          </div>
        </div>
      </footer>
          </div>

          {showPanelVisible && (
            <div className="w-[40%] max-w-[30rem] shrink-0">
              <SlideSelectPanel
                slides={deckData.slides}
                thumbs={deckData.thumbs}
                types={types}
                selected={selected}
                onToggle={(i) => setSelected((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n; })}
                onClear={() => setSelected(new Set())}
                openSlide={(i) => setOpenIndex(i)}
                openIndex={openIndex}
                busy={busy}
                onPunch={punchSelected}
                punching={punching}
                onSwap={() => setSwapOpen(true)}
                swapping={swapping}
              />
            </div>
          )}
          {showPanelCollapsed && (
            <div className="flex w-10 shrink-0 flex-col items-center border-l border-line bg-base py-3">
              <button
                onClick={() => setPanelOpen(true)}
                title="Expand slides"
                aria-label="Expand slides"
                className="grid h-8 w-8 place-items-center rounded-md text-fg-faint transition hover:bg-hover hover:text-fg"
              >
                <PanelLeftOpen className="h-4 w-4" />
              </button>
              <div className="mt-2 text-[10px] font-medium uppercase tracking-wider text-fg-faint" style={{ writingMode: "vertical-rl" }}>
                {deckData.slides.length}
              </div>
            </div>
          )}
        </div>
      )}

      {showPanel && openIndex != null && deckData.slides[openIndex] && (
        <Lightbox
          slides={deckData.plates}
          thumbs={deckData.thumbs}
          index={openIndex}
          onIndex={(i) => { setOpenIndex(i); deckContext.focusSlide(chat.deckSlug, i); }}
          onClose={() => setOpenIndex(null)}
        />
      )}

      {showPanel && swapOpen && (
        <TypePickModal
          types={types}
          onPick={(t) => { setSwapOpen(false); swapSelected(t); }}
          onClose={() => setSwapOpen(false)}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ parts */

/** A textarea that grows with its content and stops at a cap, then scrolls —
 *  the Claude-style composer. The height is derived from scrollHeight on
 *  input, clamped between a comfortable single-line minimum and the cap; the
 *  styling is passed through so the caller keeps full control. */
const AutoGrowTextarea = forwardRef(function AutoGrowTextarea({ className = "", ...props }, ref) {
  const local = useRef(null);
  const taRef = ref ?? local;
  const resize = () => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(Math.max(el.scrollHeight, 44), 152)}px`;
  };
  useEffect(resize, [props.value]);
  useEffect(() => { resize(); }, []);
  return (
    <textarea
      ref={taRef}
      rows={1}
      style={{ height: 44 }}
      onInput={resize}
      className={className}
      {...props}
    ></textarea>
  );
});

function Welcome({ chat, org, onFill }) {
  if (chat.topic || chat.produced) return null;
  return (
    <div className="text-center">
      <h1 className="text-[2.5rem] font-semibold leading-tight tracking-tight text-fg">
        {chat.kind === "report" ? "What would you like to write a report about?" : "What would you like to present today?"}
      </h1>
      <p className="mx-auto mt-2 max-w-md text-[15px] leading-relaxed text-fg-muted">
        {chat.kind === "report"
          ? "Send a topic and I'll ask a few questions first — depth, density, branding — then the report is researched, written and rendered. The app does the bulk; the final words are yours."
          : org
            ? `Send a topic and a themed deck comes out — I'll ask a few questions first, everything defaults unless you say otherwise. The app drafts it; you do the final touches.`
            : "Send a topic and a themed deck comes out — I'll ask a few questions first, everything defaults unless you say otherwise. The app drafts it; you do the final touches."}
      </p>
      {chat.kind === "deck" && (
        <div className="mt-5 flex flex-wrap justify-center gap-1.5">
          {DECK_SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => onFill(s)}
              className="rounded-full border border-line px-2.5 py-1.5 text-[12px] text-fg-muted transition hover:border-accent/60 hover:text-fg"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Bubble({ role, children }) {
  return (
    <div className={role === "user" ? "ml-auto max-w-[85%]" : "mr-auto max-w-[88%]"}>
      <div
        className={
          role === "user"
            ? "rounded-xl rounded-br-sm bg-accent/10 px-3.5 py-2.5 text-[15px] leading-relaxed break-words text-fg"
            : "rounded-xl rounded-bl-sm border border-line bg-panel px-3.5 py-2.5"
        }
      >
        {children}
      </div>
    </div>
  );
}

function PresetCard({ presets, value, themeLabel, onPick, onDelete }) {
  const [confirming, setConfirming] = useState(null);
  return (
    <div>
      <div className="mb-2 text-[11px] leading-relaxed text-fg-faint">
        A saved format pre-fills the fixed fields — team, slides, density,
        theme, branding — so only the changing bits (title, subject, teacher)
        need answering. Create and edit formats in Settings, or from the
        summary card's "Save as preset…".
      </div>
      <div className="space-y-1.5">
        <button
          onClick={() => onPick(null)}
          className={`block w-full rounded-lg border px-3 py-2 text-left text-[12.5px] transition ${
            value == null
              ? "border-accent bg-accent/10 text-fg"
              : "border-line bg-panel text-fg-muted hover:border-line-strong hover:text-fg"
          }`}
        >
          <span className="font-medium">Start fresh</span>
          <span className="ml-2 text-[10.5px] text-fg-faint">answer everything this time</span>
        </button>
        {presets.map((p) => (
          <div
            key={p.id}
            className={`flex items-center rounded-lg border transition ${
              value === p.id ? "border-accent bg-accent/10" : "border-line bg-panel hover:border-line-strong"
            }`}
          >
            <button
              onClick={() => onPick(p)}
              className="min-w-0 flex-1 px-3 py-2 text-left"
            >
              <span className="block truncate text-[12.5px] font-medium text-fg">{p.name}</span>
              <span className="block truncate text-[10.5px] text-fg-faint">
                {p.maxSlides ? `${p.maxSlides} slides` : "auto slides"} · {(p.team?.members ?? []).filter((m) => m.name?.trim()).length} people
                {p.branding !== "full" ? ` · ${p.branding} branding` : ""} · {themeLabel(p.theme)}
              </span>
            </button>
            <div className="flex shrink-0 items-center pr-1.5">
              {confirming === p.id ? (
                <button
                  onClick={() => { onDelete(p.id); setConfirming(null); }}
                  className="rounded px-2 py-1 text-[11px] font-medium text-danger transition hover:bg-danger/10"
                >
                  Delete?
                </button>
              ) : (
                <button
                  onClick={() => setConfirming(p.id)}
                  title="Delete this preset"
                  className="rounded p-1 text-fg-faint transition hover:bg-hover hover:text-amber"
                >
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}


/**
 * One briefing field, as a control rather than a card.
 *
 * `QuestionCard` below renders the same set one at a time with a footer each;
 * this renders one with no footer, patching the briefing as it is touched. The
 * two share every underlying card — the difference is `embedded`.
 */
function BriefingControl({ q, chat, themes, themeLabel, presets, onPickPreset, onDeletePreset, onPatch }) {
  const b = chat.briefing ?? {};
  const patch = (p) => onPatch(p);
  const common = { onNext: patch, embedded: true };
  switch (q.key) {
    case "preset": return <PresetCard presets={presets} value={b.presetId} themeLabel={themeLabel} onPick={onPickPreset} onDelete={onDeletePreset} />;
    case "title": return <TitleCard value={b.title} {...common} />;
    case "thesis": return <FreeTextCard field="thesis" value={b.thesis} placeholder="e.g. Green hydrogen can decarbonise steel but only if storage scales" {...common} />;
    case "audience": return <FreeTextCard field="audience" value={b.audience} placeholder="e.g. final-year classmates and the guide — sceptical on costs" {...common} />;
    case "emphasis": return <FreeTextCard field="emphasis" value={b.emphasis} placeholder="e.g. the cost comparison and the environmental case" {...common} />;
    case "evidence": return <FreeTextCard field="evidence" value={b.evidence} placeholder="e.g. 53 kWh/kg, 180 GW by 2030 — and don't invent capex" {...common} />;
    case "team": return <TeamCard team={b.team} {...common} />;
    case "guide": return <GuideCard guide={b.guide} {...common} />;
    case "academic": return <AcademicCard academic={b.academic} {...common} />;
    case "theme": return <ThemeCard themes={themes} value={b.theme} themeLabel={themeLabel} {...common} />;
    case "depth": return <DepthCard value={b.depth} {...common} />;
    case "maxSlides": return <MaxSlidesCard value={b.maxSlides} {...common} />;
    case "slidesPerMember": return <SlidesPerMemberCard value={b.slidesPerMember} {...common} />;
    case "density": return <DensityCard value={b.density} {...common} />;
    case "branding": return <BrandingCard value={b.branding} {...common} />;
    case "research": return (
      <ResearchCard
        value={b.researchSource ?? (b.research ? "web" : "none")}
        kind={chat.kind}
        uploaded={b.uploadedSource}
        papersValue={b.papers ?? false}
        onPapers={(x) => patch({ papers: x })}
        onSource={(x) => patch({ researchSource: x, research: x === "web" })}
        onUpload={async (file) => {
          const staged = await api.stageBriefingUpload(file);
          patch({ uploadedSource: staged });
          return staged;
        }}
        {...common}
      />
    );
    default: return null;
  }
}

/** A labelled field inside a tier form. */
function FormField({ q, children, first }) {
  return (
    <section className={first ? "" : "mt-3.5 border-t border-line pt-3.5"}>
      <div className="mb-1.5 text-[12px] font-medium text-fg">{q.ask}</div>
      {children}
    </section>
  );
}

/**
 * The required tier: everything that most changes the artefact, answered
 * together, then one action.
 *
 * This is the screen that replaced fifteen cards. Every field here has a
 * default and says so, because the product's promise is that a topic alone is
 * enough — the form exists to make the few worth changing reachable at once,
 * not to ask for anything.
 */
function RequiredForm({ chat, themes, themeLabel, presets, onPickPreset, onDeletePreset, onPatch, onDone }) {
  const fields = tierQuestions(chat.kind, "required", chat.briefing ?? {}, presets);
  return (
    <Bubble role="assistant">
      <div className="text-[13px] font-medium text-fg">A few choices, then I draft it.</div>
      <div className="mt-0.5 mb-3 text-[11.5px] leading-relaxed text-fg-faint">
        Everything here already has a default — change what matters and continue.
      </div>
      {fields.map((q, i) => (
        <FormField key={q.key} q={q} first={i === 0}>
          <BriefingControl
            q={q} chat={chat} themes={themes} themeLabel={themeLabel} presets={presets}
            onPickPreset={onPickPreset} onDeletePreset={onDeletePreset} onPatch={onPatch}
          />
        </FormField>
      ))}
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3.5">
        <Button variant="primary" onClick={onDone}>Continue</Button>
        <span className="text-[11px] text-fg-faint">Details like the team, guide and thesis come next — and are optional.</span>
      </div>
    </Bubble>
  );
}

/**
 * The optional tier: one panel, collapsed, skippable in a single action.
 *
 * Collapsed is the point. Answering none of these is the ordinary case and it
 * should cost one click, not ten — the old walk charged ten and then printed
 * "no guide set / no subject set" three lines each into the summary for the
 * trouble.
 */
function OptionalForm({ chat, themes, themeLabel, presets, onPickPreset, onDeletePreset, onPatch, onDone, baseline }) {
  const [open, setOpen] = useState(false);
  const fields = tierQuestions(chat.kind, "optional", chat.briefing ?? {}, presets);
  const answered = optionalAnswered(chat.kind, chat.briefing ?? {}, baseline);
  return (
    <Bubble role="assistant">
      <div className="text-[13px] font-medium text-fg">Anything else I should know?</div>
      <div className="mt-0.5 text-[11.5px] leading-relaxed text-fg-faint">
        {answered > 0
          ? `${answered} of ${fields.length} set. The rest stay at their defaults.`
          : `${fields.length} optional details — a thesis or an audience sharpens the argument, but none of them is needed.`}
      </div>

      {open && (
        <div className="mt-3">
          {fields.map((q, i) => (
            <FormField key={q.key} q={q} first={i === 0}>
              <BriefingControl
                q={q} chat={chat} themes={themes} themeLabel={themeLabel} presets={presets}
                onPickPreset={onPickPreset} onDeletePreset={onDeletePreset} onPatch={onPatch}
              />
            </FormField>
          ))}
        </div>
      )}

      <div className="mt-3.5 flex flex-wrap items-center gap-2 border-t border-line pt-3">
        <Button variant="primary" onClick={onDone}>{answered > 0 ? "Done — build it" : "Skip, use the defaults"}</Button>
        <Button size="sm" variant="outline" onClick={() => setOpen((o) => !o)}>
          {open ? "Hide details" : "Add detail"}
        </Button>
      </div>
    </Bubble>
  );
}

function CardFooter({ onNext, nextLabel = "Next", disabled = false }) {
  return (
    <div className="mt-2.5 flex justify-end">
      <Button variant="primary" size="sm" onClick={onNext} disabled={disabled}>{nextLabel}</Button>
    </div>
  );
}

function TitleCard({ value, onNext, embedded = false }) {
  const [v, setV] = useState(value ?? "");
  const commit = () => onNext({ title: v.trim() || value });
  return (
    <div>
      <div className="mb-1.5 text-[11px] text-fg-faint">Suggested from your topic — edit freely.</div>
      <input
        value={v}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") commit(); }}
        onBlur={embedded ? commit : undefined}
        autoFocus={!embedded}
        className={inputCls}
      />
      {!embedded && <CardFooter onNext={commit} />}
    </div>
  );
}

/** A free-text briefing answer — type it or leave blank to move on. */
function FreeTextCard({ field, value, onNext, placeholder = "", embedded = false }) {
  const [v, setV] = useState(value ?? "");
  const submit = () => onNext({ [field]: v.trim() });
  return (
    <div>
      {!embedded && <div className="mb-1.5 text-[11px] text-fg-faint">Skip to move on — an empty answer just uses the default.</div>}
      <textarea
        value={v}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !embedded) { e.preventDefault(); submit(); } }}
        onBlur={embedded ? submit : undefined}
        rows={2}
        placeholder={placeholder}
        autoFocus={!embedded}
        className={`${inputCls} resize-none`}
      />
      {!embedded && <CardFooter onNext={submit} nextLabel="Continue" />}
    </div>
  );
}

function TeamCard({ team, onNext, embedded = false }) {
  const [label, setLabel] = useState(team?.label ?? "");
  const [members, setMembers] = useState(((team?.members ?? []).map((m) => ({ ...m }))));
  const edit = (i, patch) => setMembers((ms) => ms.map((m, j) => (j === i ? { ...m, ...patch } : m)));
  const add = () => setMembers((ms) => [...ms, { name: "", roll: "", presenting: false }]);
  const named = members.filter((m) => m.name?.trim());
  const presenting = named.filter((m) => m.presenting);

  return (
    <div className="w-full">
      <div className="mb-1.5 text-[11px] text-fg-faint">
        Visible rows, an obvious add — nobody is saved until you press Next, and
        “presents” decides who the slides split across.
      </div>

      <div className="grid grid-cols-[1fr_4.5rem_5rem_2rem] items-center gap-2 px-1 pb-1 text-[10px] font-medium uppercase tracking-wider text-fg-faint">
        <div>Name</div><div>Roll</div><div>Presents</div><div />
      </div>

      <div className="space-y-1.5">
        {members.map((m, i) => (
          <div key={i} className="grid grid-cols-[1fr_4.5rem_5rem_2rem] items-center gap-2">
            <input
              value={m.name ?? ""}
              onChange={(e) => edit(i, { name: e.target.value })}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (i === members.length - 1) add(); } }}
              placeholder="Full name"
              className={`${inputCls} py-1.5 text-[12.5px]`}
            />
            <input
              value={m.roll ?? ""}
              onChange={(e) => edit(i, { roll: e.target.value })}
              placeholder="21"
              className={`${inputCls} py-1.5 text-[12.5px]`}
            />
            <label className="flex cursor-pointer items-center justify-center gap-1 text-[11px] text-fg-muted">
              <input
                type="checkbox"
                checked={Boolean(m.presenting)}
                onChange={(e) => edit(i, { presenting: e.target.checked })}
                className="h-3.5 w-3.5 accent-[--accent]"
              />
              presents
            </label>
            <button
              onClick={() => setMembers((ms) => ms.filter((_, j) => j !== i))}
              className="rounded p-1 text-fg-faint transition hover:bg-hover hover:text-amber"
              title="Remove member"
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
            </button>
          </div>
        ))}
      </div>

      <button
        onClick={add}
        className="mt-2 w-full rounded-lg border border-dashed border-line py-1.5 text-[12px] text-fg-faint transition hover:border-accent/50 hover:text-accent"
      >
        + Add member
      </button>

      <div className="mt-2 flex items-center gap-2">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Group label (optional)"
          className={`${inputCls} w-48 py-1.5 text-[12.5px]`}
        />
        {named.length > 0 && (
          <span className="text-[11px] text-fg-faint">
            {named.length} member{named.length === 1 ? "" : "s"}{presenting.length ? ` · ${presenting.length} presenting` : ""}
          </span>
        )}
      </div>

      {!embedded && (
        <CardFooter
          onNext={() => onNext({ team: { label, members: members.filter((m) => m.name?.trim()) } })}
          nextLabel={named.length ? `Next — ${named.length} on the team` : "Next"}
        />
      )}
    </div>
  );
}

function GuideCard({ guide, onNext, embedded = false }) {
  const [name, setName] = useState(guide?.name ?? "");
  const [designation, setDesignation] = useState(guide?.designation ?? "");
  const commit = () => onNext({ guide: { name, designation } });
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      <label className="block">
        <div className="mb-1 text-[11px] text-fg-faint">Name</div>
        <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") commit(); }} onBlur={embedded ? commit : undefined} className={inputCls} />
      </label>
      <label className="block">
        <div className="mb-1 text-[11px] text-fg-faint">Designation</div>
        <input value={designation} onChange={(e) => setDesignation(e.target.value)} onBlur={embedded ? commit : undefined} className={inputCls} />
      </label>
      {!embedded && (
        <div className="sm:col-span-2">
          <CardFooter onNext={commit} />
        </div>
      )}
    </div>
  );
}

function AcademicCard({ academic, onNext, embedded = false }) {
  const [v, setV] = useState({ ...(academic ?? {}) });
  const set = (patch) => setV((x) => ({ ...x, ...patch }));
  const commit = embedded ? () => onNext({ academic: v }) : undefined;
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      <label className="block sm:col-span-2">
        <div className="mb-1 text-[11px] text-fg-faint">Subject</div>
        <input value={v.subject ?? ""} onChange={(e) => set({ subject: e.target.value })} onBlur={commit} className={inputCls} />
      </label>
      <label className="block">
        <div className="mb-1 text-[11px] text-fg-faint">Academic year</div>
        <input value={v.year ?? ""} onChange={(e) => set({ year: e.target.value })} onBlur={commit} className={inputCls} />
      </label>
      <label className="block">
        <div className="mb-1 text-[11px] text-fg-faint">Semester</div>
        <input value={v.semester ?? ""} onChange={(e) => set({ semester: e.target.value })} onBlur={commit} className={inputCls} />
      </label>
      <label className="block sm:col-span-2">
        <div className="mb-1 text-[11px] text-fg-faint">Exam type</div>
        <input value={v.exam_type ?? ""} onChange={(e) => set({ exam_type: e.target.value })} onBlur={commit} className={inputCls} />
      </label>
      {!embedded && (
        <div className="sm:col-span-2">
          <CardFooter onNext={() => onNext({ academic: v })} />
        </div>
      )}
    </div>
  );
}

/** The theme gallery — visual previews, searchable, Gamma-like. */
/**
 * `embedded` is the briefing form's mode: the control patches the briefing as
 * soon as it is touched and renders no footer of its own, because the form has
 * one action for the whole tier. Without it every field would carry its own
 * "Continue" and the form would be the walk again with worse spacing.
 */
function ThemeCard({ themes, value, onNext, embedded = false }) {
  const [sel, setSel] = useState(value ?? "");
  const pick = (name) => { setSel(name); if (embedded) onNext({ theme: name }); };
  const [q, setQ] = useState("");
  const selectedRef = useRef(null);
  // Only chase the selection when this is a card of its own. Inside the tier
  // form the gallery is one field among several, and scrolling its inner
  // scroller on mount opened the form half-way down the theme list.
  useEffect(() => {
    if (embedded) return;
    selectedRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [sel, embedded]);
  const filtered = themes.filter((t) => {
    if (!q.trim()) return true;
    const s = q.toLowerCase();
    return t.name.includes(s) || (t.label ?? "").toLowerCase().includes(s) || (t.summary ?? "").toLowerCase().includes(s);
  });
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[11px] text-fg-faint">{filtered.length} of {themes.length} themes — drawn live, this is exactly how slides look</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter themes…" className="ml-auto w-36 rounded-full border border-line bg-sunken px-2.5 py-1 text-[11px] outline-none placeholder:text-fg-faint focus:border-accent" />
      </div>
      {themes.length === 0 && <div className="text-[12px] text-fg-faint">Loading themes…</div>}
      <div className="grid max-h-[420px] grid-cols-2 gap-3 overflow-y-auto pr-1 sm:grid-cols-3">
        {filtered.map((t) => (
          <div key={t.name} ref={sel === t.name || (!sel && t.name === "warm-humanist") ? selectedRef : null} className="min-w-0">
            <ThemeMiniCard theme={t} selected={sel === t.name || (!sel && t.name === "warm-humanist")} defaultTheme={t.name === "warm-humanist"} onClick={() => pick(t.name)} />
          </div>
        ))}
        {filtered.length === 0 && <div className="col-span-full py-8 text-center text-[12px] text-fg-faint">No themes match “{q}”</div>}
      </div>
      {!embedded && <CardFooter onNext={() => onNext({ theme: sel })} nextLabel="Use this theme" />}
    </div>
  );
}

function ChoicePills({ options, value, onPick }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o.id ?? o.value}
          onClick={() => onPick(o.value)}
          className={`pill px-2.5 py-1 text-[12px] font-medium transition ${
            value === o.value ? "bg-hover text-fg" : "text-fg-faint hover:bg-raised hover:text-fg-muted"
          }`}
        >
          {o.label}
          {o.note && <span className="text-[10px] text-fg-faint"> — {o.note}</span>}
        </button>
      ))}
    </div>
  );
}

function MaxSlidesCard({ value, onNext, embedded = false }) {
  const [v, setV] = useState(value ?? 0);
  const [custom, setCustom] = useState("");
  const pick = (n) => { setV(n); if (embedded) onNext({ maxSlides: n }); };
  return (
    <div>
      <ChoicePills
        options={SLIDE_COUNTS.map((n) => ({ value: n, label: n === 0 ? "Auto" : `${n}` }))}
        value={v}
        onPick={pick}
      />
      <div className="mt-2 flex items-center gap-2">
        <input
          type="number"
          min={3}
          max={24}
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          placeholder="…or a custom number"
          className={`${inputCls} w-44 py-1.5 text-[12.5px]`}
        />
        {custom && (
          <Button size="sm" onClick={() => pick(Number(custom) || 0)}>Set</Button>
        )}
      </div>
      {!embedded && <CardFooter onNext={() => onNext({ maxSlides: v })} nextLabel={v === 0 ? "Auto it is" : `Use ${v}`} />}
    </div>
  );
}

function SlidesPerMemberCard({ value, onNext, embedded = false }) {
  const [v, setV] = useState(value ?? null);
  const [custom, setCustom] = useState("");
  const pick = (n) => { setV(n); if (embedded) onNext({ slidesPerMember: n }); };
  return (
    <div>
      <ChoicePills
        options={PER_MEMBER.map((n) => ({ value: n, label: n === null ? "Auto" : `${n} each` }))}
        value={v}
        onPick={pick}
      />
      <div className="mt-2 flex items-center gap-2">
        <input
          type="number"
          min={1}
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          placeholder="…or a custom count"
          className={`${inputCls} w-44 py-1.5 text-[12.5px]`}
        />
        {custom && <Button size="sm" onClick={() => pick(Number(custom) || null)}>Set</Button>}
      </div>
      {!embedded && <CardFooter onNext={() => onNext({ slidesPerMember: v })} nextLabel="Continue" />}
    </div>
  );
}

function DensityCard({ value, onNext, embedded = false }) {
  const [v, setV] = useState(value ?? "balanced");
  const pick = (x) => { setV(x); if (embedded) onNext({ density: x }); };
  return (
    <div>
      <ChoicePills
        options={DENSITIES.map((d) => ({ value: d.id, label: d.id[0].toUpperCase() + d.id.slice(1), note: d.note }))}
        value={v}
        onPick={pick}
      />
      {!embedded && <CardFooter onNext={() => onNext({ density: v })} nextLabel="Continue" />}
    </div>
  );
}

const DEPTHS = [
  { value: "full", label: "Full", note: "3-6 paragraphs per section, a table where it earns one" },
  { value: "brief", label: "Brief", note: "a headline statement + 3 supporting sentences, no tables" },
];

function DepthCard({ value, onNext, embedded = false }) {
  const [v, setV] = useState(value ?? "full");
  const pick = (x) => { setV(x); if (embedded) onNext({ depth: x }); };
  return (
    <div>
      <ChoicePills options={DEPTHS} value={v} onPick={pick} />
      {!embedded && <CardFooter onNext={() => onNext({ depth: v })} nextLabel="Continue" />}
    </div>
  );
}

const BRANDINGS = [
  { value: "full", label: "Full branding", note: "banner + crest + footer marks" },
  { value: "minimal", label: "Minimal", note: "crest and slide numbers, no banner" },
  { value: "none", label: "No branding", note: "just slide numbers — no institution marks" },
];

function BrandingCard({ value, onNext, embedded = false }) {
  const [v, setV] = useState(value ?? "full");
  const pick = (x) => { setV(x); if (embedded) onNext({ branding: x }); };
  return (
    <div>
      <div className="mb-2 text-[11px] leading-relaxed text-fg-faint">
        The institution's marks (banner, crest, footer) render on every slide
        by default. "No branding" strips them entirely and keeps only the slide
        numbers.
      </div>
      <ChoicePills
        options={BRANDINGS}
        value={v}
        onPick={pick}
      />
      {!embedded && <CardFooter onNext={() => onNext({ branding: v })} nextLabel="Continue" />}
    </div>
  );
}

function ResearchCard({ value, onNext, kind, uploaded, onUpload, papersValue, onPapers, onSource, embedded = false }) {
  // Controlled from the briefing (researchSource / papers), NOT local state:
  // the card remounts on every briefing update (QuestionCard keys on
  // chat.briefStep), and local state would reset — the "Papers too" pick
  // snapped back to "Web only" until repeated clicks finally stuck.
  const v = value;
  const papers = papersValue;
  const [file, setFile] = useState(uploaded ?? null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  // A standalone report always needs content to write from, so "no research"
  // is not offered there — the file is the alternative to the web pass.
  const options = [
    { value: "web", label: "Web search", note: "SearXNG research over the topic — the default" },
    { value: "upload", label: "My uploaded file", note: "no search — the file is the only content source" },
    ...(kind === "report" ? [] : [{ value: "none", label: "No research", note: "write from the topic alone" }]),
  ];

  const pickFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploading(true);
    setUploadError("");
    onUpload(f)
      .then((staged) => setFile({ ...staged, name: f.name }))
      .catch((err) => setUploadError(err.message))
      .finally(() => { setUploading(false); e.target.value = ""; });
  };

  const finish = () => {
    if (v === "upload" && !file) return; // never plan an upload with no file
    onNext({
      research: v === "web",
      papers: v === "web" && papers,
      researchSource: v,
      uploadedSource: v === "upload" ? file : null,
    });
  };

  return (
    <div>
      <div className="mb-2 text-[11px] leading-relaxed text-fg-faint">
        Where should the content come from? Research searches the topic; an
        uploaded file makes YOUR document the only source of truth — the
        writer never goes outside it.
      </div>
      <ChoicePills options={options} value={v} onPick={onSource} />
      {v === "web" && (
        <div className="mt-2 rounded-lg border border-line bg-sunken px-3 py-2">
          <div className="mb-1 text-[11px] text-fg-faint">
            Also search arXiv and Crossref for academic papers on the topic?
          </div>
          <ChoicePills
            options={[
              { value: true, label: "Papers too" },
              { value: false, label: "Web only" },
            ]}
            value={papers}
            onPick={onPapers}
          />
        </div>
      )}
      {v === "upload" && (
        <div className="mt-2 rounded-lg border border-line bg-sunken px-3 py-2">
          {file ? (
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-[12.5px] font-medium text-fg">{file.name}</div>
                <div className="text-[11px] text-fg-faint">
                  ~{Number(file.words ?? 0).toLocaleString()} words · your file is the source of truth
                </div>
              </div>
              <button
                onClick={() => setFile(null)}
                className="shrink-0 rounded p-1 text-fg-faint transition hover:bg-hover hover:text-amber"
                title="Remove file"
              >
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
              </button>
            </div>
          ) : (
            <div>
              <div className="mb-1.5 text-[11px] text-fg-faint">
                Markdown, text, Word or PDF — the document becomes the notes.
              </div>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-line bg-raised px-3 py-1.5 text-[12px] text-fg transition hover:border-accent/50 hover:text-accent">
                {uploading ? <Spinner /> : (
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" /></svg>
                )}
                {uploading ? "Reading your file…" : "Choose a file…"}
                <input type="file" accept=".md,.txt,.markdown,.docx,.pdf" onChange={pickFile} className="hidden" disabled={uploading} />
              </label>
            </div>
          )}
          {uploadError && (
            <div className="mt-2 rounded-lg border border-danger/30 bg-danger/10 px-2 py-1.5 text-[11px] leading-relaxed text-danger">{uploadError}</div>
          )}
          {!file && !uploading && (
            <div className="mt-2 text-[11px] text-fg-faint">A file is required before the briefing can finish.</div>
          )}
        </div>
      )}
      {/* Already controlled from the briefing through onSource/onPapers, so
          embedded needs nothing but the footer gone. */}
      {!embedded && <CardFooter onNext={finish} nextLabel="Finish briefing" disabled={v === "upload" && !file} />}
    </div>
  );
}

function PresetSave({ onSave, state }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  if (!open) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        Save as preset…
      </Button>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { onSave(name); setOpen(false); } if (e.key === "Escape") setOpen(false); }}
        placeholder="e.g. IE preset"
        className={`${inputCls} w-40 py-1.5 text-[12px]`}
      />
      <Button size="sm" variant="outline" disabled={!name.trim() || state.status === "saving"}
        onClick={() => { onSave(name); setOpen(false); }}>
        {state.status === "saving" ? <Spinner /> : "Save"}
      </Button>
      <button onClick={() => setOpen(false)} className="rounded p-1 text-fg-faint hover:text-fg" title="Cancel">
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
      </button>
    </span>
  );
}

function researchLabel(b) {
  if (b.researchSource === "upload") return `from my file (${b.uploadedSource?.name ?? "upload"})`;
  if (b.researchSource === "web") return b.papers ? "research + papers" : "researched";
  return "no research";
}

function SummaryLine({ chat, themeLabel }) {
  const b = chat.briefing ?? {};
  const presenting = (b.team?.members ?? []).filter((m) => m.presenting && m.name?.trim()).map((m) => m.name.trim());
  const bits = chat.kind === "report"
    ? [
        b.title || "Untitled",
        `${b.depth === "brief" ? "brief" : "full"} depth`,
        `${b.density} density`,
        b.branding === "full" ? "full branding" : b.branding === "minimal" ? "minimal branding" : "no branding",
        researchLabel(b),
      ]
    : [
        b.title || "Untitled",
        `${b.maxSlides || "auto"} slides`,
        themeLabel(b.theme),
        `${b.density} density`,
        b.branding === "full" ? "full branding" : b.branding === "minimal" ? "minimal branding" : "no branding",
        researchLabel(b),
      ];
  if (presenting.length) bits.push(`${presenting.length} presenting`);
  return (
    <div className="text-[13px] leading-relaxed text-fg-muted">
      <span className="font-semibold text-fg">
        {b.title || (chat.kind === "report" ? "Untitled report" : "Untitled deck")}
      </span>
      {presenting.length > 0 && (
        <span className="mt-1 block text-[12px]">
          Presenting: <span className="text-fg-muted">{presenting.join(", ")}</span>
        </span>
      )}
      <span className="mt-1 block text-[12px]">{bits.join(" · ")}</span>
      {b.audience?.trim() && (
        <span className="mt-1 block text-[12px]">For: <span className="text-fg-muted">{b.audience.trim()}</span></span>
      )}
      {b.emphasis?.trim() && (
        <span className="mt-1 block text-[12px]">Emphasis: <span className="text-fg-muted">{b.emphasis.trim()}</span></span>
      )}
    </div>
  );
}

/** The compact recap of the deck-briefing answers, shown once the deck is
 *  ready — the briefing "cards" collapse into this block and the Q&A record
 *  stays inside it, expandable, so nothing said for the deck is lost. */
function DeckBriefing({ chat, answered, echoAnswer, themeLabel, presetLabel }) {
  const [open, setOpen] = useState(false);
  const b = chat.briefing ?? {};
  const presenting = (b.team?.members ?? []).filter((m) => m.presenting && m.name?.trim()).map((m) => m.name.trim());
  const bits = [
    b.title?.trim() || chat.title || "Untitled",
    `${b.maxSlides || "auto"} slides`,
    themeLabel(b.theme),
    `${b.density} density`,
    b.branding === "full" ? "full branding" : b.branding === "minimal" ? "minimal branding" : "no branding",
  ];
  return (
    <Panel className="p-4">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 text-left"
        title={open ? "Collapse the briefing record" : "Show the full briefing record"}
      >
        <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-faint">Deck briefing</span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-fg-faint transition-transform duration-150 ${open ? "rotate-180" : ""}`} />
        <span className="ml-auto hidden min-w-0 truncate text-[11.5px] text-fg-muted sm:block">{bits.join(" · ")}</span>
      </button>
      <div className="mt-1.5 text-[12px] leading-relaxed text-fg-muted sm:hidden">{bits.join(" · ")}</div>
      {presenting.length > 0 && (
        <div className="mt-1 text-[11.5px] text-fg-muted">
          Presenting: <span className="text-fg">{presenting.join(", ")}</span>
        </div>
      )}
      {open && (
        <div className="mt-3 space-y-1 border-t border-line/60 pt-2.5">
          <div className="mb-1 text-[10.5px] font-medium uppercase tracking-wider text-fg-faint">What was said</div>
          {answered.map((q) => (
            <div key={q.key} className="rounded-lg bg-sunken px-2.5 py-1.5">
              <div className="text-[10px] font-medium uppercase tracking-wider text-fg-faint">{q.ask}</div>
              <div className="text-[12.5px] text-fg">{echoAnswer(chat.briefing ?? {}, q.key, { themeLabel, presetLabel })}</div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

/** One-line description of what an edit turn applied — the assistant's reply
 *  in the turn log. Never claims more than the turn returned. */
function turnSummary(r) {
  const parts = [];
  if (r.changes?.length) parts.push(r.changes.slice(0, 5).join("; "));
  if (r.problems?.length) parts.push(r.problems.slice(0, 3).join("; "));
  return parts.join("  ") || "Applied.";
}

/**
 * The generation-run banner: what a reload finds between "approved the plan"
 * and "the deck is produced". A live server-side run is watched (reconnect),
 * a partial checkpoint is offered for resume, and a complete-but-unfinalised
 * deck is offered for finalize — never a silent fresh run from slide 1.
 */
function DeckRunCard({ run, onResume, onFinalize, onStop, onOpen }) {
  if (!run || (!run.active && !run.resumable && !run.needsFinalize)) return null;
  let title;
  let hint;
  if (run.active) {
    title = `Generation in progress — ${run.written}/${run.total} slides written`;
    hint = "The run survived the refresh; it continues in the background and this view is watching it.";
  } else if (run.needsFinalize) {
    title = `The deck is fully written (${run.total} slides) but was never finalised`;
    hint = "Finalize runs the post-write pass — grounding, text fitting, review and render — and flips it to ready.";
  } else {
    title = `This deck has ${run.written}/${run.total} slides written`;
    hint = "A previous run stopped part-way. Resume continues writing the remaining slides; the slides already written are on disk.";
  }
  return (
    <Panel className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[13px] font-semibold text-fg">
            <span className="h-2 w-2 shrink-0 rounded-full bg-amber" />
            {title}
          </div>
          <div className="mt-0.5 text-[11.5px] leading-relaxed text-fg-muted">{hint}</div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {run.active ? (
            <>
              <Button size="sm" variant="outline" onClick={onStop}>Stop</Button>
              <Button size="sm" variant="primary" onClick={onOpen}>Open what's written</Button>
            </>
          ) : run.needsFinalize ? (
            <>
              <Button size="sm" variant="outline" onClick={onOpen}>Open what's written</Button>
              <Button size="sm" variant="primary" onClick={onFinalize}>Finalize this deck</Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="outline" onClick={onOpen}>Open what's written</Button>
              <Button size="sm" variant="primary" onClick={onResume}>Resume generation</Button>
            </>
          )}
        </div>
      </div>
    </Panel>
  );
}

/**
 * The outline gate, in the thread. Every slide reads in plain language — the
 * type's description, not an enum value — with its purpose editable, the type
 * switchable, and rows movable. Approve is the only thing that writes slides.
 */
function OutlineCard({ chat, types, plan, onPlan, themeLabel, busy, onApprove }) {
  if (!plan) return null;
  const edit = (i, patch) => onPlan({ ...plan, slides: plan.slides.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  const move = (i, dir) => onPlan((() => {
    const slides = [...plan.slides];
    const j = i + dir;
    if (j < 0 || j >= slides.length) return plan;
    [slides[i], slides[j]] = [slides[j], slides[i]];
    return { ...plan, slides };
  })());

  return (
    <Panel className="p-5">
      <div className="mb-1 flex items-center gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wider text-fg-faint">Here's the plan</span>
        <Badge className="bg-raised text-fg-faint">{chat.deckSlug}</Badge>
      </div>
      <p className="mb-4 text-[12px] leading-relaxed text-fg-muted">
        Nothing is written until you approve — edit the purpose, switch a type, or reorder rows freely.
      </p>

      <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="block">
          <div className="mb-1 text-[11px] text-fg-faint">Title</div>
          <input value={plan.title ?? ""} onChange={(e) => onPlan({ ...plan, title: e.target.value })} className={inputCls} />
        </label>
        <label className="block">
          <div className="mb-1 text-[11px] text-fg-faint">Subtitle</div>
          <input value={plan.subtitle ?? ""} onChange={(e) => onPlan({ ...plan, subtitle: e.target.value })} className={inputCls} />
        </label>
      </div>

      <div className="space-y-2">
        {plan.slides.map((s, i) => {
          const meta = types[s.type] ?? { label: s.type, description: "" };
          return (
            <div key={i} className="rounded-card border border-line bg-sunken p-3">
              <div className="mb-1.5 flex items-center gap-2">
                <span className="font-mono text-[10px] tabular-nums text-fg-faint">{String(i + 1).padStart(2, "0")}</span>
                <span className="text-[12.5px] font-semibold text-fg">{meta.label ?? s.type}</span>
                <span className="truncate text-[11px] text-fg-faint">— {meta.description}</span>
                <div className="ml-auto flex shrink-0 items-center gap-0.5">
                  <button onClick={() => move(i, -1)} disabled={i === 0} className="rounded p-1 text-fg-faint transition hover:bg-hover hover:text-fg disabled:opacity-30" title="Move up">
                    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 15 6-6 6 6" /></svg>
                  </button>
                  <button onClick={() => move(i, 1)} disabled={i === plan.slides.length - 1} className="rounded p-1 text-fg-faint transition hover:bg-hover hover:text-fg disabled:opacity-30" title="Move down">
                    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                  </button>
                  <button onClick={() => onPlan({ ...plan, slides: plan.slides.filter((_, j) => j !== i) })} className="rounded p-1 text-fg-faint transition hover:bg-hover hover:text-amber" title="Remove slide">
                    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
                  </button>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <select
                  value={s.type ?? "bullets"}
                  onChange={(e) => edit(i, { type: e.target.value })}
                  className="w-40 shrink-0 appearance-none rounded-lg border border-line bg-panel px-2 py-1.5 text-[12px] text-fg-muted outline-none transition hover:border-line-strong focus:border-accent"
                >
                  {Object.keys(types).length
                    ? Object.entries(types).map(([t, m]) => <option key={t} value={t}>{m.label}</option>)
                    : <option value={s.type}>{s.type}</option>}
                </select>
                <textarea
                  value={s.purpose ?? ""}
                  onChange={(e) => edit(i, { purpose: e.target.value })}
                  rows={1}
                  placeholder="What this slide must convey…"
                  className={`${inputCls} min-w-0 flex-1 resize-none py-1.5 text-[12.5px]`}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => onPlan({ ...plan, slides: [...plan.slides, { type: "bullets", section: null, purpose: "" }] })}>
          + Add slide
        </Button>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        <span className="text-[12px] text-fg-muted">
          Theme: <span className="font-medium text-fg">{themeLabel((chat.briefing ?? {}).theme)}</span>
        </span>
        <Button variant="primary" onClick={onApprove} disabled={busy}>
          {busy && <Spinner />}
          Approve &amp; generate
        </Button>
      </div>
    </Panel>
  );
}

/** The type-picker modal for the selected slides — a compact list of every
 *  type's name + description; the swap runs through the deck view's convert
 *  endpoint (remap when compatible, scoped rewrite otherwise). */
function TypePickModal({ types, onPick, onClose }) {
  return (
    <div className="fade-in fixed inset-0 z-50 flex items-center justify-center bg-sunken/80 p-6 backdrop-blur-sm">
      <div className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-2xl border border-line bg-panel p-4 shadow-[var(--shadow-float)]">
        <div className="mb-1 flex items-center justify-between">
          <div className="text-[13px] font-semibold text-fg">Swap the selected slides' type</div>
          <button onClick={onClose} className="rounded-lg px-2 py-1 text-fg-faint transition hover:bg-hover hover:text-fg" aria-label="Close">
            ✕
          </button>
        </div>
        <p className="mb-3 text-[11.5px] leading-relaxed text-fg-faint">
          Compatible types remap instantly; the rest get a scoped rewrite grounded in the research.
        </p>
        <div className="space-y-1">
          {Object.entries(types).map(([t, m]) => (
            <button
              key={t}
              onClick={() => onPick(t)}
              className="block w-full rounded-lg border border-line bg-sunken px-3 py-2 text-left transition hover:border-accent/60 hover:bg-hover"
            >
              <span className="block text-[12.5px] font-medium text-fg">{m.label ?? t}</span>
              {m.description && (
                <span className="block truncate text-[11px] text-fg-faint">{m.description}</span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
