import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { Button, Panel, Spinner, Badge, inputCls } from "../components/ui.jsx";
import SlideSelectPanel from "../components/SlideSelectPanel.jsx";
import Lightbox from "../components/Lightbox.jsx";
import { ChevronDown, DocIcon, LayersIcon, PanelRightOpen, SparkleIcon } from "../components/icons.jsx";
import { useModels, anonymizeModel } from "../lib/useModels.js";
import { progressLabel } from "../lib/progress.js";
import { BRIEFING_QUESTIONS, REPORT_QUESTIONS, PRESET_KEYS, questionsFor, initialBriefing, suggestTitle, echoAnswer, applyPresetToBriefing, effectiveBriefStep, presetPayload, briefingAnsweredText, tierQuestions, optionalAnswered, briefTier, stepForTier, isAnswered } from "../lib/briefing.js";
import { runs } from "../lib/runs.js";
import { deckContext } from "../lib/deckContext.js";
import { presetsStore } from "../lib/presets.js";
import { parseSlashCommand, SLASH_HELP, looksLikeSlash } from "../lib/slash.js";
import { setModelMode } from "../lib/modelMode.js";
import { AutoGrowTextarea, Welcome, Bubble, DENSITIES, RequiredForm, OptionalForm, DeckBriefing, DeckRunCard, OutlineCard, PresetSave, SummaryLine, turnSummary, TypePickModal } from "../components/ChatPanels.jsx";

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

function chatName(title, topic) {
  const t = String((title ?? "").trim() || (topic ?? "").trim()).replace(/\s+/g, " ").trim();
  if (!t) return "New chat";
  return t.length > 48 ? `${t.slice(0, 45).trimEnd()}…` : t;
}

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
  const needsKey = modelMode === "auto" ? !auto?.keySet : !cloudOn;

  async function switchMode() {
    const next = modelMode === "cloud" ? "auto" : "cloud";
    try { await api.cloudRoute(next); } catch { return; }
    setModelMode(next);
    if (next === "auto") {
      setModel("");
      persist({ ...chat, model: undefined, updatedAt: new Date().toISOString() });
    }
  }
  const [model, setModel] = useState(chat.model ?? "");
  const [deckData, setDeckData] = useState(null); // { slides:[{type,headline}], thumbs:[] }
  const [selected, setSelected] = useState(() => new Set(chat.selectedSlides ?? []));
  const [openIndex, setOpenIndex] = useState(null); // enlarged slide in the panel
  const [punching, setPunching] = useState(false);
  const [swapping, setSwapping] = useState(false);
  const [swapOpen, setSwapOpen] = useState(false); // the type-picker modal
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
    presetsStore.refresh().then((list) => setPresets(list)).catch(() => {});
    return presetsStore.subscribe(setPresets);
  }, []);

  useEffect(() => { setDraftPlan(chat.plan); }, [chat.plan]);

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

  useEffect(() => {
    if (!deckRun?.active || autoAttachedRef.current) return;
    autoAttachedRef.current = true;
    resumeRun();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deckRun?.active]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat.produced, chat.deckSlug, chat.turns?.length]);

  useEffect(() => {
    const saved = chatRef.current.selectedSlides ?? [];
    const same = saved.length === selected.size && saved.every((i) => selected.has(i));
    if (chatRef.current.produced && chatRef.current.deckSlug && !same) {
      persist({ ...chatRef.current, selectedSlides: [...selected] });
    }
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

  function firstBriefStep() {
    return stepForTier(chat.kind, "required");
  }

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

  function patchBriefing(patch) {
    const briefing = { ...(chat.briefing ?? {}), ...patch };
    persist({
      ...chat,
      title: patch.title ? chatName(patch.title, chat.topic) : chat.title,
      briefing,
      updatedAt: new Date().toISOString(),
    });
  }

  function finishTier(tier) {
    persist({ ...chat, briefStep: stepForTier(chat.kind, tier === "required" ? "optional" : "done"), updatedAt: new Date().toISOString() });
  }

  function editAt(i) {
    const q = questions[i];
    const briefing = q && PRESET_KEYS.includes(q.key)
      ? { ...(chat.briefing ?? {}), unskip: [...(chat.briefing?.unskip ?? []), q.key] }
      : (chat.briefing ?? {});
    persist({ ...chat, briefing, briefStep: Math.min(i, questions.length), updatedAt: new Date().toISOString() });
  }

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
        briefing: briefingAnsweredText(b, themeLabel),
        maxSlides: b.maxSlides || undefined,
        theme: b.theme || undefined,
        research: b.research,
        researchSource: b.researchSource,
        imageSupply: b.imageSupply ?? "none",
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

  function switchKind(kind) {
    if (chat.topic || kind === chat.kind) return;
    persist({ ...chat, kind, updatedAt: new Date().toISOString() });
  }

  function slashReply(msg) {
    setError("");
    setFreeHint(msg);
  }

  function handleSlash(text) {
    const parsed = parseSlashCommand(text);
    if (!parsed) {
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
        onOpenReport(chat.deckSlug);
        return true;
      }
      default:
        slashReply(`Unknown command /${command}. ${SLASH_HELP.split("\n").slice(0, 3).join("  ·  ")}`);
        return true;
    }
  }

  function send() {
    const text = input.trim();
    if (!text || busy) return;
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
      const said = text.trim();
      if (!said) return;
      const prev = String(chat.briefing?.thesis ?? "").trim();
      patchBriefing({ thesis: prev ? `${prev} ${said}` : said });
      setInput("");
      setFreeHint("Noted as part of your thesis — the form above has the rest.");
    }
  }

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
  const inputDisabled = unverified || busy || phase === "summary" || phase === "outline" || phase === "record";
  const showPanel = phase === "editing" && deckData && deckData.slides.length > 0;
  const showPanelVisible = showPanel && panelOpen;
  const showPanelCollapsed = showPanel && !panelOpen;

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
                <PanelRightOpen className="h-4 w-4" />
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
