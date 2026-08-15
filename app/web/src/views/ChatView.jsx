import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { Button, Panel, Spinner, Badge, inputCls } from "../components/ui.jsx";
import ThemeMiniCard from "../components/ThemeMiniCard.jsx";
import SlideSelectPanel from "../components/SlideSelectPanel.jsx";
import Lightbox from "../components/Lightbox.jsx";
import { ChevronDown, DocIcon, LayersIcon, SparkleIcon } from "../components/icons.jsx";
import { useModels } from "../lib/useModels.js";
import { progressLabel } from "../lib/progress.js";
import { BRIEFING_QUESTIONS, REPORT_QUESTIONS, PRESET_KEYS, questionsFor, initialBriefing, suggestTitle, echoAnswer, applyFreeText, applyPresetToBriefing, effectiveBriefStep, presetPayload, briefingAnsweredText } from "../lib/briefing.js";
import { runs } from "../lib/runs.js";
import { deckContext } from "../lib/deckContext.js";

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
  if (chat.kind === "report") {
    if (chat.produced) return "record";
    if (!chat.topic) return "greeting";
    if (effStep < questions.length) return "briefing";
    return "summary";
  }
  if (chat.produced) return "editing"; // the deck exists — the thread edits it
  if (chat.plan) return "outline";
  if (!chat.topic) return "greeting";
  if (effStep >= questions.length) return "summary";
  return "briefing";
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
  chat, identity, onChatChanged, onOpenDeck, onOpenReport, onDeckChanged, onIdentityChanged,
}) {
  const [themes, setThemes] = useState([]);
  const [types, setTypes] = useState({});
  const [presets, setPresets] = useState([]);
  const [input, setInput] = useState("");
  const [freeHint, setFreeHint] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState(chat.error ?? "");
  const [job, setJob] = useState(null);
  const [draftPlan, setDraftPlan] = useState(null);
  const [defaultsState, setDefaultsState] = useState({ status: "idle" });
  const [presetSaveState, setPresetSaveState] = useState({ status: "idle" });
  const { models, mode: modelMode, cloudOn, defaultModel } = useModels();
  const [model, setModel] = useState(chat.model ?? "");
  // The slide-selection panel: the deck's content + previews (fetched when the
  // deck is ready), which slides the user has picked, and the enlarged slide.
  const [deckData, setDeckData] = useState(null); // { slides:[{type,headline}], thumbs:[] }
  const [selected, setSelected] = useState(() => new Set(chat.selectedSlides ?? []));
  const [openIndex, setOpenIndex] = useState(null); // enlarged slide in the panel
  const [punching, setPunching] = useState(false);
  const [swapping, setSwapping] = useState(false);
  const [swapOpen, setSwapOpen] = useState(false); // the type-picker modal
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const chatRef = useRef(chat);

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
    api.presets().then((r) => setPresets(r.presets ?? [])).catch(() => {});
  }, []);

  useEffect(() => { setDraftPlan(chat.plan); }, [chat.plan]);

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
  const phase = phaseOf(chat, effectiveBriefStep(chat.briefing, chat.briefStep, questions), questions);
  const qIndex = Math.min(effectiveBriefStep(chat.briefing, chat.briefStep, questions), questions.length - 1);
  const currentQuestion = phase === "briefing" ? questions[qIndex] : null;

  const themeLabel = (name) => {
    if (!name) return "Default (warm-humanist)";
    return themes.find((t) => t.name === name)?.label ?? name;
  };

  const presetById = (id) => presets.find((p) => p.id === id) ?? null;
  const presetLabel = (id) => presetById(id)?.name ?? id;

  function persist(updated) {
    onChatChanged(updated);
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
      updatedAt: new Date().toISOString(),
    });
  }

  /** One question answered (via the card's controls or free text). */
  function onNext(patch) {
    const briefing = { ...chat.briefing, ...patch };
    const named = patch.title ? chatName(patch.title, chat.topic) : chat.title;
    persist({
      ...chat,
      title: named,
      briefing,
      briefStep: Math.min(chat.briefStep + 1, questions.length),
      updatedAt: new Date().toISOString(),
    });
  }

  /** Jump back to an earlier question — later answers are re-asked. */
  function editAt(i) {
    const q = questions[i];
    // Rewinding to a preset-fixed question un-skips it so the user can change
    // the preset's value for this deck without abandoning the whole format.
    const briefing = q && PRESET_KEYS.includes(q.key)
      ? { ...chat.briefing, unskip: [...(chat.briefing?.unskip ?? []), q.key] }
      : chat.briefing;
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
      ? applyPresetToBriefing(chat.briefing, { ...preset, id: preset.id })
      : chat.briefing;
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
        ? await api.updatePreset(existing.id, { ...presetPayload(chat.briefing), name: clean })
        : await api.savePreset({ ...presetPayload(chat.briefing), name: clean });
      setPresets((list) => {
        const next = existing ? list.map((p) => (p.id === saved.preset?.id ? saved.preset : p)) : [saved.preset, ...list];
        return next;
      });
      setPresetSaveState({ status: "saved" });
    } catch (err) {
      setPresetSaveState({ status: "error", message: err.message });
    }
  }

  async function deletePreset(id) {
    try {
      await api.deletePreset(id);
      setPresets((list) => list.filter((p) => p.id !== id));
    } catch (err) {
      window.alert(`Could not delete preset: ${err.message}`);
    }
  }

  function densityNote(d) {
    return DENSITIES.find((x) => x.id === d)?.note ?? d;
  }

  /** The ONLY trigger of research/planning. Everything before this was local. */
  function planDeck() {
    const b = chat.briefing;
    let brief = chat.topic;
    const notes = [];
    if (b.density !== "balanced") notes.push(`Keep the slides ${b.density} density — ${densityNote(b.density)}.`);
    if (b.slidesPerMember) notes.push(`Distribute the CONTENT slides (not section dividers) roughly evenly, about ${b.slidesPerMember} per presenting member.`);
    if (b.audience?.trim()) notes.push(`The deck is for: ${b.audience.trim()}. Write to that audience and make sure they leave having absorbed it.`);
    if (b.emphasis?.trim()) notes.push(`Emphasis: ${b.emphasis.trim()}. These parts matter most — give them the most slides and the deepest treatment.`);
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
        theme: chat.briefing.theme || undefined,
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
      updatedAt: new Date().toISOString(),
    });
  }

  function runReport(c) {
    setBusy(true);
    setError("");
    setStatus("Queued…");
    const b = c.briefing ?? {};
    const identityPayload = {
      academic: b.academic ?? identity?.academic ?? {},
      guide: b.guide ?? identity?.guide ?? {},
      team: b.team ?? identity?.team ?? {},
      chrome: { branding: b.branding ?? "full" },
    };
    runs.begin(c.id, { abort: () => {}, status: "Queued…" });
    const j = api.createReport(
      {
        brief: c.topic,
        depth: b.depth ?? "full",
        density: b.density ?? "balanced",
        research: b.research ?? true,
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

  /**
   * Persist the repeated set — guide, subject/year, team — as remembered
   * defaults in config/identity.yaml, the same file the Identity view edits.
   * Institution and brand come from the saved identity and pass through
   * untouched; blank fields are dropped rather than overwriting good defaults.
   */
  async function saveDefaults() {
    const b = chat.briefing;
    const drop = (o) => Object.fromEntries(Object.entries(o ?? {}).filter(([, v]) => String(v ?? "").trim() !== ""));
    const next = {
      ...(identity ?? {}),
      academic: { ...(identity?.academic ?? {}), ...drop(b.academic) },
      guide: { ...(identity?.guide ?? {}), ...drop(b.guide) },
      team: {
        label: b.team?.label ?? identity?.team?.label ?? "",
        members: (b.team?.members ?? []).filter((m) => m.name?.trim()),
      },
    };
    if (!next.team.members.length) delete next.team;
    setDefaultsState({ status: "saving" });
    try {
      await api.saveIdentity(next);
      setDefaultsState({ status: "saved" });
      onIdentityChanged?.(next);
    } catch (err) {
      setDefaultsState({ status: "error", message: err.message });
    }
  }

  /** Flip an empty thread between the two products before a topic is sent. */
  function switchKind(kind) {
    if (chat.topic || kind === chat.kind) return;
    persist({ ...chat, kind, updatedAt: new Date().toISOString() });
  }

  /** The bottom input bar: topic first, then free-text answers to questions,
   *  then — once the deck exists — deck-editing turns. */
  function send() {
    const text = input.trim();
    if (!text || busy) return;
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
    if (phase === "briefing" && currentQuestion) {
      if (currentQuestion.key === "preset") {
        // Free text on the preset question names a saved format, or "none" to
        // start fresh. Picking via the card is the full path; typing a name is
        // the keyboard-only path.
        const named = presets.find((p) => p.name.toLowerCase() === text.trim().toLowerCase());
        if (named) { setInput(""); setFreeHint(""); pickPreset(named); return; }
        if (/^(none|fresh|new|no)/i.test(text.trim())) { setInput(""); setFreeHint(""); pickPreset(null); return; }
        setFreeHint("No preset by that name — pick one from the card, or type 'none' to start fresh.");
        return;
      }
      const r = applyFreeText(chat.briefing, currentQuestion.key, text);
      if (!r) {
        setFreeHint(currentQuestion.key === "theme"
          ? "Pick a theme from the gallery above — typing a name here can't see the previews."
          : "That didn't answer this question — try the card above.");
        return;
      }
      setInput("");
      setFreeHint("");
      onNext(r.briefing);
    }
  }

  const answered = [];
  const effStep = effectiveBriefStep(chat.briefing, chat.briefStep, questions);
  for (let i = 0; i < effStep && i < questions.length; i++) {
    answered.push({ ...questions[i], idx: i });
  }

  const placeholder =
    phase === "greeting"
      ? chat.kind === "report"
        ? "What should the report be about?"
        : "Type a topic — everything else defaults…"
      : phase === "briefing"
        ? `Answer: ${currentQuestion?.ask}`
        : phase === "editing"
          ? "Edit the deck — try \u201cmake slide 2 punchier\u201d…"
          : phase === "record"
            ? "The report is ready — this thread is its record."
            : busy
              ? "Working…"
              : "Review the card above…";
  const inputDisabled = busy || phase === "summary" || phase === "outline" || phase === "record";
  // The slide-selection panel shows beside the thread once the deck is ready
  // and its content is loaded. ~40% of the row; the chat shifts left.
  const showPanel = phase === "editing" && deckData && deckData.slides.length > 0;

  /** The bottom input bar — topic first, then free-text answers to questions,
   *  then — once the deck exists — deck-editing turns. Shared by the greeting
   *  column (centered above the fold) and the pinned footer of a working chat. */
  const composerBar = (
    <div className="surface-well rounded-[var(--radius-lg)] border border-line bg-prompt">
      <div className="flex items-end gap-2 p-3 pb-2">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => { setInput(e.target.value); setFreeHint(""); }}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          rows={1}
          disabled={inputDisabled}
          placeholder={placeholder}
          className="max-h-40 min-h-[2.5rem] flex-1 resize-none bg-transparent px-2 py-1.5 text-[15px] leading-relaxed text-fg outline-none placeholder:text-fg-faint/60 disabled:opacity-50"
        ></textarea>
        <Button variant="primary" onClick={send} disabled={inputDisabled || !input.trim()} title="Send">
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 2 11 13M22 2l-7 20-4-9-9-4Z" />
          </svg>
        </Button>
      </div>

      <div className="flex items-center gap-2 border-t border-line/60 px-3 pb-2.5 pt-2">
        {!chat.topic && (
          <div className="flex items-center gap-0.5 rounded-full bg-panel p-0.5">
            <button
              onClick={() => switchKind("deck")}
              title="A topic becomes a themed deck"
              className={`pill px-2.5 py-1 text-[11.5px] font-medium transition ${chat.kind === "deck" ? "bg-hover text-fg" : "text-fg-faint hover:text-fg-muted"}`}
            >
              <LayersIcon className="h-3 w-3" /> Chat
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
          <div className="relative">
            <select
              value={model}
              onChange={(e) => { const v = e.target.value; setModel(v); persist({ ...chat, model: v || undefined, updatedAt: new Date().toISOString() }); }}
              disabled={inputDisabled}
              title={modelMode === "cloud" ? "Cloud model — requires the attached key" : "Which local model does the work"}
              className="max-w-[15rem] appearance-none rounded-full border border-line bg-sunken py-1 pl-7 pr-7 text-[12px] text-fg-muted outline-none transition hover:border-line-strong focus:border-accent disabled:opacity-50"
            >
              <option value="">auto · {defaultModel}</option>
              {models.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            <SparkleIcon className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-fg-faint" />
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-fg-faint" />
          </div>
        </div>
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
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold text-fg">{chat.title}</div>
          <div className="truncate text-[10.5px] text-fg-faint">
            {chat.kind === "report" ? "standalone report" : "guided deck briefing"}
          </div>
        </div>
        {chat.produced && (
          <Badge className="bg-accent/10 text-accent">ready</Badge>
        )}
      </header>

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

          {!chat.plan && answered.map((q, i) => (
            <div key={q.key}>
              <Bubble role="assistant">
                <div className="mb-0.5 text-[12px] font-medium uppercase tracking-wider text-fg-faint">{q.ask}</div>
                <div className="text-[15px] text-fg">{echoAnswer(chat.briefing, q.key, { themeLabel, presetLabel })}</div>
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

          {currentQuestion && (
            <QuestionCard
              key={`${chat.id}-${currentQuestion.key}-${chat.briefStep}`}
              q={currentQuestion}
              chat={chat}
              themes={themes}
              themeLabel={themeLabel}
              presets={presets}
              onPickPreset={pickPreset}
              onDeletePreset={deletePreset}
              onNext={onNext}
              onFreeText={(text) => {
                const r = applyFreeText(chat.briefing, currentQuestion.key, text);
                if (r) { onNext(r.briefing); return true; }
                return false;
              }}
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
                <Button variant="outline" onClick={saveDefaults} disabled={defaultsState.status === "saving"}>
                  {defaultsState.status === "saving" ? <Spinner /> : null}
                  Remember as defaults
                </Button>
                <PresetSave
                  onSave={saveAsPreset}
                  state={presetSaveState}
                />
                <span className="text-[11px] text-fg-faint">
                  {chat.kind === "report"
                    ? "The only thing that starts research &amp; writing."
                    : "The only thing that starts research &amp; planning."}
                </span>
              </div>
              {defaultsState.status === "saved" && (
                <div className="mt-2 text-[11.5px] text-accent">Saved — next briefing starts from these.</div>
              )}
              {defaultsState.status === "error" && (
                <div className="mt-2 text-[11.5px] text-danger">{defaultsState.message}</div>
              )}
            </Panel>
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

          {(phase === "editing" || phase === "record") && (
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
              : phase === "briefing" ? "Answer in the card above, or type the answer here and send."
                : phase === "editing" ? "Select slides on the right, then type — the AI knows exactly which you mean."
                  : "The app does the bulk; you do the final touches — every model call stays on this machine."}
          </div>
        </div>
      </footer>
          </div>

          {showPanel && (
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

function PresetCard({ presets, value, onPick, onDelete }) {
  const [confirming, setConfirming] = useState(null);
  return (
    <div>
      <div className="mb-2 text-[11px] leading-relaxed text-fg-faint">
        A saved format pre-fills the fixed fields — team, guide, academic
        context, theme, density, branding, slides per member — so only the
        changing bits (title, subject, teacher) need answering.
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
                {p.team?.members?.length ?? 0} members{p.theme ? ` · ${p.theme}` : ""} · {p.density} density
                {p.branding !== "full" ? ` · ${p.branding} branding` : ""}
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

function QuestionCard({ q, chat, themes, themeLabel, presets, onPickPreset, onDeletePreset, onNext }) {
  const b = chat.briefing;
  return (
    <Bubble role="assistant">
      <div className="mb-1 text-[12px] font-medium text-fg">{q.ask}</div>
      {q.key === "preset" && <PresetCard presets={presets} value={b.presetId} onPick={onPickPreset} onDelete={onDeletePreset} />}
      {q.key === "title" && <TitleCard value={b.title} onNext={onNext} />}
      {q.key === "team" && <TeamCard team={b.team} onNext={onNext} />}
      {q.key === "guide" && <GuideCard guide={b.guide} onNext={onNext} />}
      {q.key === "academic" && <AcademicCard academic={b.academic} onNext={onNext} />}
      {q.key === "audience" && (
        <FreeTextCard
          field="audience"
          value={b.audience}
          placeholder="e.g. classmates and the guide — they should leave knowing how the parts fit"
          onNext={onNext}
        />
      )}
      {q.key === "emphasis" && (
        <FreeTextCard
          field="emphasis"
          value={b.emphasis}
          placeholder="e.g. the cost comparison and the environmental case"
          onNext={onNext}
        />
      )}
      {q.key === "theme" && <ThemeCard themes={themes} value={b.theme} themeLabel={themeLabel} onNext={onNext} />}
      {q.key === "depth" && <DepthCard value={b.depth} onNext={onNext} />}
      {q.key === "maxSlides" && <MaxSlidesCard value={b.maxSlides} onNext={onNext} />}
      {q.key === "slidesPerMember" && <SlidesPerMemberCard value={b.slidesPerMember} onNext={onNext} />}
      {q.key === "density" && <DensityCard value={b.density} onNext={onNext} />}
      {q.key === "branding" && <BrandingCard value={b.branding} onNext={onNext} />}
      {q.key === "research" && <ResearchCard value={b.research} onNext={onNext} />}
    </Bubble>
  );
}

function CardFooter({ onNext, nextLabel = "Next" }) {
  return (
    <div className="mt-2.5 flex justify-end">
      <Button variant="primary" size="sm" onClick={onNext}>{nextLabel}</Button>
    </div>
  );
}

function TitleCard({ value, onNext }) {
  const [v, setV] = useState(value ?? "");
  return (
    <div>
      <div className="mb-1.5 text-[11px] text-fg-faint">Suggested from your topic — edit freely.</div>
      <input
        value={v}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") onNext({ title: v.trim() || value }); }}
        autoFocus
        className={inputCls}
      />
      <CardFooter onNext={() => onNext({ title: v.trim() || value })} />
    </div>
  );
}

/** A free-text briefing answer — type it or leave blank to move on. */
function FreeTextCard({ field, value, onNext, placeholder = "" }) {
  const [v, setV] = useState(value ?? "");
  const submit = () => onNext({ [field]: v.trim() });
  return (
    <div>
      <div className="mb-1.5 text-[11px] text-fg-faint">Skip to move on — an empty answer just uses the default.</div>
      <textarea
        value={v}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
        rows={2}
        placeholder={placeholder}
        autoFocus
        className={`${inputCls} resize-none`}
      />
      <CardFooter onNext={submit} nextLabel="Continue" />
    </div>
  );
}

function TeamCard({ team, onNext }) {
  const [label, setLabel] = useState(team.label ?? "");
  const [members, setMembers] = useState((team.members ?? []).map((m) => ({ ...m })));
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

      <CardFooter
        onNext={() => onNext({ team: { label, members: members.filter((m) => m.name?.trim()) } })}
        nextLabel={named.length ? `Next — ${named.length} on the team` : "Next"}
      />
    </div>
  );
}

function GuideCard({ guide, onNext }) {
  const [name, setName] = useState(guide.name ?? "");
  const [designation, setDesignation] = useState(guide.designation ?? "");
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      <label className="block">
        <div className="mb-1 text-[11px] text-fg-faint">Name</div>
        <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") onNext({ guide: { name, designation } }); }} className={inputCls} />
      </label>
      <label className="block">
        <div className="mb-1 text-[11px] text-fg-faint">Designation</div>
        <input value={designation} onChange={(e) => setDesignation(e.target.value)} className={inputCls} />
      </label>
      <div className="sm:col-span-2">
        <CardFooter onNext={() => onNext({ guide: { name, designation } })} />
      </div>
    </div>
  );
}

function AcademicCard({ academic, onNext }) {
  const [v, setV] = useState({ ...academic });
  const set = (patch) => setV((x) => ({ ...x, ...patch }));
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      <label className="block sm:col-span-2">
        <div className="mb-1 text-[11px] text-fg-faint">Subject</div>
        <input value={v.subject ?? ""} onChange={(e) => set({ subject: e.target.value })} className={inputCls} />
      </label>
      <label className="block">
        <div className="mb-1 text-[11px] text-fg-faint">Academic year</div>
        <input value={v.year ?? ""} onChange={(e) => set({ year: e.target.value })} className={inputCls} />
      </label>
      <label className="block">
        <div className="mb-1 text-[11px] text-fg-faint">Semester</div>
        <input value={v.semester ?? ""} onChange={(e) => set({ semester: e.target.value })} className={inputCls} />
      </label>
      <label className="block sm:col-span-2">
        <div className="mb-1 text-[11px] text-fg-faint">Exam type</div>
        <input value={v.exam_type ?? ""} onChange={(e) => set({ exam_type: e.target.value })} className={inputCls} />
      </label>
      <div className="sm:col-span-2">
        <CardFooter onNext={() => onNext({ academic: v })} />
      </div>
    </div>
  );
}

/** The theme gallery — visual previews from the themes' own tokens, never names. */
function ThemeCard({ themes, value, onNext }) {
  const [sel, setSel] = useState(value ?? "");
  const gridRef = useRef(null);
  const selectedRef = useRef(null);

  // A deck defaults to warm-humanist; if it is not in the first scroll of the
  // gallery, bring it into view so the chosen theme is never hidden.
  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [sel]);

  return (
    <div>
      <div className="mb-1.5 text-[11px] text-fg-faint">
        {themes.length} design languages, each drawn live from its own values.
      </div>
      {themes.length === 0 && <div className="text-[12px] text-fg-faint">Loading themes…</div>}
      <div ref={gridRef} className="grid max-h-60 grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3">
        {themes.map((t) => (
          <div key={t.name} ref={sel === t.name || (!sel && t.name === "warm-humanist") ? selectedRef : null} className="min-w-0">
            <ThemeMiniCard
              theme={t}
              selected={sel === t.name || (!sel && t.name === "warm-humanist")}
              defaultTheme={t.name === "warm-humanist"}
              onClick={() => setSel(t.name)}
            />
          </div>
        ))}
      </div>
      <CardFooter onNext={() => onNext({ theme: sel })} nextLabel="Use this theme" />
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

function MaxSlidesCard({ value, onNext }) {  const [v, setV] = useState(value ?? 0);
  const [custom, setCustom] = useState("");
  return (
    <div>
      <ChoicePills
        options={SLIDE_COUNTS.map((n) => ({ value: n, label: n === 0 ? "Auto" : `${n}` }))}
        value={v}
        onPick={(n) => setV(n)}
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
          <Button size="sm" onClick={() => setV(Number(custom) || 0)}>Set</Button>
        )}
      </div>
      <CardFooter onNext={() => onNext({ maxSlides: v })} nextLabel={v === 0 ? "Auto it is" : `Use ${v}`} />
    </div>
  );
}

function SlidesPerMemberCard({ value, onNext }) {
  const [v, setV] = useState(value ?? null);
  const [custom, setCustom] = useState("");
  return (
    <div>
      <ChoicePills
        options={PER_MEMBER.map((n) => ({ value: n, label: n === null ? "Auto" : `${n} each` }))}
        value={v}
        onPick={(n) => setV(n)}
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
        {custom && <Button size="sm" onClick={() => setV(Number(custom) || null)}>Set</Button>}
      </div>
      <CardFooter onNext={() => onNext({ slidesPerMember: v })} nextLabel="Continue" />
    </div>
  );
}

function DensityCard({ value, onNext }) {
  const [v, setV] = useState(value ?? "balanced");
  return (
    <div>
      <ChoicePills
        options={DENSITIES.map((d) => ({ value: d.id, label: d.id[0].toUpperCase() + d.id.slice(1), note: d.note }))}
        value={v}
        onPick={setV}
      />
      <CardFooter onNext={() => onNext({ density: v })} nextLabel="Continue" />
    </div>
  );
}

const DEPTHS = [
  { value: "full", label: "Full", note: "3-6 paragraphs per section, a table where it earns one" },
  { value: "brief", label: "Brief", note: "a headline statement + 3 supporting sentences, no tables" },
];

function DepthCard({ value, onNext }) {
  const [v, setV] = useState(value ?? "full");
  return (
    <div>
      <ChoicePills options={DEPTHS} value={v} onPick={setV} />
      <CardFooter onNext={() => onNext({ depth: v })} nextLabel="Continue" />
    </div>
  );
}

const BRANDINGS = [
  { value: "full", label: "Full branding", note: "banner + crest + footer marks" },
  { value: "minimal", label: "Minimal", note: "crest and slide numbers, no banner" },
  { value: "none", label: "No branding", note: "just slide numbers — no institution marks" },
];

function BrandingCard({ value, onNext }) {
  const [v, setV] = useState(value ?? "full");
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
        onPick={setV}
      />
      <CardFooter onNext={() => onNext({ branding: v })} nextLabel="Continue" />
    </div>
  );
}

function ResearchCard({ value, onNext }) {
  const [v, setV] = useState(value ?? false);
  const [papers, setPapers] = useState(false);
  return (
    <div>
      <div className="mb-2 text-[11px] leading-relaxed text-fg-faint">
        A research pass searches the topic (SearXNG, fully local) and the writer
        draws every figure from the notes it returns.
      </div>
      <ChoicePills
        options={[
          { value: true, label: "On — research it" },
          { value: false, label: "Off — just write it" },
        ]}
        value={v}
        onPick={setV}
      />
      {v && (
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
            onPick={setPapers}
          />
        </div>
      )}
      <CardFooter onNext={() => onNext({ research: v, papers: v && papers })} nextLabel="Finish briefing" />
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

function SummaryLine({ chat, themeLabel }) {
  const b = chat.briefing;
  const presenting = (b.team?.members ?? []).filter((m) => m.presenting && m.name?.trim()).map((m) => m.name.trim());
  const bits = chat.kind === "report"
    ? [
        b.title || "Untitled",
        `${b.depth === "brief" ? "brief" : "full"} depth`,
        `${b.density} density`,
        b.branding === "full" ? "full branding" : b.branding === "minimal" ? "minimal branding" : "no branding",
        b.research ? (b.papers ? "research + papers" : "researched") : "no research pass",
      ]
    : [
        b.title || "Untitled",
        `${b.maxSlides || "auto"} slides`,
        themeLabel(b.theme),
        `${b.density} density`,
        b.branding === "full" ? "full branding" : b.branding === "minimal" ? "minimal branding" : "no branding",
        b.research ? (b.papers ? "research + papers" : "researched") : "no research pass",
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
  const b = chat.briefing;
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
              <div className="text-[12.5px] text-fg">{echoAnswer(chat.briefing, q.key, { themeLabel, presetLabel })}</div>
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
          Theme: <span className="font-medium text-fg">{themeLabel(chat.briefing.theme)}</span>
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
