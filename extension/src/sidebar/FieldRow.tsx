import React, { useState } from "react";
import { AlertTriangle, Check, CheckCircle2, ChevronDown, ChevronUp, History, LocateFixed, Lock, Paperclip, PencilLine, RefreshCw, Sparkles, Undo2, X } from "lucide-react";
import { FieldResult } from "../shared/types";
import { questionText } from "../engines/profileResolver";
import { Badge, Button, Notice, Spinner } from "../ui/components";
import { Effective } from "./review";

interface Props {
  r: FieldResult;
  eff: Effective;
  showConfidence: boolean;
  filled: boolean;
  generating: boolean;
  thresholds: { auto: number; review: number };
  onAccept: () => void;
  onReject: () => void;
  onEdit: (v: string) => void;
  onRegenerate: (notes?: string) => void;
  onLocate: () => void;
  onUndo: () => void;
  onUseSuggestion: () => void;
}

function statusBadge(r: FieldResult, generating: boolean) {
  switch (r.status) {
    case "auto": return <Badge tone="ok" icon={<CheckCircle2 size={11} />}>Ready</Badge>;
    case "review": return <Badge tone="warn" icon={<AlertTriangle size={11} />}>Review</Badge>;
    case "ai": return generating && !r.value ? <Badge tone="ai" icon={<Spinner size={11} />}>Writing…</Badge> : <Badge tone="ai" icon={<Sparkles size={11} />}>AI draft</Badge>;
    case "memory": return <Badge tone="ai" icon={<History size={11} />}>Reused</Badge>;
    case "needs_input": return r.suggestion ? <Badge tone="warn" icon={<AlertTriangle size={11} />}>Suggested</Badge> : <Badge icon={<PencilLine size={11} />}>Needs input</Badge>;
    case "sensitive": return <Badge icon={<Lock size={11} />}>Personal</Badge>;
    case "document": return <Badge tone="primary" icon={<Paperclip size={11} />}>Upload</Badge>;
    default: return <Badge>Skipped</Badge>;
  }
}

const confLabel = (c: number, t: Props["thresholds"]) => (c >= t.auto ? "High" : c >= t.review ? "Medium" : "Low");

