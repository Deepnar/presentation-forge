import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { Button, Panel, Spinner, Badge, inputCls } from "../components/ui.jsx";
import ThemeMiniCard from "../components/ThemeMiniCard.jsx";
import { ChevronDown, DocIcon, LayersIcon, SparkleIcon } from "../components/icons.jsx";
import { useModels } from "../lib/useModels.js";
import { progressLabel } from "../lib/progress.js";
import { BRIEFING_QUESTIONS, initialBriefing, suggestTitle, echoAnswer, applyFreeText } from "../lib/briefing.js";
import { runs } from "../lib/runs.js";

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

function phaseOf(chat) {
  if (chat.kind === "report") {
    if (chat.produced) return "done";
    if (chat.topic) return "running";
    return "greeting";
  }
  if (chat.produced) return "done";
  if (chat.plan) return "outline";
  if (!chat.topic) return "greeting";
  if (chat.briefStep >= BRIEFING_QUESTIONS.length) return "summary";
  return "briefing";
}

/**
 * The sidebar row's name. The deck title wins once the briefing has one (the
 * user can edit it on the title card); before that the topic's first sentence
 * names the chat so the list reads as "about what", never as "New chat".
 */
function chatName(title, topic) {
  const t = String(title ?? topic ?? "").replace(/\s+/g, " ").trim();
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
  const [input, setInput] = useState("");
  const [freeHint, setFreeHint] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState(chat.error ?? "");
  const [job, setJob] = useState(null);
  const [draftPlan, setDraftPlan] = useState(null);
  const [defaultsState, setDefaultsState] = useState({ status: "idle" });
  const { models, mode: modelMode, cloudOn, defaultModel } = useModels();
  const [model, setModel] = useState(chat.model ?? "");
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
  }, []);

  useEffect(() => { setDraftPlan(chat.plan); }, [chat.plan]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [chat, status, busy, themes.length]);

  const phase = phaseOf(chat);
  const qIndex = Math.min(chat.briefStep, BRIEFING_QUESTIONS.length - 1);
  const currentQuestion = phase === "briefing" ? BRIEFING_QUESTIONS[qIndex] : null;

  const themeLabel = (name) => {
    if (!name) return "Default (warm-humanist)";
    return themes.find((t) => t.name === name)?.label ?? name;
  };

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
      briefStep: Math.min(chat.briefStep + 1, BRIEFING_QUESTIONS.length),
      updatedAt: new Date().toISOString(),
    });
  }

  /** Jump back to an earlier question — later answers are re-asked. */
  function editAt(i) {
    persist({ ...chat, briefStep: Math.min(i, BRIEFING_QUESTIONS.length), updatedAt: new Date().toISOString() });
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
        maxSlides: b.maxSlides || undefined,
        theme: b.theme || undefined,
        research: b.research,
        identity: { academic: b.academic, guide: b.guide, team: b.team },
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

  function sendReportTopic(text) {
    const updated = { ...chat, topic: text, title: chatName("", text), updatedAt: new Date().toISOString() };
    persist(updated);
    runReport(updated);
  }

  function runReport(c) {
    setBusy(true);
    setError("");
    setStatus("Queued…");
    const identityPayload = {
      academic: identity?.academic ?? {},
      guide: identity?.guide ?? {},
      team: identity?.team ?? {},
    };
    runs.begin(c.id, { abort: () => {}, status: "Queued…" });
    const j = api.createReport(
      { brief: c.topic, depth: "brief", research: true, identity: identityPayload, model: model || undefined },
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

  /** The bottom input bar: topic first, then free-text answers to questions. */
  function send() {
    const text = input.trim();
    if (!text || busy) return;
    if (phase === "greeting") {
      setInput("");
      chat.kind === "report" ? sendReportTopic(text) : sendTopic(text);
      return;
    }
    if (phase === "briefing" && currentQuestion) {
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
  for (let i = 0; i < chat.briefStep && i < BRIEFING_QUESTIONS.length; i++) answered.push(BRIEFING_QUESTIONS[i]);

  const placeholder =
    phase === "greeting"
      ? chat.kind === "report"
        ? "What should the report be about?"
        : "Type a topic — everything else defaults…"
      : phase === "briefing"
        ? `Answer: ${currentQuestion?.ask}`
        : phase === "running" || phase === "planning" || phase === "generating"
          ? "Working…"
          : "Review the card above…";
  const inputDisabled = busy || phase === "summary" || phase === "outline" || phase === "done";

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
                <div className="mb-0.5 text-[10.5px] font-medium uppercase tracking-wider text-fg-faint">{q.ask}</div>
                <div className="text-[13px] text-fg">{echoAnswer(chat.briefing, q.key, { themeLabel })}</div>
              </Bubble>
              <div className="mt-0.5 flex justify-start pl-1">
                <button
                  onClick={() => editAt(i)}
                  className="rounded px-1.5 py-0.5 text-[10px] text-fg-faint transition hover:bg-hover hover:text-fg-muted"
                >
                  change
                </button>
              </div>
            </div>
          ))}

          {currentQuestion && (
            <QuestionCard
              key={`${chat.id}-${currentQuestion.key}-${chat.briefStep}`}
              q={currentQuestion}
              chat={chat}
              themes={themes}
              themeLabel={themeLabel}
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
              <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-fg-faint">Your deck</div>
              <SummaryLine
                chat={chat}
                themeLabel={themeLabel}
              />
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Button variant="primary" onClick={planDeck} disabled={busy}>
                  {busy ? <Spinner /> : null}
                  Plan the deck
                </Button>
                <Button variant="outline" onClick={saveDefaults} disabled={defaultsState.status === "saving"}>
                  {defaultsState.status === "saving" ? <Spinner /> : null}
                  Remember as defaults
                </Button>
                <span className="text-[11px] text-fg-faint">
                  The only thing that starts research &amp; planning.
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

          {(phase === "running" || (busy && phase === "summary") || (busy && phase === "outline")) && (
            <Bubble role="assistant">
              <div className="flex items-center gap-2 text-[12px] text-fg-muted">
                <Spinner /> {status}
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
              {phase === "summary" && !busy && (
                <Button size="sm" variant="outline" className="mt-2" onClick={planDeck}>Retry planning</Button>
              )}
            </Bubble>
          )}

          {phase === "done" && (
            <Panel className="p-5">
              <div className="flex items-center gap-2 text-[13px] font-semibold text-fg">
                <svg viewBox="0 0 24 24" className="h-4 w-4 text-accent" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
                {chat.kind === "report" ? "Your report is ready." : `${chat.title} is ready.`}
              </div>
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
              />
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
          {freeHint && <div className="mt-1.5 px-1 text-[11px] text-amber">{freeHint}</div>}
          <div className="mt-1.5 px-1 text-[10.5px] text-fg-faint">
            {chat.kind === "report"
              ? "A report is researched and written from your topic — depth defaults to brief."
              : phase === "briefing" ? "Answer in the card above, or type the answer here and send."
                : "Every model call stays on this machine."}
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ------------------------------------------------------------------ parts */

function Welcome({ chat, org, onFill }) {
  if (chat.topic || chat.produced) return null;
  return (
    <div className="pt-8 text-center">
      <h1 className="text-[2rem] font-semibold tracking-tight text-fg">
        {chat.kind === "report" ? "What would you like to write a report about?" : "What would you like to present today?"}
      </h1>
      <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-fg-muted">
        {chat.kind === "report"
          ? "Send a topic and the report is researched, written and rendered — the graded section order is the structure."
          : org
            ? `Send a topic and a themed deck comes out — I'll ask a few questions first, everything defaults unless you say otherwise.`
            : "Send a topic and a themed deck comes out — I'll ask a few questions first, everything defaults unless you say otherwise."}
      </p>
      {chat.kind === "deck" && (
        <div className="mt-4 flex flex-wrap justify-center gap-1.5">
          {DECK_SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => onFill(s)}
              className="rounded-full border border-line px-2.5 py-1 text-[11px] text-fg-muted transition hover:border-accent/60 hover:text-fg"
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
            ? "rounded-xl rounded-br-sm bg-accent/10 px-3.5 py-2.5 text-[13px] leading-relaxed break-words text-fg"
            : "rounded-xl rounded-bl-sm border border-line bg-panel px-3.5 py-2.5"
        }
      >
        {children}
      </div>
    </div>
  );
}

function QuestionCard({ q, chat, themes, themeLabel, onNext }) {
  const b = chat.briefing;
  return (
    <Bubble role="assistant">
      <div className="mb-1 text-[12px] font-medium text-fg">{q.ask}</div>
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
      {q.key === "maxSlides" && <MaxSlidesCard value={b.maxSlides} onNext={onNext} />}
      {q.key === "slidesPerMember" && <SlidesPerMemberCard value={b.slidesPerMember} onNext={onNext} />}
      {q.key === "density" && <DensityCard value={b.density} onNext={onNext} />}
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
  return (
    <div>
      <div className="mb-1.5 text-[11px] text-fg-faint">
        {themes.length} design languages, each drawn live from its own values.
      </div>
      {themes.length === 0 && <div className="text-[12px] text-fg-faint">Loading themes…</div>}
      <div className="grid max-h-60 grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3">
        {themes.map((t) => (
          <ThemeMiniCard
            key={t.name}
            theme={t}
            selected={sel === t.name || (!sel && t.name === "warm-humanist")}
            defaultTheme={t.name === "warm-humanist"}
            onClick={() => setSel(t.name)}
          />
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

function MaxSlidesCard({ value, onNext }) {
  const [v, setV] = useState(value ?? 0);
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

function ResearchCard({ value, onNext }) {
  const [v, setV] = useState(value ?? false);
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
      <CardFooter onNext={() => onNext({ research: v })} nextLabel="Finish briefing" />
    </div>
  );
}

function SummaryLine({ chat, themeLabel }) {
  const b = chat.briefing;
  const presenting = (b.team?.members ?? []).filter((m) => m.presenting && m.name?.trim()).map((m) => m.name.trim());
  const bits = [
    b.title || "Untitled",
    `${b.maxSlides || "auto"} slides`,
    themeLabel(b.theme),
    `${b.density} density`,
    b.research ? "researched" : "no research pass",
  ];
  if (presenting.length) bits.push(`${presenting.length} presenting`);
  return (
    <div className="text-[13px] leading-relaxed text-fg-muted">
      <span className="font-semibold text-fg">{b.title || "Untitled deck"}</span>
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
