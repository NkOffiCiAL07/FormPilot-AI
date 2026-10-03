import React, { useState } from "react";
import { BrainCircuit, Briefcase, ClipboardCheck, GraduationCap, ScanSearch, ScrollText, RefreshCw } from "lucide-react";
import { useProfile, useSettings } from "../ui/hooks";
import { Button, EmptyState, Spinner, Tabs } from "../ui/components";
import { useActiveTab, useDecisions, useTabState, send } from "./hooks";
import ReviewTab from "./ReviewTab";
import JobTab from "./JobTab";
import CoverLetterTab from "./CoverLetterTab";
import InterviewTab from "./InterviewTab";

type View = "review" | "job" | "letter" | "interview";

export default function SidePanel() {
  const tabId = useActiveTab();
  const { state, loaded } = useTabState(tabId);
  const { settings } = useSettings();
  const { profile } = useProfile();
  const { decisions, patch, clear, set } = useDecisions(tabId, state?.url);
  const [view, setView] = useState<View>("review");

  const detected = (state?.fields.length ?? 0) > 0;
  const role = state?.job?.job.title || state?.page?.role;
  const company = state?.job?.job.company || state?.page?.company;

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <header className="fp-header" style={{ borderRadius: "0 0 22px 22px" }}>
        <div className="fp-logo" aria-hidden="true"><BrainCircuit size={16} color="#fff" /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800 }}>FormPilot</div>
          <div className="fp-truncate" style={{ fontSize: 11, opacity: 0.85 }}>{detected ? (role ? `${role}${company ? ` · ${company}` : ""}` : "Application detected") : "No application form yet"}</div>
        </div>
        {(state?.jobStatus === "running" || state?.answersStatus === "running") && <span className="fp-status" role="status"><Spinner size={11} /> Analyzing</span>}
        <Button variant="ghost" icon aria-label="Rescan page" style={{ color: "#fff" }} onClick={() => tabId !== null && send("REANALYZE", { tabId })}><RefreshCw size={15} /></Button>
      </header>

      <div style={{ padding: "12px 12px 0" }}>
        <Tabs<View> label="Side panel sections" value={view} onChange={setView} tabs={[
          { id: "review", label: "Review", icon: <ClipboardCheck size={13} /> }, { id: "job", label: "Job", icon: <Briefcase size={13} /> },
          { id: "letter", label: "Letter", icon: <ScrollText size={13} /> }, { id: "interview", label: "Prep", icon: <GraduationCap size={13} /> },
        ]} />
      </div>

      <main style={{ flex: 1, padding: 12 }} aria-live="polite">
        {tabId === null || !loaded ? <div style={{ display: "grid", placeItems: "center", padding: 40 }}><Spinner size={20} /></div>
          : !state || (!detected && view === "review") ? (
            <EmptyState icon={<ScanSearch size={22} />} title="Looking for an application form" body="Open a job application page and FormPilot will detect it. Forms that load late are picked up automatically."
              action={<Button variant="primary" onClick={() => send("SCAN_FORM", { tabId })}>Scan this page</Button>} />)
          : view === "review" ? <ReviewTab tabId={tabId} state={state} settings={settings} decisions={decisions} patch={patch} clear={clear} set={set} goJob={() => setView("job")} />
          : view === "job" ? <JobTab tabId={tabId} state={state} />
          : view === "letter" ? <CoverLetterTab tabId={tabId} state={state} profile={profile} />
          : <InterviewTab state={state} profile={profile} />}
      </main>
    </div>
  );
}
