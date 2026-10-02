import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Upload, Trash2, FileText, Download, Tag, X,
  CheckCircle, AlertTriangle, File, FileImage,
} from "lucide-react";
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
  resume:       { label: "Resume",       color: "bg-brand-50 text-brand-700 border-brand-100",     dot: "bg-brand-400"   },
  cover_letter: { label: "Cover Letter", color: "bg-emerald-50 text-emerald-700 border-emerald-100",dot: "bg-emerald-400" },
  certificate:  { label: "Certificate",  color: "bg-amber-50 text-amber-700 border-amber-100",     dot: "bg-amber-400"   },
  transcript:   { label: "Transcript",   color: "bg-violet-50 text-violet-700 border-violet-100",  dot: "bg-violet-400"  },
  id:           { label: "ID / Passport",color: "bg-red-50 text-red-700 border-red-100",            dot: "bg-red-400"     },
  other:        { label: "Other",        color: "bg-gray-50 text-gray-600 border-gray-200",         dot: "bg-gray-400"    },
};

// unlimitedStorage permission removes the 5MB cap — allow up to 20MB per file
const MAX_FILE_BYTES = 20 * 1024 * 1024;

const ACCEPTED = ".pdf,.doc,.docx,.txt,.rtf,.odt,.png,.jpg,.jpeg,.webp,.html";

function fileIcon(filename: string) {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  if (["png", "jpg", "jpeg", "webp"].includes(ext))
    return <FileImage size={16} className="text-emerald-500" />;
  if (ext === "pdf") return <File size={16} className="text-red-500" />;
  return <FileText size={16} className="text-brand-500" />;
}

function guessCategoryFromFilename(name: string): Category {
  const lower = name.toLowerCase();
  if (lower.includes("resume") || lower.includes("cv")) return "resume";
  if (lower.includes("cover") || lower.includes("letter")) return "cover_letter";
  if (lower.includes("certificate") || lower.includes("cert")) return "certificate";
  if (lower.includes("transcript") || lower.includes("grade")) return "transcript";
  if (lower.includes("passport") || lower.includes("id") || lower.includes("aadhaar") || lower.includes("pan")) return "id";
  return "other";
}

