import React, { useState } from "react";
import { BookmarkCheck, ExternalLink, MessageSquareText, Search, Trash2, ChevronDown, ChevronUp, Briefcase } from "lucide-react";
import { AnswerRec, APP_STATUSES, AppStatus, ApplicationRec, STATUS_LABEL, api } from "../shared/api";
import { Badge, Button, Card, ConfirmDialog, EmptyState, ErrorNotice, Field, Skeleton, Tabs, timeAgo, useAsync } from "../ui/components";

type View = "applications" | "answers";

export const statusTone = (s: AppStatus): "neutral" | "ok" | "warn" | "ai" | "danger" | "primary" =>
  ({ saved: "neutral", applied: "primary", assessment: "ai", interview: "warn", offer: "ok", rejected: "danger", withdrawn: "neutral" } as const)[s];

export default function ApplicationsPanel() {
  const [view, setView] = useState<View>("applications");
  return (
    <div className="fp-screen">
      <h1 className="fp-h1">Applications</h1>
      <Tabs<View> label="Applications or saved answers" value={view} onChange={setView} tabs={[{ id: "applications", label: "Tracker", icon: <Briefcase size={13} /> }, { id: "answers", label: "Saved answers", icon: <MessageSquareText size={13} /> }]} />
      {view === "applications" ? <Tracker /> : <Answers />}
    </div>
  );
}

