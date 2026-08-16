import React, { useEffect, useState } from "react";
import {
  CheckCircle, Sparkles, AlertTriangle, Paperclip,
  LayoutPanelLeft, ScanSearch, RefreshCw,
} from "lucide-react";

interface Summary { total: number; auto: number; ai: number; needsInput: number; documents: number; }
interface DashboardProps { apiOnline: boolean | null; onSetupProfile?: () => void; }

export default function Dashboard({ apiOnline, onSetupProfile }: DashboardProps) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [pageTitle, setPageTitle] = useState("");
  const [scanning, setScanning] = useState(false);
  const [activeTabId, setActiveTabId] = useState<number | null>(null);

  useEffect(() => { loadTabData(); }, []);

  useEffect(() => {
    if (activeTabId == null) return;
    const key = `tab_${activeTabId}`;
    const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === "session" && changes[key]) {
        const s = changes[key].newValue;
        if (s) { setSummary(s.summary); setPageTitle(s.title || ""); }
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
      const s = data[`tab_${tab.id}`];
      if (s) { setSummary(s.summary); setPageTitle(s.title || tab.title || ""); }
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
    } catch (e) { console.error("[FormPilot] sidePanel.open error:", e); }
    window.close();
  }

  const hasFields = summary && summary.total > 0;

  /* ── Stat card definitions ─────────────────────────────────────── */
  const metrics = hasFields ? [
    {
      icon: <CheckCircle size={16} className="text-emerald-500" />,
      label: "Auto-fill",  count: summary.auto,
      /* Gradient bg as inline style to avoid CSS specificity issues */
      bg: "linear-gradient(135deg,#ecfdf5 0%,#d1fae5 100%)",
      border: "rgba(16,185,129,0.2)",
      num: "text-emerald-700",
      iconBg: "rgba(16,185,129,0.12)",
    },
    {
      icon: <Sparkles size={16} className="text-brand-500" />,
      label: "AI answers",  count: summary.ai,
      bg: "linear-gradient(135deg,#eef2ff 0%,#ede9fe 100%)",
      border: "rgba(99,102,241,0.2)",
      num: "text-brand-700",
      iconBg: "rgba(99,102,241,0.1)",
    },
    {
      icon: <AlertTriangle size={16} className="text-amber-500" />,
      label: "Need review",  count: summary.needsInput,
      bg: "linear-gradient(135deg,#fffbeb 0%,#fef3c7 100%)",
      border: "rgba(245,158,11,0.2)",
      num: "text-amber-700",
      iconBg: "rgba(245,158,11,0.1)",
    },
    {
      icon: <Paperclip size={16} className="text-purple-500" />,
      label: "Documents",  count: summary.documents,
      bg: "linear-gradient(135deg,#faf5ff 0%,#ede9fe 100%)",
      border: "rgba(139,92,246,0.2)",
      num: "text-purple-700",
      iconBg: "rgba(139,92,246,0.1)",
    },
  ] : [];

  return (
    <div className="px-4 py-3 space-y-3">

      {/* Page title */}
      {pageTitle && (
        <div className="flex items-center gap-2 animate-fade-up">
          <div
            className="w-2 h-2 rounded-full shrink-0"
            style={{ background: "linear-gradient(135deg,#6366f1,#a855f7)" }}
          />
          <span className="text-[11px] text-gray-400 truncate">{pageTitle}</span>
        </div>
      )}

      {hasFields ? (
        <>
          {/* Hero row — field count + coverage ring */}
          <div className="flex items-center justify-between animate-fade-up">
            <div>
              <div className="text-3xl font-black text-gray-800 leading-none tracking-tight">{summary.total}</div>
              <div className="text-[11px] text-gray-400 mt-0.5 font-medium">fields detected</div>
            </div>
            {/* Coverage ring */}
            <div className="relative w-14 h-14">
              <svg viewBox="0 0 56 56" className="w-full h-full -rotate-90">
                <circle cx="28" cy="28" r="22" fill="none" stroke="#e0e7ff" strokeWidth="5" />
                <circle
                  cx="28" cy="28" r="22" fill="none"
                  stroke="url(#coverGrad)" strokeWidth="5"
                  strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 22}
                  strokeDashoffset={2 * Math.PI * 22 * (1 - (summary.auto + summary.ai) / Math.max(summary.total, 1))}
                  style={{ transition: "stroke-dashoffset 0.9s ease-out" }}
                />
                <defs>
                  <linearGradient id="coverGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#6366f1" />
                    <stop offset="100%" stopColor="#a855f7" />
                  </linearGradient>
                </defs>
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-[11px] font-black text-brand-600">
                  {Math.round((summary.auto + summary.ai) / Math.max(summary.total, 1) * 100)}%
                </span>
                <span className="text-[8px] text-gray-400">filled</span>
              </div>
            </div>
          </div>

          {/* Stat cards — use inline bg to beat CSS specificity */}
          <div className="grid grid-cols-2 gap-2 animate-fade-up" style={{ animationDelay: "50ms" }}>
            {metrics.map((m) => (
              <div
                key={m.label}
                className="metric-card flex items-center gap-3 p-3"
                style={{
                  background: m.bg,
                  border: `1px solid ${m.border}`,
                  boxShadow: "0 2px 12px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.8)",
                }}
              >
                {/* Icon in a tiny liquid blob */}
                <div
                  className="shrink-0 w-8 h-8 flex items-center justify-center"
                  style={{
                    background: m.iconBg,
                    borderRadius: "55% 45% 40% 60% / 55% 40% 60% 45%",
                    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.7)",
                  }}
                >
                  {m.icon}
                </div>
                <div>
                  <div className={`text-xl font-black leading-none ${m.num}`}>{m.count}</div>
                  <div className="text-[10px] text-gray-500 font-medium mt-0.5">{m.label}</div>
                </div>
              </div>
            ))}
          </div>

          {/* CTA button */}
          <button
            onClick={openSidePanel}
            className="btn-water w-full text-white text-sm font-bold py-3 rounded-2xl flex items-center justify-center gap-2 animate-fade-up"
            style={{
              background: "linear-gradient(135deg,#6366f1,#8b5cf6,#a855f7)",
              boxShadow: "0 6px 22px rgba(99,102,241,0.45), inset 0 1px 0 rgba(255,255,255,0.2)",
              animationDelay: "100ms",
            }}
          >
            <LayoutPanelLeft size={16} />
            Review &amp; Fill Form
          </button>

          {/* Re-scan */}
          <button
            onClick={handleScan}
            disabled={scanning}
            className="w-full flex items-center justify-center gap-1.5 text-[11px] text-gray-400 hover:text-brand-600 disabled:opacity-40 transition-colors py-1 animate-fade-up"
            style={{ animationDelay: "140ms" }}
          >
            <RefreshCw size={11} className={scanning ? "animate-spin" : ""} />
            {scanning ? "Re-scanning…" : "Re-scan page"}
          </button>
        </>
      ) : (
        /* ── Empty state — liquid drop CTA ──────────────────────── */
        <div className="flex flex-col items-center gap-5 py-6 animate-drop-in">
          {/* Scan drop button with always-visible idle rings */}
          <div className="relative flex items-center justify-center w-32 h-32">
            {/* Outer ambient rings — always visible, brighter when scanning */}
            <div
              className="absolute w-28 h-28 rounded-full border-2 animate-scan-ring"
              style={{
                borderColor: scanning ? "rgba(99,102,241,0.45)" : "rgba(99,102,241,0.18)",
                animationDuration: scanning ? "1.4s" : "2.4s",
              }}
            />
            <div
              className="absolute w-28 h-28 rounded-full border-2 animate-scan-ring"
              style={{
                borderColor: scanning ? "rgba(139,92,246,0.3)" : "rgba(139,92,246,0.12)",
                animationDuration: scanning ? "1.4s" : "2.4s",
                animationDelay: scanning ? "0.7s" : "1.2s",
              }}
            />
            {/* Third subtle ring */}
            <div
              className="absolute w-28 h-28 rounded-full border animate-scan-ring"
              style={{
                borderColor: "rgba(168,85,247,0.1)",
                animationDuration: "3s",
                animationDelay: "1.8s",
              }}
            />

            {/* The liquid drop button */}
            <button
              onClick={handleScan}
              disabled={scanning}
              className="relative w-[72px] h-[72px] flex items-center justify-center disabled:cursor-wait"
              style={{
                background: "linear-gradient(135deg,#6366f1 0%,#8b5cf6 55%,#a855f7 100%)",
                borderRadius: "60% 40% 30% 70% / 60% 30% 70% 40%",
                animation: `liquid ${scanning ? "2" : "5"}s ease-in-out infinite, glow 2.5s ease-in-out infinite`,
                boxShadow: "0 10px 28px rgba(99,102,241,0.5), inset 0 2px 0 rgba(255,255,255,0.3)",
                transition: "transform 0.15s ease",
              }}
            >
              {/* Water surface highlight */}
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background: "linear-gradient(160deg, rgba(255,255,255,0.35) 0%, transparent 55%)",
                  borderRadius: "inherit",
                }}
              />
              <ScanSearch size={24} className={`text-white relative z-10 ${scanning ? "animate-pulse" : ""}`} />
            </button>
          </div>

          <div className="text-center space-y-1.5">
            <p className="text-sm font-bold text-gray-700">
              {scanning ? "Scanning form fields…" : "Tap to scan this page"}
            </p>
            <p className="text-[11px] text-gray-400 leading-relaxed">
              {scanning
                ? "Detecting all input fields on the page"
                : "FormPilot will find every field and auto-fill with your profile"}
            </p>
          </div>
        </div>
      )}

      {/* Profile setup nudge */}
      {hasFields && summary.auto === 0 && (
        <div
          className="flex items-start gap-2.5 rounded-2xl px-3 py-3 cursor-pointer transition-all animate-fade-up water-card hover:border-brand-200"
          onClick={onSetupProfile}
        >
          <div
            className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center mt-0.5"
            style={{ background: "linear-gradient(135deg,#6366f1,#a855f7)" }}
          >
            <span className="text-white text-[9px] font-black">✦</span>
          </div>
          <div className="text-[11px] text-gray-700 leading-relaxed">
            <strong className="text-gray-900">Set up your Profile</strong> so FormPilot can remember your details and auto-fill every form.
            <span className="ml-1 text-brand-600 font-semibold underline underline-offset-2">Go →</span>
          </div>
        </div>
      )}

      {/* API offline notice */}
      {apiOnline === false && (
        <div className="text-[11px] bg-amber-50 border border-amber-200 text-amber-700 rounded-2xl p-3 leading-relaxed animate-fade-up">
          <strong>Local AI offline.</strong> Run <code className="font-mono bg-amber-100 px-1 rounded">npm start</code> in{" "}
          <code className="font-mono bg-amber-100 px-1 rounded">local-api/</code> for AI answers.
        </div>
      )}
    </div>
  );
}
