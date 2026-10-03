import React, { useEffect, useRef, useState } from "react";
import { Download, Eye, FileText, Pencil, Plus, Search, Star, Trash2, Upload } from "lucide-react";
import { api, ApiError, DocMeta } from "../shared/api";
import { Badge, Button, Card, ConfirmDialog, Dialog, EmptyState, ErrorNotice, Field, Notice, Skeleton, Tabs, TextInput, useAsync } from "../ui/components";

const CATEGORIES: { id: DocMeta["category"]; label: string }[] = [
  { id: "resume", label: "Resume" }, { id: "cover_letter", label: "Cover letter" }, { id: "certificate", label: "Certificate" },
  { id: "transcript", label: "Transcript" }, { id: "id", label: "ID document" }, { id: "other", label: "Other" },
];
const catLabel = (c: string) => CATEGORIES.find((x) => x.id === c)?.label ?? c;
const fmtSize = (n: number) => (n > 1_000_000 ? `${(n / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1000))} KB`);

type Filter = "all" | DocMeta["category"];

export default function DocumentsManager() {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const { data: docs, error, loading, reload } = useAsync(() => api.documents.list(q, filter === "all" ? "" : filter), [q, filter]);
  const [editing, setEditing] = useState<{ doc?: DocMeta; file?: File } | null>(null);
  const [preview, setPreview] = useState<DocMeta | null>(null);
  const [removing, setRemoving] = useState<DocMeta | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const pick = (f?: File | null) => { if (f) setEditing({ file: f }); };
  const resumes = (docs ?? []).filter((d) => d.category === "resume");

  async function download(d: DocMeta) {
    const blob = await api.documents.blob(d.id);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${d.name}${d.ext}`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  return (
    <div className="fp-screen"
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); pick(e.dataTransfer.files[0]); }}>
      <div className="fp-row">
        <h1 className="fp-h1" style={{ flex: 1 }}>Documents</h1>
        <Button variant="primary" size="sm" onClick={() => fileRef.current?.click()}><Plus size={14} /> Add</Button>
        <input ref={fileRef} type="file" hidden accept=".pdf,.doc,.docx,.txt,.md,.png,.jpg,.jpeg" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} aria-label="Choose a document to upload" />
      </div>
      <div className="fp-help" style={{ marginTop: -6 }}>Files stay on this computer. They are never sent to an external AI service.</div>

      <div className="fp-row" style={{ position: "relative" }}>
        <Search size={14} className="fp-muted" style={{ position: "absolute", left: 10 }} aria-hidden="true" />
        <input className="fp-input" style={{ paddingLeft: 30 }} placeholder="Search documents" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search documents" />
      </div>
      <Tabs<Filter> label="Filter by type" value={filter} onChange={setFilter} tabs={[{ id: "all", label: "All" }, { id: "resume", label: "Resumes" }, { id: "cover_letter", label: "Letters" }, { id: "other", label: "Other" }]} />

      {dragging && <Notice tone="info" title="Drop to upload">Release the file to add it.</Notice>}
      {error ? <ErrorNotice error={error} onRetry={reload} /> : null}
      {loading && !docs && <div className="fp-col"><Skeleton h={64} /><Skeleton h={64} /></div>}

      {docs && docs.length === 0 && !error && (
        <EmptyState icon={<FileText size={22} />}
          title={q || filter !== "all" ? "Nothing matches" : "No resumes yet"}
          body={q || filter !== "all" ? "Try a different search or type." : "Add your first resume so FormPilot can recommend the right version for each application."}
          action={!q && filter === "all" ? <Button variant="primary" onClick={() => fileRef.current?.click()}><Upload size={14} /> Add resume</Button> : undefined} />
      )}
      {resumes.length > 1 && !q && <Notice tone="info">You have {resumes.length} resumes. FormPilot recommends the best fit for each job and always asks before using one.</Notice>}

      {(docs ?? []).map((d) => (
        <Card key={d.id} tight>
          <div className="fp-row" style={{ alignItems: "flex-start" }}>
            <div className="fp-col" style={{ flex: 1, gap: 3, minWidth: 0 }}>
              <div className="fp-row"><strong className="fp-truncate">{d.name}</strong>{d.isDefault && <Badge tone="primary" icon={<Star size={10} />}>Default</Badge>}</div>
              <div className="fp-row" style={{ flexWrap: "wrap", gap: 4 }}>
                <Badge>{catLabel(d.category)}</Badge><span className="fp-muted" style={{ fontSize: 11 }}>{fmtSize(d.size)} · {new Date(d.updatedAt).toLocaleDateString()}</span>
              </div>
              {d.resume?.targetRole && <div className="fp-sub" style={{ fontSize: 12 }}>Target: {d.resume.targetRole}</div>}
              {d.description && <div className="fp-sub" style={{ fontSize: 12 }}>{d.description}</div>}
              {(d.tags.length > 0 || (d.resume?.skills.length ?? 0) > 0) && (
                <div className="fp-row" style={{ flexWrap: "wrap", gap: 4 }}>{[...(d.resume?.skills ?? []), ...d.tags].slice(0, 8).map((t) => <Badge key={t} tone="ai">{t}</Badge>)}</div>
              )}
              {d.category === "resume" && !d.resume?.hasText && !(d.resume?.skills.length) && <div className="fp-help">Add skills so matching works for this resume.</div>}
            </div>
          </div>
          <div className="fp-row" style={{ marginTop: 8, flexWrap: "wrap", gap: 4 }}>
            <Button size="sm" onClick={() => setPreview(d)}><Eye size={13} /> Preview</Button>
            <Button size="sm" variant="ghost" onClick={() => download(d)} aria-label={`Download ${d.name}`}><Download size={13} /></Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing({ doc: d })} aria-label={`Edit ${d.name}`}><Pencil size={13} /></Button>
            {!d.isDefault && <Button size="sm" variant="ghost" onClick={async () => { await api.documents.update(d.id, { isDefault: true }); reload(); }} aria-label={`Make ${d.name} the default`}><Star size={13} /> Default</Button>}
            <span className="fp-spacer" />
            <Button size="sm" variant="ghost" onClick={() => setRemoving(d)} aria-label={`Delete ${d.name}`}><Trash2 size={13} /></Button>
          </div>
        </Card>
      ))}

      {editing && <DocForm {...editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); reload(); }} />}
      {preview && <Preview doc={preview} onClose={() => setPreview(null)} onDownload={() => download(preview)} />}
      {removing && <ConfirmDialog title="Delete document?" confirmLabel="Delete" body={<>“{removing.name}” will be permanently removed from this computer.</>}
        onClose={() => setRemoving(null)} onConfirm={async () => { await api.documents.remove(removing.id); reload(); }} />}
    </div>
  );
}

function DocForm({ doc, file, onClose, onDone }: { doc?: DocMeta; file?: File; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState(doc?.name ?? file?.name.replace(/\.[^.]+$/, "") ?? "");
  const [category, setCategory] = useState<DocMeta["category"]>(doc?.category ?? (/resume|cv/i.test(file?.name ?? "") ? "resume" : "other"));
  const [description, setDescription] = useState(doc?.description ?? "");
  const [tags, setTags] = useState((doc?.tags ?? []).join(", "));
  const [targetRole, setTargetRole] = useState(doc?.resume?.targetRole ?? "");
  const [skills, setSkills] = useState((doc?.resume?.skills ?? []).join(", "));
  const [isDefault, setIsDefault] = useState(doc?.isDefault ?? false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const list = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

  async function submit() {
    setBusy(true); setErr(null);
    try {
      if (doc) await api.documents.update(doc.id, { name, category, description, tags: list(tags), ...(category === "resume" ? { targetRole, skills: list(skills) } : {}), ...(isDefault ? { isDefault: true } : {}) });
      else await api.documents.upload(file!, { name, category, description, tags: list(tags), targetRole, skills: list(skills), isDefault });
      onDone();
    } catch (e) { setErr(e); setBusy(false); }
  }
  return (
    <Dialog title={doc ? "Edit document" : "Add document"} onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" busy={busy} disabled={!name.trim()} onClick={submit}>{doc ? "Save" : "Upload"}</Button></>}>
      {file && <div className="fp-sub">{file.name} · {fmtSize(file.size)}</div>}
      <TextInput label="Title" value={name} onChange={setName} />
      <Field label="Type"><select className="fp-select" value={category} onChange={(e) => setCategory(e.target.value as DocMeta["category"])} aria-label="Document type">{CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></Field>
      <TextInput label="Description" value={description} onChange={setDescription} placeholder="Optional" />
      <TextInput label="Tags" value={tags} onChange={setTags} help="Separate with commas" />
      {category === "resume" && <>
        <TextInput label="Target role" value={targetRole} onChange={setTargetRole} placeholder="e.g. Backend Engineer" />
        <TextInput label="Key skills" value={skills} onChange={setSkills} help="Used to recommend this resume for matching jobs" />
      </>}
      <label className="fp-row"><input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} /> Use as my default {catLabel(category).toLowerCase()}</label>
      {err ? <ErrorNotice error={err} /> : null}
    </Dialog>
  );
}

function Preview({ doc, onClose, onDownload }: { doc: DocMeta; onClose: () => void; onDownload: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [err, setErr] = useState<unknown>(null);
  const isImg = /^image\//.test(doc.mimeType), isPdf = doc.mimeType === "application/pdf", isTxt = /^text\//.test(doc.mimeType);
  useEffect(() => {
    let u: string | null = null;
    api.documents.blob(doc.id).then(async (b) => {
      if (isTxt) setText((await b.text()).slice(0, 20000));
      else if (isImg || isPdf) { u = URL.createObjectURL(b); setUrl(u); }
    }).catch(setErr);
    return () => { if (u) URL.revokeObjectURL(u); };
  }, [doc.id, isImg, isPdf, isTxt]);
  return (
    <Dialog title={doc.name} onClose={onClose} footer={<><Button onClick={onDownload}><Download size={13} /> Download</Button>{url && isPdf && <Button onClick={() => chrome.tabs.create({ url })}>Open in tab</Button>}</>}>
      {err ? <ErrorNotice error={err} /> : null}
      {isImg && url && <img src={url} alt={doc.name} style={{ maxWidth: "100%", borderRadius: 10 }} />}
      {isPdf && url && <iframe src={url} title={`Preview of ${doc.name}`} style={{ width: "100%", height: 360, border: 0, borderRadius: 10, background: "#fff" }} />}
      {isTxt && text !== null && <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, maxHeight: 360, overflow: "auto", margin: 0 }}>{text}</pre>}
      {!isImg && !isPdf && !isTxt && <Notice tone="info">No inline preview for this file type. Use Download to open it.</Notice>}
    </Dialog>
  );
}
