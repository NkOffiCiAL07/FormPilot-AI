import React, { useEffect, useRef, useState } from "react";
import {
  Clock, ExternalLink, Trash2, CheckCircle2, MessageCircle,
  PartyPopper, XCircle, ChevronDown, StickyNote, Inbox,
} from "lucide-react";
import {
  ApplicationRecord,
  getHistory,
  updateApplicationRecord,
  deleteApplicationRecord,
  clearHistory,
} from "../shared/storage";

type Status = ApplicationRecord["status"];

const STATUS_META: Record<Status, {
  label: string;
  icon: React.ReactNode;
  pill: string;
  dot: string;
}> = {
  applied:     { label: "Applied",     icon: <CheckCircle2 size={11} />,   pill: "bg-brand-50 text-brand-700 border-brand-200",    dot: "bg-brand-400" },
  interviewing:{ label: "Interviewing",icon: <MessageCircle size={11} />,  pill: "bg-amber-50 text-amber-700 border-amber-200",    dot: "bg-amber-400" },
  offer:       { label: "Offer! 🎉",   icon: <PartyPopper size={11} />,   pill: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-400" },
  rejected:    { label: "Rejected",    icon: <XCircle size={11} />,        pill: "bg-red-50 text-red-500 border-red-200",          dot: "bg-red-400" },
};

const ALL_STATUSES: Status[] = ["applied", "interviewing", "offer", "rejected"];

function relativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function HistoryPanel() {
  const [history, setHistory] = useState<ApplicationRecord[]>([]);
  const [filterStatus, setFilterStatus] = useState<Status | "all">("all");
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    load();
    const listener = (_: unknown, area: string) => {
      if (area === "local") load();
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  async function load() {
    setHistory(await getHistory());
  }

  async function handleStatusChange(id: string, status: Status) {
    await updateApplicationRecord(id, { status });
    setHistory((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
  }

  async function handleNotesChange(id: string, notes: string) {
    await updateApplicationRecord(id, { notes });
    setHistory((prev) => prev.map((r) => (r.id === id ? { ...r, notes } : r)));
  }

  async function handleDelete(id: string) {
    await deleteApplicationRecord(id);
    setHistory((prev) => prev.filter((r) => r.id !== id));
  }

  async function handleClearAll() {
    await clearHistory();
    setHistory([]);
    setConfirmClear(false);
  }

  const filtered = filterStatus === "all"
    ? history
    : history.filter((r) => r.status === filterStatus);

  const counts = {
    all:          history.length,
    applied:      history.filter((r) => r.status === "applied").length,
    interviewing: history.filter((r) => r.status === "interviewing").length,
    offer:        history.filter((r) => r.status === "offer").length,
    rejected:     history.filter((r) => r.status === "rejected").length,
  };

  if (history.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-52 gap-4 px-6 animate-fade-up">
        <div
          className="w-16 h-16 flex items-center justify-center"
          style={{
            background: "linear-gradient(135deg, rgba(99,102,241,0.1), rgba(168,85,247,0.06))",
            borderRadius: "60% 40% 30% 70% / 60% 30% 70% 40%",
            animation: "liquid 5s ease-in-out infinite",
          }}
        >
          <Inbox size={24} className="text-brand-400" />
        </div>
        <div className="text-center">
          <div className="text-sm font-semibold text-gray-700">No applications yet</div>
          <div className="text-[11px] text-gray-400 mt-1 leading-relaxed">
            FormPilot automatically logs here every time you fill and submit a form.
          </div>
        </div>
        <style>{`
          @keyframes liquid{0%,100%{border-radius:60% 40% 30% 70%/60% 30% 70% 40%}50%{border-radius:30% 60% 70% 40%/50% 60% 30% 60%}}
        `}</style>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Stats strip */}
      <div className="flex gap-2 px-4 pt-3 pb-2 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
        {(["all", ...ALL_STATUSES] as const).map((s) => {
          const count = counts[s];
          if (s !== "all" && count === 0) return null;
          const meta = s === "all" ? null : STATUS_META[s];
          const isActive = filterStatus === s;
          return (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`shrink-0 flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold border transition-all ${
                isActive
                  ? "text-white border-transparent shadow-brand"
                  : s === "all"
                    ? "bg-gray-50 text-gray-600 border-gray-200 hover:border-brand-300 hover:text-brand-600"
                    : `${meta!.pill} hover:opacity-80`
              }`}
              style={isActive ? { background: "linear-gradient(135deg,#6366f1,#8b5cf6)" } : {}}
            >
              {s !== "all" && <span className={`w-1.5 h-1.5 rounded-full ${isActive ? "bg-white" : meta!.dot}`} />}
              {s === "all" ? `All (${count})` : `${STATUS_META[s].label} (${count})`}
            </button>
          );
        })}
      </div>

      {/* Card list */}
      <div className="flex-1 overflow-y-auto px-3 pb-2 space-y-2">
        {filtered.length === 0 ? (
          <div className="flex items-center justify-center h-20 text-xs text-gray-400">
            No applications with this status
          </div>
        ) : (
          filtered.map((rec, idx) => (
            <ApplicationCard
              key={rec.id}
              record={rec}
              delay={idx * 40}
              onStatusChange={(s) => handleStatusChange(rec.id, s)}
              onNotesChange={(n) => handleNotesChange(rec.id, n)}
              onDelete={() => handleDelete(rec.id)}
            />
          ))
        )}
      </div>

      {/* Footer */}
      <div className="shrink-0 px-4 py-2.5 border-t border-gray-100">
        {confirmClear ? (
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-gray-600">Clear all {history.length} records?</span>
            <div className="flex gap-2">
              <button
                onClick={handleClearAll}
                className="text-[11px] font-semibold text-red-600 px-2.5 py-1 rounded-lg hover:bg-red-50"
              >
                Yes, clear
              </button>
              <button
                onClick={() => setConfirmClear(false)}
                className="text-[11px] text-gray-500 px-2.5 py-1 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setConfirmClear(true)}
            className="text-[11px] text-gray-400 hover:text-red-500 transition-colors"
          >
            Clear history
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Application Card ─────────────────────────────────────────────────────────

function ApplicationCard({
  record, delay, onStatusChange, onNotesChange, onDelete,
}: {
  record: ApplicationRecord;
  delay: number;
  onStatusChange: (s: Status) => void;
  onNotesChange: (n: string) => void;
  onDelete: () => void;
}) {
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [notes, setNotes] = useState(record.notes ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const meta = STATUS_META[record.status];

  // Close status menu on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowStatusMenu(false);
      }
    }
    if (showStatusMenu) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showStatusMenu]);

  const faviconUrl = record.domain
    ? `https://www.google.com/s2/favicons?domain=${record.domain}&sz=32`
    : null;

  return (
    <div
      className="bg-white rounded-2xl border border-gray-100 shadow-card overflow-hidden animate-fade-up"
      style={{ animationDelay: `${delay}ms`, boxShadow: "0 1px 6px rgba(0,0,0,0.05)" }}
    >
      <div className="px-3.5 py-3">
        {/* Top row */}
        <div className="flex items-start gap-2.5">
          {/* Favicon */}
          <div className="shrink-0 w-8 h-8 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center overflow-hidden mt-0.5">
            {faviconUrl ? (
              <img
                src={faviconUrl}
                alt=""
                className="w-5 h-5 object-contain"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            ) : (
              <Clock size={14} className="text-gray-400" />
            )}
          </div>

          {/* Company + role */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[13px] font-bold text-gray-800 truncate">{record.company}</span>
            </div>
            <div className="text-[11px] text-gray-500 truncate mt-0.5">{record.role}</div>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <span className="text-[10px] text-gray-400">{relativeDate(record.date)}</span>
              <span className="text-gray-200">·</span>
              <span className="text-[10px] text-gray-400">{record.fieldsCount} fields filled</span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 shrink-0">
            <a
              href={record.url}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 text-gray-300 hover:text-brand-500 transition-colors rounded-lg hover:bg-brand-50"
              title="Open application"
            >
              <ExternalLink size={12} />
            </a>
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
                  className="text-[10px] text-gray-500 px-1.5 py-1 rounded-lg hover:bg-gray-50"
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
                <Trash2 size={12} />
              </button>
            )}
          </div>
        </div>

        {/* Status + notes row */}
        <div className="flex items-center gap-2 mt-2.5">
          {/* Status badge / dropdown */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setShowStatusMenu((v) => !v)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold border transition-all ${meta.pill}`}
            >
              {meta.icon}
              {meta.label}
              <ChevronDown size={9} />
            </button>

            {showStatusMenu && (
              <div className="absolute top-full left-0 mt-1 z-50 bg-white rounded-xl border border-gray-100 shadow-lg overflow-hidden min-w-[140px]">
                {ALL_STATUSES.map((s) => {
                  const sm = STATUS_META[s];
                  return (
                    <button
                      key={s}
                      onClick={() => { onStatusChange(s); setShowStatusMenu(false); }}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-[11px] font-medium hover:bg-gray-50 transition-colors ${
                        record.status === s ? "text-brand-600 bg-brand-50" : "text-gray-700"
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full ${sm.dot}`} />
                      {sm.label}
                      {record.status === s && <span className="ml-auto text-brand-500">✓</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Notes toggle */}
          <button
            onClick={() => setShowNotes((v) => !v)}
            className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded-full border transition-colors ${
              showNotes || record.notes
                ? "bg-amber-50 text-amber-700 border-amber-200"
                : "text-gray-400 border-gray-200 hover:border-gray-300 hover:text-gray-600"
            }`}
          >
            <StickyNote size={10} />
            {record.notes ? "Notes" : "Add note"}
          </button>
        </div>

        {/* Notes textarea */}
        {showNotes && (
          <textarea
            className="mt-2 w-full text-[12px] text-gray-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-amber-300/40"
            rows={2}
            placeholder="Interview notes, links, contacts…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => onNotesChange(notes)}
          />
        )}
      </div>
    </div>
  );
}