function Tracker() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"" | AppStatus>("");
  const { data: apps, error, loading, reload } = useAsync(() => api.applications.list({ q, status }), [q, status]);
  const { data: stats, reload: reloadStats } = useAsync(() => api.applications.stats(), []);
  const [open, setOpen] = useState<string | null>(null);
  const [removing, setRemoving] = useState<ApplicationRec | null>(null);

  const change = async (a: ApplicationRec, s: AppStatus) => { await api.applications.update(a.id, { status: s }); reload(); reloadStats(); };

  return (<>
    {stats && stats.total > 0 && (
      <div className="fp-row" style={{ flexWrap: "wrap" }} aria-label="Application counts">
        {(["saved", "applied", "interview", "offer"] as AppStatus[]).map((s) => (
          <Badge key={s} tone={statusTone(s)}>{STATUS_LABEL[s]} {stats.byStatus[s]}</Badge>
        ))}
        <Badge>This week {stats.thisWeek}</Badge><Badge>This month {stats.thisMonth}</Badge>
      </div>
    )}
    <div className="fp-row">
      <div style={{ position: "relative", flex: 1 }}>
        <Search size={14} className="fp-muted" style={{ position: "absolute", left: 10, top: 10 }} aria-hidden="true" />
        <input className="fp-input" style={{ paddingLeft: 30 }} placeholder="Search company or role" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search applications" />
      </div>
      <select className="fp-select" style={{ width: 120 }} value={status} onChange={(e) => setStatus(e.target.value as AppStatus | "")} aria-label="Filter by status">
        <option value="">All</option>{APP_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
      </select>
    </div>

    {error ? <ErrorNotice error={error} onRetry={reload} /> : null}
    {loading && !apps && <div className="fp-col"><Skeleton h={70} /><Skeleton h={70} /></div>}
    {apps && apps.length === 0 && !error && (
      <EmptyState icon={<BookmarkCheck size={22} />} title={q || status ? "No matching applications" : "No applications yet"}
        body={q || status ? "Try clearing the search or filter." : "Open a job application page and fill it with FormPilot — it shows up here automatically."} />
    )}
    {(apps ?? []).map((a) => (
      <Card key={a.id} tight>
        <div className="fp-row" style={{ alignItems: "flex-start" }}>
          <div className="fp-col" style={{ flex: 1, gap: 2, minWidth: 0 }}>
            <strong className="fp-truncate">{a.role || "Untitled role"}</strong>
            <span className="fp-sub fp-truncate">{a.company || a.domain}{a.location ? ` · ${a.location}` : ""}</span>
            <span className="fp-muted" style={{ fontSize: 11 }}>{a.appliedAt ? `Applied ${timeAgo(a.appliedAt)}` : `Saved ${timeAgo(a.createdAt)}`}{a.matchScore != null ? ` · Match ${a.matchScore}%` : ""}</span>
          </div>
          <select className="fp-select" style={{ width: 112 }} value={a.status} onChange={(e) => change(a, e.target.value as AppStatus)} aria-label={`Status for ${a.role} at ${a.company}`}>
            {APP_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        </div>
        <div className="fp-row" style={{ marginTop: 6 }}>
          {a.url && !a.url.startsWith("legacy:") && <Button size="sm" variant="ghost" onClick={() => chrome.tabs.create({ url: a.url })}><ExternalLink size={13} /> Open</Button>}
          <Button size="sm" variant="ghost" aria-expanded={open === a.id} onClick={() => setOpen(open === a.id ? null : a.id)}>{open === a.id ? <ChevronUp size={13} /> : <ChevronDown size={13} />} Details</Button>
          <span className="fp-spacer" />
          <Button size="sm" variant="ghost" aria-label={`Delete application ${a.role}`} onClick={() => setRemoving(a)}><Trash2 size={13} /></Button>
        </div>
        {open === a.id && <Details id={a.id} notes={a.notes} onNotes={async (n) => { await api.applications.update(a.id, { notes: n }); }} />}
      </Card>
    ))}
    {removing && <ConfirmDialog title="Delete application?" confirmLabel="Delete" body={<>“{removing.role}” at {removing.company || removing.domain} and its saved answers will be removed.</>}
      onClose={() => setRemoving(null)} onConfirm={async () => { await api.applications.remove(removing.id); reload(); reloadStats(); }} />}
  </>);
}

function Details({ id, notes, onNotes }: { id: string; notes: string; onNotes: (n: string) => Promise<void> }) {
  const { data, loading } = useAsync(() => api.applications.get(id), [id]);
  const [n, setN] = useState(notes);
  if (loading) return <div style={{ marginTop: 8 }}><Skeleton h={50} /></div>;
  return (
    <div className="fp-col fp-fade" style={{ marginTop: 8 }}>
      <Field label="Notes"><textarea className="fp-textarea" rows={2} value={n} onChange={(e) => setN(e.target.value)} onBlur={() => n !== notes && onNotes(n)} aria-label="Notes" /></Field>
      {data && data.fields.length > 0 && <div><div className="fp-eyebrow">Filled fields ({data.fields.length})</div>
        {data.fields.slice(0, 8).map((f, i) => <div key={i} className="fp-row fp-sub" style={{ fontSize: 12 }}><span className="fp-truncate" style={{ flex: 1 }}>{f.label}</span><span className="fp-truncate" style={{ maxWidth: 140 }}>{f.value}</span></div>)}</div>}
      {data && data.answers.length > 0 && <div><div className="fp-eyebrow">Answers</div>
        {data.answers.map((a, i) => <div key={i} style={{ fontSize: 12 }}><strong>{a.question}</strong><div className="fp-sub">{a.answer}</div></div>)}</div>}
      {data && data.coverLetters.length > 0 && <Badge tone="ai">Cover letter saved</Badge>}
    </div>
  );
}

function Answers() {
  const [q, setQ] = useState("");
  const { data: answers, error, loading, reload } = useAsync(() => api.answers.list(q), [q]);
  const [removing, setRemoving] = useState<AnswerRec | null>(null);
  const [clearing, setClearing] = useState(false);
  return (<>
    <div className="fp-help">Answers you approved are reused for similar questions — and always shown to you first.</div>
    <div className="fp-row">
      <div style={{ position: "relative", flex: 1 }}>
        <Search size={14} className="fp-muted" style={{ position: "absolute", left: 10, top: 10 }} aria-hidden="true" />
        <input className="fp-input" style={{ paddingLeft: 30 }} placeholder="Search answers" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search saved answers" />
      </div>
      {(answers?.length ?? 0) > 0 && <Button size="sm" variant="danger" onClick={() => setClearing(true)}>Clear all</Button>}
    </div>
    {error ? <ErrorNotice error={error} onRetry={reload} /> : null}
    {loading && !answers && <Skeleton h={80} />}
    {answers && answers.length === 0 && !error && <EmptyState icon={<MessageSquareText size={22} />} title="No saved answers" body="When you fill an application with an AI-written answer, it's saved here so you can reuse it next time." />}
    {(answers ?? []).map((a) => <AnswerCard key={a.id} a={a} onChange={reload} onDelete={() => setRemoving(a)} />)}
    {removing && <ConfirmDialog title="Delete answer?" confirmLabel="Delete" body="This answer won't be suggested again." onClose={() => setRemoving(null)} onConfirm={async () => { await api.answers.remove(removing.id); reload(); }} />}
    {clearing && <ConfirmDialog title="Delete all saved answers?" confirmLabel="Delete all" requireText="DELETE" body="Every saved answer will be removed. This can't be undone." onClose={() => setClearing(false)} onConfirm={async () => { await api.answers.clear(); reload(); }} />}
  </>);
}

function AnswerCard({ a, onChange, onDelete }: { a: AnswerRec; onChange: () => void; onDelete: () => void }) {
  const [text, setText] = useState(a.answer);
  return (
    <Card tight>
      <div className="fp-row" style={{ alignItems: "flex-start" }}><strong style={{ flex: 1 }}>{a.question}</strong>{a.userApproved ? <Badge tone="ok">Approved</Badge> : <Badge>Draft</Badge>}</div>
      <textarea className="fp-textarea" rows={3} value={text} onChange={(e) => setText(e.target.value)} onBlur={async () => { if (text.trim() && text !== a.answer) { await api.answers.update(a.id, { answer: text }); onChange(); } }} aria-label={`Answer to ${a.question}`} style={{ marginTop: 6 }} />
      <div className="fp-row" style={{ marginTop: 6 }}>
        <span className="fp-muted" style={{ fontSize: 11 }}>{a.company ? `${a.company} · ` : ""}used {a.usedCount}× · {timeAgo(a.updatedAt)}</span>
        <span className="fp-spacer" />
        <Button size="sm" variant="ghost" onClick={async () => { await api.answers.update(a.id, { userApproved: !a.userApproved }); onChange(); }}>{a.userApproved ? "Unapprove" : "Approve"}</Button>
        <Button size="sm" variant="ghost" aria-label="Delete answer" onClick={onDelete}><Trash2 size={13} /></Button>
      </div>
    </Card>
  );
}
