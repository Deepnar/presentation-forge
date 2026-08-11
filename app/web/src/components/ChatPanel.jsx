import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { Button, Panel, Spinner, Badge } from "./ui.jsx";

/**
 * The chat panel — a deck-scoped conversational surface on runTurn.
 *
 * Per the memory model in the roadmap: deck.yaml is the memory, chat.jsonl
 * holds the recent turns verbatim, decisions.md carries durable preferences,
 * and older turns collapse into a rolling summary. This component only
 * transports an instruction and renders the thread; the maintenance happens
 * server-side in src/ai/chat.js.
 */

const STATUS_LABEL = {
  reading: "Reading the deck…",
  editing: "Editing the deck…",
  rendering: "Rendering slides…",
};

function formatTokens(n) {
  if (n == null || !Number.isFinite(n)) return "";
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

export default function ChatPanel({ slug, onDeckChanged }) {
  const [thread, setThread] = useState(null);
  const [models, setModels] = useState([]);
  const [defaultModel, setDefaultModel] = useState("");
  const [model, setModel] = useState("");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [streamText, setStreamText] = useState("");
  const [error, setError] = useState("");
  const [job, setJob] = useState(null);
  const [pending, setPending] = useState(null); // in-flight user instruction
  const [render, setRender] = useState(null);   // latest turn's rendered slides
  const [lastStats, setLastStats] = useState(null);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    api.models().then((r) => {
      setModels(r.models ?? []);
      setDefaultModel(r.default ?? "");
    }).catch(() => {});
  }, []);

  useEffect(() => {
    setThread(null); setInput(""); setError(""); setPending(null);
    setStreamText(""); setRender(null); setLastStats(null);
    if (!slug) return;
    api.chatThread(slug).then((r) => setThread(r)).catch((e) => setError(e.message));
  }, [slug]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight });
  }, [thread, pending, streamText]);

  async function send(text = input) {
    const instruction = text.trim();
    if (!instruction || busy || !slug) return;
    setBusy(true);
    setError("");
    setStatus("Queued…");
    setStreamText("");
    setPending({ instruction, model: model || defaultModel });
    setInput("");

    const j = api.chatDeck(slug, { instruction, model: model || undefined }, {
      status: (p) => setStatus(STATUS_LABEL[p.status] ?? "Working…"),
      token: (t) => setStreamText((s) => s + t.text),
      result: (r) => {
        setPending(null);
        setStreamText("");
        setRender({ slides: r.slides ?? [], thumbs: r.thumbs ?? [], problems: r.problems ?? [] });
        setLastStats({ model: r.stats?.model, in: r.stats?.promptTokens, out: r.stats?.outputTokens });
        onDeckChanged?.();
        // The thread is maintained server-side; re-fetch for the canonical
        // summary, windowing and promoted decisions.
        api.chatThread(slug).then(setThread).catch(() => {});
      },
    });
    setJob(j);
    try {
      await j.promise;
    } catch (err) {
      setPending(null);
      if (err.name === "AbortError") setStatus("Stopped.");
      else { setError(err.message); setStatus(""); }
    } finally {
      setBusy(false);
    }
  }

  function stop() { job?.abort(); }

  function retry() {
    const last = thread?.turns?.filter((t) => t.role === "user").at(-1);
    if (last) send(last.instruction);
  }

  async function clear() {
    if (!slug || !window.confirm("Clear this deck's thread? Standing decisions are kept.")) return;
    try {
      await api.clearChat(slug);
      setThread({ summary: "", turns: [], decisions: "" });
    } catch (e) { setError(e.message); }
  }

  const decisions = thread?.decisions?.trim() ? thread.decisions.trim() : "";
  const turns = thread?.turns ?? [];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-col gap-2 border-b border-line px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 leading-tight">
            <div className="truncate text-[13px] font-semibold text-fg">
              {slug ? "Chat with the deck" : "Chat"}
            </div>
            <div className="truncate text-[10.5px] text-fg-faint">
              {slug ? slug : "open a deck to talk about it"}
            </div>
          </div>
          {slug && (
            <button
              onClick={clear}
              title="Clear thread (keeps standing decisions)"
              className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-fg-faint transition hover:bg-hover hover:text-fg"
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h18M8 6V4h8v2m1 0-1 14H8L7 6M10 11v6M14 11v6" />
              </svg>
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              title="Which model writes the edits"
              className="w-full appearance-none rounded-lg border border-line bg-sunken py-1.5 pl-2.5 pr-7 text-[11.5px] text-fg-muted outline-none transition hover:border-line-strong focus:border-accent"
            >
              <option value="">auto · {defaultModel}</option>
              {models.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            <svg viewBox="0 0 24 24" className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-fg-faint" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </div>
          {lastStats && (
            <span className="shrink-0 text-[10px] tabular-nums text-fg-faint" title="Context used on the last turn">
              {formatTokens(lastStats.in)} in · {formatTokens(lastStats.out)} out
            </span>
          )}
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {!slug && (
          <div className="rounded-card border border-dashed border-line p-4 text-center text-[11px] leading-relaxed text-fg-faint">
            Pick a deck from the grid and it becomes the context here.
            <br />
            Every turn edits its <code>deck.yaml</code>.
          </div>
        )}

        {slug && !thread && (
          <div className="flex justify-center py-6"><Spinner className="text-fg-faint" /></div>
        )}

        {slug && thread && (
          <>
            {thread.summary && (
              <details className="group rounded-card border border-line bg-panel">
                <summary className="cursor-pointer select-none px-3 py-2 text-[10.5px] font-medium uppercase tracking-wider text-fg-faint transition hover:text-fg-muted">
                  Earlier · summarised
                </summary>
                <p className="px-3 pb-2.5 text-[11.5px] leading-relaxed text-fg-muted">
                  {thread.summary}
                </p>
              </details>
            )}

            {turns.map((t, i) => (
              <Turn
                key={t.id}
                turn={t}
                isLast={i === turns.length - 1}
                onEdit={t.role === "user" && !busy ? () => {
                  setInput(t.instruction ?? "");
                  inputRef.current?.focus();
                } : undefined}
              />
            ))}

            {pending && (
              <>
                <Turn turn={{ role: "user", instruction: pending.instruction }} isLastUser />
                <div className="ml-auto max-w-[85%] rounded-xl rounded-br-sm bg-accent/10 px-3 py-2">
                  <div className="mb-1 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-accent">
                    <Spinner className="text-accent" /> {status}
                  </div>
                  {streamText && (
                    <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap font-mono text-[10.5px] leading-relaxed text-fg-muted">
                      {streamText}
                    </pre>
                  )}
                  <div className="mt-1.5 flex justify-end">
                    <Button size="sm" variant="outline" onClick={stop}>Stop</Button>
                  </div>
                </div>
              </>
            )}

            {render && !busy && (
              <div className="rounded-card border border-line bg-panel p-2.5">
                <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-fg-faint">
                  Rendered from deck.yaml
                </div>
                {render.thumbs.length ? (
                  <div className="flex gap-1.5 overflow-x-auto pb-0.5">
                    {render.thumbs.map((src, i) => (
                      <img key={src} src={src} alt={`Slide ${i + 1}`} className="h-14 w-auto shrink-0 rounded border border-line" />
                    ))}
                  </div>
                ) : (
                  <div className="text-[11px] text-fg-faint">no preview yet</div>
                )}
                {render.problems.length > 0 && (
                  <div className="mt-1.5 text-[10.5px] leading-snug text-amber">
                    {render.problems.length} problem{render.problems.length > 1 ? "s" : ""}
                  </div>
                )}
              </div>
            )}

            {decisions && (
              <details className="rounded-card border border-line bg-panel">
                <summary className="cursor-pointer select-none px-3 py-2 text-[10.5px] font-medium uppercase tracking-wider text-fg-faint transition hover:text-fg-muted">
                  Standing decisions
                </summary>
                <div className="px-3 pb-2.5">
                  {decisions.split("\n").filter((l) => l.startsWith("- ")).map((l, i) => (
                    <div key={i} className="text-[11.5px] leading-relaxed text-fg-muted">{l.slice(2)}</div>
                  ))}
                </div>
              </details>
            )}

            {error && (
              <div className="rounded-card border border-amber/30 bg-amber/5 px-3 py-2.5 text-[11.5px] leading-relaxed text-amber">
                {error}
              </div>
            )}
          </>
        )}
      </div>

      <footer className="border-t border-line p-3">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={2}
            disabled={busy || !slug}
            placeholder={slug ? "Ask for a change…" : "Open a deck first"}
            className="min-h-0 flex-1 resize-none rounded-lg border border-line bg-sunken px-3 py-2 text-[13px] leading-relaxed text-fg outline-none transition placeholder:text-fg-faint/60 hover:border-line-strong focus:border-accent disabled:opacity-50"
          />
          <Button variant="primary" onClick={() => send()} disabled={busy || !input.trim() || !slug}>
            <SendIcon />
          </Button>
        </div>
        {!busy && turns.some((t) => t.role === "user") && (
          <button
            onClick={retry}
            className="mt-1.5 text-[10.5px] text-fg-faint transition hover:text-fg-muted"
          >
            Re-run the last instruction
          </button>
        )}
      </footer>
    </div>
  );
}

function Turn({ turn, onEdit, isLast }) {
  if (turn.role === "user") {
    return (
      <div className="ml-auto max-w-[85%]">
        <div className="rounded-xl rounded-br-sm bg-accent/10 px-3 py-2 text-[12.5px] leading-relaxed text-fg">
          {turn.instruction}
        </div>
        {onEdit && (
          <div className="mt-0.5 flex justify-end gap-1">
            <button
              onClick={onEdit}
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-fg-faint transition hover:bg-hover hover:text-fg-muted"
              title="Edit and resend"
            >
              <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
              </svg>
              edit
            </button>
          </div>
        )}
      </div>
    );
  }

  const changes = turn.changes ?? [];
  return (
    <div className="mr-auto max-w-[90%]">
      <div className="mb-1 flex items-center gap-1.5">
        <Badge className="bg-raised text-fg-faint">{turn.model ?? "model"}</Badge>
        {turn.promoted && <Badge className="bg-accent/10 text-accent">pref kept</Badge>}
      </div>
      <div className="rounded-xl rounded-bl-sm border border-line bg-panel px-3 py-2">
        {changes.length ? (
          <ul className="space-y-1">
            {changes.map((c, i) => (
              <li key={i} className="flex items-start gap-1.5 text-[12px] leading-snug text-fg-muted">
                <span className="mt-0.5 text-accent">✓</span>
                <span className="font-mono text-[11px]">{c}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-[12px] text-fg-muted">No changes applied.</div>
        )}
        {isLast && (turn.stats?.promptTokens || turn.stats?.outputTokens) && (
          <div className="mt-1.5 text-[10px] tabular-nums text-fg-faint">
            {formatTokens(turn.stats.promptTokens)} in · {formatTokens(turn.stats.outputTokens)} out
          </div>
        )}
      </div>
    </div>
  );
}

function SendIcon(props) {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M22 2 11 13M22 2l-7 20-4-9-9-4Z" />
    </svg>
  );
}
