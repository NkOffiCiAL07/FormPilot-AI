import React, { useEffect, useRef, useState } from "react";
import {
  Download, Upload, Trash2, Sparkles, ShieldCheck,
  Info, CheckCircle, AlertTriangle, Loader2, Brain,
} from "lucide-react";
import { UserProfile, defaultProfile } from "../shared/types";
import { clearHistory, clearAllData, getSettings, saveSettings, AppSettings, DEFAULT_SETTINGS } from "../shared/storage";

interface Props {
  profile: UserProfile;
  onImportProfile: (p: UserProfile) => void;
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className="relative shrink-0 w-10 h-5.5 rounded-full transition-colors duration-200"
      style={{
        background: checked
          ? "linear-gradient(135deg,#6366f1,#a855f7)"
          : "rgba(156,163,175,0.4)",
        width: 40, height: 22,
        boxShadow: checked ? "0 2px 8px rgba(99,102,241,0.4)" : "none",
      }}
    >
      <span
        className="absolute top-0.5 w-[18px] h-[18px] bg-white rounded-full shadow transition-all duration-200"
        style={{ left: checked ? 20 : 2 }}
      />
    </button>
  );
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="water-card px-4 py-3 space-y-3">
      <div className="flex items-center gap-2 pb-1 border-b border-gray-50">
        <div
          className="w-6 h-6 rounded-lg flex items-center justify-center"
          style={{ background: "linear-gradient(135deg,#6366f1,#a855f7)" }}
        >
          {React.cloneElement(icon as React.ReactElement, { size: 12, className: "text-white" })}
        </div>
        <span className="text-[11px] font-bold text-gray-700 uppercase tracking-wider">{title}</span>
      </div>
      {children}
    </div>
  );
}

