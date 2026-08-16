import React, { useEffect, useState } from "react";
import { CheckCircle, Sparkles, AlertTriangle, Paperclip, LayoutPanelLeft } from "lucide-react";

interface Summary {
  total: number;
  auto: number;
  ai: number;
  needsInput: number;
  documents: number;
}

interface DashboardProps {
  apiOnline: boolean | null;
}

export default function Dashboard({ apiOnline }: DashboardProps) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [pageTitle, setPageTitle] = useState("");
  const [scanning, setScanning] = useState(false);
  const [activeTabId, setActiveTabId] = useState<number | null>(null);

  useEffect(() => {
    loadTabData();
  }, []);

  // Listen for storage changes so popup updates automatically when scan finishes
  useEffect(() => {
    if (activeTabId == null) return;
    const key = `tab_${activeTabId}`;
    const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === "session" && changes[key]) {
        const state = changes[key].newValue;
        if (state) {
          setSummary(state.summary);
          setPageTitle(state.title || "");
        }
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
      if (state) {
        setSummary(state.summary);
        setPageTitle(state.title || tab.title || "");
      }
    });
  }

  async function handleScan() {
    setScanning(true);
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) { setScanning(false); return; }

    // Tell background to forward scan command to the active tab's content scripts
    chrome.runtime.sendMessage({ type: "SCAN_FORM", payload: { tabId: tab.id } }, () => {
      // Storage listener will pick up the result; also poll as fallback
      setTimeout(() => {
        loadTabData();
        setScanning(false);
      }, 2500);
    });
  }

  async function openSidePanel() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    // Pass tabId explicitly — background sender.tab.id is undefined for popup messages
    chrome.runtime.sendMessage({ type: "OPEN_SIDEPANEL", payload: { tabId: tab.id } }, () => {
      window.close();
    });
  }

  const hasFields = summary && summary.total > 0;

  return (
    <div className="p-4 space-y-4">
      {/* Page info */}
      {pageTitle && (
        <div className="text-xs text-gray-500 truncate border-b pb-2">
          {pageTitle}
        </div>
      )}

      {hasFields ? (
        <>
          <div className="text-sm font-semibold text-gray-700">
            {summary.total} fields detected
          </div>
          <div className="grid grid-cols-2 gap-2">
            <SummaryCard
              icon={<CheckCircle size={16} className="text-green-500" />}
              label="Auto-fill"
              count={summary.auto}
              color="green"
            />
            <SummaryCard
              icon={<Sparkles size={16} className="text-brand-500" />}
              label="AI answers"
              count={summary.ai}
              color="blue"
            />
            <SummaryCard
              icon={<AlertTriangle size={16} className="text-amber-500" />}
              label="Need input"
              count={summary.needsInput}
              color="amber"
            />
            <SummaryCard
              icon={<Paperclip size={16} className="text-purple-500" />}
              label="Documents"
              count={summary.documents}
              color="purple"
            />
          </div>

          <button
            onClick={openSidePanel}
            className="w-full bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium py-2.5 rounded-lg flex items-center justify-center gap-2 transition-colors"
          >
            <LayoutPanelLeft size={16} />
            Review &amp; Fill Form
          </button>

          <button
            onClick={handleScan}
            disabled={scanning}
            className="w-full text-xs text-gray-500 hover:text-brand-600 disabled:opacity-50 transition-colors py-1"
          >
            {scanning ? "Re-scanning…" : "Re-scan page"}
          </button>
        </>
      ) : (
        <div className="flex flex-col items-center gap-3 py-6">
          <p className="text-sm text-gray-500 text-center">
            {scanning ? "Scanning for form fields…" : "No form detected on this page yet."}
          </p>
          <button
            onClick={handleScan}
            disabled={scanning}
            className="bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors"
          >
            {scanning ? "Scanning…" : "Scan Page for Forms"}
          </button>
        </div>
      )}

      {/* Profile setup nudge */}
      {hasFields && summary.auto === 0 && summary.needsInput === summary.total && (
        <div className="text-xs bg-blue-50 border border-blue-200 text-blue-700 rounded-lg p-2">
          Set up your <strong>Profile</strong> tab so FormPilot can auto-fill your details.
        </div>
      )}

      {/* API status notice */}
      {apiOnline === false && (
        <div className="text-xs bg-amber-50 border border-amber-200 text-amber-700 rounded-lg p-2">
          Local AI server offline. Start it with <code className="font-mono">npm start</code> in{" "}
          <code>local-api/</code> for AI-generated answers.
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  count,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  color: "green" | "blue" | "amber" | "purple";
}) {
  const bg = {
    green: "bg-green-50 border-green-200",
    blue: "bg-blue-50 border-blue-200",
    amber: "bg-amber-50 border-amber-200",
    purple: "bg-purple-50 border-purple-200",
  }[color];

  return (
    <div className={`flex items-center gap-2 rounded-lg border p-3 ${bg}`}>
      {icon}
      <div>
        <div className="text-lg font-bold leading-none">{count}</div>
        <div className="text-xs text-gray-500">{label}</div>
      </div>
    </div>
  );
}
