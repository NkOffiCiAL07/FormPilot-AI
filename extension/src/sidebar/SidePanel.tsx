import React, { useEffect, useState } from "react";
import {
  BrainCircuit,
  CheckCircle,
  Sparkles,
  AlertTriangle,
  Paperclip,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Pencil,
  Check,
  Loader2,
} from "lucide-react";
import { FieldResult, FillStatus } from "../shared/types";

interface TabState {
  results: FieldResult[];
  summary: { total: number; auto: number; ai: number; needsInput: number; documents: number };
  title: string;
  url: string;
}

type FilterTab = "all" | "auto" | "ai" | "needs_input" | "document";

export default function SidePanel() {
  const [state, setState] = useState<TabState | null>(null);
  const [results, setResults] = useState<FieldResult[]>([]);
  const [filter, setFilter] = useState<FilterTab>("all");
  const [filling, setFilling] = useState(false);
  const [filled, setFilled] = useState(false);

  useEffect(() => {
    loadState();

    // Listen for storage changes so the panel updates instantly when a scan completes
    const listener = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string
    ) => {
      if (area !== "session") return;
      chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
        if (tab?.id && changes[`tab_${tab.id}`]) loadState();
      });
    };
    chrome.storage.onChanged.addListener(listener);
    // Also poll as fallback in case the listener fires before tab id is known
    const interval = setInterval(loadState, 3000);
    return () => {
      chrome.storage.onChanged.removeListener(listener);
      clearInterval(interval);
    };
  }, []);

  async function loadState() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    chrome.storage.session.get(`tab_${tab.id}`, (data) => {
      const s = data[`tab_${tab.id}`] as TabState | undefined;
      if (s) {
        setState(s);
        setResults(s.results);
      }
    });
  }

  function updateResult(fieldId: string, partial: Partial<FieldResult>) {
    setResults((prev) => prev.map((r) => (r.fieldId === fieldId ? { ...r, ...partial } : r)));
  }

  async function handleFill() {
    setFilling(true);
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) { setFilling(false); return; }
    // Route through background so it reaches the correct frame
    chrome.runtime.sendMessage({
      type: "FILL_FORM",
      payload: { results, tabId: tab.id },
    }, () => {
      setFilling(false);
      setFilled(true);
      setTimeout(() => setFilled(false), 3000);
    });
  }

  const filtered = results.filter((r) => {
    if (filter === "all") return true;
    if (filter === "needs_input") return r.status === "needs_input" || r.status === "sensitive";
    return r.status === filter;
  });

  if (!state) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-3 text-gray-400">
        <BrainCircuit size={36} />
        <p className="text-sm">No form detected on this page.</p>
        <p className="text-xs text-center px-6">Open a page with a form and click the FormPilot icon.</p>
      </div>
    );
  }

  const { summary } = state;

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="bg-brand-600 text-white px-4 py-3 flex items-center gap-2">
        <BrainCircuit size={20} />
        <span className="font-bold">FormPilot AI</span>
      </div>

      {/* Page context */}
      <div className="bg-white border-b px-4 py-2">
        <div className="text-xs text-gray-500 truncate">{state.title}</div>
      </div>

      {/* Summary bar */}
      <div className="bg-white border-b px-4 py-3">
        <div className="text-sm font-semibold text-gray-700 mb-2">{summary.total} fields detected</div>
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
            className={`flex-1 py-2 capitalize font-medium transition-colors ${
              filter === f ? "border-b-2 border-brand-600 text-brand-600" : "text-gray-500"
            }`}
          >
            {f === "needs_input" ? "Review" : f === "document" ? "Docs" : f}
          </button>
        ))}
      </div>

      {/* Field list */}
      <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
        {filtered.length === 0 && (
          <div className="flex items-center justify-center h-24 text-xs text-gray-400">
            No fields in this category
          </div>
        )}
        {filtered.map((result) => (
          <FieldCard key={result.fieldId} result={result} onUpdate={updateResult} />
        ))}
      </div>

      {/* Fill button */}
      <div className="bg-white border-t p-4">
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
        <p className="text-center text-xs text-gray-400 mt-1.5">
          Form will not be submitted automatically
        </p>
      </div>
    </div>
  );
}

// ─── Field Card ───────────────────────────────────────────────────────────────

