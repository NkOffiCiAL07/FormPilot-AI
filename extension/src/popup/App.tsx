import React, { useEffect, useState } from "react";
import { UserProfile, defaultProfile } from "../shared/types";
import ProfileEditor from "./ProfileEditor";
import Dashboard from "./Dashboard";
import DocumentsManager from "./DocumentsManager";
import { BrainCircuit, AlertCircle } from "lucide-react";

type Tab = "dashboard" | "profile" | "documents" | "history";

// Completeness = how many core fields are filled (0–100)
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

  useEffect(() => {
    chrome.runtime.sendMessage({ type: "GET_PROFILE" }, (res) => {
      if (res?.profile) {
        setProfile(res.profile);
      }
      setProfileLoaded(true);
    });
    chrome.runtime.sendMessage({ type: "API_STATUS" }, (res) => {
      setApiOnline(res?.online ?? false);
    });
    // Re-read profile whenever storage changes (e.g. saved from another context)
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
    // Persist to chrome.storage.local directly AND notify background
    chrome.storage.local.set({ profile: p });
    chrome.runtime.sendMessage({ type: "SAVE_PROFILE", payload: p }).catch(() => {});
  }

  const completeness = profileCompleteness(profile);
  const isFirstRun = profileLoaded && completeness === 0;

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <header className="flex items-center gap-2 px-4 py-3 bg-brand-600 text-white">
        <BrainCircuit size={22} />
        <span className="font-bold text-base tracking-tight">FormPilot AI</span>
        <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-white/20">
          {apiOnline === null ? "…" : apiOnline ? "AI Online" : "Offline Mode"}
        </span>
      </header>

      {/* First-run / low-profile nudge */}
      {profileLoaded && completeness < 50 && activeTab === "dashboard" && (
        <div
          className="flex items-start gap-2 bg-amber-50 border-b border-amber-200 px-4 py-2.5 cursor-pointer hover:bg-amber-100 transition-colors"
          onClick={() => setActiveTab("profile")}
        >
          <AlertCircle size={15} className="text-amber-600 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-800">
            {isFirstRun
              ? <><strong>Welcome!</strong> Fill in your profile once and FormPilot will remember your details for every future form.</>
              : <><strong>Profile {completeness}% complete.</strong> Add more details to improve auto-fill accuracy.</>
            }
            <span className="ml-1 font-medium underline">Set up now →</span>
          </div>
        </div>
      )}

      {/* Profile completeness bar */}
      {profileLoaded && completeness > 0 && completeness < 100 && activeTab === "profile" && (
        <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
          <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
            <span>Profile completeness</span>
            <span className="font-medium text-gray-700">{completeness}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-gray-200">
            <div
              className="h-1.5 rounded-full bg-brand-600 transition-all duration-500"
              style={{ width: `${completeness}%` }}
            />
          </div>
        </div>
      )}

      {/* Tab bar */}
      <nav className="flex border-b border-gray-200 text-sm">
        {(["dashboard", "profile", "documents", "history"] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2.5 capitalize font-medium transition-colors relative ${
              activeTab === tab
                ? "border-b-2 border-brand-600 text-brand-600"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab}
            {/* Red dot on Profile tab if incomplete */}
            {tab === "profile" && completeness < 80 && completeness > 0 && (
              <span className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-amber-500" />
            )}
          </button>
        ))}
      </nav>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === "dashboard" && <Dashboard apiOnline={apiOnline} onSetupProfile={() => setActiveTab("profile")} />}
        {activeTab === "profile" && <ProfileEditor profile={profile} onSave={saveProfile} />}
        {activeTab === "documents" && <DocumentsManager />}
        {activeTab === "history" && <HistoryPlaceholder />}
      </div>
    </div>
  );
}

function HistoryPlaceholder() {
  return (
    <div className="flex flex-col items-center justify-center h-48 text-gray-400 text-sm gap-2">
      <span className="text-3xl">📋</span>
      <p>Application history coming in Phase 4</p>
    </div>
  );
}