export default function Settings({ profile, onImportProfile }: Props) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [clearingHistory, setClearingHistory] = useState(false);
  const [clearingAll, setClearingAll] = useState(false);
  const [clearingMemory, setClearingMemory] = useState(false);
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getSettings().then(setSettings);
  }, []);

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 2800);
  }

  async function updateSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    const next = { ...settings, [key]: value };
    setSettings(next);
    await saveSettings(next);
  }

  /* ── Export ── */
  function handleExport() {
    const json = JSON.stringify(profile, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `formpilot-profile-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    showToast("Profile exported!");
  }

  /* ── Import ── */
  function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string);
        if (typeof parsed !== "object" || !parsed.email) throw new Error("Invalid profile");
        const merged: UserProfile = { ...defaultProfile, ...parsed, updatedAt: new Date().toISOString() };
        onImportProfile(merged);
        showToast("Profile imported!");
      } catch {
        showToast("Invalid profile file.", false);
      } finally {
        if (importRef.current) importRef.current.value = "";
      }
    };
    reader.readAsText(file);
  }

  /* ── Clear history ── */
  async function handleClearHistory() {
    setClearingHistory(true);
    await clearHistory();
    setClearingHistory(false);
    showToast("Application history cleared.");
  }

  /* ── Clear all ── */
  async function handleClearAll() {
    setClearingAll(true);
    await clearAllData();
    setClearingAll(false);
    setConfirmClearAll(false);
    showToast("All data cleared. Please reload the extension.");
  }

  /* ── Clear AI memory ── */
  async function handleClearMemory() {
    setClearingMemory(true);
    chrome.runtime.sendMessage({ type: "CLEAR_AI_MEMORY" }, (res) => {
      setClearingMemory(false);
      if (res?.ok) showToast("AI answer memory cleared.");
      else showToast("Could not clear memory — is local AI running?", false);
    });
  }

  return (
    <div className="px-4 py-4 space-y-3 relative">

      {/* Toast */}
      {toast && (
        <div
          className="fixed bottom-20 left-4 right-4 z-50 flex items-center gap-2 px-4 py-2.5 rounded-2xl text-[12px] font-semibold shadow-lg animate-fade-up"
          style={{
            background: toast.ok
              ? "linear-gradient(135deg,#10b981,#059669)"
              : "linear-gradient(135deg,#ef4444,#dc2626)",
            color: "white",
            boxShadow: toast.ok
              ? "0 6px 20px rgba(16,185,129,0.4)"
              : "0 6px 20px rgba(239,68,68,0.4)",
          }}
        >
          {toast.ok ? <CheckCircle size={14} /> : <AlertTriangle size={14} />}
          {toast.msg}
        </div>
      )}

      {/* ── Display settings ── */}
      <Section title="Auto-fill" icon={<Sparkles />}>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[12px] font-semibold text-gray-700">Highlight detected fields</div>
              <div className="text-[10px] text-gray-400 mt-0.5">Show coloured outlines on scanned form inputs</div>
            </div>
            <Toggle
              checked={settings.highlightFields}
              onChange={(v) => updateSetting("highlightFields", v)}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[12px] font-semibold text-gray-700">Show confidence scores</div>
              <div className="text-[10px] text-gray-400 mt-0.5">Display % match on each field in the side panel</div>
            </div>
            <Toggle
              checked={settings.showConfidence}
              onChange={(v) => updateSetting("showConfidence", v)}
            />
          </div>
        </div>
      </Section>

      {/* ── Profile backup ── */}
      <Section title="Profile Backup" icon={<ShieldCheck />}>
        <p className="text-[11px] text-gray-400 leading-relaxed">
          Export your profile as a JSON file to back it up or transfer it to another device.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={handleExport}
            className="flex items-center justify-center gap-1.5 py-2.5 rounded-2xl text-[12px] font-bold text-white transition-all active:scale-95"
            style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)", boxShadow: "0 4px 14px rgba(99,102,241,0.35)" }}
          >
            <Download size={13} /> Export
          </button>
          <button
            onClick={() => importRef.current?.click()}
            className="flex items-center justify-center gap-1.5 py-2.5 rounded-2xl text-[12px] font-bold border-2 transition-all active:scale-95"
            style={{ borderColor: "rgba(99,102,241,0.3)", color: "#6366f1", background: "rgba(99,102,241,0.06)" }}
          >
            <Upload size={13} /> Import
          </button>
          <input ref={importRef} type="file" accept=".json" className="hidden" onChange={handleImport} />
        </div>
      </Section>

      {/* ── AI memory ── */}
      <Section title="AI Memory" icon={<Brain />}>
        <p className="text-[11px] text-gray-400 leading-relaxed">
          FormPilot remembers your previous form answers to improve future suggestions. Clear this to start fresh.
        </p>
        <button
          onClick={handleClearMemory}
          disabled={clearingMemory}
          className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-2xl text-[12px] font-semibold border transition-all disabled:opacity-50"
          style={{ borderColor: "rgba(99,102,241,0.2)", color: "#6366f1", background: "rgba(99,102,241,0.04)" }}
        >
          {clearingMemory ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
          {clearingMemory ? "Clearing…" : "Clear AI Answer Memory"}
        </button>
      </Section>

      {/* ── Data management ── */}
      <Section title="Privacy & Data" icon={<Trash2 />}>
        <div className="space-y-2">
          <button
            onClick={handleClearHistory}
            disabled={clearingHistory}
            className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-2xl text-[12px] font-semibold border border-amber-200 text-amber-700 bg-amber-50 hover:bg-amber-100 transition-all disabled:opacity-50"
          >
            {clearingHistory ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
            {clearingHistory ? "Clearing…" : "Clear Application History"}
          </button>

          {confirmClearAll ? (
            <div className="bg-red-50 border border-red-200 rounded-2xl px-3 py-2.5 space-y-2">
              <p className="text-[11px] text-red-700 font-semibold">This will delete your profile, documents, history, and all settings.</p>
              <div className="flex gap-2">
                <button
                  onClick={handleClearAll}
                  disabled={clearingAll}
                  className="flex-1 flex items-center justify-center gap-1 py-2 rounded-xl text-[11px] font-bold text-white bg-red-500 hover:bg-red-600 transition-colors disabled:opacity-50"
                >
                  {clearingAll ? <Loader2 size={11} className="animate-spin" /> : null}
                  Yes, delete everything
                </button>
                <button
                  onClick={() => setConfirmClearAll(false)}
                  className="px-3 py-2 rounded-xl text-[11px] text-gray-600 bg-white border border-gray-200 hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setConfirmClearAll(true)}
              className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-2xl text-[12px] font-semibold border border-red-200 text-red-600 bg-red-50 hover:bg-red-100 transition-all"
            >
              <Trash2 size={12} /> Clear All Data
            </button>
          )}
        </div>
      </Section>

      {/* ── About ── */}
      <Section title="About" icon={<Info />}>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-gray-500">Version</span>
            <span className="text-[11px] font-semibold text-gray-700">0.1.0</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-gray-500">AI engine</span>
            <span className="text-[11px] font-semibold text-gray-700">Local (Ollama / OpenAI)</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-gray-500">Data storage</span>
            <span className="text-[11px] font-semibold text-emerald-600">On-device only</span>
          </div>
        </div>
        <p className="text-[10px] text-gray-400 leading-relaxed pt-1 border-t border-gray-50">
          Your profile and form data never leave your device. The AI runs entirely locally.
        </p>
      </Section>
    </div>
  );
}
