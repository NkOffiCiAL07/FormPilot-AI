import React, { useEffect, useState } from "react";
import { UserProfile, defaultProfile } from "../shared/types";
import ProfileEditor from "./ProfileEditor";
import Dashboard from "./Dashboard";
import { BrainCircuit, User, Settings, History } from "lucide-react";

type Tab = "dashboard" | "profile" | "documents" | "history";

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [profile, setProfile] = useState<UserProfile>(defaultProfile);
  const [apiOnline, setApiOnline] = useState<boolean | null>(null);

  useEffect(() => {
    chrome.runtime.sendMessage({ type: "GET_PROFILE" }, (res) => {
      if (res?.profile) setProfile(res.profile);
    });
    chrome.runtime.sendMessage({ type: "API_STATUS" }, (res) => {
      setApiOnline(res?.online ?? false);
    });
  }, []);

  function saveProfile(updated: UserProfile) {
    const p = { ...updated, updatedAt: new Date().toISOString() };
    setProfile(p);
    chrome.runtime.sendMessage({ type: "SAVE_PROFILE", payload: p });
  }

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

      {/* Tab bar */}
      <nav className="flex border-b border-gray-200 text-sm">
        {(["dashboard", "profile", "documents", "history"] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2.5 capitalize font-medium transition-colors ${
              activeTab === tab
                ? "border-b-2 border-brand-600 text-brand-600"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab}
          </button>
        ))}
      </nav>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === "dashboard" && <Dashboard apiOnline={apiOnline} />}
        {activeTab === "profile" && (
          <ProfileEditor profile={profile} onSave={saveProfile} />
        )}
        {activeTab === "documents" && <DocumentsPlaceholder />}
        {activeTab === "history" && <HistoryPlaceholder />}
      </div>
    </div>
  );
}

function DocumentsPlaceholder() {
  return (
    <div className="flex flex-col items-center justify-center h-48 text-gray-400 text-sm gap-2">
      <span className="text-3xl">📎</span>
      <p>Document manager coming in Phase 3</p>
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
