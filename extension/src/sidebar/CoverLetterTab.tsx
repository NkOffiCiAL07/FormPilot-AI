import React, { useEffect, useState } from "react";
import { Copy, Download, FileInput, RefreshCw, Save, Sparkles } from "lucide-react";
import type { TabState } from "../background/state";
import { api, CoverLetterRec, GeneratedLetter, LetterVariant } from "../shared/api";
import { UserProfile } from "../shared/types";
import { Badge, Button, Card, EmptyState, ErrorNotice, Notice, Tabs, timeAgo } from "../ui/components";
import { send } from "./hooks";

const VARIANTS: { id: LetterVariant; label: string; hint: string }[] = [
  { id: "concise", label: "Concise", hint: "~120 words" }, { id: "standard", label: "Standard", hint: "~250 words" }, { id: "detailed", label: "Detailed", hint: "~400 words" },
];

export default function CoverLetterTab({ tabId, state, profile }: { tabId: number; state: TabState; profile: UserProfile }) {
  const [variant, setVariant] = useState<LetterVariant>("standard");
  const [letters, setLetters] = useState<Partial<Record<LetterVariant, GeneratedLetter>>>({});
  const [edited, setEdited] = useState<Partial<Record<LetterVariant, string>>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const [note, setNote] = useState<string | null>(null);
  const [saved, setSaved] = useState<CoverLetterRec[]>([]);

  const company = state.job?.job.company || state.page?.company || "";
  const role = state.job?.job.title || state.page?.role || "";
  const resumeId = state.resumeId ?? state.job?.recommendedResume?.id ?? null;
  const field = state.results.find((r) => r.canonicalKey === "coverLetter");
  const cur = letters[variant];
  const text = edited[variant] ?? cur?.letter ?? "";

  useEffect(() => { api.coverLetters.list().then((l) => setSaved(l.filter((x) => !company || x.company === company).slice(0, 4))).catch(() => {}); }, [company]);

  async function generate(v = variant) {
    setBusy(true); setErr(null); setNote(null);
    try {
      const { letters: out } = await api.coverLetters.generate({ profile, company, role, jobDescription: state.page?.description, resumeId, variants: [v] });
      setLetters((l) => ({ ...l, [v]: out[0] })); setEdited((e) => ({ ...e, [v]: undefined }));
    } catch (e) { setErr(e); }
    setBusy(false);
  }
  const copy = async () => { await navigator.clipboard.writeText(text); setNote("Copied to clipboard."); };
  async function save() {
    const rec = await api.coverLetters.save({ content: text, company, role, variant, applicationId: state.applicationId ?? undefined });
    setSaved((s) => [rec, ...s].slice(0, 4)); setNote("Saved. You can find it again below.");
  }
  function exportTxt() {
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const a = document.createElement("a"); a.href = url; a.download = `cover-letter-${(company || "letter").replace(/\W+/g, "_")}.txt`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 3000);
  }

  return (
    <div className="fp-col">
      <Tabs<LetterVariant> label="Cover letter length" value={variant} onChange={setVariant} tabs={VARIANTS.map((v) => ({ id: v.id, label: v.label }))} />
      <div className="fp-help">{VARIANTS.find((v) => v.id === variant)?.hint} · for {role || "this role"}{company ? ` at ${company}` : ""}</div>

      {err ? <ErrorNotice error={err} onRetry={() => generate()} /> : null}
      {!cur && !busy && !err && (
        <EmptyState icon={<Sparkles size={22} />} title="Write a cover letter" body="FormPilot drafts it from your profile, the selected resume and this job — and never invents achievements."
          action={<Button variant="primary" onClick={() => generate()}>Generate {variant} letter</Button>} />
      )}
      {busy && <Card><div className="fp-col"><div className="fp-skel" style={{ height: 14 }} /><div className="fp-skel" style={{ height: 14 }} /><div className="fp-skel" style={{ height: 14, width: "70%" }} /><div className="fp-help" role="status">Writing with your local model…</div></div></Card>}

      {cur && !busy && (<>
        {(cur.missing?.length ?? 0) > 0 && <Notice tone="warn" title="Could be stronger with">{cur.missing.join(" · ")}. Add these to your profile to include them truthfully.</Notice>}
        {cur.sanitized && <Notice tone="warn">Links or emails that weren't yours were removed from the draft.</Notice>}
        <textarea className="fp-textarea" rows={14} value={text} onChange={(e) => setEdited((x) => ({ ...x, [variant]: e.target.value }))} aria-label="Cover letter text" />
        <div className="fp-row" style={{ flexWrap: "wrap" }}>
          <Button size="sm" onClick={() => generate()}><RefreshCw size={12} /> Regenerate</Button>
          <Button size="sm" onClick={copy}><Copy size={12} /> Copy</Button>
          <Button size="sm" onClick={save}><Save size={12} /> Save</Button>
          <Button size="sm" onClick={exportTxt}><Download size={12} /> Export</Button>
          {field && <Button size="sm" variant="primary" onClick={() => send("FILL_FORM", { tabId, items: [{ fieldId: field.fieldId, value: text }], accepted: [] })}><FileInput size={12} /> Insert into form</Button>}
        </div>
        {note && <div className="fp-help" role="status">{note}</div>}
        <div className="fp-help">Review and edit before sending — you're the author.</div>
      </>)}

      {saved.length > 0 && (<><h2 className="fp-h2">Saved letters</h2>
        {saved.map((s) => <Card key={s.id} tight><div className="fp-row"><div style={{ flex: 1, minWidth: 0 }}><div className="fp-truncate" style={{ fontWeight: 600 }}>{s.role || "Cover letter"} {s.company && `· ${s.company}`}</div><div className="fp-muted" style={{ fontSize: 11 }}>{timeAgo(s.updatedAt)}</div></div>
          <Badge>{s.variant}</Badge><Button size="sm" onClick={() => { setLetters((l) => ({ ...l, [s.variant]: { variant: s.variant, letter: s.content, missing: [] } })); setEdited((e) => ({ ...e, [s.variant]: undefined })); setVariant(s.variant); }}>Open</Button></div></Card>)}</>)}
    </div>
  );
}
