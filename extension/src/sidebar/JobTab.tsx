import React, { useState } from "react";
import { Briefcase, Check, FileText, MapPin, X } from "lucide-react";
import type { TabState } from "../background/state";
import { Badge, Button, Card, EmptyState, Notice, ScoreRing, Skeleton } from "../ui/components";
import { send } from "./hooks";

export default function JobTab({ tabId, state }: { tabId: number; state: TabState }) {
  const [text, setText] = useState("");
  const j = state.job;
  const title = j?.job.title || state.page?.role || state.title;
  const company = j?.job.company || state.page?.company;

  if (!j && state.jobStatus !== "running") {
    return (
      <div className="fp-col">
        <EmptyState icon={<Briefcase size={22} />} title="No job description found" body="Paste the job description to see how it matches your profile, get a resume recommendation, and write better answers." />
        <textarea className="fp-textarea" rows={7} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste the job description here" aria-label="Job description" />
        <Button variant="primary" disabled={text.trim().length < 80} onClick={() => send("SET_JOB_TEXT", { tabId, text })}>Analyze job</Button>
        <div className="fp-help">Pasted text stays on this computer and is only read by your local model.</div>
      </div>
    );
  }
  if (!j) return <div className="fp-col"><Skeleton h={90} /><Skeleton h={120} /></div>;

  const { job, match } = j;
  const facts: [string, string][] = [["Location", job.location], ["Experience", job.experience], ["Type", job.employmentType], ["Education", job.education], ["Salary", job.salary], ["Sponsorship", job.sponsorship]].filter(([, v]) => v) as [string, string][];

  return (
    <div className="fp-col" style={{ paddingBottom: 12 }}>
      <Card><div className="fp-row">
        <div style={{ flex: 1, minWidth: 0 }}><h1 className="fp-h1" style={{ fontSize: 15 }}>{title}</h1><div className="fp-sub">{company}</div>
          {job.location && <div className="fp-muted fp-row" style={{ fontSize: 12, marginTop: 2 }}><MapPin size={12} /> {job.location}</div>}</div>
        <ScoreRing value={match.score} label="Profile match" />
      </div></Card>

      {j.injectionSuspected && <Notice tone="warn" title="Unusual text on this page">The page contains wording that looks like instructions to an AI. FormPilot treats page text as data only and ignores it.</Notice>}
      {match.score == null && <Notice tone="info">Not enough information to compute a match. Add skills or experience to your profile.</Notice>}

      {match.components.length > 0 && (
        <Card><h2 className="fp-h2" style={{ marginBottom: 8 }}>Why this score</h2>
          <div className="fp-col" style={{ gap: 8 }}>{match.components.map((c) => (
            <div key={c.key}><div className="fp-row"><span style={{ flex: 1, fontWeight: 600 }}>{c.label}</span><span className="fp-muted" style={{ fontSize: 11 }}>{Math.round(c.score * 100)}%</span></div>
              <div className="fp-bar" role="progressbar" aria-valuenow={Math.round(c.score * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={c.label}><i style={{ width: `${c.score * 100}%` }} /></div>
              <div className="fp-help">{c.detail}</div></div>))}</div>
          <div className="fp-help" style={{ marginTop: 8 }}>{match.disclaimer}</div></Card>
      )}

      {(job.requiredSkills.length > 0 || job.preferredSkills.length > 0) && (
        <Card><h2 className="fp-h2" style={{ marginBottom: 8 }}>Skills</h2>
          {job.requiredSkills.length > 0 && <><div className="fp-eyebrow">Required</div><div className="fp-row" style={{ flexWrap: "wrap", gap: 4, margin: "4px 0 8px" }}>
            {job.requiredSkills.map((s) => { const has = match.matchedSkills.includes(s); return <Badge key={s} tone={has ? "ok" : "warn"} icon={has ? <Check size={10} /> : <X size={10} />}>{s}</Badge>; })}</div></>}
          {job.preferredSkills.length > 0 && <><div className="fp-eyebrow">Preferred</div><div className="fp-row" style={{ flexWrap: "wrap", gap: 4, marginTop: 4 }}>
            {job.preferredSkills.map((s) => <Badge key={s} tone={match.matchedSkills.includes(s) ? "ok" : "neutral"} icon={match.matchedSkills.includes(s) ? <Check size={10} /> : undefined}>{s}</Badge>)}</div></>}
          {match.missingSkills.length > 0 && <div className="fp-help" style={{ marginTop: 8 }}>Missing from your profile: {match.missingSkills.join(", ")}. Only add skills you really have.</div>}
        </Card>
      )}

      {facts.length > 0 && <Card><dl style={{ margin: 0, display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 12px" }}>{facts.map(([k, v]) => <React.Fragment key={k}><dt className="fp-muted">{k}</dt><dd style={{ margin: 0 }}>{v}</dd></React.Fragment>)}</dl></Card>}

      {j.resumes.length > 0 && (
        <Card><div className="fp-row" style={{ marginBottom: 6 }}><FileText size={15} /><h2 className="fp-h2">Resume ranking</h2></div>
          <div className="fp-col" style={{ gap: 8 }}>{j.resumes.map((r, i) => (
            <div key={r.id} className="fp-row" style={{ alignItems: "flex-start" }}>
              <div style={{ flex: 1, minWidth: 0 }}><strong>{r.name}</strong> {i === 0 && r.score != null && <Badge tone="ai">Recommended</Badge>}
                <div className="fp-help">{r.reasons.join(" · ")}</div>{r.missingSkills.length > 0 && <div className="fp-help">Missing: {r.missingSkills.slice(0, 5).join(", ")}</div>}</div>
              <Badge>{r.score == null ? "–" : `${r.score}%`}</Badge>
              <Button size="sm" variant={state.resumeId === r.id ? "primary" : "default"} onClick={() => send("SET_RESUME", { tabId, resumeId: r.id })}>{state.resumeId === r.id ? "Selected" : "Use"}</Button>
            </div>))}</div></Card>
      )}

      {job.applicationQuestions.length > 0 && <Card><h2 className="fp-h2" style={{ marginBottom: 6 }}>Questions mentioned in the posting</h2><ul className="fp-sub" style={{ margin: 0, paddingLeft: 18 }}>{job.applicationQuestions.map((q) => <li key={q}>{q}</li>)}</ul></Card>}
      {j.aiUsed && <div className="fp-help">Some details were extracted by your local AI model. Please double-check them.</div>}
    </div>
  );
}
