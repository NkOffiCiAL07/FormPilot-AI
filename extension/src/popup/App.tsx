import React, { useEffect, useState } from "react";
import { BrainCircuit, Briefcase, FileText, LayoutDashboard, Settings as SettingsIcon, User } from "lucide-react";
import { api } from "../shared/api";
import { hasLegacyData, migrateLegacyData } from "../shared/storage";
import { profileCompleteness, useProfile, useSettings } from "../ui/hooks";
import { Spinner } from "../ui/components";
import Dashboard from "./Dashboard";
import ProfileEditor from "./ProfileEditor";
import DocumentsManager from "./DocumentsManager";
import ApplicationsPanel from "./ApplicationsPanel";
import Settings from "./Settings";
import Onboarding from "./Onboarding";

type Tab = "home" | "profile" | "documents" | "applications" | "settings";

export default function App() {
  const [tab, setTab] = useState<Tab>("home");
  const { profile, save, loaded } = useProfile();
  const { settings, update, loaded: settingsLoaded } = useSettings();
  const [apiOnline, setApiOnline] = useState<boolean | null>(null);
  const [aiModel, setAiModel] = useState<string | null>(null);

  useEffect(() => {
    api.health().then((h) => { setApiOnline(true); setAiModel(h.ai.online ? h.ai.model : null); }).catch(() => setApiOnline(false));
  }, []);
  // bring data saved by older versions (or queued while the API was offline) into the local database
  useEffect(() => { if (apiOnline) hasLegacyData().then(async (y) => { if (y) await migrateLegacyData(); }).catch(() => {}); }, [apiOnline]);

  if (!loaded || !settingsLoaded) return <div style={{ display: "grid", placeItems: "center", height: "100%" }}><Spinner size={22} /></div>;

  // First run: onboarding (also shown if the profile is entirely empty and onboarding was never completed)
  if (!settings.onboardingComplete && profileCompleteness(profile) === 0) {
    return <Onboarding profile={profile} saveProfile={save} update={update} onDone={() => setTab("home")} />;
  }

  const nav: { id: Tab; icon: React.ReactNode; label: string }[] = [
    { id: "home", icon: <LayoutDashboard size={17} />, label: "Home" }, { id: "profile", icon: <User size={17} />, label: "Profile" },
    { id: "documents", icon: <FileText size={17} />, label: "Docs" }, { id: "applications", icon: <Briefcase size={17} />, label: "Applications" },
    { id: "settings", icon: <SettingsIcon size={17} />, label: "Settings" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <header className="fp-header">
        <div className="fp-logo" aria-hidden="true"><BrainCircuit size={17} color="#fff" /></div>
        <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 800, fontSize: 15, lineHeight: 1.1 }}>FormPilot AI</div><div style={{ fontSize: 10.5, opacity: 0.75 }}>Private application assistant</div></div>
        <div className="fp-status" role="status" title={apiOnline ? (aiModel ? `Local AI: ${aiModel}` : "Local server running; Ollama not detected") : "Local server isn't running"}>
          <span className={`fp-dot ${apiOnline ? "on" : ""}`} aria-hidden="true" />{apiOnline === null ? "…" : apiOnline ? (aiModel ? "AI ready" : "No AI") : "Offline"}
        </div>
      </header>
      <main style={{ flex: 1, overflowY: "auto" }} className="fp-fade" key={tab}>
        {tab === "home" && <Dashboard profile={profile} settings={settings} apiOnline={apiOnline} go={(n) => setTab(n)} />}
        {tab === "profile" && <ProfileEditor profile={profile} onSave={save} />}
        {tab === "documents" && <DocumentsManager />}
        {tab === "applications" && <ApplicationsPanel />}
        {tab === "settings" && <Settings settings={settings} update={update} profile={profile} saveProfile={save} />}
      </main>
      <nav className="fp-nav" aria-label="Main">
        {nav.map((n) => <button key={n.id} aria-current={tab === n.id ? "page" : undefined} onClick={() => setTab(n.id)}>{n.icon}<span>{n.label}</span></button>)}
      </nav>
    </div>
  );
}