export default function DocumentsManager() {
  const [docs, setDocs]                     = useState<StoredDocument[]>([]);
  const [filter, setFilter]                 = useState<Category | "all">("all");
  const [uploading, setUploading]           = useState(false);
  const [uploadDone, setUploadDone]         = useState(false);
  const [error, setError]                   = useState("");
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [dragging, setDragging]             = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [pendingFile, setPendingFile]         = useState<File | null>(null);
  const [pendingName, setPendingName]         = useState("");
  const [pendingCategory, setPendingCategory] = useState<Category>("resume");
  const [pendingTags, setPendingTags]         = useState("");

  useEffect(() => { load(); }, []);

  async function load() { setDocs(await getDocuments()); }

  function pickFile(file: File) {
    if (file.size > MAX_FILE_BYTES) {
      setError(`File too large (max 20 MB). Yours is ${(file.size / 1024 / 1024).toFixed(1)} MB.`);
      return;
    }
    setError("");
    setPendingFile(file);
    const baseName = file.name.replace(/\.[^.]+$/, "");
    setPendingName(baseName);
    setPendingCategory(guessCategoryFromFilename(file.name));
    // Auto-fill tags from filename words
    const autoTags = baseName.split(/[\s_\-]+/).filter((w) => w.length > 2).slice(0, 4);
    setPendingTags(autoTags.join(", "));
    setShowUploadForm(true);
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) pickFile(file);
  }

  // Drag-and-drop handlers
  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  }, []);
  const onDragLeave = useCallback(() => setDragging(false), []);
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) pickFile(file);
  }, []);

  async function handleUpload() {
    if (!pendingFile) return;
    setUploading(true);
    setError("");
    try {
      const data = await readFileAsBase64(pendingFile);
      await saveDocument({
        id: crypto.randomUUID(),
        name: pendingName.trim() || pendingFile.name,
        category: pendingCategory,
        filename: pendingFile.name,
        size: pendingFile.size,
        mimeType: pendingFile.type || "application/octet-stream",
        uploadedAt: new Date().toISOString(),
        tags: pendingTags.split(",").map((t) => t.trim()).filter(Boolean),
        data,
      });
      await load();
      setUploadDone(true);
      setTimeout(() => {
        setUploadDone(false);
        resetUploadForm();
      }, 1800);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("QUOTA") || msg.includes("quota")) {
        setError("Storage full. Delete some documents and try again.");
      } else {
        setError("Failed to save. Try a smaller file or different format.");
      }
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
  const counts = docs.reduce((acc, d) => {
    acc[d.category] = (acc[d.category] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="flex flex-col h-full">

      {/* Filter pills */}
      {docs.length > 0 && (
        <div className="flex gap-1.5 px-3 pt-3 pb-2 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
          <button
            onClick={() => setFilter("all")}
            className={`shrink-0 text-[11px] font-semibold px-3 py-1 rounded-full border transition-all ${
              filter === "all"
                ? "text-white border-transparent"
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
                    ? "text-white border-transparent"
                    : `${CATEGORY_META[cat].color} hover:opacity-80`
                }`}
                style={filter === cat ? { background: "linear-gradient(135deg,#6366f1,#8b5cf6)" } : {}}
              >
                {CATEGORY_META[cat].label} ({counts[cat]})
              </button>
            ) : null
          )}
        </div>
      )}

      {/* Document list / upload form / empty state */}
      <div className="flex-1 overflow-y-auto px-3 pb-2 space-y-2">

        {/* Upload form */}
        {showUploadForm && pendingFile && (
          <div
            className="rounded-2xl border p-4 space-y-3 animate-fade-up mt-3"
            style={{
              background: "linear-gradient(135deg,rgba(99,102,241,0.04),rgba(168,85,247,0.02))",
              borderColor: "rgba(99,102,241,0.2)",
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {fileIcon(pendingFile.name)}
                <span className="text-[12px] font-bold text-gray-800">New Document</span>
              </div>
              <button
                onClick={resetUploadForm}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100"
              >
                <X size={13} />
              </button>
            </div>

            {/* File info chip */}
            <div className="flex items-center gap-2 bg-white rounded-xl px-3 py-2 border border-gray-100">
              {fileIcon(pendingFile.name)}
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-semibold text-gray-700 truncate">{pendingFile.name}</div>
                <div className="text-[10px] text-gray-400">{(pendingFile.size / 1024).toFixed(0)} KB</div>
              </div>
            </div>

            {/* Fields */}
            <div className="space-y-2">
              <UploadField label="Display Name">
                <input
                  className="input-water"
                  value={pendingName}
                  onChange={(e) => setPendingName(e.target.value)}
                  placeholder="e.g. Software Engineer Resume"
                />
              </UploadField>

              <UploadField label="Category">
                <select
                  className="input-water"
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
                  className="input-water"
                  value={pendingTags}
                  onChange={(e) => setPendingTags(e.target.value)}
                  placeholder="backend, python, senior"
                />
              </UploadField>
            </div>

            {error && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                <AlertTriangle size={12} className="text-red-500 shrink-0 mt-0.5" />
                <p className="text-[11px] text-red-600 leading-relaxed">{error}</p>
              </div>
            )}

            {/* Save button */}
            <button
              onClick={handleUpload}
              disabled={uploading || uploadDone || !pendingName.trim()}
              className="w-full flex items-center justify-center gap-2 text-white text-[13px] font-bold py-2.5 rounded-xl disabled:opacity-60 transition-all active:scale-[0.98]"
              style={{
                background: uploadDone
                  ? "linear-gradient(135deg,#10b981,#059669)"
                  : "linear-gradient(135deg,#6366f1,#8b5cf6)",
                boxShadow: uploadDone
                  ? "0 4px 14px rgba(16,185,129,0.35)"
                  : "0 4px 14px rgba(99,102,241,0.35)",
              }}
            >
              {uploading ? (
                <>
                  <div
                    className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin"
                  />
                  Saving…
                </>
              ) : uploadDone ? (
                <><CheckCircle size={15} /> Saved!</>
              ) : (
                <><Upload size={15} /> Save Document</>
              )}
            </button>
          </div>
        )}

        {/* Empty state with drop zone */}
        {docs.length === 0 && !showUploadForm && (
          <div
            className="mx-0 mt-3 flex flex-col items-center justify-center py-8 gap-4 rounded-2xl border-2 border-dashed transition-all cursor-pointer animate-fade-up"
            style={{
              borderColor: dragging ? "rgba(99,102,241,0.5)" : "rgba(99,102,241,0.18)",
              background: dragging
                ? "rgba(99,102,241,0.06)"
                : "rgba(99,102,241,0.02)",
            }}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            onClick={() => { setError(""); fileRef.current?.click(); }}
          >
            <div
              className="w-14 h-14 flex items-center justify-center transition-transform"
              style={{
                background: dragging
                  ? "linear-gradient(135deg,rgba(99,102,241,0.2),rgba(168,85,247,0.12))"
                  : "linear-gradient(135deg,rgba(99,102,241,0.1),rgba(168,85,247,0.06))",
                borderRadius: "60% 40% 30% 70% / 60% 30% 70% 40%",
                animation: "liquid 5s ease-in-out infinite",
                transform: dragging ? "scale(1.1)" : "scale(1)",
              }}
            >
              <Upload size={22} className="text-brand-500" />
            </div>
            <div className="text-center space-y-1">
              <p className="text-sm font-bold text-gray-700">
                {dragging ? "Drop to upload!" : "Upload your resume"}
              </p>
              <p className="text-[11px] text-gray-400 leading-relaxed px-4">
                {dragging
                  ? "Release to start upload"
                  : "Drag & drop here or click to browse\nPDF, DOC, DOCX, TXT, Image · up to 20 MB"}
              </p>
            </div>
          </div>
        )}

        {/* Document cards */}
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

      {/* Bottom upload bar (when docs exist) */}
      {!showUploadForm && (
        <div
          className="shrink-0 px-3 py-3 border-t border-gray-100"
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          {error && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-100 rounded-xl px-3 py-2 mb-2">
              <AlertTriangle size={12} className="text-red-500 shrink-0 mt-0.5" />
              <p className="text-[11px] text-red-600">{error}</p>
            </div>
          )}
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            accept={ACCEPTED}
            onChange={handleFileSelect}
          />
          <button
            onClick={() => { setError(""); fileRef.current?.click(); }}
            className={`w-full flex items-center justify-center gap-2 text-white text-[13px] font-bold py-3 rounded-2xl transition-all active:scale-[0.98] ${
              dragging ? "scale-[1.02]" : ""
            }`}
            style={{
              background: dragging
                ? "linear-gradient(135deg,#4f46e5,#7c3aed,#9333ea)"
                : "linear-gradient(135deg,#6366f1,#8b5cf6,#a855f7)",
              boxShadow: dragging
                ? "0 8px 28px rgba(99,102,241,0.6)"
                : "0 4px 18px rgba(99,102,241,0.4)",
            }}
          >
            <Upload size={15} />
            {dragging ? "Drop file here!" : "Upload Document"}
          </button>
          <p className="text-center text-[10px] text-gray-400 mt-1.5">
            PDF · DOC · DOCX · TXT · Image · up to 20 MB
          </p>
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
            {fileIcon(doc.filename)}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-semibold text-gray-800 truncate">{doc.name}</div>
            <div className="text-[10px] text-gray-400 mt-0.5 truncate">
              {doc.filename} · {doc.size > 1024 * 1024
                ? `${(doc.size / 1024 / 1024).toFixed(1)} MB`
                : `${(doc.size / 1024).toFixed(0)} KB`}
            </div>
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
                <button
                  onClick={onDelete}
                  className="text-[10px] font-semibold text-red-600 px-2 py-1 rounded-lg hover:bg-red-50"
                >
                  Delete
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="text-[10px] text-gray-500 px-1 py-1 rounded-lg"
                >
                  ✕
                </button>
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

        {/* Category + tags */}
        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${meta.color}`}>
            {meta.label}
          </span>
          {doc.tags.map((tag) => (
            <span
              key={tag}
              className="text-[10px] bg-gray-50 text-gray-500 border border-gray-100 px-2 py-0.5 rounded-full flex items-center gap-1"
            >
              <Tag size={8} />
              {tag}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
