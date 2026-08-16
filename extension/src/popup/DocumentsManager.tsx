import React, { useEffect, useRef, useState } from "react";
import { Upload, Trash2, FileText, Download, Tag, X, FilePlus } from "lucide-react";
import {
  StoredDocument,
  getDocuments,
  saveDocument,
  deleteDocument,
  readFileAsBase64,
  base64ToObjectUrl,
} from "../shared/storage";

type Category = StoredDocument["category"];

const CATEGORY_META: Record<Category, { label: string; color: string; dot: string }> = {
  resume:       { label: "Resume",       color: "bg-brand-50 text-brand-700 border-brand-100",   dot: "bg-brand-400"   },
  cover_letter: { label: "Cover Letter", color: "bg-emerald-50 text-emerald-700 border-emerald-100", dot: "bg-emerald-400" },
  certificate:  { label: "Certificate",  color: "bg-amber-50 text-amber-700 border-amber-100",   dot: "bg-amber-400"   },
  transcript:   { label: "Transcript",   color: "bg-violet-50 text-violet-700 border-violet-100", dot: "bg-violet-400"  },
  id:           { label: "ID / Passport",color: "bg-red-50 text-red-700 border-red-100",          dot: "bg-red-400"     },
  other:        { label: "Other",        color: "bg-gray-50 text-gray-600 border-gray-200",       dot: "bg-gray-400"    },
};

const MAX_FILE_BYTES = 5 * 1024 * 1024;