export default function FieldRow(p: Props) {
  const { r, eff } = p;
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const f = r.normalizedField;
  const label = questionText(f) || "Unnamed field";
  const isLong = f.fieldType === "textarea" || r.status === "ai" || r.status === "memory";
  const editable = !["document", "sensitive", "skipped"].includes(r.status);
  // show the option's label ("Yes", "India"), not its internal value ("y", "IN")
  const optLabel = (v: string) => f.options.find((o) => o.value === v)?.label ?? v;
  const display = optLabel(eff.value) || r.suggestion || "";
  const dimmed = eff.rejected;

  return (
    <div className="fp-card tight fp-fade" style={{ opacity: dimmed ? 0.55 : 1 }} data-status={r.status}>
      <div className="fp-row" style={{ alignItems: "flex-start" }}>
        {editable && (
          <input type="checkbox" checked={eff.accepted} disabled={!eff.value} onChange={() => (eff.accepted ? p.onReject() : p.onAccept())}
            aria-label={`${eff.accepted ? "Exclude" : "Include"} ${label}`} style={{ marginTop: 3 }} />
        )}
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} style={{ all: "unset", cursor: "pointer", flex: 1, minWidth: 0, display: "block" }}>
          <div className="fp-row"><strong className="fp-truncate" style={{ flex: 1 }}>{label}</strong>{p.filled ? <Badge tone="ok" icon={<Check size={11} />}>Filled</Badge> : statusBadge(r, p.generating)}</div>
          {display && <div className="fp-sub fp-truncate" style={{ fontSize: 12, marginTop: 2 }}>{eff.edited ? "✎ " : ""}{display}</div>}
          {!display && r.reason && <div className="fp-muted fp-truncate" style={{ fontSize: 11.5, marginTop: 2 }}>{r.reason}</div>}
        </button>
        <Button variant="ghost" size="sm" icon aria-label={open ? "Collapse" : "Expand"} onClick={() => setOpen(!open)}>{open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</Button>
      </div>

      {open && (
        <div className="fp-col fp-fade" style={{ marginTop: 8, gap: 8 }}>
          <div className="fp-muted" style={{ fontSize: 11.5 }}>
            {r.reason}{p.showConfidence && r.confidence > 0 && r.status !== "ai" ? ` · ${confLabel(r.confidence, p.thresholds)} confidence (${Math.round(r.confidence * 100)}%)` : ""}
          </div>

          {r.status === "memory" && r.reused && (
            <Notice tone="info" title="Similar answer found" action={<div className="fp-row">
              <Button size="sm" onClick={p.onAccept}>Use previous answer</Button><Button size="sm" onClick={() => p.onRegenerate()}>Generate new answer</Button></div>}>
              “{r.reused.question}” — based on an answer you approved previously{r.reused.company ? ` for ${r.reused.company}` : ""}.</Notice>
          )}
          {r.status === "ai" && !r.reused && (r.similar ?? []).some((s) => !s.contextMatch) && (
            <div className="fp-help">You wrote a similar answer for {(r.similar ?? []).find((s) => !s.contextMatch)?.company || "another company"}. It wasn't reused because it's company-specific.</div>
          )}
          {(r.missing?.length ?? 0) > 0 && (
            <Notice tone="warn" title="Missing information" action={<div className="fp-col" style={{ gap: 6 }}>
              <textarea className="fp-textarea" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Add the details here, then regenerate" aria-label={`Details for ${label}`} />
              <div><Button size="sm" disabled={!notes.trim()} onClick={() => { p.onRegenerate(notes); setNotes(""); }}><RefreshCw size={12} /> Regenerate with these details</Button></div></div>}>
              {r.missing!.join(" · ")}. FormPilot won't make this up — add the facts or write the answer yourself.</Notice>
          )}
          {r.sanitized && <Notice tone="warn">Links or emails in the draft that weren't yours were removed.</Notice>}
          {r.injectionSuspected && r.status !== "document" && <Notice tone="warn">This page contains text that looks like instructions to an AI. FormPilot ignored it.</Notice>}

          {editable && (
            f.options.length > 0 && !isLong ? (
              <select className="fp-select" value={eff.value} onChange={(e) => p.onEdit(e.target.value)} aria-label={`Value for ${label}`}>
                <option value="">— choose —</option>{f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            ) : isLong ? (
              <textarea className="fp-textarea" rows={5} value={eff.value} onChange={(e) => p.onEdit(e.target.value)} placeholder={r.status === "needs_input" ? "Write your answer" : undefined} aria-label={`Value for ${label}`} />
            ) : (
              <input className="fp-input" value={eff.value} onChange={(e) => p.onEdit(e.target.value)} placeholder={r.suggestion ? "" : "Type a value"} aria-label={`Value for ${label}`} />
            )
          )}

          {r.suggestion && !eff.value && <div className="fp-row"><span className="fp-sub">Suggested: <strong>{r.suggestion}</strong></span><Button size="sm" onClick={p.onUseSuggestion}>Use it</Button></div>}
          {r.userPrompt && r.status !== "ai" && <div className="fp-help">{r.userPrompt}</div>}

          <div className="fp-row" style={{ flexWrap: "wrap" }}>
            {editable && !eff.accepted && eff.value && <Button size="sm" variant="primary" onClick={p.onAccept}><Check size={12} /> Accept</Button>}
            {editable && !eff.rejected && <Button size="sm" onClick={p.onReject}><X size={12} /> Reject</Button>}
            {(r.status === "ai" || r.status === "memory") && <Button size="sm" onClick={() => p.onRegenerate()}><RefreshCw size={12} /> Regenerate</Button>}
            {p.filled && <Button size="sm" onClick={p.onUndo}><Undo2 size={12} /> Undo</Button>}
            <span className="fp-spacer" /><Button size="sm" variant="ghost" onClick={p.onLocate}><LocateFixed size={12} /> Locate</Button>
          </div>
        </div>
      )}
    </div>
  );
}
