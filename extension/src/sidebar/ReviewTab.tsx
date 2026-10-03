import React, { useEffect, useMemo, useState } from "react";
import { Download, FileText, Highlighter, Paperclip, Rocket, ScanSearch, Undo2 } from "lucide-react";
import type { TabState } from "../background/state";
import { api, ApiError, DocMeta, ResumeRank } from "../shared/api";
import { FieldResult, FillStats } from "../shared/types";
import { AppSettings } from "../shared/storage";
import { Badge, Button, Card, EmptyState, ErrorNotice, Notice, ScoreRing, Skeleton, Tabs } from "../ui/components";
import FieldRow from "./FieldRow";
import { Decisions, Group, buildFill, counts, effective, groupOf } from "./review";
import { send } from "./hooks";

type Filter = "all" | "review" | "ai" | "input" | "ready" | "files";
const ORDER: Group[] = ["review", "ai", "input", "ready", "files", "personal", "skipped"];

export default function ReviewTab({ tabId, state, settings, decisions, patch, clear, set, goJob }: {
  tabId: number; state: TabState; settings: AppSettings; decisions: Decisions;
  patch: (id: string, p: Decisions[string]) => void; clear: (ids?: string[]) => void; set: (d: Decisions) => void; goJob: () => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [filled, setFilled] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);
  const th = { auto: settings.autoThreshold, review: settings.reviewThreshold };
  const results = state.results;
  const c = counts(results, decisions);
  const generating = state.answersStatus === "running";

  const visible = useMemo(() => results
    .filter((r) => {
      const g = groupOf(r);
      return filter === "all" ? g !== "skipped" : filter === "review" ? g === "review" : filter === "ai" ? g === "ai" : filter === "input" ? g === "input" || g === "personal" : filter === "ready" ? g === "ready" : g === "files";
    })
    .sort((a, b) => ORDER.indexOf(groupOf(a)) - ORDER.indexOf(groupOf(b))), [results, filter]);

  const n = (g: Group) => results.filter((r) => groupOf(r) === g).length;

  async function fill(mode: "selected" | "all") {
    setBusy(true); setToast(null);
    const req = buildFill(results, decisions, mode);
    if (mode === "all") set({ ...decisions, ...Object.fromEntries(req.items.map((i) => [i.fieldId, { ...decisions[i.fieldId], accepted: true }])) });
    const res = await send<{ stats: FillStats | null }>("FILL_FORM", { tabId, ...req });
    const st = res?.stats;
    if (st) {
      setFilled((cur) => new Set([...cur, ...st.filled]));
      setToast({ tone: st.failed ? "warn" : "ok", text: `Filled ${st.success} field${st.success === 1 ? "" : "s"}${st.failed ? ` · ${st.failed} couldn't be found on the page` : ""}.` });
    }
    setBusy(false);
  }
  async function undoAll() {
    const r = await send<{ undone: number }>("UNDO_FILL", { tabId });
    setFilled(new Set());
    setToast({ tone: "ok", text: `Restored ${r?.undone ?? 0} field${r?.undone === 1 ? "" : "s"} to what they were before.` });
  }
  const undoOne = async (id: string) => { await send("UNDO_FILL", { tabId, fieldIds: [id] }); setFilled((cur) => { const x = new Set(cur); x.delete(id); return x; }); };

  const files = results.filter((r) => r.status === "document");

  if (results.length === 0) {
    return <EmptyState icon={<ScanSearch size={22} />} title="No form detected yet" body="Open a job application page. FormPilot scans automatically — or scan again if the form loads late."
      action={<Button variant="primary" onClick={() => send("SCAN_FORM", { tabId })}>Scan this page</Button>} />;
  }

  return (<>
    <div className="fp-col" style={{ paddingBottom: 84 }}>
      <Tabs<Filter> label="Filter fields" value={filter} onChange={setFilter} tabs={[
        { id: "all", label: "All" }, { id: "review", label: `Review ${n("review") || ""}`.trim() }, { id: "ai", label: `AI ${n("ai") || ""}`.trim() },
        { id: "input", label: `Input ${n("input") + n("personal") || ""}`.trim() }, { id: "ready", label: `Ready ${n("ready") || ""}`.trim() },
      ]} />

      {state.ai && state.ai.code !== "API_OFFLINE" && <ErrorNotice error={new ApiError(state.ai.message, state.ai.code, { debug: state.ai.debug })} onRetry={() => send("REANALYZE", { tabId })} />}
      {!state.apiOnline && <Notice tone="warn" title="Local server isn't running">Basic autofill works. Start the server for AI drafts, job analysis and tracking.</Notice>}
      {files.length > 0 && filter !== "ready" && <ResumeCard tabId={tabId} state={state} fieldId={files.find((f) => f.canonicalKey === "resume")?.fieldId ?? files[0].fieldId} />}
      {toast && <Notice tone={toast.tone}>{toast.text}</Notice>}

      {visible.map((r: FieldResult) => (
        <FieldRow key={r.fieldId} r={r} eff={effective(r, decisions[r.fieldId])} showConfidence={settings.showConfidence} thresholds={th}
          filled={filled.has(r.fieldId)} generating={generating}
          onAccept={() => patch(r.fieldId, { accepted: true, rejected: false })}
          onReject={() => patch(r.fieldId, { rejected: true, accepted: false })}
          onEdit={(v) => patch(r.fieldId, { value: v, accepted: v.trim() !== "", rejected: false })}
          onUseSuggestion={() => patch(r.fieldId, { value: r.suggestion, accepted: true, rejected: false })}
          onRegenerate={(notes) => { clear([r.fieldId]); send("REGENERATE_FIELD", { tabId, fieldId: r.fieldId, notes }); }}
          onLocate={() => send("SCROLL_TO_FIELD", { tabId, fieldId: r.fieldId })} onUndo={() => undoOne(r.fieldId)} />
      ))}
      {visible.length === 0 && <div className="fp-sub" style={{ textAlign: "center", padding: 16 }}>Nothing in this view.</div>}
    </div>

    <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, padding: "10px 12px", background: "var(--surface)", borderTop: "1px solid var(--border)", boxShadow: "0 -6px 20px rgba(0,0,0,0.06)" }}>
      <div className="fp-row" style={{ marginBottom: 6 }}>
        <span className="fp-sub" style={{ flex: 1 }}>{c.attention > 0 ? `Review ${c.attention} item${c.attention === 1 ? "" : "s"}` : "Everything reviewed"}</span>
        {filled.size > 0 && <Button size="sm" variant="ghost" onClick={undoAll}><Undo2 size={12} /> Undo all</Button>}
      </div>
      <div className="fp-row">
        <Button block busy={busy} disabled={c.selected === 0} onClick={() => fill("selected")}>Fill selected ({c.selected})</Button>
        <Button block variant="primary" busy={busy} disabled={c.all === 0} onClick={() => fill("all")}><Rocket size={14} /> Fill all ({c.all})</Button>
      </div>
      <div className="fp-row" style={{ marginTop: 6 }}>
        <Button size="sm" variant="ghost" block onClick={() => send("SAVE_APPLICATION", { tabId, status: "saved" })}>Save to tracker</Button>
        <Button size="sm" variant="ghost" block onClick={() => send("SAVE_APPLICATION", { tabId, status: "applied" })}>Mark as applied</Button>
      </div>
    </div>
  </>);
}

