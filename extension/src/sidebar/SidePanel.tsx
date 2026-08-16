import React, { useEffect, useState } from "react";
import {
  BrainCircuit, CheckCircle, Sparkles, AlertTriangle, Paperclip,
  ChevronDown, ChevronUp, Pencil, Check, Loader2, FolderOpen, LocateFixed,
} from "lucide-react";
import { FieldResult, FillStatus } from "../shared/types";
import { StoredDocument, getDocuments, recommendResume, base64ToObjectUrl } from "../shared/storage";

interface TabState {
  results: FieldResult[];
  summary: { total: number; auto: number; ai: number; needsInput: number; documents: number };
  title: string;
  url: string;
  fieldCount?: number;
}

type FilterTab = "all" | "auto" | "ai" | "needs_input" | "document";

export default function SidePanel() {
  const [state, setState] = useState<TabState | null>(null);
  const [results, setResults] = useState<FieldResult[]>([]);
  const [filter, setFilter] = useState<FilterTab>("all");
  const [filling, setFilling] = useState(false);
  const [filled, setFilled] = useState(false);
  const [activeTabId, setActiveTabId] = useState<number | null>(null);
  const [documents, setDocuments] = useState<StoredDocument[]>([]);

  useEffect(() => {
    loadState();
    getDocuments().then(setDocuments);

    const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== "session") return;
      chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
        if (tab?.id && changes[`tab_${tab.id}`]) loadState();
      });
    };
    chrome.storage.onChanged.addListener(listener);
    // Also reload documents when storage changes (user uploads in popup)
    const localListener = (_: unknown, area: string) => {
      if (area === "local") getDocuments().then(setDocuments);
    };
    chrome.storage.onChanged.addListener(localListener);
    const interval = setInterval(loadState, 3000);
    return () => {
      chrome.storage.onChanged.removeListener(listener);
      chrome.storage.onChanged.removeListener(localListener);
      clearInterval(interval);
    };
  }, []);

  async function loadState() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    if (!activeTabId) setActiveTabId(tab.id);
    chrome.storage.session.get(`tab_${tab.id}`, (data) => {
      const s = data[`tab_${tab.id}`] as TabState | undefined;
      if (s) { setState(s); setResults(s.results); }
    });
  }

  function updateResult(fieldId: string, partial: Partial<FieldResult>) {
    setResults((prev) => prev.map((r) => (r.fieldId === fieldId ? { ...r, ...partial } : r)));
  }

  async function handleFill() {
    setFilling(true);
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const tabId = tab?.id ?? activeTabId;
    if (!tabId) { setFilling(false); return; }

    chrome.runtime.sendMessage({ type: "FILL_FORM", payload: { results, tabId } }).catch(() => {});

    setTimeout(() => {
      setFilling(false);
      setFilled(true);
      setTimeout(() => setFilled(false), 3000);
    }, 900);
  }

  async function scrollToField(fieldId: string) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    chrome.runtime.sendMessage({
      type: "FILL_FORM",
      payload: { results: [], tabId: tab.id },
    }).catch(() => {});
    // Use scripting to scroll — broadcast to all frames
    chrome.runtime.sendMessage({ type: "SCROLL_TO_FIELD", payload: { fieldId, tabId: tab.id } }).catch(() => {});
  }

  const filtered = results.filter((r) => {
    if (filter === "all") return true;
    if (filter === "needs_input") return r.status === "needs_input" || r.status === "sensitive";
    return r.status === filter;
  });

  const pageContext = state?.title || state?.url || "";

  if (!state) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-3 text-gray-400 px-6">
        <BrainCircuit size={36} />
        <p className="text-sm font-medium">No form detected</p>
        <p className="text-xs text-center">Open a page with a form, then click the FormPilot badge to scan.</p>
      </div>
    );
  }

  const { summary } = state;

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-brand-600 text-white px-4 py-3 flex items-center gap-2">
        <BrainCircuit size={20} />
        <span className="font-bold text-sm">FormPilot AI</span>
        <span className="ml-auto text-xs opacity-75 truncate max-w-[160px]">{state.title}</span>
      </div>

      {/* Summary bar */}
      <div className="bg-white border-b px-4 py-2.5">
        <div className="text-sm font-semibold text-gray-800 mb-1">{summary.total} fields detected</div>
        <div className="flex gap-3 text-xs flex-wrap">
          <span className="text-green-600 font-medium">✓ {summary.auto} auto</span>
          <span className="text-brand-600 font-medium">✦ {summary.ai} AI</span>
          <span className="text-amber-600 font-medium">⚠ {summary.needsInput} review</span>
          <span className="text-purple-600 font-medium">📎 {summary.documents} docs</span>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex border-b bg-white text-xs">
        {(["all", "auto", "ai", "needs_input", "document"] as FilterTab[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`flex-1 py-2 font-medium transition-colors ${
              filter === f ? "border-b-2 border-brand-600 text-brand-600" : "text-gray-400 hover:text-gray-600"
            }`}
          >
            {f === "needs_input" ? "Review" : f === "document" ? "Docs" : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Field cards */}
      <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
        {filtered.length === 0 && (
          <div className="flex items-center justify-center h-20 text-xs text-gray-400">
            No fields in this category
          </div>
        )}
        {filtered.map((result) => (
          <FieldCard
            key={result.fieldId}
            result={result}
            documents={documents}
            pageContext={pageContext}
            onUpdate={updateResult}
            onScrollTo={() => scrollToField(result.fieldId)}
          />
        ))}
      </div>

      {/* Fill button */}
      <div className="bg-white border-t px-4 py-3">
        <button
          onClick={handleFill}
          disabled={filling}
          className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white text-sm font-semibold py-3 rounded-xl flex items-center justify-center gap-2 transition-colors"
        >
          {filling ? (
            <><Loader2 size={16} className="animate-spin" /> Filling…</>
          ) : filled ? (
            <><Check size={16} /> Filled!</>
          ) : (
            "Fill Form"
          )}
        </button>
        <p className="text-center text-xs text-gray-400 mt-1.5">Form will not be submitted automatically</p>
      </div>
    </div>
  );
}