function FieldCard({
  result,
  onUpdate,
}: {
  result: FieldResult;
  onUpdate: (id: string, p: Partial<FieldResult>) => void;
}) {
  const [expanded, setExpanded] = useState(result.status === "needs_input" || result.status === "sensitive");
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(result.value);

  const { normalizedField: f, status, confidence, value, source } = result;
  const label = f.label || f.name || f.ariaLabel || f.placeholder || "Unnamed field";

  const statusMeta: Record<FillStatus, { icon: React.ReactNode; color: string; badge: string }> = {
    auto: { icon: <CheckCircle size={14} />, color: "text-green-600", badge: "bg-green-100 text-green-700" },
    ai: { icon: <Sparkles size={14} />, color: "text-brand-600", badge: "bg-brand-100 text-brand-700" },
    needs_input: { icon: <AlertTriangle size={14} />, color: "text-amber-600", badge: "bg-amber-100 text-amber-700" },
    sensitive: { icon: <AlertTriangle size={14} />, color: "text-red-600", badge: "bg-red-100 text-red-700" },
    document: { icon: <Paperclip size={14} />, color: "text-purple-600", badge: "bg-purple-100 text-purple-700" },
    skipped: { icon: null, color: "text-gray-400", badge: "bg-gray-100 text-gray-500" },
  };

  const meta = statusMeta[status];

  function saveEdit() {
    onUpdate(result.fieldId, { value: editValue, status: "auto" });
    setEditing(false);
  }

  return (
    <div className="bg-white px-4 py-3">
      <div
        className="flex items-start justify-between cursor-pointer"
        onClick={() => setExpanded((e) => !e)}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className={meta.color}>{meta.icon}</span>
          <span className="text-sm font-medium text-gray-800 truncate">{label}</span>
          {f.required && <span className="text-red-400 text-xs shrink-0">*</span>}
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-2">
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${meta.badge}`}>
            {status === "needs_input" ? "needs input" : status === "sensitive" ? "sensitive" : status}
          </span>
          {expanded ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
        </div>
      </div>

      {value && !expanded && (
        <div className="mt-1 text-xs text-gray-500 truncate pl-6">{value}</div>
      )}

      {expanded && (
        <div className="mt-3 space-y-2 pl-1">
          {/* Field metadata */}
          <div className="text-xs text-gray-400 space-y-0.5">
            {f.fieldType && <span className="inline-block mr-2">Type: {f.fieldType}</span>}
            {f.sectionContext && <span className="inline-block mr-2">Section: {f.sectionContext}</span>}
            {confidence > 0 && (
              <span className="inline-block">Confidence: {Math.round(confidence * 100)}%</span>
            )}
          </div>

          {/* Value display / edit */}
          {status !== "document" && (
            <div className="space-y-1">
              <div className="text-xs font-medium text-gray-600">Answer</div>
              {editing ? (
                <div className="space-y-2">
                  <textarea
                    className="w-full border border-brand-400 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    rows={3}
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={saveEdit}
                      className="flex items-center gap-1 bg-brand-600 text-white text-xs px-3 py-1.5 rounded-lg hover:bg-brand-700"
                    >
                      <Check size={12} /> Save
                    </button>
                    <button
                      onClick={() => setEditing(false)}
                      className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2 items-start">
                  {value ? (
                    <div className="flex-1 text-sm text-gray-800 bg-gray-50 rounded-lg px-3 py-2 break-words">
                      {value}
                    </div>
                  ) : (
                    <div className="flex-1 text-sm text-gray-400 bg-gray-50 rounded-lg px-3 py-2 italic">
                      {result.userPrompt || "No value — please enter manually"}
                    </div>
                  )}
                  <button
                    onClick={() => { setEditValue(value); setEditing(true); }}
                    className="shrink-0 p-1.5 text-gray-400 hover:text-brand-600 rounded"
                  >
                    <Pencil size={14} />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Source */}
          {source && source !== "ask_user" && (
            <div className="text-xs text-gray-400">
              Source: <code className="bg-gray-100 px-1 rounded">{source}</code>
            </div>
          )}

          {/* Options for select/radio */}
          {f.options.length > 0 && (
            <div className="space-y-1">
              <div className="text-xs font-medium text-gray-600">Options</div>
              <div className="flex flex-wrap gap-1">
                {f.options.slice(0, 8).map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => onUpdate(result.fieldId, { value: opt.value, status: "auto" })}
                    className={`text-xs px-2 py-1 rounded border transition-colors ${
                      value === opt.value
                        ? "bg-brand-600 text-white border-brand-600"
                        : "border-gray-200 hover:border-brand-400"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
                {f.options.length > 8 && (
                  <span className="text-xs text-gray-400 self-center">+{f.options.length - 8} more</span>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
