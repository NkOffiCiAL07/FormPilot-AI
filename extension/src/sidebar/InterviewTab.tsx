import React, { useEffect, useState } from "react";
import { GraduationCap, RefreshCw, Sparkles } from "lucide-react";
import type { TabState } from "../background/state";
import { api, InterviewQ, InterviewSession, PracticeFeedback } from "../shared/api";
import { UserProfile } from "../shared/types";
import { Badge, Button, Card, EmptyState, ErrorNotice, Notice, Skeleton } from "../ui/components";

type Section = "technical" | "behavioral" | "company";
const TITLES: Record<Section, string> = { technical: "Technical", behavioral: "Behavioral", company: "About the company" };

export default function InterviewTab({ state, profile }: { state: TabState; profile: UserProfile }) {
  const [session, setSession] = useState<InterviewSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const company = state.job?.job.company || state.page?.company || "";
  const role = state.job?.job.title || state.page?.role || "";
  const resumeId = state.resumeId ?? state.job?.recommendedResume?.id ?? null;

  // resume the latest session for this job, if there is one
  useEffect(() => { api.interview.sessions().then((s) => setSession(s.find((x) => x.company === company && x.role === role) ?? null)).catch(() => {}); }, [company, role]);

  async function generate() {
    setBusy(true); setErr(null);
    try { setSession(await api.interview.generate({ profile, company, role, jobDescription: state.page?.description, resumeId, applicationId: state.applicationId ?? undefined })); }
    catch (e) { setErr(e); }
    setBusy(false);
  }

  if (busy) return <div className="fp-col"><Skeleton h={60} /><Skeleton h={60} /><Skeleton h={60} /><div className="fp-help" role="status">Preparing questions with your local model…</div></div>;
  if (!session) return (
    <div className="fp-col">
      {err ? <ErrorNotice error={err} onRetry={generate} /> : null}
      <EmptyState icon={<GraduationCap size={22} />} title="Prepare for the interview" body={`Get technical, behavioral and company questions based on this job and your experience — then practise your answers and get feedback.`}
        action={<Button variant="primary" onClick={generate}><Sparkles size={14} /> Generate questions</Button>} />
      {!state.page?.description && <Notice tone="info">No job description was found on this page, so questions will be general. Paste one in the Job tab for better results.</Notice>}
    </div>
  );

  return (
    <div className="fp-col">
      <div className="fp-row"><div style={{ flex: 1 }}><strong>{role || "Interview"}</strong><div className="fp-sub">{company}</div></div><Button size="sm" onClick={generate}><RefreshCw size={12} /> New set</Button></div>
      {err ? <ErrorNotice error={err} onRetry={generate} /> : null}
      <div className="fp-help">Practise out loud or in writing. Feedback is a writing aid — it can't predict interview results.</div>
      {(Object.keys(TITLES) as Section[]).map((k) => session.questions[k]?.length ? (
        <div key={k} className="fp-col"><h2 className="fp-h2">{TITLES[k]}</h2>{session.questions[k].map((q, i) => <Question key={`${k}${i}`} q={q} session={session} profile={profile} state={state} />)}</div>
      ) : null)}
    </div>
  );
}

function Question({ q, session, profile, state }: { q: InterviewQ; session: InterviewSession; profile: UserProfile; state: TabState }) {
  const [open, setOpen] = useState(false);
  const [answer, setAnswer] = useState("");
  const [fb, setFb] = useState<PracticeFeedback | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);

  async function analyze() {
    setBusy(true); setErr(null);
    try { setFb((await api.interview.analyze({ question: q.question, answer, profile, company: session.company, role: session.role, jobDescription: state.page?.description, sessionId: session.id })).feedback); }
    catch (e) { setErr(e); }
    setBusy(false);
  }
  return (
    <Card tight>
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} style={{ all: "unset", cursor: "pointer", display: "block", width: "100%" }}>
        <strong>{q.question}</strong>{q.why && <div className="fp-muted" style={{ fontSize: 11.5 }}>{q.why}</div>}
      </button>
      {open && (
        <div className="fp-col fp-fade" style={{ marginTop: 8 }}>
          <textarea className="fp-textarea" rows={5} value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Your answer…" aria-label={`Your answer to: ${q.question}`} />
          <div><Button size="sm" variant="primary" busy={busy} disabled={answer.trim().length < 20} onClick={analyze}>Analyze answer</Button></div>
          {err ? <ErrorNotice error={err} onRetry={analyze} /> : null}
          {fb && (
            <div className="fp-col" style={{ gap: 6 }}>
              <div className="fp-row" style={{ flexWrap: "wrap" }}>{(["structure", "relevance", "clarity"] as const).map((k) => fb.scores[k] != null && <Badge key={k} tone={fb.scores[k]! >= 4 ? "ok" : fb.scores[k]! >= 3 ? "warn" : "danger"}>{k} {fb.scores[k]}/5</Badge>)}</div>
              <div><strong>Structure</strong><div className="fp-sub">{fb.structure}</div></div>
              <div><strong>Relevance</strong><div className="fp-sub">{fb.relevance}</div></div>
              <div><strong>Clarity</strong><div className="fp-sub">{fb.clarity}</div></div>
              {fb.missing.length > 0 && <div><strong>Missing points</strong><ul className="fp-sub" style={{ margin: 0, paddingLeft: 18 }}>{fb.missing.map((m, i) => <li key={i}>{m}</li>)}</ul></div>}
              {fb.improvements.length > 0 && <div><strong>Suggested improvements</strong><ul className="fp-sub" style={{ margin: 0, paddingLeft: 18 }}>{fb.improvements.map((m, i) => <li key={i}>{m}</li>)}</ul></div>}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
