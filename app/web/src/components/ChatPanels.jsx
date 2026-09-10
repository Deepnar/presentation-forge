import { forwardRef, useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { Button, Panel, Spinner, Badge, inputCls } from "./ui.jsx";
import ThemeMiniCard from "./ThemeMiniCard.jsx";
import { ChevronDown } from "./icons.jsx";
import { echoAnswer, optionalAnswered, tierQuestions } from "../lib/briefing.js";

export const DENSITIES = [
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

export const AutoGrowTextarea = forwardRef(function AutoGrowTextarea({ className = "", ...props }, ref) {
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

export function Welcome({ chat, org, onFill }) {
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
export function Bubble({ role, children }) {
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
                {p.maxSlides ? `${p.maxSlides} content slides` : "auto slides"} · {(p.team?.members ?? []).filter((m) => m.name?.trim()).length} people
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
    case "images": return (
      <ImagesCard
        value={b.imageSupply ?? "none"}
        onPick={(x) => patch({ imageSupply: x })}
        {...common}
      />
    );
    default: return null;
  }
}

function FormField({ q, children, first }) {
  return (
    <section className={first ? "" : "mt-3.5 border-t border-line pt-3.5"}>
      <div className="mb-1.5 text-[12px] font-medium text-fg">{q.ask}</div>
      {children}
    </section>
  );
}

export function RequiredForm({ chat, themes, themeLabel, presets, onPickPreset, onDeletePreset, onPatch, onDone }) {
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

export function OptionalForm({ chat, themes, themeLabel, presets, onPickPreset, onDeletePreset, onPatch, onDone, baseline }) {
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

function ThemeCard({ themes, value, onNext, embedded = false }) {
  const [sel, setSel] = useState(value ?? "");
  const pick = (name) => { setSel(name); if (embedded) onNext({ theme: name }); };
  const [q, setQ] = useState("");
  const selectedRef = useRef(null);
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
      <div className="mt-1.5 text-[10.5px] text-fg-faint">Title, section dividers, and closing are added around this content count.</div>
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
  const v = value;
  const papers = papersValue;
  const [file, setFile] = useState(uploaded ?? null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

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

function ImagesCard({ value, onNext, onPick, embedded = false }) {
  const v = value ?? "none";
  const options = [
    { value: "none", label: "No images", note: "slides that want one show an 'add image' prompt" },
    { value: "auto", label: "Find images", note: "freely-licenced only, with credits" },
  ];
  return (
    <div>
      <div className="mb-2 text-[11px] leading-relaxed text-fg-faint">
        When the writer says a slide needs a picture, look one up. Wikimedia
        Commons and Openverse only, public domain first — never a stock photo and
        never a link the model made up. Anything that needs crediting is listed
        in the deck's <span className="font-medium text-fg-muted">CREDITS.md</span>.
      </div>
      <ChoicePills options={options} value={v} onPick={onPick} />
      {v === "auto" && (
        <div className="mt-2 rounded-lg border border-line bg-sunken px-3 py-2 text-[11px] leading-relaxed text-fg-faint">
          A picture is only added where the slide still reads properly with one.
          Where it would crowd out the words, the slide keeps its 'add image'
          prompt instead.
        </div>
      )}
      {!embedded && <CardFooter onNext={() => onNext({ imageSupply: v })} nextLabel="Continue" />}
    </div>
  );
}

export function PresetSave({ onSave, state }) {
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

export function SummaryLine({ chat, themeLabel }) {
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
        `${b.maxSlides || "auto"} content slides`,
        themeLabel(b.theme),
        `${b.density} density`,
        b.branding === "full" ? "full branding" : b.branding === "minimal" ? "minimal branding" : "no branding",
        researchLabel(b),
        ...(b.imageSupply === "auto" ? ["auto images"] : []),
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

export function DeckBriefing({ chat, answered, echoAnswer, themeLabel, presetLabel }) {
  const [open, setOpen] = useState(false);
  const b = chat.briefing ?? {};
  const presenting = (b.team?.members ?? []).filter((m) => m.presenting && m.name?.trim()).map((m) => m.name.trim());
  const bits = [
    b.title?.trim() || chat.title || "Untitled",
    `${b.maxSlides || "auto"} content slides`,
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

export function turnSummary(r) {
  const parts = [];
  if (r.changes?.length) parts.push(r.changes.slice(0, 5).join("; "));
  if (r.problems?.length) parts.push(r.problems.slice(0, 3).join("; "));
  return parts.join("  ") || "Applied.";
}

export function DeckRunCard({ run, onResume, onFinalize, onStop, onOpen }) {
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

export function OutlineCard({ chat, types, plan, onPlan, themeLabel, busy, onApprove }) {
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

export function TypePickModal({ types, onPick, onClose }) {
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