// ─── Resume recommendation + attach ───────────────────────────────────────────────────

function ResumeCard({ tabId, state, fieldId }: { tabId: number; state: TabState; fieldId: string }) {
  const [docs, setDocs] = useState<DocMeta[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { api.documents.list("", "resume").then(setDocs).catch(() => setDocs([])); }, []);
  const ranks: ResumeRank[] = state.job?.resumes ?? [];
  const chosenId = state.resumeId ?? state.job?.recommendedResume?.id ?? docs?.find((d) => d.isDefault)?.id ?? docs?.[0]?.id ?? null;
  const chosen = docs?.find((d) => d.id === chosenId);
  const rank = ranks.find((r) => r.id === chosenId);

  if (docs === null) return <Skeleton h={80} />;
  if (docs.length === 0) return <Card tone="warn"><div className="fp-row"><Paperclip size={16} /><div style={{ flex: 1 }}><strong>This form asks for a resume</strong><div className="fp-sub">Add one in the FormPilot popup → Docs, so it can be attached here.</div></div></div></Card>;

  async function attach() {
    if (!chosen) return;
    setMsg("Attaching…");
    const r = await send<{ ok: boolean }>("ATTACH_FILE", { tabId, fieldId, docId: chosen.id, name: `${chosen.name}${chosen.ext}`, mime: chosen.mimeType });
    if (r?.ok) setMsg("Attached to the form. Check it looks right before submitting.");
    else { setMsg("This site wouldn't accept an automatic attach — downloading the file so you can upload it yourself."); await download(); send("HIGHLIGHT_UPLOAD_AREA", { tabId, fieldId }); }
  }
  async function download() {
    if (!chosen) return;
    const url = URL.createObjectURL(await api.documents.blob(chosen.id));
    const a = document.createElement("a"); a.href = url; a.download = `${chosen.name}${chosen.ext}`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  return (
    <Card tone="ai"><div className="fp-col" style={{ gap: 8 }}>
      <div className="fp-row"><FileText size={16} aria-hidden="true" /><strong style={{ flex: 1 }}>Resume for this application</strong>{rank?.score != null && <Badge tone="ai">{rank.score}% fit</Badge>}</div>
      <select className="fp-select" value={chosenId ?? ""} onChange={(e) => send("SET_RESUME", { tabId, resumeId: e.target.value })} aria-label="Choose resume">
        {docs.map((d) => <option key={d.id} value={d.id}>{d.name}{state.job?.recommendedResume?.id === d.id ? " — recommended" : d.isDefault ? " — default" : ""}</option>)}
      </select>
      {rank && rank.reasons.length > 0 && <div className="fp-sub" style={{ fontSize: 12 }}>{rank.reasons.map((r) => `✓ ${r}`).join("  ")}{rank.missingSkills.length > 0 && <div className="fp-muted">Missing: {rank.missingSkills.slice(0, 5).join(", ")}</div>}</div>}
      <div className="fp-row" style={{ flexWrap: "wrap" }}>
        <Button size="sm" variant="primary" onClick={attach}><Paperclip size={12} /> Attach to form</Button>
        <Button size="sm" onClick={download}><Download size={12} /> Download</Button>
        <Button size="sm" variant="ghost" onClick={() => send("HIGHLIGHT_UPLOAD_AREA", { tabId, fieldId })}><Highlighter size={12} /> Show upload</Button>
      </div>
      {msg && <div className="fp-help" role="status">{msg}</div>}
      <div className="fp-help">FormPilot never changes your resume.</div>
    </div></Card>
  );
}
