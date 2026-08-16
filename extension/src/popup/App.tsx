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
  return Math.round(coreFields.filter(Boolean).length / coreFields.length * 100);
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
      if (area === "local" && changes["profile"])
        setProfile(changes["profile"].newValue ?? defaultProfile);
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
    setTimeout(() => { setActiveTab(tab); setTabChanging(false); }, 110);
  }

  const completeness = profileCompleteness(profile);
  const isFirstRun = profileLoaded && completeness === 0;
  const showNudge = profileLoaded && completeness < 40 && activeTab === "dashboard";
  const showProgressBar = profileLoaded && completeness > 0 && completeness < 100 && activeTab === "profile";

  const navItems: { id: Tab; icon: React.ReactNode; label: string }[] = [
    { id: "dashboard", icon: <LayoutDashboard size={18} />, label: "Home"    },
    { id: "profile",   icon: <User size={18} />,            label: "Profile" },
    { id: "documents", icon: <FileText size={18} />,        label: "Docs"    },
    { id: "history",   icon: <Clock size={18} />,           label: "History" },
  ];

  return (
    <div className="flex flex-col" style={{ height: "100vh", minHeight: 520, background: "#eef2ff" }}>

      {/* ── Gradient drop-wave header ──────────────────────────────── */}
      <div
        className="drop-wave shrink-0 flex items-center gap-3 px-4 pt-4 pb-4 z-10"
        style={{ background: "linear-gradient(135deg,#6366f1 0%,#8b5cf6 55%,#a855f7 100%)" }}
      >
        {/* Liquid logo blob */}
        <div
          className="shrink-0 w-9 h-9 flex items-center justify-center animate-liquid"
          style={{
            background: "rgba(255,255,255,0.22)",
            borderRadius: "60% 40% 30% 70% / 60% 30% 70% 40%",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.4), 0 2px 8px rgba(0,0,0,0.15)",
          }}
        >
          <BrainCircuit size={17} className="text-white" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="font-bold text-white text-[15px] tracking-tight leading-none">FormPilot AI</div>
          <div className="text-white/55 text-[10px] mt-0.5 truncate">
            {activeTab === "dashboard" && "Smart form filler"}
            {activeTab === "profile"   && "Your saved profile"}
            {activeTab === "documents" && "Uploaded documents"}
            {activeTab === "history"   && "Application history"}
          </div>
        </div>

        {/* API status capsule */}
        <div
          className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold"
          style={{
            background: apiOnline
              ? "rgba(52,211,153,0.2)"
              : "rgba(255,255,255,0.13)",
            color: apiOnline ? "#a7f3d0" : "rgba(255,255,255,0.6)",
            border: "1px solid rgba(255,255,255,0.15)",
          }}
        >
          {apiOnline === null ? <Loader2 size={10} className="animate-spin" /> :
           apiOnline         ? <Wifi size={10} /> : <WifiOff size={10} />}
          <span>{apiOnline === null ? "…" : apiOnline ? "AI On" : "Offline"}</span>
        </div>
      </div>

      {/* ── Sub-header banners (outside scroll so they sit above wave) ── */}
      {showNudge && (
        <div
          className="mx-3 flex items-start gap-2.5 rounded-2xl px-3 py-2.5 cursor-pointer transition-all animate-fade-up water-card"
          style={{ marginTop: 28, marginBottom: 4 }}
          onClick={() => switchTab("profile")}
        >
          <div
            className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center mt-0.5"
            style={{ background: "linear-gradient(135deg,#f59e0b,#d97706)" }}
          >
            <span className="text-white text-[9px] font-black">!</span>
          </div>
          <div className="text-[11px] text-gray-700 leading-relaxed">
            {isFirstRun
              ? <><strong className="text-gray-900">Welcome to FormPilot!</strong> Fill in your profile once — we'll auto-fill every form from then on.</>
              : <><strong className="text-gray-900">Profile {completeness}% complete.</strong> Add more details to improve auto-fill accuracy.</>
            }
            <span className="ml-1 text-brand-600 font-semibold underline underline-offset-2">Set up →</span>
          </div>
        </div>
      )}

      {showProgressBar && (
        <div
          className="mx-3 rounded-2xl px-3 py-2.5 animate-fade-up water-card"
          style={{ marginTop: 28, marginBottom: 4 }}
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] text-brand-700 font-semibold">Profile completeness</span>
            <span className="text-[11px] font-black text-brand-600">{completeness}%</span>
          </div>
          <div className="h-2 rounded-full bg-brand-100 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${completeness}%`,
                background: "linear-gradient(90deg,#6366f1,#a855f7)",
                boxShadow: "0 0 8px rgba(99,102,241,0.4)",
              }}
            />
          </div>
        </div>
      )}

      {/* ── Main content ──────────────────────────────────────────── */}
      <div
        className="flex-1 overflow-y-auto"
        style={{
          /* Always pad top by wave height so first card isn't under the wave */
          paddingTop: (showNudge || showProgressBar) ? 0 : 26,
          opacity: tabChanging ? 0 : 1,
          transform: tabChanging ? "translateY(5px)" : "translateY(0)",
          transition: "opacity 0.11s ease, transform 0.11s ease",
        }}
      >
        {activeTab === "dashboard" && <Dashboard apiOnline={apiOnline} onSetupProfile={() => switchTab("profile")} />}
        {activeTab === "profile"   && <ProfileEditor profile={profile} onSave={saveProfile} />}
        {activeTab === "documents" && <DocumentsManager />}
        {activeTab === "history"   && <HistoryPanel />}
      </div>

      {/* ── Bottom drop-nav ───────────────────────────────────────── */}
      <div
        className="shrink-0 flex items-center justify-around px-2 py-2"
        style={{
          background: "linear-gradient(135deg,#6366f1 0%,#8b5cf6 55%,#a855f7 100%)",
          borderTop: "1px solid rgba(255,255,255,0.1)",
        }}
      >
        {navItems.map(({ id, icon, label }) => (
          <button
            key={id}
            onClick={() => switchTab(id)}
            className={`nav-pill relative flex flex-col items-center gap-0.5 px-4 py-1.5 transition-all ${
              activeTab === id ? "active text-brand-600" : "text-white/55 hover:text-white/85"
            }`}
          >
            <span className={`transition-transform duration-200 ${activeTab === id ? "scale-115" : ""}`}>
              {icon}
            </span>
            <span className="text-[9px] font-bold tracking-wide">{label}</span>

            {/* Profile incomplete dot */}
            {id === "profile" && completeness < 80 && completeness > 0 && (
              <span
                className="absolute top-0.5 right-1.5 w-2 h-2 rounded-full border-2 border-white/30 animate-badge-pop"
                style={{ background: "#fbbf24" }}
              />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
