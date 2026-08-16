import React, { useEffect, useState } from "react";
import {
  CheckCircle, Sparkles, AlertTriangle, Paperclip,
  LayoutPanelLeft, ScanSearch, RefreshCw,
} from "lucide-react";

interface Summary {
  total: number;
  auto: number;
  ai: number;
  needsInput: number;
  documents: number;
}

interface DashboardProps {
  apiOnline: boolean | null;
  onSetupProfile?: () => void;
}

export default function Dashboard({ apiOnline, onSetupProfile }: DashboardProps) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [pageTitle, setPageTitle] = useState("");
  const [scanning, setScanning] = useState(false);
  const [activeTabId, setActiveTabId] = useState<number | null>(null);

  useEffect(() => {
    loadTabData();
  }, []);

  useEffect(() => {
    if (activeTabId == null) return;
    const key = `tab_${activeTabId}`;
    const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === "session" && changes[key]) {
        const state = changes[key].newValue;
        if (state) { setSummary(state.summary); setPageTitle(state.title || ""); }
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, [activeTabId]);

  async function loadTabData() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    setActiveTabId(tab.id);
    chrome.storage.session.get(`tab_${tab.id}`, (data) => {
      const state = data[`tab_${tab.id}`];
      if (state) { setSummary(state.summary); setPageTitle(state.title || tab.title || ""); }
    });
  }

  async function handleScan() {
    setScanning(true);
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) { setScanning(false); return; }
    chrome.runtime.sendMessage({ type: "SCAN_FORM", payload: { tabId: tab.id } }, () => {
      setTimeout(() => { loadTabData(); setScanning(false); }, 2500);
    });
  }

  async function openSidePanel() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    try {
      await (chrome.sidePanel as any).setOptions({ tabId: tab.id, path: "sidepanel.html", enabled: true });
      await (chrome.sidePanel as any).open({ tabId: tab.id });
    } catch (e) {
      console.error("[FormPilot] sidePanel.open error:", e);
    }
    window.close();
  }

  const hasFields = summary && summary.total > 0;

  const metrics = hasFields ? [
    {
      icon: <CheckCircle size={17} className="text-emerald-500" />,
      label: "Auto-fill",
      count: summary.auto,
      color: "from-emerald-50 to-green-50",
      border: "border-emerald-100",
      text: "text-emerald-700",
    },
    {
      icon: <Sparkles size={17} className="text-brand-500" />,
      label: "AI answers",
      count: summary.ai,
      color: "from-brand-50 to-violet-50",
      border: "border-brand-100",
      text: "text-brand-700",
    },
    {
      icon: <AlertTriangle size={17} className="text-amber-500" />,
      label: "Need review",
      count: summary.needsInput,
      color: "from-amber-50 to-orange-50",
      border: "border-amber-100",
      text: "text-amber-700",
    },
    {
      icon: <Paperclip size={17} className="text-purple-500" />,
      label: "Documents",
      count: summary.documents,
      color: "from-purple-50 to-fuchsia-50",
      border: "border-purple-100",
      text: "text-purple-700",
    },
  ] : [];

  return (
    <div className="px-4 py-3 space-y-3">

      {/* Page title chip */}
      {pageTitle && (
        <div className="flex items-center gap-2 animate-fade-up">
          <div className="w-1.5 h-1.5 rounded-full bg-brand-400 shrink-0" />
          <span className="text-[11px] text-gray-400 truncate">{pageTitle}</span>
        </div>
      )}

      {hasFields ? (
        <>
          {/* Field count hero */}
          <div className="flex items-center justify-between animate-fade-up">
            <div>
              <div className="text-2xl font-black text-gray-800 leading-none">{summary.total}</div>
              <div className="text-[11px] text-gray-400 mt-0.5 font-medium">fields detected</div>
            </div>
            {/* Mini coverage ring */}
            <div className="relative w-14 h-14">
              <svg viewBox="0 0 56 56" className="w-full h-full -rotate-90">
                <circle cx="28" cy="28" r="22" fill="none" stroke="#e0e7ff" strokeWidth="5" />
                <circle
                  cx="28" cy="28" r="22" fill="none"
                  stroke="url(#fillGrad)" strokeWidth="5"
                  strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 22}`}
                  strokeDashoffset={`${2 * Math.PI * 22 * (1 - (summary.auto + summary.ai) / Math.max(summary.total, 1))}`}
                  style={{ transition: "stroke-dashoffset 0.8s ease-out" }}
                />
                <defs>
                  <linearGradient id="fillGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#6366f1" />
                    <stop offset="100%" stopColor="#a855f7" />
                  </linearGradient>
                </defs>
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center rotate-0">
                <span className="text-[11px] font-black text-brand-600">
                  {Math.round(((summary.auto + summary.ai) / Math.max(summary.total, 1)) * 100)}%
                </span>
                <span className="text-[8px] text-gray-400 leading-none">filled</span>
              </div>
            </div>
          </div>

          {/* Metric cards grid */}
          <div className="grid grid-cols-2 gap-2 animate-fade-up" style={{ animationDelay: "60ms" }}>
            {metrics.map((m) => (
              <div
                key={m.label}
                className={`metric-card flex items-center gap-3 p-3 bg-gradient-to-br ${m.color} border ${m.border} rounded-2xl`}
              >
                <div className="shrink-0 w-8 h-8 rounded-xl bg-white flex items-center justify-center shadow-sm">
                  {m.icon}
                </div>
                <div>
                  <div className={`text-xl font-black leading-none ${m.text}`}>{m.count}</div>
                  <div className="text-[10px] text-gray-500 font-medium mt-0.5">{m.label}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Open side panel CTA */}
          <button
            onClick={openSidePanel}
            className="animate-fade-up w-full text-white text-sm font-bold py-3 rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-95 shadow-brand"
            style={{
              background: "linear-gradient(135deg, #6366f1, #8b5cf6, #a855f7)",
              animationDelay: "120ms",
            }}
          >
            <LayoutPanelLeft size={16} />
            Review &amp; Fill Form
          </button>

          {/* Re-scan link */}
          <button
            onClick={handleScan}
            disabled={scanning}
            className="animate-fade-up w-full flex items-center justify-center gap-1.5 text-[11px] text-gray-400 hover:text-brand-600 disabled:opacity-40 transition-colors py-1"
            style={{ animationDelay: "160ms" }}
          >
            <RefreshCw size={11} className={scanning ? "animate-spin" : ""} />
            {scanning ? "Re-scanning…" : "Re-scan page"}
          </button>
        </>
      ) : (
        /* ── Empty / no form state ─────────────────────────────── */
        <div className="flex flex-col items-center gap-4 py-6 animate-drop-in">
          {/* Liquid drop scan button */}
          <div className="relative flex items-center justify-center">
            {scanning && (
              <>
                <div className="absolute w-24 h-24 rounded-full border-2 border-brand-300/50 animate-scan-ring" />
                <div className="absolute w-24 h-24 rounded-full border-2 border-brand-300/30 animate-scan-ring" style={{ animationDelay: "0.9s" }} />
              </>
            )}
            <button
              onClick={handleScan}
              disabled={scanning}
              className="relative w-20 h-20 flex items-center justify-center transition-all duration-300 active:scale-90 disabled:cursor-wait"
              style={{
                background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 55%, #a855f7 100%)",
                borderRadius: "60% 40% 30% 70% / 60% 30% 70% 40%",
                animation: `liquid ${scanning ? "2" : "5"}s ease-in-out infinite, glow 2.5s ease-in-out infinite`,
                boxShadow: "0 8px 24px rgba(99, 102, 241, 0.45)",
              }}
            >
              <ScanSearch size={26} className={`text-white ${scanning ? "animate-pulse" : ""}`} />
            </button>
          </div>

          <div className="text-center space-y-1">
            <p className="text-sm font-semibold text-gray-700">
              {scanning ? "Scanning form fields…" : "Scan this page"}
            </p>
            <p className="text-[11px] text-gray-400">
              {scanning
                ? "Detecting all input fields on this page"
                : "Tap the drop to detect forms on this page"}
            </p>
          </div>
        </div>
      )}

      {/* Profile nudge */}
      {hasFields && summary.auto === 0 && (
        <div
          className="animate-fade-up flex items-start gap-2.5 text-xs bg-gradient-to-r from-brand-50 to-violet-50 border border-brand-100 text-brand-700 rounded-2xl p-3 cursor-pointer hover:from-brand-100 hover:to-violet-100 transition-colors"
          onClick={onSetupProfile}
        >
          <div className="shrink-0 w-5 h-5 rounded-full bg-brand-500 flex items-center justify-center mt-0.5">
            <span className="text-white text-[9px] font-black">✦</span>
          </div>
          <div>
            <strong className="font-semibold">Set up your Profile</strong> so FormPilot can remember your details and auto-fill every form instantly.
            <span className="ml-1 underline font-semibold">Go →</span>
          </div>
        </div>
      )}

      {/* API offline notice */}
      {apiOnline === false && (
        <div className="animate-fade-up text-[11px] bg-amber-50 border border-amber-200 text-amber-700 rounded-2xl p-3 leading-relaxed">
          <strong>Local AI offline.</strong> Run <code className="font-mono bg-amber-100 px-1 rounded">npm start</code> in{" "}
          <code className="font-mono bg-amber-100 px-1 rounded">local-api/</code> for AI-generated answers.
        </div>
      )}
    </div>
  );
}
