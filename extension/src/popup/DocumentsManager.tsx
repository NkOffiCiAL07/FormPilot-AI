import React, { useEffect, useRef, useState } from "react";
import { Upload, Trash2, FileText, Download, Tag, Plus, X } from "lucide-react";
import {
  StoredDocument,
  getDocuments,
  saveDocument,
  deleteDocument,
  readFileAsBase64,
  base64ToObjectUrl,
} from "../shared/storage";

type Category = StoredDocument["category"];

const CATEGORY_LABELS: Record<Category, string> = {
  resume: "Resume",
  cover_letter: "Cover Letter",
  certificate: "Certificate",
  transcript: "Transcript",
  id: "ID / Passport",
  other: "Other",
};

const CATEGORY_COLORS: Record<Category, string> = {
  resume: "bg-blue-100 text-blue-700",
  cover_letter: "bg-green-100 text-green-700",
  certificate: "bg-yellow-100 text-yellow-700",
  transcript: "bg-purple-100 text-purple-700",
  id: "bg-red-100 text-red-700",
  other: "bg-gray-100 text-gray-600",
};

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB

export default function DocumentsManager() {
  const [docs, setDocs] = useState<StoredDocument[]>([]);
  const [filter, setFilter] = useState<Category | "all">("all");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [showUploadForm, setShowUploadForm] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Upload form state
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingName, setPendingName] = useState("");
  const [pendingCategory, setPendingCategory] = useState<Category>("resume");
  const [pendingTags, setPendingTags] = useState("");

  useEffect(() => { load(); }, []);

  async function load() {
    setDocs(await getDocuments());
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setError(`File too large (max 5 MB). Your file is ${(file.size / 1024 / 1024).toFixed(1)} MB.`);
      return;
    }
    setError("");
    setPendingFile(file);
    setPendingName(file.name.replace(/\.[^.]+$/, "")); // strip extension as default name
    setShowUploadForm(true);
  }

  async function handleUpload() {
    if (!pendingFile) return;
    setUploading(true);
    setError("");
    try {
      const data = await readFileAsBase64(pendingFile);
      const doc: StoredDocument = {
        id: crypto.randomUUID(),
        name: pendingName || pendingFile.name,
        category: pendingCategory,
        filename: pendingFile.name,
        size: pendingFile.size,
        mimeType: pendingFile.type || "application/octet-stream",
        uploadedAt: new Date().toISOString(),
        tags: pendingTags.split(",").map((t) => t.trim()).filter(Boolean),
        data,
      };
      await saveDocument(doc);
      await load();
      resetUploadForm();
    } catch (e) {
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
      {/* Filter tabs */}
      <div className="flex overflow-x-auto border-b bg-white text-xs gap-1 px-2 py-1.5">
        <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
          All ({docs.length})
        </FilterChip>
        {(Object.keys(CATEGORY_LABELS) as Category[]).map((cat) =>
          counts[cat] ? (
            <FilterChip key={cat} active={filter === cat} onClick={() => setFilter(cat)}>
              {CATEGORY_LABELS[cat]} ({counts[cat]})
            </FilterChip>
          ) : null
        )}
      </div>

      {/* Document list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {filtered.length === 0 && !showUploadForm && (
          <div className="flex flex-col items-center justify-center py-10 gap-2 text-gray-400">
            <FileText size={32} />
            <p className="text-sm">No documents yet</p>
            <p className="text-xs text-center">Upload your resume, cover letters, certificates, and more.</p>
          </div>
        )}

        {filtered.map((doc) => (
          <DocumentCard
            key={doc.id}
            doc={doc}
            onDelete={() => handleDelete(doc.id)}
            onDownload={() => handleDownload(doc)}
          />
        ))}

        {/* Upload form */}
        {showUploadForm && pendingFile && (
          <div className="border border-brand-300 rounded-xl bg-brand-50 p-3 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-brand-700">New Document</span>
              <button onClick={resetUploadForm} className="text-gray-400 hover:text-gray-600">
                <X size={14} />
              </button>
            </div>

            <div className="text-xs text-gray-500 bg-white rounded-lg px-3 py-2 border border-gray-200">
              {pendingFile.name} · {(pendingFile.size / 1024).toFixed(0)} KB
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-medium text-gray-600">Display Name</label>
              <input
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                value={pendingName}
                onChange={(e) => setPendingName(e.target.value)}
                placeholder="e.g. Software Engineer Resume"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-medium text-gray-600">Category</label>
              <select
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                value={pendingCategory}
                onChange={(e) => setPendingCategory(e.target.value as Category)}
              >
                {(Object.entries(CATEGORY_LABELS) as [Category, string][]).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-medium text-gray-600">
                Tags <span className="text-gray-400">(comma-separated, used for resume matching)</span>
              </label>
              <input
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                value={pendingTags}
                onChange={(e) => setPendingTags(e.target.value)}
                placeholder="e.g. software engineer, backend, python"
              />
            </div>

            {error && <p className="text-xs text-red-600">{error}</p>}

            <button
              onClick={handleUpload}
              disabled={uploading || !pendingName.trim()}
              className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white text-sm font-medium py-2 rounded-lg transition-colors"
            >
              {uploading ? "Saving…" : "Save Document"}
            </button>
          </div>
        )}
      </div>

      {/* Upload button */}
      {!showUploadForm && (
        <div className="p-3 border-t border-gray-100">
          {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg"
            onChange={handleFileSelect}
          />
          <button
            onClick={() => { setError(""); fileRef.current?.click(); }}
            className="w-full flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium py-2.5 rounded-xl transition-colors"
          >
            <Upload size={16} />
            Upload Document
          </button>
          <p className="text-center text-xs text-gray-400 mt-1.5">Max 5 MB · PDF, DOC, DOCX, TXT, Image</p>
        </div>
      )}
    </div>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`whitespace-nowrap px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
        active ? "bg-brand-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
      }`}
    >
      {children}
    </button>
  );
}

function DocumentCard({
  doc,
  onDelete,
  onDownload,
}: {
  doc: StoredDocument;
  onDelete: () => void;
  onDownload: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <FileText size={16} className="text-brand-500 shrink-0" />
          <div className="min-w-0">
            <div className="text-sm font-medium text-gray-800 truncate">{doc.name}</div>
            <div className="text-xs text-gray-400">{doc.filename} · {(doc.size / 1024).toFixed(0)} KB</div>
          </div>
        </div>
        <div className="flex gap-1 shrink-0">
          <button
            onClick={onDownload}
            className="p-1.5 text-gray-400 hover:text-brand-600 rounded transition-colors"
            title="Download"
          >
            <Download size={14} />
          </button>
          {confirmDelete ? (
            <div className="flex gap-1 items-center">
              <button onClick={onDelete} className="text-xs text-red-600 font-medium px-2 py-1 rounded hover:bg-red-50">Delete</button>
              <button onClick={() => setConfirmDelete(false)} className="text-xs text-gray-500 px-2 py-1 rounded hover:bg-gray-50">Cancel</button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="p-1.5 text-gray-400 hover:text-red-500 rounded transition-colors"
              title="Delete"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[doc.category]}`}>
          {CATEGORY_LABELS[doc.category]}
        </span>
        {doc.tags.map((tag) => (
          <span key={tag} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full flex items-center gap-1">
            <Tag size={10} />
            {tag}
          </span>
        ))}
      </div>
    </div>
  );
}
