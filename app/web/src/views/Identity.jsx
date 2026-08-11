import { useEffect, useState } from "react";
import { api } from "../api.js";
import { Button, Field, Spinner, inputCls } from "../components/ui.jsx";

/**
 * Edits config/identity.yaml — the remembered defaults every new deck starts
 * from. Everything is free text on purpose: team size, designations and
 * academic year change every submission, so nothing here is a fixed enum.
 */
export default function Identity() {
  const [id, setId] = useState(null);
  const [state, setState] = useState({ status: "idle", message: "" });

  useEffect(() => {
    api.identity().then((r) => setId(r.identity));
  }, []);

  if (!id) {
    return (
      <div className="mx-auto max-w-3xl px-8 py-9">
        <div className="skeleton h-8 w-52 rounded-lg" />
        <div className="skeleton mt-6 h-64 rounded-card" />
      </div>
    );
  }

  const set = (pathStr, value) => {
    setId((prev) => {
      const next = structuredClone(prev);
      const keys = pathStr.split(".");
      let node = next;
      for (const k of keys.slice(0, -1)) node = node[k] ??= {};
      node[keys.at(-1)] = value;
      return next;
    });
    setState({ status: "dirty", message: "" });
  };

  const members = id.team?.members ?? [];
  const setMembers = (list) => set("team.members", list);

  async function save() {
    setState({ status: "saving", message: "" });
    try {
      await api.saveIdentity(id);
      setState({ status: "saved", message: "Saved to config/identity.yaml" });
    } catch (err) {
      setState({ status: "error", message: err.message });
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-10 py-10 pb-28">
      <header className="mb-7">
        <h1 className="text-[1.5rem] font-semibold tracking-tight">Identity</h1>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-fg-muted">
          Defaults for new decks and reports. Any deck can override these in its
          own metadata. Blank fields are omitted from output rather than
          rendered empty.
        </p>
      </header>

      <Section title="Academic" hint="Changes most often — subject and year are per-submission.">
        <Field label="Subject" placeholder="Computer Graphics"
          value={id.academic?.subject} onChange={(v) => set("academic.subject", v)} />
        <Field label="Academic year" placeholder="2026-2027"
          value={id.academic?.year} onChange={(v) => set("academic.year", v)} />
        <Field label="Semester" placeholder="VI"
          value={id.academic?.semester} onChange={(v) => set("academic.semester", v)} />
        <Field label="Exam type" placeholder="Innovative Examination (IE)"
          value={id.academic?.exam_type} onChange={(v) => set("academic.exam_type", v)} />
      </Section>

      <Section title="Guide">
        <Field label="Name" placeholder="Dr. A. Sharma"
          value={id.guide?.name} onChange={(v) => set("guide.name", v)} />
        <Field label="Designation" placeholder="Assistant Professor"
          value={id.guide?.designation} onChange={(v) => set("guide.designation", v)} />
      </Section>

      <Section title="Team" hint="Any size. “Presents” marks who appears in slide chrome.">
        <Field className="col-span-2" label="Group label" placeholder="Group no. 2b [18-24]"
          value={id.team?.label} onChange={(v) => set("team.label", v)} />

        <div className="col-span-2 mt-1">
          <div className="mb-2 grid grid-cols-[1fr_5.5rem_4.5rem_2rem] gap-2 px-1 text-[10px] font-medium uppercase tracking-wider text-fg-faint">
            <div>Name</div><div>Roll</div><div>Presents</div><div />
          </div>

          <div className="space-y-1.5">
            {members.map((m, i) => (
              <div key={i} className="grid grid-cols-[1fr_5.5rem_4.5rem_2rem] items-center gap-2">
                <input
                  value={m.name ?? ""}
                  placeholder="Full name"
                  onChange={(e) => setMembers(members.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
                  className={inputCls}
                />
                <input
                  value={m.roll ?? ""}
                  placeholder="21"
                  onChange={(e) => setMembers(members.map((x, j) => j === i ? { ...x, roll: e.target.value } : x))}
                  className={`${inputCls} tabular-nums`}
                />
                <div className="flex justify-center">
                  <input
                    type="checkbox"
                    checked={Boolean(m.presenting)}
                    onChange={(e) => setMembers(members.map((x, j) => j === i ? { ...x, presenting: e.target.checked } : x))}
                    className="h-4 w-4 cursor-pointer accent-[#c96a59]"
                  />
                </div>
                <button
                  onClick={() => setMembers(members.filter((_, j) => j !== i))}
                  className="rounded p-1 text-fg-faint transition hover:bg-hover hover:text-danger"
                  aria-label={`Remove ${m.name || "member"}`}
                >
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>

          <button
            onClick={() => setMembers([...members, { name: "", roll: "", presenting: false }])}
            className="mt-2.5 w-full rounded-lg border border-dashed border-line py-2 text-xs text-fg-faint transition hover:border-accent/50 hover:text-accent"
          >
            + Add member
          </button>
        </div>
      </Section>

      <Section title="Institution" hint="Rarely changes.">
        <Field label="Name" value={id.institution?.name} onChange={(v) => set("institution.name", v)} />
        <Field label="Short" value={id.institution?.short} onChange={(v) => set("institution.short", v)} />
        <Field label="Department" value={id.institution?.department} onChange={(v) => set("institution.department", v)} />
        <Field label="University" value={id.institution?.university} onChange={(v) => set("institution.university", v)} />
      </Section>

      {/* Pinned so the action is reachable without scrolling back up. */}
      <div className="fixed inset-x-0 bottom-0 border-t border-line bg-panel/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-10 py-3.5">
          <Button variant="primary" onClick={save} disabled={state.status === "saving"}>
            {state.status === "saving" && <Spinner />}
            Save defaults
          </Button>
          {state.status === "dirty" && (
            <span className="text-xs text-fg-faint">Unsaved changes</span>
          )}
          {state.status === "saved" && (
            <span className="text-xs text-accent">{state.message}</span>
          )}
          {state.status === "error" && (
            <span className="text-xs text-danger">{state.message}</span>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ title, hint, children }) {
  return (
    <section className="mt-8 rounded-card border border-line bg-panel p-5">
      <div className="mb-4">
        <h2 className="text-[13px] font-semibold tracking-tight text-fg">{title}</h2>
        {hint && <p className="mt-0.5 text-[11px] text-fg-faint">{hint}</p>}
      </div>
      <div className="grid grid-cols-2 gap-3">{children}</div>
    </section>
  );
}