export default function DocumentsManager() {
  const [docs, setDocs] = useState<StoredDocument[]>([]);
  const [filter, setFilter] = useState<Category | "all">("all");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [showUploadForm, setShowUploadForm] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingName, setPendingName] = useState("");
  const [pendingCategory, setPendingCategory] = useState<Category>("resume");
  const [pendingTags, setPendingTags] = useState("");

  useEffect(() => { load(); }, []);

  async function load() { setDocs(await getDocuments()); }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setError(`File too large (max 5 MB). Yours is ${(file.size / 1024 / 1024).toFixed(1)} MB.`);
      return;
    }
    setError("");
    setPendingFile(file);
    setPendingName(file.name.replace(/\.[^.]+$/, ""));
    setShowUploadForm(true);
  }

  async function handleUpload() {
    if (!pendingFile) return;
    setUploading(true);
    setError("");
    try {
      const data = await readFileAsBase64(pendingFile);
      await saveDocument({
        id: crypto.randomUUID(),
        name: pendingName || pendingFile.name,
        category: pendingCategory,
        filename: pendingFile.name,
        size: pendingFile.size,
        mimeType: pendingFile.type || "application/octet-stream",
        uploadedAt: new Date().toISOString(),
        tags: pendingTags.split(",").map((t) => t.trim()).filter(Boolean),
        data,
      });
      await load();
      resetUploadForm();
    } catch {
      setError("Failed to read file. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  function resetUploadForm() {
    setPendingFile(null);
    setPendingName("");
    setPendingCategory("resume");
    setPendingTags("");
    setShowUploadForm(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleDelete(id: string) {
    await deleteDocument(id);
    await load();
  }

  function handleDownload(doc: StoredDocument) {
    const url = base64ToObjectUrl(doc.data, doc.mimeType);
    const a = document.createElement("a");
    a.href = url;
    a.download = doc.filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  const filtered = filter === "all" ? docs : docs.filter((d) => d.category === filter);
  const counts = docs.reduce((acc, d) => { acc[d.category] = (acc[d.category] || 0) + 1; return acc; }, {} as Record<string, number>);

  return (
    <div className="flex flex-col h-full">
      {/* Filter pills */}
      <div className="flex gap-1.5 px-3 pt-3 pb-2 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
        <button
          onClick={() => setFilter("all")}
          className={`shrink-0 text-[11px] font-semibold px-3 py-1 rounded-full border transition-all ${
            filter === "all"
              ? "text-white border-transparent shadow-brand"
              : "bg-white text-gray-500 border-gray-200 hover:border-brand-300 hover:text-brand-600"
          }`}
          style={filter === "all" ? { background: "linear-gradient(135deg,#6366f1,#8b5cf6)" } : {}}
        >
          All ({docs.length})
        </button>
        {(Object.keys(CATEGORY_META) as Category[]).map((cat) =>
          counts[cat] ? (
            <button
              key={cat}
              onClick={() => setFilter(cat)}
              className={`shrink-0 text-[11px] font-semibold px-3 py-1 rounded-full border transition-all ${
                filter === cat
                  ? "text-white border-transparent shadow-brand"
                  : `${CATEGORY_META[cat].color} hover:opacity-80`
              }`}
              style={filter === cat ? { background: "linear-gradient(135deg,#6366f1,#8b5cf6)" } : {}}
            >
              {CATEGORY_META[cat].label} ({counts[cat]})
            </button>
          ) : null
        )}
      </div>

      {/* Document list */}
      <div className="flex-1 overflow-y-auto px-3 pb-2 space-y-2">
        {filtered.length === 0 && !showUploadForm && (
          <div className="flex flex-col items-center justify-center py-10 gap-3 text-gray-400 animate-fade-up">
            <div
              className="w-14 h-14 flex items-center justify-center"
              style={{
                background: "linear-gradient(135deg, rgba(99,102,241,0.1), rgba(168,85,247,0.06))",
                borderRadius: "60% 40% 30% 70% / 60% 30% 70% 40%",
              }}
            >
              <FileText size={22} className="text-brand-400" />
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-gray-600">No documents yet</p>
              <p className="text-[11px] text-gray-400 mt-0.5 leading-relaxed text-center">
                Upload your resume, cover letters, or certificates
              </p>
            </div>
          </div>
        )}

        {/* Upload form */}
        {showUploadForm && pendingFile && (
          <div
            className="rounded-2xl border p-4 space-y-3 animate-fade-up"
            style={{
              background: "linear-gradient(135deg, rgba(99,102,241,0.05), rgba(168,85,247,0.03))",
              borderColor: "rgba(99,102,241,0.2)",
            }}
          >
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-bold text-brand-700">New Document</span>
              <button onClick={resetUploadForm} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100">
                <X size={14} />
              </button>
            </div>

            <div className="text-[11px] text-gray-500 bg-white rounded-xl px-3 py-2 border border-gray-100 truncate">
              {pendingFile.name} · {(pendingFile.size / 1024).toFixed(0)} KB
            </div>

            <UploadField label="Display Name">
              <input
                className={inputCls}
                value={pendingName}
                onChange={(e) => setPendingName(e.target.value)}
                placeholder="e.g. Software Engineer Resume"
              />
            </UploadField>

            <UploadField label="Category">
              <select
                className={inputCls}
                value={pendingCategory}
                onChange={(e) => setPendingCategory(e.target.value as Category)}
              >
                {(Object.entries(CATEGORY_META) as [Category, { label: string }][]).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </UploadField>

            <UploadField label="Tags (comma-separated)">
              <input
                className={inputCls}
                value={pendingTags}
                onChange={(e) => setPendingTags(e.target.value)}
                placeholder="backend, python, senior"
              />
            </UploadField>

            {error && <p className="text-[11px] text-red-600">{error}</p>}

            <button
              onClick={handleUpload}
              disabled={uploading || !pendingName.trim()}
              className="w-full text-white text-[13px] font-bold py-2.5 rounded-xl disabled:opacity-50 transition-all"
              style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}
            >
              {uploading ? "Saving…" : "Save Document"}
            </button>
          </div>
        )}

        {filtered.map((doc, idx) => (
          <DocumentCard
            key={doc.id}
            doc={doc}
            delay={idx * 40}
            onDelete={() => handleDelete(doc.id)}
            onDownload={() => handleDownload(doc)}
          />
        ))}
      </div>

      {/* Upload button */}
      {!showUploadForm && (
        <div className="shrink-0 px-3 py-3 border-t border-gray-100">
          {error && <p className="text-[11px] text-red-600 mb-2">{error}</p>}
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg"
            onChange={handleFileSelect}
          />
          <button
            onClick={() => { setError(""); fileRef.current?.click(); }}
            className="w-full flex items-center justify-center gap-2 text-white text-[13px] font-bold py-3 rounded-2xl transition-all active:scale-95"
            style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6, #a855f7)", boxShadow: "0 4px 18px rgba(99,102,241,0.4)" }}
          >
            <FilePlus size={16} />
            Upload Document
          </button>
          <p className="text-center text-[10px] text-gray-400 mt-1.5">Max 5 MB · PDF, DOC, DOCX, TXT, Image</p>
        </div>
      )}
    </div>
  );
}

function UploadField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider">{label}</label>
      {children}
    </div>
  );
}

const inputCls = "w-full border border-gray-200 rounded-xl px-3 py-2 text-[13px] bg-white focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-300";

function DocumentCard({
  doc, delay, onDelete, onDownload,
}: {
  doc: StoredDocument;
  delay: number;
  onDelete: () => void;
  onDownload: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const meta = CATEGORY_META[doc.category];

  return (
    <div
      className="bg-white rounded-2xl border border-gray-100 overflow-hidden animate-fade-up"
      style={{ animationDelay: `${delay}ms`, boxShadow: "0 1px 6px rgba(0,0,0,0.04)" }}
    >
      <div className="px-3.5 py-3">
        <div className="flex items-start gap-2.5">
          {/* File icon */}
          <div className="shrink-0 w-9 h-9 rounded-xl bg-brand-50 border border-brand-100 flex items-center justify-center">
            <FileText size={16} className="text-brand-500" />
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-semibold text-gray-800 truncate">{doc.name}</div>
            <div className="text-[10px] text-gray-400 mt-0.5">{doc.filename} · {(doc.size / 1024).toFixed(0)} KB</div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={onDownload}
              className="p-1.5 text-gray-300 hover:text-brand-500 transition-colors rounded-lg hover:bg-brand-50"
              title="Download"
            >
              <Download size={13} />
            </button>
            {confirmDelete ? (
              <div className="flex items-center gap-1">
                <button onClick={onDelete} className="text-[10px] font-semibold text-red-600 px-2 py-1 rounded-lg hover:bg-red-50">
                  Delete
                </button>
                <button onClick={() => setConfirmDelete(false)} className="text-[10px] text-gray-500 px-1 py-1 rounded-lg">✕</button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="p-1.5 text-gray-300 hover:text-red-400 transition-colors rounded-lg hover:bg-red-50"
                title="Delete"
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
        </div>

        {/* Tags */}
        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${meta.color}`}>
            {meta.label}
          </span>
          {doc.tags.map((tag) => (
            <span key={tag} className="text-[10px] bg-gray-50 text-gray-500 border border-gray-100 px-2 py-0.5 rounded-full flex items-center gap-1">
              <Tag size={8} />
              {tag}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
