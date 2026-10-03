import React, { useEffect, useState } from "react";
import { ArrowRight, Check, Copy, FileText, LayoutPanelLeft, ScanSearch, Sparkles, User } from "lucide-react";
import { api, ApplicationRec, STATUS_LABEL } from "../shared/api";
import { UserProfile } from "../shared/types";
import { AppSettings } from "../shared/storage";
import { QUICK_ITEMS, quickValue } from "../shared/quickCopy";
import { Badge, Button, Card, ErrorNotice, Notice, Skeleton, timeAgo, useAsync } from "../ui/components";
import { profileCompleteness } from "../ui/hooks";
import { statusTone } from "./ApplicationsPanel";

type Nav = "profile" | "documents" | "applications" | "settings";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export default function Dashboard({ profile, settings, apiOnline, go }: { profile: UserProfile; settings: AppSettings; apiOnline: boolean | null; go: (n: Nav) => void }) {
  const { data: stats, error, reload } = useAsync(() => api.applications.stats(), [apiOnline]);
  const { data: apps } = useAsync(() => api.applications.list({}), [apiOnline]);
  const { data: docs } = useAsync(() => api.documents.list("", "resume"), [apiOnline]);
  const { data: ai } = useAsync(() => api.settings.aiStatus(), [apiOnline]);
  const [page, setPage] = useState<{ fields: number; url: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const pct = profileCompleteness(profile);

  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (!tab?.id) return;
      chrome.storage.session.get(`tab_${tab.id}`, (d) => { const s = d[`tab_${tab.id}`]; if (s?.fields?.length) setPage({ fields: s.fields.length, url: s.url }); });
    });
  }, []);

  async function openPanel() {
    chrome.runtime.sendMessage({ type: "OPEN_SIDEPANEL" });
    window.close();
  }
  async function scan() { chrome.runtime.sendMessage({ type: "SCAN_FORM" }); setTimeout(() => window.location.reload(), 900); }
  async function copy(key: string) {
    const v = quickValue(profile, key);
    if (!v) return;
    await navigator.clipboard.writeText(v);
    setCopied(key); setTimeout(() => setCopied(null), 1400);
  }

  const total = stats?.total ?? 0;
  const pending = (stats?.byStatus.saved ?? 0) + (stats?.byStatus.applied ?? 0);
  const name = profile.firstName ? `, ${profile.firstName}` : "";
  const quick = QUICK_ITEMS.filter((i) => settings.quickCopyFields.includes(i.key) && quickValue(profile, i.key));

  return (
    <div className="fp-screen">
      <div><h1 className="fp-h1">{greeting()}{name}</h1><div className="fp-sub">Your applications</div></div>

      {/* current page */}
      {page ? (
        <Card tone="ai"><div className="fp-row"><ScanSearch size={18} aria-hidden="true" />
          <div style={{ flex: 1 }}><strong>Application form detected</strong><div className="fp-sub">{page.fields} fields on this page</div></div>
          <Button variant="primary" size="sm" onClick={openPanel}>Review <ArrowRight size={13} /></Button></div></Card>
      ) : (
        <Card tight><div className="fp-row"><LayoutPanelLeft size={16} className="fp-muted" aria-hidden="true" />
          <div style={{ flex: 1 }} className="fp-sub">Open a job application page, then open the side panel.</div>
          <Button size="sm" onClick={scan}>Scan page</Button></div></Card>
      )}

      {/* setup nudges */}
      {pct < 60 && <Notice tone="info" title={`Profile ${pct}% complete`} action={<Button size="sm" onClick={() => go("profile")}><User size={13} /> Complete profile</Button>}>The more you add, the more FormPilot can fill.</Notice>}
      {docs && docs.length === 0 && <Notice tone="info" title="Add your first resume" action={<Button size="sm" onClick={() => go("documents")}><FileText size={13} /> Add resume</Button>}>FormPilot recommends the best resume for each job.</Notice>}
      {apiOnline === false && <Notice tone="danger" title="Local server isn't running">Start it with <code>cd local-api &amp;&amp; npm start</code>. Basic autofill still works without it.</Notice>}
      {apiOnline && ai && !ai.online && <Notice tone="warn" title="Ollama isn't running">AI answers are off. Start Ollama to enable them — everything else works.</Notice>}
      {apiOnline && ai?.online && ai.configuredModel && ai.modelInstalled === false && <Notice tone="warn" title="Model not installed">{ai.configuredModel} isn't installed. Pick one of: {ai.models.join(", ") || "none installed"} in Settings.</Notice>}

      {/* stats */}
      {error ? <ErrorNotice error={error} onRetry={reload} /> : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
          {[["Applications", total], ["Interviews", stats?.byStatus.interview ?? 0], ["Pending", pending], ["Offers", stats?.byStatus.offer ?? 0]].map(([l, v]) => (
            <Card key={l as string} tight><div style={{ fontSize: 20, fontWeight: 800 }}>{stats ? v : "–"}</div><div className="fp-muted" style={{ fontSize: 10.5 }}>{l}</div></Card>
          ))}
        </div>
      )}

      {/* recent */}
      <div className="fp-row"><h2 className="fp-h2" style={{ flex: 1 }}>Recent applications</h2>{total > 0 && <Button variant="ghost" size="sm" onClick={() => go("applications")}>See all</Button>}</div>
      {!apps ? <Skeleton h={50} /> : apps.length === 0 ? <Card tight><span className="fp-sub">Nothing yet. Fill an application and it will appear here.</span></Card> :
        apps.slice(0, 4).map((a: ApplicationRec) => (
          <Card key={a.id} tight><div className="fp-row"><div style={{ flex: 1, minWidth: 0 }}><div className="fp-truncate" style={{ fontWeight: 600 }}>{a.role || "Untitled role"}</div>
            <div className="fp-muted fp-truncate" style={{ fontSize: 11 }}>{a.company || a.domain} · {timeAgo(a.appliedAt || a.createdAt)}</div></div>
            <Badge tone={statusTone(a.status)}>{STATUS_LABEL[a.status]}</Badge></div></Card>
        ))}

      {/* insights — descriptive only */}
      {stats && total > 0 && (
        <Card tone="ai"><div className="fp-row" style={{ marginBottom: 6 }}><Sparkles size={15} aria-hidden="true" /><h2 className="fp-h2">Insights</h2></div>
          <ul className="fp-sub" style={{ margin: 0, paddingLeft: 18 }}>
            <li>You applied to {stats.thisWeek} job{stats.thisWeek === 1 ? "" : "s"} this week and {stats.thisMonth} this month.</li>
            {stats.topRoles[0] && <li>Your most common target role: {stats.topRoles[0].name}.</li>}
            {stats.topCompanies[0] && stats.topCompanies[0].count > 1 && <li>You've applied to {stats.topCompanies[0].name} {stats.topCompanies[0].count} times.</li>}
            {stats.reusableAnswers > 0 && <li>You have {stats.reusableAnswers} saved answer{stats.reusableAnswers === 1 ? "" : "s"} that can be reused.</li>}
          </ul></Card>
      )}

      {/* quick copy */}
      {quick.length > 0 && (<>
        <h2 className="fp-h2">Quick copy</h2>
        <div className="fp-row" style={{ flexWrap: "wrap" }}>
          {quick.map((i) => (
            <Button key={i.key} size="sm" onClick={() => copy(i.key)} aria-label={`Copy ${i.label}`}>
              {copied === i.key ? <Check size={12} /> : <Copy size={12} />} {i.label}{settings.shortcuts[i.key] ? <span className="fp-muted" style={{ fontWeight: 500 }}> {settings.shortcuts[i.key]}</span> : null}
            </Button>
          ))}
        </div>
      </>)}
    </div>
  );
}
