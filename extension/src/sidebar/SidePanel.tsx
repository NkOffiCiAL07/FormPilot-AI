import React, { useEffect, useState } from "react";
import {
  BrainCircuit, CheckCircle, Sparkles, AlertTriangle, Paperclip,
  ChevronDown, ChevronUp, Pencil, Check, Loader2, FolderOpen, LocateFixed,
  ScanSearch, FileCheck, Copy, ClipboardCheck, FileText, WifiOff,
} from "lucide-react";
import { FieldResult, FillStatus, UserProfile, defaultProfile } from "../shared/types";
import { StoredDocument, getDocuments, recommendResume, base64ToObjectUrl, saveDocument } from "../shared/storage";
import { LOCAL_API_BASE } from "../shared/constants";

interface TabState {
  results: FieldResult[];
  summary: { total: number; auto: number; ai: number; needsInput: number; documents: number };
  title: string;
  url: string;
  fieldCount?: number;
}

type FilterTab = "all" | "auto" | "ai" | "needs_input" | "document";

const FILTER_LABELS: Record<FilterTab, string> = {
  all: "All",
  auto: "Auto",
  ai: "AI",
  needs_input: "Review",
  document: "Docs",
};

export default function SidePanel() {
  const [state, setState] = useState<TabState | null>(null);
  const [results, setResults] = useState<FieldResult[]>([]);
  const [filter, setFilter] = useState<FilterTab>("all");
  const [filling, setFilling] = useState(false);
  const [filled, setFilled] = useState(false);
  const [activeTabId, setActiveTabId] = useState<number | null>(null);
  const [documents, setDocuments] = useState<StoredDocument[]>([]);
  const [profile, setProfile] = useState<UserProfile>(defaultProfile);
  const [showCoverLetter, setShowCoverLetter] = useState(false);

  useEffect(() => {
    loadState();
    getDocuments().then(setDocuments);
    chrome.storage.local.get("profile", (d) => { if (d.profile) setProfile(d.profile); });

    const sessionListener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== "session") return;
      chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
        if (tab?.id && changes[`tab_${tab.id}`]) loadState();
      });
    };
    const localListener = (_: unknown, area: string) => {
      if (area === "local") getDocuments().then(setDocuments);
    };
    chrome.storage.onChanged.addListener(sessionListener);
    chrome.storage.onChanged.addListener(localListener);
    const interval = setInterval(loadState, 3000);
    return () => {
      chrome.storage.onChanged.removeListener(sessionListener);
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
    chrome.runtime.sendMessage({ type: "SCROLL_TO_FIELD", payload: { fieldId, tabId: tab.id } }).catch(() => {});
  }

  const filtered = results.filter((r) => {
    if (filter === "all") return true;
    if (filter === "needs_input") return r.status === "needs_input" || r.status === "sensitive";
    return r.status === filter;
  });

  const pageContext = state?.title || state?.url || "";

  const summaryChips = state ? [
    { label: `${state.summary.auto} auto`,   color: "bg-emerald-100 text-emerald-700" },
    { label: `${state.summary.ai} AI`,        color: "bg-brand-100 text-brand-700" },
    { label: `${state.summary.needsInput} review`, color: "bg-amber-100 text-amber-700" },
    { label: `${state.summary.documents} docs`, color: "bg-purple-100 text-purple-700" },
  ] : [];

  if (!state) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-6 px-10">
        {/* Large liquid blob with nested drop ripples */}
        <div className="relative flex items-center justify-center w-32 h-32">
          <div
            className="absolute w-28 h-28 rounded-full border-2 border-brand-200/40"
            style={{ animation: "scanRing 3s ease-out infinite" }}
          />
          <div
            className="absolute w-28 h-28 rounded-full border border-brand-200/25"
            style={{ animation: "scanRing 3s ease-out infinite", animationDelay: "1.5s" }}
          />
          <div
            className="w-[72px] h-[72px] flex items-center justify-center"
            style={{
              background: "linear-gradient(135deg, rgba(99,102,241,0.14), rgba(168,85,247,0.08))",
              borderRadius: "60% 40% 30% 70% / 60% 30% 70% 40%",
              animation: "liquid 5s ease-in-out infinite",
              boxShadow: "inset 0 2px 0 rgba(255,255,255,0.6), 0 4px 16px rgba(99,102,241,0.12)",
            }}
          >
            <BrainCircuit size={28} className="text-brand-500" />
          </div>
        </div>
        <div className="text-center">
          <p className="text-[14px] font-bold text-gray-700">No form detected yet</p>
          <p className="text-[11px] text-gray-400 mt-1.5 leading-relaxed">
            Open a page with a form, then click the FormPilot badge to scan.
          </p>
        </div>
      </div>
    );
  }

  const { summary } = state;

  return (
    <div className="flex flex-col h-screen" style={{ background: "#eef2ff" }}>

      {/* ── Drop-shape gradient header ─────────────────────────────── */}
      <div className="sp-header px-4 py-3 flex items-center gap-2.5 relative z-10">
        <div
          className="w-8 h-8 flex items-center justify-center shrink-0"
          style={{
            background: "rgba(255,255,255,0.2)",
            borderRadius: "60% 40% 30% 70% / 60% 30% 70% 40%",
          }}
        >
          <BrainCircuit size={16} className="text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-bold text-white text-[13px] leading-none">FormPilot AI</div>
          <div className="text-white/60 text-[10px] mt-0.5 truncate">{state.title || state.url}</div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-2xl font-black text-white leading-none">{summary.total}</div>
          <div className="text-white/60 text-[9px]">fields</div>
        </div>
      </div>

      {/* ── Summary chips (mt accounts for 24px wave height) ───────── */}
      <div className="flex gap-1.5 px-4 pb-2 overflow-x-auto" style={{ marginTop: 36, scrollbarWidth: "none" }}>
        {summaryChips.map((c) => (
          <span
            key={c.label}
            className={`shrink-0 text-[10px] font-bold px-2.5 py-1 rounded-full ${c.color}`}
            style={{ boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}
          >
            {c.label}
          </span>
        ))}
      </div>

      {/* ── Filter pills ───────────────────────────────────────────── */}
      <div className="flex gap-1.5 px-4 pb-3 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
        {(["all", "auto", "ai", "needs_input", "document"] as FilterTab[]).map((f) => {
          const count = f === "all"
            ? results.length
            : f === "needs_input"
              ? results.filter((r) => r.status === "needs_input" || r.status === "sensitive").length
              : results.filter((r) => r.status === f).length;
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`filter-pill ${filter === f ? "active" : ""}`}
            >
              {FILTER_LABELS[f]}
              {count > 0 && (
                <span className={`ml-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                  filter === f ? "bg-white/25 text-white" : "bg-gray-100 text-gray-500"
                }`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Field cards ───────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-3 pb-2 space-y-2">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-24 text-xs text-gray-400 gap-1.5">
            <ScanSearch size={20} className="text-gray-300" />
            No fields in this category
          </div>
        ) : (
          filtered.map((result, idx) => (
            <div key={result.fieldId} className="animate-slide-up" style={{ animationDelay: `${idx * 30}ms` }}>
              <FieldCard
                result={result}
                documents={documents}
                pageContext={pageContext}
                onUpdate={updateResult}
                onScrollTo={() => scrollToField(result.fieldId)}
              />
            </div>
          ))
        )}
      </div>

      {/* ── Cover Letter Generator ────────────────────────────────── */}
      {showCoverLetter && (
        <CoverLetterPanel
          profile={profile}
          company={state ? extractCompanyFromState(state) : ""}
          role={state ? extractRoleFromState(state) : ""}
          onClose={() => setShowCoverLetter(false)}
          documents={documents}
        />
      )}

      {/* ── Fill button footer ─────────────────────────────────────── */}
      <div className="shrink-0 px-4 py-3 bg-white border-t border-gray-100">
        <div className="flex gap-2">
          <button
            onClick={handleFill}
            disabled={filling}
            className="fill-btn flex-1 py-3.5 flex items-center justify-center gap-2"
          >
            {filling ? (
              <><Loader2 size={16} className="animate-spin" /> Filling…</>
            ) : filled ? (
              <><FileCheck size={16} /> Done!</>
            ) : (
              <>Fill Form <span className="text-white/70 font-normal text-xs">({results.filter(r => r.status === "auto" || r.status === "ai").length})</span></>
            )}
          </button>
          <button
            onClick={() => setShowCoverLetter((v) => !v)}
            className="shrink-0 flex items-center justify-center gap-1 px-3 py-2 rounded-[18px] text-[11px] font-bold transition-all active:scale-95"
            style={{
              background: showCoverLetter
                ? "linear-gradient(135deg,#6366f1,#a855f7)"
                : "rgba(99,102,241,0.08)",
              color: showCoverLetter ? "white" : "#6366f1",
              border: "1.5px solid rgba(99,102,241,0.2)",
              boxShadow: showCoverLetter ? "0 4px 14px rgba(99,102,241,0.35)" : "none",
            }}
            title="Generate cover letter with AI"
          >
            <Sparkles size={14} />
            Cover Letter
          </button>
        </div>
        <p className="text-center text-[10px] text-gray-400 mt-1.5">
          FormPilot will never auto-submit your form
        </p>
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
  const [copied, setCopied] = useState(false);

  function copyValue() {
    if (!value) return;
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }).catch(() => {});
  }

  const { normalizedField: f, status, confidence, value, source } = result;
  const label = f.label || f.name || f.ariaLabel || f.placeholder || "Unnamed field";

  const statusMeta: Record<FillStatus, {
    icon: React.ReactNode; dotColor: string; badge: string; badgeText: string;
  }> = {
    auto:        { icon: <CheckCircle size={13} />, dotColor: "bg-emerald-400", badge: "bg-emerald-50 text-emerald-700 border-emerald-100", badgeText: "auto" },
    ai:          { icon: <Sparkles size={13} />,    dotColor: "bg-brand-400",   badge: "bg-brand-50 text-brand-700 border-brand-100",   badgeText: "AI"   },
    needs_input: { icon: <AlertTriangle size={13} />, dotColor: "bg-amber-400", badge: "bg-amber-50 text-amber-700 border-amber-100",   badgeText: "review" },
    sensitive:   { icon: <AlertTriangle size={13} />, dotColor: "bg-red-400",   badge: "bg-red-50 text-red-700 border-red-100",         badgeText: "sensitive" },
    document:    { icon: <Paperclip size={13} />,   dotColor: "bg-purple-400", badge: "bg-purple-50 text-purple-700 border-purple-100", badgeText: "doc" },
    skipped:     { icon: null,                       dotColor: "bg-gray-300",   badge: "bg-gray-50 text-gray-500 border-gray-100",      badgeText: "skip" },
  };

  const meta = statusMeta[status];

  function saveEdit() {
    onUpdate(result.fieldId, { value: editValue, status: "auto" });
    setEditing(false);
  }

  if (status === "document") {
    const recommended = recommendResume(documents, pageContext);
    return <DocumentFieldCard label={label} fieldId={f.id} recommended={recommended} documents={documents} />;
  }

  return (
    <div className="field-card overflow-hidden" data-status={status}>
      {/* Card header */}
      <div
        className="flex items-start gap-2.5 px-3.5 py-3 cursor-pointer"
        onClick={() => setExpanded((e) => !e)}
      >
        {/* Status dot */}
        <div className={`mt-1 w-2 h-2 rounded-full shrink-0 ${meta.dotColor}`} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[13px] font-semibold text-gray-800 truncate">{label}</span>
            {f.required && <span className="text-red-400 text-[11px] shrink-0 font-bold">*</span>}
          </div>
          {value && !expanded && (
            <div className="text-[11px] text-gray-400 truncate mt-0.5">{value}</div>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${meta.badge}`}>
            {meta.badgeText}
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); onScrollTo(); }}
            className="p-1 text-gray-300 hover:text-brand-500 transition-colors rounded-lg hover:bg-brand-50"
            title="Locate on page"
          >
            <LocateFixed size={12} />
          </button>
          <span className="text-gray-300">
            {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </span>
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-gray-50 px-3.5 py-3 space-y-3 bg-gray-50/50">
          {/* Meta chips */}
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {f.fieldType && (
              <span className="text-[10px] text-gray-400 bg-white px-2 py-0.5 rounded-full border border-gray-100">
                {f.fieldType}
              </span>
            )}
            {f.sectionContext && (
              <span className="text-[10px] text-gray-400 bg-white px-2 py-0.5 rounded-full border border-gray-100">
                {f.sectionContext}
              </span>
            )}
            {confidence > 0 && (
              <span className="text-[10px] text-brand-500 bg-brand-50 px-2 py-0.5 rounded-full border border-brand-100">
                {Math.round(confidence * 100)}% confidence
              </span>
            )}
          </div>

          {/* Answer editor */}
          <div>
            <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Answer</div>
            {editing ? (
              <div className="space-y-2">
                {f.fieldType === "textarea" ? (
                  <textarea
                    className="w-full border border-brand-300 rounded-xl px-3 py-2 text-[13px] bg-white focus:outline-none focus:ring-2 focus:ring-brand-400/40 resize-none"
                    rows={4}
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    autoFocus
                  />
                ) : (
                  <input
                    className="w-full border border-brand-300 rounded-xl px-3 py-2 text-[13px] bg-white focus:outline-none focus:ring-2 focus:ring-brand-400/40"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    autoFocus
                  />
                )}
                <div className="flex gap-2">
                  <button
                    onClick={saveEdit}
                    className="flex items-center gap-1.5 text-white text-xs font-semibold px-3 py-1.5 rounded-xl"
                    style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}
                  >
                    <Check size={11} /> Save
                  </button>
                  <button
                    onClick={() => setEditing(false)}
                    className="text-xs text-gray-500 px-3 py-1.5 rounded-xl border border-gray-200 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex gap-1.5 items-start">
                {value ? (
                  <div className="flex-1 text-[13px] text-gray-800 bg-white rounded-xl px-3 py-2 break-words whitespace-pre-wrap border border-gray-100 shadow-sm">
                    {value}
                  </div>
                ) : (
                  <div className="flex-1 text-[12px] text-gray-400 bg-white rounded-xl px-3 py-2 italic border border-gray-100">
                    {result.userPrompt || "No value — please fill manually"}
                  </div>
                )}
                <div className="flex flex-col gap-1 shrink-0">
                  {value && (
                    <button
                      onClick={copyValue}
                      className={`p-2 rounded-xl transition-colors ${
                        copied
                          ? "text-emerald-500 bg-emerald-50"
                          : "text-gray-300 hover:text-brand-500 hover:bg-brand-50"
                      }`}
                      title="Copy to clipboard"
                    >
                      {copied ? <ClipboardCheck size={13} /> : <Copy size={13} />}
                    </button>
                  )}
                  <button
                    onClick={() => { setEditValue(value); setEditing(true); }}
                    className="p-2 text-gray-300 hover:text-brand-500 rounded-xl hover:bg-brand-50 transition-colors"
                    title="Edit value"
                  >
                    <Pencil size={13} />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Source */}
          {source && source !== "ask_user" && source !== "no_match" && (
            <div className="text-[10px] text-gray-400">
              Source: <code className="bg-white border border-gray-100 px-1.5 py-0.5 rounded-lg">{source}</code>
            </div>
          )}

          {/* Options picker */}
          {f.options.length > 0 && (
            <div>
              <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Options</div>
              <div className="flex flex-wrap gap-1">
                {f.options.slice(0, 10).map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => onUpdate(result.fieldId, { value: opt.value, status: "auto" })}
                    className={`text-[11px] px-2.5 py-1 rounded-lg border font-medium transition-all ${
                      value === opt.value
                        ? "text-white border-transparent"
                        : "border-gray-200 text-gray-600 hover:border-brand-300 hover:text-brand-600"
                    }`}
                    style={value === opt.value ? { background: "linear-gradient(135deg, #6366f1, #8b5cf6)" } : {}}
                  >
                    {opt.label}
                  </button>
                ))}
                {f.options.length > 10 && (
                  <span className="text-[11px] text-gray-400 self-center px-1">+{f.options.length - 10} more</span>
                )}
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
    chrome.runtime.sendMessage({ type: "CLICK_FILE_INPUT", payload: { fieldId, tabId: tab.id } }).catch(() => {});
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
    <div className="field-card overflow-hidden" data-status="document">
      <div
        className="flex items-center gap-2.5 px-3.5 py-3 cursor-pointer"
        onClick={() => setExpanded((e) => !e)}
      >
        <div className="w-2 h-2 rounded-full bg-purple-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <span className="text-[13px] font-semibold text-gray-800 truncate">{label}</span>
        </div>
        <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-purple-50 text-purple-700 border border-purple-100">
          document
        </span>
        <span className="text-gray-300">
          {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </span>
      </div>

      {expanded && (
        <div className="border-t border-gray-50 px-3.5 py-3 space-y-3 bg-gray-50/50">
          {resumes.length === 0 ? (
            <div className="text-[12px] text-amber-700 bg-amber-50 border border-amber-100 rounded-xl p-3 leading-relaxed">
              No resumes stored. Open the <strong>FormPilot popup → Docs tab</strong> to upload your resume.
            </div>
          ) : (
            <>
              <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Select resume</div>
              <div className="space-y-1.5">
                {resumes.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => setSelectedId(r.id)}
                    className={`w-full flex items-center gap-2.5 text-left px-3 py-2.5 rounded-xl border text-[12px] transition-all ${
                      selectedId === r.id
                        ? "border-brand-300 bg-brand-50 text-brand-800"
                        : "border-gray-100 bg-white hover:border-brand-200 text-gray-700"
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold truncate">{r.name}</div>
                      <div className="text-[10px] text-gray-400">{(r.size / 1024).toFixed(0)} KB · {r.filename}</div>
                    </div>
                    {selectedId === r.id && <Check size={13} className="text-brand-600 shrink-0" />}
                  </button>
                ))}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleSelectFile}
                  className="flex-1 flex items-center justify-center gap-1.5 text-white text-[12px] font-semibold py-2.5 rounded-xl"
                  style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}
                >
                  <FolderOpen size={13} />
                  Browse &amp; Upload
                </button>
                {selected && (
                  <button
                    onClick={handleDownload}
                    className="flex items-center gap-1 text-[12px] border border-gray-200 bg-white hover:border-gray-300 px-3 py-2 rounded-xl text-gray-600 transition-colors"
                  >
                    ↓ Save
                  </button>
                )}
              </div>

              {selected && (
                <p className="text-[11px] text-gray-400 leading-relaxed">
                  Click <strong>Browse &amp; Upload</strong> to open the file picker, then select <strong>{selected.filename}</strong>.
                  Use <strong>Save</strong> to download it first if needed.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractCompanyFromState(state: { title: string; url: string }): string {
  try {
    const hostname = new URL(state.url).hostname.replace(/^www\./, "");
    let m = state.url.match(/greenhouse\.io\/([^/?#]+)/);
    if (m) return m[1];
    m = state.url.match(/lever\.co\/([^/?#]+)/);
    if (m) return m[1];
    const atMatch = state.title.match(/\s[Aa][Tt]\s(.+?)(?:\s[-|]|$)/);
    if (atMatch) return atMatch[1].trim();
    const pipeMatch = state.title.split(/\s\|\s/);
    if (pipeMatch.length > 1) return pipeMatch[pipeMatch.length - 1].trim();
    return hostname.split(".")[0];
  } catch { return ""; }
}

function extractRoleFromState(state: { title: string }): string {
  return state.title
    .replace(/\s\|\s.*$/, "")
    .replace(/\s[-–]\s.*$/, "")
    .replace(/\s[Aa][Tt]\s.*$/, "")
    .trim() || state.title;
}

// ─── Cover Letter Panel ───────────────────────────────────────────────────────

function CoverLetterPanel({
  profile, company, role, onClose, documents,
}: {
  profile: UserProfile;
  company: string;
  role: string;
  onClose: () => void;
  documents: StoredDocument[];
}) {
  const [letter, setLetter] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);

  async function generate() {
    setGenerating(true);
    setError("");
    setLetter("");
    try {
      const res = await fetch(`${LOCAL_API_BASE}/api/cover-letter`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile, company, role, jobContext: `${role} at ${company}` }),
        signal: AbortSignal.timeout(60000),
      });
      if (!res.ok) throw new Error("API error");
      const data = await res.json();
      if (data.error && !data.letter) { setError("AI is offline. Start the local API server to generate cover letters."); return; }
      setLetter(data.letter || "");
    } catch (e: unknown) {
      setError("Could not reach the local AI. Run `npm start` in `local-api/` first.");
    } finally {
      setGenerating(false);
    }
  }

  function copyLetter() {
    navigator.clipboard.writeText(letter).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  async function saveToDocs() {
    const blob = new Blob([letter], { type: "text/plain" });
    const encoded = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(",")[1]);
      reader.readAsDataURL(blob);
    });
    await saveDocument({
      id: crypto.randomUUID(),
      name: `Cover Letter — ${role || "Role"} at ${company || "Company"}`,
      category: "cover_letter",
      filename: `cover-letter-${company}-${new Date().toISOString().slice(0, 10)}.txt`,
      size: blob.size,
      mimeType: "text/plain",
      uploadedAt: new Date().toISOString(),
      tags: [company, role].filter(Boolean),
      data: encoded,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="shrink-0 border-t border-gray-100 bg-white">
      {/* Panel header */}
      <div
        className="flex items-center justify-between px-4 py-2.5"
        style={{ background: "linear-gradient(135deg,rgba(99,102,241,0.08),rgba(168,85,247,0.05))" }}
      >
        <div className="flex items-center gap-2">
          <div
            className="w-6 h-6 rounded-lg flex items-center justify-center"
            style={{ background: "linear-gradient(135deg,#6366f1,#a855f7)" }}
          >
            <FileText size={12} className="text-white" />
          </div>
          <span className="text-[12px] font-bold text-gray-800">AI Cover Letter</span>
          {(company || role) && (
            <span className="text-[10px] text-gray-400 truncate max-w-[100px]">
              {role && company ? `${role} @ ${company}` : role || company}
            </span>
          )}
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 text-xs">✕</button>
      </div>

      <div className="px-4 pb-3 pt-2 space-y-2.5 max-h-72 overflow-y-auto">
        {!letter && !generating && (
          <div className="text-center py-2">
            <p className="text-[11px] text-gray-500 mb-3 leading-relaxed">
              Generate a tailored cover letter using your profile and this job's context.
            </p>
            <button
              onClick={generate}
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-2xl text-[13px] font-bold text-white transition-all active:scale-95"
              style={{
                background: "linear-gradient(135deg,#6366f1,#8b5cf6,#a855f7)",
                boxShadow: "0 6px 20px rgba(99,102,241,0.4)",
              }}
            >
              <Sparkles size={14} /> Generate with AI
            </button>
          </div>
        )}

        {generating && (
          <div className="flex flex-col items-center gap-2 py-4">
            <div
              className="w-10 h-10 flex items-center justify-center"
              style={{
                background: "linear-gradient(135deg,rgba(99,102,241,0.15),rgba(168,85,247,0.08))",
                borderRadius: "60% 40% 30% 70% / 60% 30% 70% 40%",
                animation: "liquid 3s ease-in-out infinite",
              }}
            >
              <Loader2 size={18} className="text-brand-500 animate-spin" />
            </div>
            <p className="text-[11px] text-gray-500">Writing your cover letter…</p>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
            <WifiOff size={13} className="text-amber-600 shrink-0 mt-0.5" />
            <p className="text-[11px] text-amber-700 leading-relaxed">{error}</p>
          </div>
        )}

        {letter && (
          <>
            <div
              className="text-[12px] text-gray-700 bg-gray-50 rounded-xl px-3 py-3 leading-relaxed whitespace-pre-wrap border border-gray-100"
              style={{ maxHeight: 160, overflowY: "auto" }}
            >
              {letter}
            </div>
            <div className="flex gap-2">
              <button
                onClick={copyLetter}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-[11px] font-bold text-white transition-all active:scale-95"
                style={{
                  background: copied
                    ? "linear-gradient(135deg,#10b981,#059669)"
                    : "linear-gradient(135deg,#6366f1,#8b5cf6)",
                  boxShadow: "0 3px 12px rgba(99,102,241,0.3)",
                }}
              >
                {copied ? <><ClipboardCheck size={12} /> Copied!</> : <><Copy size={12} /> Copy</>}
              </button>
              <button
                onClick={saveToDocs}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-[11px] font-bold transition-all active:scale-95"
                style={{
                  background: saved ? "rgba(16,185,129,0.1)" : "rgba(99,102,241,0.08)",
                  color: saved ? "#059669" : "#6366f1",
                  border: `1.5px solid ${saved ? "rgba(16,185,129,0.3)" : "rgba(99,102,241,0.2)"}`,
                }}
              >
                <FileText size={12} />
                {saved ? "Saved!" : "Save to Docs"}
              </button>
              <button
                onClick={generate}
                className="px-3 py-2 rounded-xl text-[11px] font-semibold text-gray-500 border border-gray-200 hover:bg-gray-50 transition-colors"
                title="Regenerate"
              >
                ↻
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