// ─── Field Card ───────────────────────────────────────────────────────────────

function FieldCard({
  result, documents, pageContext, onUpdate, onScrollTo,
}: {
  result: FieldResult;
  documents: StoredDocument[];
  pageContext: string;
  onUpdate: (id: string, p: Partial<FieldResult>) => void;
  onScrollTo: () => void;
}) {
  const [expanded, setExpanded] = useState(
    result.status === "needs_input" || result.status === "sensitive" || result.status === "document"
  );
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(result.value);

  const { normalizedField: f, status, confidence, value, source } = result;
  const label = f.label || f.name || f.ariaLabel || f.placeholder || "Unnamed field";

  const statusMeta: Record<FillStatus, { icon: React.ReactNode; color: string; badge: string; badgeText: string }> = {
    auto:        { icon: <CheckCircle size={14} />, color: "text-green-600", badge: "bg-green-100 text-green-700", badgeText: "auto" },
    ai:          { icon: <Sparkles size={14} />,    color: "text-brand-600", badge: "bg-brand-100 text-brand-700", badgeText: "AI" },
    needs_input: { icon: <AlertTriangle size={14} />, color: "text-amber-600", badge: "bg-amber-100 text-amber-700", badgeText: "review" },
    sensitive:   { icon: <AlertTriangle size={14} />, color: "text-red-500", badge: "bg-red-100 text-red-700", badgeText: "sensitive" },
    document:    { icon: <Paperclip size={14} />,   color: "text-purple-600", badge: "bg-purple-100 text-purple-700", badgeText: "document" },
    skipped:     { icon: null, color: "text-gray-400", badge: "bg-gray-100 text-gray-500", badgeText: "skip" },
  };

  const meta = statusMeta[status];

  function saveEdit() {
    onUpdate(result.fieldId, { value: editValue, status: "auto" });
    setEditing(false);
  }

  // Document card
  if (status === "document") {
    const recommended = recommendResume(documents, pageContext);
    return <DocumentFieldCard label={label} fieldId={f.id} recommended={recommended} documents={documents} />;
  }

  return (
    <div className="bg-white px-4 py-3">
      <div className="flex items-start justify-between cursor-pointer" onClick={() => setExpanded((e) => !e)}>
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className={meta.color}>{meta.icon}</span>
          <span className="text-sm font-medium text-gray-800 truncate">{label}</span>
          {f.required && <span className="text-red-400 text-xs shrink-0">*</span>}
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-2">
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${meta.badge}`}>{meta.badgeText}</span>
          <button onClick={(e) => { e.stopPropagation(); onScrollTo(); }} className="text-gray-300 hover:text-brand-500 transition-colors" title="Scroll to field">
            <LocateFixed size={13} />
          </button>
          {expanded ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
        </div>
      </div>

      {value && !expanded && (
        <div className="mt-1 text-xs text-gray-500 truncate pl-6">{value}</div>
      )}

      {expanded && (
        <div className="mt-3 space-y-2 pl-1">
          <div className="flex flex-wrap gap-x-3 text-xs text-gray-400">
            {f.fieldType && <span>Type: {f.fieldType}</span>}
            {f.sectionContext && <span>Section: {f.sectionContext}</span>}
            {confidence > 0 && <span>Confidence: {Math.round(confidence * 100)}%</span>}
          </div>

          {/* Value editor */}
          <div className="space-y-1">
            <div className="text-xs font-medium text-gray-600">Answer</div>
            {editing ? (
              <div className="space-y-2">
                {f.fieldType === "textarea" ? (
                  <textarea
                    className="w-full border border-brand-400 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
                    rows={4}
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    autoFocus
                  />
                ) : (
                  <input
                    className="w-full border border-brand-400 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    autoFocus
                  />
                )}
                <div className="flex gap-2">
                  <button onClick={saveEdit} className="flex items-center gap-1 bg-brand-600 text-white text-xs px-3 py-1.5 rounded-lg hover:bg-brand-700">
                    <Check size={12} /> Save
                  </button>
                  <button onClick={() => setEditing(false)} className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2 items-start">
                {value ? (
                  <div className="flex-1 text-sm text-gray-800 bg-gray-50 rounded-lg px-3 py-2 break-words whitespace-pre-wrap">{value}</div>
                ) : (
                  <div className="flex-1 text-sm text-gray-400 bg-gray-50 rounded-lg px-3 py-2 italic">
                    {result.userPrompt || "No value — please enter manually"}
                  </div>
                )}
                <button onClick={() => { setEditValue(value); setEditing(true); }} className="shrink-0 p-1.5 text-gray-400 hover:text-brand-600 rounded">
                  <Pencil size={14} />
                </button>
              </div>
            )}
          </div>

          {/* Source */}
          {source && source !== "ask_user" && source !== "no_match" && (
            <div className="text-xs text-gray-400">Source: <code className="bg-gray-100 px-1 rounded">{source}</code></div>
          )}

          {/* Options picker for select/radio */}
          {f.options.length > 0 && (
            <div className="space-y-1">
              <div className="text-xs font-medium text-gray-600">Options</div>
              <div className="flex flex-wrap gap-1">
                {f.options.slice(0, 10).map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => onUpdate(result.fieldId, { value: opt.value, status: "auto" })}
                    className={`text-xs px-2 py-1 rounded-lg border transition-colors ${
                      value === opt.value ? "bg-brand-600 text-white border-brand-600" : "border-gray-200 hover:border-brand-400"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
                {f.options.length > 10 && <span className="text-xs text-gray-400 self-center">+{f.options.length - 10} more</span>}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Document Field Card ──────────────────────────────────────────────────────

function DocumentFieldCard({
  label, fieldId, recommended, documents,
}: {
  label: string;
  fieldId: string;
  recommended: StoredDocument | null;
  documents: StoredDocument[];
}) {
  const [expanded, setExpanded] = useState(true);
  const [selectedId, setSelectedId] = useState(recommended?.id ?? "");

  const resumes = documents.filter((d) => d.category === "resume");
  const selected = documents.find((d) => d.id === selectedId) ?? recommended;

  async function handleSelectFile() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    // Broadcast CLICK_FILE_INPUT to all frames — it clicks the actual <input type="file">
    chrome.runtime.sendMessage({
      type: "CLICK_FILE_INPUT",
      payload: { fieldId, tabId: tab.id },
    }).catch(() => {});
  }

  function handleDownload() {
    if (!selected) return;
    const url = base64ToObjectUrl(selected.data, selected.mimeType);
    const a = document.createElement("a");
    a.href = url;
    a.download = selected.filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  return (
    <div className="bg-white px-4 py-3">
      <div className="flex items-center justify-between cursor-pointer" onClick={() => setExpanded((e) => !e)}>
        <div className="flex items-center gap-2">
          <Paperclip size={14} className="text-purple-600" />
          <span className="text-sm font-medium text-gray-800">{label}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium">document</span>
          {expanded ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
        </div>
      </div>

      {expanded && (
        <div className="mt-3 space-y-3 pl-1">
          {resumes.length === 0 ? (
            <div className="text-xs text-gray-500 bg-amber-50 border border-amber-200 rounded-lg p-2">
              No resumes stored. Go to <strong>Documents</strong> tab in the popup to upload your resume.
            </div>
          ) : (
            <>
              <div className="space-y-1">
                <div className="text-xs font-medium text-gray-600">Select resume to upload</div>
                <div className="space-y-1">
                  {resumes.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => setSelectedId(r.id)}
                      className={`w-full flex items-center gap-2 text-left px-3 py-2 rounded-lg border text-xs transition-colors ${
                        selectedId === r.id
                          ? "border-brand-500 bg-brand-50 text-brand-700"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{r.name}</div>
                        <div className="text-gray-400">{(r.size / 1024).toFixed(0)} KB · {r.filename}</div>
                        {r.tags.length > 0 && (
                          <div className="text-gray-400 mt-0.5">{r.tags.join(", ")}</div>
                        )}
                      </div>
                      {selectedId === r.id && <Check size={14} className="text-brand-600 shrink-0" />}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleSelectFile}
                  className="flex-1 flex items-center justify-center gap-1.5 bg-brand-600 hover:bg-brand-700 text-white text-xs font-medium py-2 rounded-lg transition-colors"
                >
                  <FolderOpen size={13} />
                  Browse &amp; Upload
                </button>
                {selected && (
                  <button
                    onClick={handleDownload}
                    className="flex items-center gap-1 text-xs border border-gray-200 hover:border-gray-300 px-3 py-2 rounded-lg text-gray-600 transition-colors"
                    title="Download selected resume to your computer first, then select it in the file picker"
                  >
                    ↓ Save first
                  </button>
                )}
              </div>

              {selected && (
                <p className="text-xs text-gray-400">
                  Click <strong>Browse &amp; Upload</strong> to open the file picker, then select <strong>{selected.filename}</strong> from your computer.
                  Use <strong>Save first</strong> if you need to download it.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
