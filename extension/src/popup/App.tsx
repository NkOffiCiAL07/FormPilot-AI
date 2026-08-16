import React, { useEffect, useState } from "react";
import { UserProfile, defaultProfile } from "../shared/types";
import ProfileEditor from "./ProfileEditor";
import Dashboard from "./Dashboard";
import DocumentsManager from "./DocumentsManager";
import HistoryPanel from "./HistoryPanel";
import {
  BrainCircuit, LayoutDashboard, User, FileText, Clock,
  Wifi, WifiOff, Loader2,
} from "lucide-react";

type Tab = "dashboard" | "profile" | "documents" | "history";

function profileCompleteness(p: UserProfile): number {
  const coreFields = [
    p.firstName, p.lastName, p.email, p.phone,
    p.address.city, p.address.country,
    p.currentCompany, p.currentTitle, p.totalExperience,
  ];
  const filled = coreFields.filter(Boolean).length;
  return Math.round((filled / coreFields.length) * 100);
}

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [profile, setProfile] = useState<UserProfile>(defaultProfile);
  const [apiOnline, setApiOnline] = useState<boolean | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [tabChanging, setTabChanging] = useState(false);

  useEffect(() => {
    chrome.runtime.sendMessage({ type: "GET_PROFILE" }, (res) => {
      if (res?.profile) setProfile(res.profile);
      setProfileLoaded(true);
    });
    chrome.runtime.sendMessage({ type: "API_STATUS" }, (res) => {
      setApiOnline(res?.online ?? false);
    });
    const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === "local" && changes["profile"]) {
        setProfile(changes["profile"].newValue ?? defaultProfile);
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  function saveProfile(updated: UserProfile) {
    const p = { ...updated, updatedAt: new Date().toISOString() };
    setProfile(p);
    chrome.storage.local.set({ profile: p });
    chrome.runtime.sendMessage({ type: "SAVE_PROFILE", payload: p }).catch(() => {});
  }

  function switchTab(tab: Tab) {
    if (tab === activeTab) return;
    setTabChanging(true);
    setTimeout(() => { setActiveTab(tab); setTabChanging(false); }, 120);
  }

  const completeness = profileCompleteness(profile);
  const isFirstRun = profileLoaded && completeness === 0;

  const navItems: { id: Tab; icon: React.ReactNode; label: string }[] = [
    { id: "dashboard", icon: <LayoutDashboard size={18} />, label: "Home" },
    { id: "profile",   icon: <User size={18} />,            label: "Profile" },
    { id: "documents", icon: <FileText size={18} />,        label: "Docs" },
    { id: "history",   icon: <Clock size={18} />,           label: "History" },
  ];

  return (
    <div className="flex flex-col h-full bg-white" style={{ minHeight: 520 }}>

      {/* ── Drop-shape gradient header ─────────────────────────────── */}
      <div
        className="drop-wave relative flex items-center gap-3 px-4 pb-4 pt-4 z-10"
        style={{ background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 55%, #a855f7 100%)" }}
      >
        {/* Logo drop-blob */}
        <div className="relative shrink-0">
          <div
            className="w-9 h-9 flex items-center justify-center animate-liquid"
            style={{
              background: "rgba(255,255,255,0.25)",
              borderRadius: "60% 40% 30% 70% / 60% 30% 70% 40%",
            }}
          >
            <BrainCircuit size={18} className="text-white" />
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="font-bold text-white text-[15px] tracking-tight leading-none">FormPilot AI</div>
          <div className="text-white/60 text-[10px] mt-0.5 truncate">
            {activeTab === "dashboard" && "Smart form filler"}
            {activeTab === "profile"   && "Your saved profile"}
            {activeTab === "documents" && "Uploaded documents"}
            {activeTab === "history"   && "Application history"}
          </div>
        </div>

        {/* API status pill */}
        <div className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold shrink-0 ${
          apiOnline === null
            ? "bg-white/15 text-white/70"
            : apiOnline
              ? "bg-emerald-400/25 text-emerald-100"
              : "bg-white/15 text-white/60"
        }`}>
          {apiOnline === null ? (
            <Loader2 size={10} className="animate-spin" />
          ) : apiOnline ? (
            <Wifi size={10} />
          ) : (
            <WifiOff size={10} />
          )}
          <span>{apiOnline === null ? "…" : apiOnline ? "AI On" : "Offline"}</span>
        </div>
      </div>

      {/* ── First-run / completeness nudge ────────────────────────── */}
      {profileLoaded && completeness < 40 && activeTab === "dashboard" && (
        <div
          className="mx-3 mt-5 mb-1 flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-2xl px-3 py-2.5 cursor-pointer hover:bg-amber-100 transition-colors animate-fade-up"
          onClick={() => switchTab("profile")}
        >
          <div className="shrink-0 mt-0.5">
            <div className="w-5 h-5 rounded-full bg-amber-400 flex items-center justify-center">
              <span className="text-white text-[10px] font-bold">!</span>
            </div>
          </div>
          <div className="text-xs text-amber-800 leading-relaxed">
            {isFirstRun ? (
              <><strong>Welcome to FormPilot!</strong> Fill in your profile once and we'll auto-fill every form for you.</>
            ) : (
              <><strong>Profile {completeness}% complete.</strong> Add more details for better auto-fill accuracy.</>
            )}
            <span className="ml-1 underline font-semibold">Set up →</span>
          </div>
        </div>
      )}

      {/* ── Profile completeness bar (profile tab) ────────────────── */}
      {profileLoaded && completeness > 0 && completeness < 100 && activeTab === "profile" && (
        <div className="mx-3 mt-5 mb-1 px-3 py-2.5 bg-brand-50 rounded-2xl border border-brand-100 animate-fade-up">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] text-brand-700 font-medium">Profile completeness</span>
            <span className="text-[11px] font-bold text-brand-700">{completeness}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-brand-100 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700 ease-out"
              style={{
                width: `${completeness}%`,
                background: "linear-gradient(90deg, #6366f1, #a855f7)",
              }}
            />
          </div>
        </div>
      )}

      {/* ── Main content ──────────────────────────────────────────── */}
      <div
        className="flex-1 overflow-y-auto"
        style={{
          marginTop: activeTab === "dashboard" && completeness >= 40 ? "20px" : undefined,
          opacity: tabChanging ? 0 : 1,
          transform: tabChanging ? "translateY(4px)" : "translateY(0)",
          transition: "opacity 0.12s ease, transform 0.12s ease",
        }}
      >
        {activeTab === "dashboard" && (
          <Dashboard apiOnline={apiOnline} onSetupProfile={() => switchTab("profile")} />
        )}
        {activeTab === "profile" && (
          <ProfileEditor profile={profile} onSave={saveProfile} />
        )}
        {activeTab === "documents" && <DocumentsManager />}
        {activeTab === "history"   && <HistoryPanel />}
      </div>

      {/* ── Bottom navigation ─────────────────────────────────────── */}
      <div
        className="shrink-0 flex items-center justify-around px-3 py-2"
        style={{
          background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 55%, #a855f7 100%)",
          borderTop: "1px solid rgba(255,255,255,0.12)",
        }}
      >
        {navItems.map(({ id, icon, label }) => (
          <button
            key={id}
            onClick={() => switchTab(id)}
            className={`nav-pill relative flex flex-col items-center gap-0.5 px-4 py-1.5 rounded-xl transition-all ${
              activeTab === id
                ? "active text-brand-600"
                : "text-white/60 hover:text-white/90"
            }`}
          >
            <span className={`transition-all duration-200 ${activeTab === id ? "scale-110" : ""}`}>
              {icon}
            </span>
            <span className="text-[9px] font-semibold tracking-wide">{label}</span>
            {/* Incomplete profile dot */}
            {id === "profile" && completeness < 80 && completeness > 0 && (
              <span className="absolute top-1 right-2 w-2 h-2 rounded-full bg-amber-400 border-2 border-white/20 animate-badge-pop" />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

