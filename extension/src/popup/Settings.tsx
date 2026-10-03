import React, { useEffect, useRef, useState } from "react";
import { Bot, Check, Download, Keyboard, Lock, Moon, Palette, RotateCcw, ShieldCheck, SlidersHorizontal, Sun, Trash2, Upload, MonitorCog, Database } from "lucide-react";
import { api, ApiError, ApiSettings, AiStatus } from "../shared/api";
import { AppSettings, Theme, clearAllData } from "../shared/storage";
import { UserProfile } from "../shared/types";
import { QUICK_ITEMS, comboOf, isValidCombo } from "../shared/quickCopy";
import { ExportFile, buildExport, diffProfile, extensionSettingsFrom, mergeProfile, parseExport, replaceProfile, validateExport } from "../shared/dataTransfer";
import { Badge, Button, Card, ConfirmDialog, Dialog, ErrorNotice, Field, Notice, Spinner, Switch, Tabs, TextInput, useAsync } from "../ui/components";

type Section = "ai" | "autofill" | "privacy" | "look" | "keys" | "data";

export default function Settings({ settings, update, profile, saveProfile }: {
  settings: AppSettings; update: (p: Partial<AppSettings>) => Promise<AppSettings>; profile: UserProfile; saveProfile: (p: UserProfile) => void;
}) {
  const [section, setSection] = useState<Section>("ai");
  return (
    <div className="fp-screen">
      <h1 className="fp-h1">Settings</h1>
      <Tabs<Section> label="Settings sections" value={section} onChange={setSection} tabs={[
        { id: "ai", label: "AI", icon: <Bot size={13} /> }, { id: "autofill", label: "Fill", icon: <SlidersHorizontal size={13} /> },
        { id: "privacy", label: "Privacy", icon: <Lock size={13} /> }, { id: "look", label: "Look", icon: <Palette size={13} /> },
        { id: "keys", label: "Keys", icon: <Keyboard size={13} /> }, { id: "data", label: "Data", icon: <Database size={13} /> },
      ]} />
      {section === "ai" && <AiSection />}
      {section === "autofill" && <AutofillSection settings={settings} update={update} />}
      {section === "privacy" && <PrivacySection />}
      {section === "look" && <AppearanceSection settings={settings} update={update} />}
      {section === "keys" && <ShortcutsSection settings={settings} update={update} />}
      {section === "data" && <DataSection settings={settings} update={update} profile={profile} saveProfile={saveProfile} />}
    </div>
  );
}

// ─── AI ────────────────────────────────────────────────────────────────────────────────

function AiSection() {
  const { data: loaded, error, reload } = useAsync(() => api.settings.get(), []);
  const [ai, setAi] = useState<ApiSettings["ai"] | null>(null);
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [testing, setTesting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveErr, setSaveErr] = useState<unknown>(null);

  useEffect(() => { if (loaded) { setAi(loaded.ai); test(loaded.ai); } /* eslint-disable-next-line */ }, [loaded]);

  async function test(cfg = ai) {
    if (!cfg) return;
    setTesting(true);
    try { setStatus(await api.settings.testAi({ ollamaUrl: cfg.ollamaUrl, model: cfg.model })); }
    catch (e) { setStatus({ online: false, model: null, models: [], error: e instanceof ApiError ? e.message : "Couldn't test the connection." }); }
    setTesting(false);
  }
  async function save() {
    if (!ai) return;
    setSaveErr(null);
    try { await api.settings.save({ ai }); setSaved(true); setTimeout(() => setSaved(false), 1600); test(); }
    catch (e) { setSaveErr(e); }
  }

  if (error) return <ErrorNotice error={error} onRetry={reload} />;
  if (!ai) return <Spinner />;
  const set = (p: Partial<ApiSettings["ai"]>) => setAi({ ...ai, ...p });

  return (
    <div className="fp-col">
      <Card><div className="fp-col" style={{ gap: 10 }}>
        <TextInput label="Ollama URL" value={ai.ollamaUrl} onChange={(v) => set({ ollamaUrl: v })} help="Must be on this computer (localhost)." />
        <Field label="Model" help="“Automatic” uses the first model installed in Ollama.">
          <select className="fp-select" value={ai.model} onChange={(e) => set({ model: e.target.value })} aria-label="Model">
            <option value="">Automatic</option>
            {(status?.models ?? []).map((m) => <option key={m} value={m}>{m}</option>)}
            {ai.model && !(status?.models ?? []).includes(ai.model) && <option value={ai.model}>{ai.model} (not installed)</option>}
          </select>
        </Field>
        <Field label={`Creativity (temperature): ${ai.temperature.toFixed(1)}`} help="Lower is more factual and consistent. Recommended: 0.3.">
          <input type="range" min={0} max={1} step={0.1} value={ai.temperature} onChange={(e) => set({ temperature: Number(e.target.value) })} style={{ width: "100%" }} aria-label="Temperature" />
        </Field>
        <TextInput label="Max answer length (tokens)" type="number" value={String(ai.maxTokens)} onChange={(v) => set({ maxTokens: Number(v) || 700 })} help="Higher allows longer cover letters; slower on small models." />
        <TextInput label="Timeout (seconds)" type="number" value={String(Math.round(ai.timeoutMs / 1000))} onChange={(v) => set({ timeoutMs: (Number(v) || 90) * 1000 })} />
        <div className="fp-row"><Button onClick={() => test()} busy={testing}>Test connection</Button><Button variant="primary" onClick={save}>Save</Button>{saved && <Badge tone="ok" icon={<Check size={11} />}>Saved</Badge>}</div>
        {saveErr ? <ErrorNotice error={saveErr} /> : null}
      </div></Card>
      {status && (status.online
        ? <Notice tone={status.model ? "ok" : "warn"} title={status.model ? `Connected · using ${status.model}` : "Connected, but no model is installed"}>
            {status.model ? `${status.models.length} model(s) available.` : "Run `ollama pull llama3.2` (or any model), then test again."}</Notice>
        : <ErrorNotice error={new ApiError(status.error || "Ollama isn't running. Start Ollama and try again.", status.code || "OLLAMA_UNAVAILABLE")} onRetry={() => test()} />)}
    </div>
  );
}

// ─── Autofill ──────────────────────────────────────────────────────────────────────────

function AutofillSection({ settings, update }: { settings: AppSettings; update: (p: Partial<AppSettings>) => Promise<AppSettings> }) {
  const pct = (n: number) => Math.round(n * 100);
  const sync = (s: AppSettings) => api.settings.save({ autofill: { autoThreshold: s.autoThreshold, reviewThreshold: s.reviewThreshold, autoFillHigh: s.autoFillHigh, reviewMedium: s.reviewMedium } }).catch(() => {});
  const set = async (p: Partial<AppSettings>) => sync(await update(p));
  return (
    <div className="fp-col">
      <Card><div className="fp-col" style={{ gap: 12 }}>
        <Field label={`Fill automatically at ${pct(settings.autoThreshold)}% confidence or higher`}>
          <input type="range" min={50} max={100} value={pct(settings.autoThreshold)} onChange={(e) => set({ autoThreshold: Number(e.target.value) / 100 })} style={{ width: "100%" }} aria-label="Auto-fill threshold" />
        </Field>
        <Field label={`Highlight for review from ${pct(settings.reviewThreshold)}%`} help={`Below ${pct(settings.reviewThreshold)}% FormPilot never fills the field by itself — it only suggests.`}>
          <input type="range" min={30} max={95} value={pct(settings.reviewThreshold)} onChange={(e) => set({ reviewThreshold: Number(e.target.value) / 100 })} style={{ width: "100%" }} aria-label="Review threshold" />
        </Field>
        <Switch label="Auto-fill high-confidence fields" description="Off = even high-confidence fields wait for your review." checked={settings.autoFillHigh} onChange={(v) => set({ autoFillHigh: v })} />
        <Switch label="Review medium-confidence fields" description="Off = medium-confidence fields are suggestions only." checked={settings.reviewMedium} onChange={(v) => set({ reviewMedium: v })} />
        <Switch label="Highlight fields on the page" checked={settings.highlightFields} onChange={(v) => set({ highlightFields: v })} />
        <Switch label="Show confidence in the side panel" checked={settings.showConfidence} onChange={(v) => set({ showConfidence: v })} />
      </div></Card>
      <Notice tone="info" title="What always needs you">Salary, notice period, work authorization and similar answers are always shown for review. Gender, ethnicity, disability, veteran status, ID numbers and agreements are never filled.</Notice>
    </div>
  );
}

// ─── Privacy ───────────────────────────────────────────────────────────────────────────

function PrivacySection() {
  const { data: ai } = useAsync(() => api.settings.aiStatus(), []);
  return (
    <div className="fp-col">
      <Card><div className="fp-row"><ShieldCheck size={22} aria-hidden="true" style={{ color: "var(--ok)" }} /><div><h2 className="fp-h2">Local-first</h2><div className="fp-sub">Your profile and documents are stored on this computer.</div></div></div></Card>
      <Card><dl style={{ margin: 0, display: "grid", gridTemplateColumns: "auto 1fr", gap: "8px 14px" }}>
        <dt className="fp-muted">AI processing</dt><dd style={{ margin: 0 }}>{ai?.online ? <>Ollama running locally{ai.model ? ` · ${ai.model}` : ""}</> : "Ollama (local) — not running"}</dd>
        <dt className="fp-muted">Cloud data sharing</dt><dd style={{ margin: 0, fontWeight: 700 }}>None</dd>
        <dt className="fp-muted">Local server</dt><dd style={{ margin: 0 }}>127.0.0.1 only — web pages can't reach it</dd>
        <dt className="fp-muted">Web page content</dt><dd style={{ margin: 0 }}>Treated as untrusted data; never followed as instructions</dd>
        <dt className="fp-muted">Documents</dt><dd style={{ margin: 0 }}>Never uploaded to any AI service</dd>
      </dl></Card>
    </div>
  );
}

// ─── Appearance ────────────────────────────────────────────────────────────────────────

function AppearanceSection({ settings, update }: { settings: AppSettings; update: (p: Partial<AppSettings>) => Promise<AppSettings> }) {
  const opts: { id: Theme; label: string; icon: React.ReactNode }[] = [{ id: "light", label: "Light", icon: <Sun size={13} /> }, { id: "dark", label: "Dark", icon: <Moon size={13} /> }, { id: "system", label: "System", icon: <MonitorCog size={13} /> }];
  return <Card><Field label="Theme"><Tabs<Theme> label="Theme" value={settings.theme} onChange={(t) => update({ theme: t })} tabs={opts} /></Field></Card>;
}

// ─── Shortcuts ─────────────────────────────────────────────────────────────────────────

function ShortcutsSection({ settings, update }: { settings: AppSettings; update: (p: Partial<AppSettings>) => Promise<AppSettings> }) {
  const [capturing, setCapturing] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const ref = useRef<HTMLButtonElement | null>(null);

  function onKey(e: React.KeyboardEvent, key: string) {
    e.preventDefault();
    if (e.key === "Escape") { setCapturing(null); setMsg(null); return; }
    if (["Control", "Alt", "Shift", "Meta"].includes(e.key)) return;
    const combo = comboOf(e.nativeEvent);
    if (!isValidCombo(combo)) { setMsg("Use a combination with Ctrl, Alt or ⌘ — for example Alt+Shift+E."); return; }
    const clash = Object.entries(settings.shortcuts).find(([k, c]) => c === combo && k !== key);
    if (clash) { setMsg(`${combo} is already used for ${QUICK_ITEMS.find((i) => i.key === clash[0])?.label}.`); return; }
    update({ shortcuts: { ...settings.shortcuts, [key]: combo } });
    setCapturing(null); setMsg(null);
  }
  const toggleQuick = (key: string, on: boolean) => update({ quickCopyFields: on ? [...settings.quickCopyFields, key] : settings.quickCopyFields.filter((k) => k !== key) });

  return (
    <div className="fp-col">
      <Notice tone="info">With a shortcut set, pressing it on any page types that value into the focused field — or copies it if no field is focused.</Notice>
      <Card><div className="fp-col" style={{ gap: 6 }}>
        {QUICK_ITEMS.map((i) => (
          <div key={i.key} className="fp-row">
            <label className="fp-row" style={{ flex: 1 }}><input type="checkbox" checked={settings.quickCopyFields.includes(i.key)} onChange={(e) => toggleQuick(i.key, e.target.checked)} aria-label={`Show ${i.label} in Quick copy`} />{i.label}</label>
            {capturing === i.key
              ? <button ref={ref} autoFocus className="fp-btn sm primary" onKeyDown={(e) => onKey(e, i.key)} onBlur={() => setCapturing(null)} aria-label={`Press the new shortcut for ${i.label}`}>Press keys…</button>
              : <Button size="sm" onClick={() => { setCapturing(i.key); setMsg(null); }} aria-label={`Set shortcut for ${i.label}`}>{settings.shortcuts[i.key] || "Set"}</Button>}
            {settings.shortcuts[i.key] && <Button size="sm" variant="ghost" aria-label={`Clear shortcut for ${i.label}`} onClick={() => { const { [i.key]: _, ...rest } = settings.shortcuts; update({ shortcuts: rest }); }}>✕</Button>}
          </div>
        ))}
        {msg && <div className="fp-help" role="alert" style={{ color: "var(--danger)" }}>{msg}</div>}
      </div></Card>
      <Card tight><div className="fp-row"><div style={{ flex: 1 }}><strong>Browser shortcuts</strong><div className="fp-help">Open the side panel (Alt+Shift+F) and rescan the page (Alt+Shift+S) are managed by Chrome.</div></div>
        <Button size="sm" onClick={() => chrome.tabs.create({ url: "chrome://extensions/shortcuts" })}>Customize</Button></div></Card>
    </div>
  );
}

// ─── Data ──────────────────────────────────────────────────────────────────────────────

function DataSection({ settings, update, profile, saveProfile }: {
  settings: AppSettings; update: (p: Partial<AppSettings>) => Promise<AppSettings>; profile: UserProfile; saveProfile: (p: UserProfile) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, setPending] = useState<{ data: ExportFile; summary: Record<string, unknown>; profileDiff: ReturnType<typeof diffProfile> } | null>(null);
  const [confirm, setConfirm] = useState<null | "history" | "answers" | "reset">(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function doExport() {
    setBusy(true); setError(null);
    try {
      const data = await buildExport(profile, settings);
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      const a = document.createElement("a"); a.href = url; a.download = `formpilot-export-${new Date().toISOString().slice(0, 10)}.json`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      setInfo("Exported. The file contains your profile and documents — keep it private.");
    } catch (e) { setError(e); }
    setBusy(false);
  }

  async function onPick(f?: File | null) {
    if (!f) return;
    setError(null); setInfo(null);
    const { data, error: perr } = parseExport(await f.text());
    if (!data) { setError(new ApiError(perr ?? "Invalid file", "INVALID_IMPORT")); return; }
    const local = validateExport(data);
    if (!local.ok) { setError(new ApiError(local.errors.join(" "), "INVALID_IMPORT")); return; }
    try {
      const v = await api.data.validate(data);
      if (!v.ok) { setError(new ApiError(v.errors.join(" "), "INVALID_IMPORT")); return; }
      setPending({ data, summary: v.summary ?? {}, profileDiff: diffProfile(profile, data.profile ?? {}) });
    } catch (e) { setError(e); }
  }

  async function runImport(mode: "merge" | "replace") {
    if (!pending) return;
    setBusy(true); setError(null);
    try {
      const res = await api.data.import(pending.data, mode);
      saveProfile(mode === "merge" ? mergeProfile(profile, pending.data.profile ?? {}) : replaceProfile(pending.data.profile ?? {}));
      const ext = extensionSettingsFrom(pending.data);
      if (mode === "replace" && ext) await update(ext);
      const a = res.added;
      setInfo(`Imported (${mode}). Added ${a.answers ?? 0} answers, ${a.applications ?? 0} applications, ${a.coverLetters ?? 0} cover letters, ${a.documents ?? 0} documents.`);
      setPending(null);
    } catch (e) { setError(e); }
    setBusy(false);
  }

  return (
    <div className="fp-col">
      <Card><div className="fp-col" style={{ gap: 10 }}>
        <h2 className="fp-h2">Backup &amp; transfer</h2>
        <div className="fp-sub">Export everything — profile, preferences, saved answers, applications and documents — as one portable file.</div>
        <div className="fp-row"><Button onClick={doExport} busy={busy}><Download size={13} /> Export</Button>
          <Button onClick={() => fileRef.current?.click()}><Upload size={13} /> Import</Button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => { onPick(e.target.files?.[0]); e.target.value = ""; }} aria-label="Choose an export file to import" /></div>
      </div></Card>
      {error ? <ErrorNotice error={error} /> : null}
      {info && <Notice tone="ok">{info}</Notice>}

      <Card><div className="fp-col" style={{ gap: 10 }}>
        <h2 className="fp-h2">Danger zone</h2>
        <Button variant="danger" onClick={() => setConfirm("history")}><Trash2 size={13} /> Clear application history</Button>
        <Button variant="danger" onClick={() => setConfirm("answers")}><Trash2 size={13} /> Delete saved answers</Button>
        <Button variant="danger" onClick={() => setConfirm("reset")}><RotateCcw size={13} /> Reset FormPilot</Button>
      </div></Card>

      {pending && (
        <Dialog title="Import this file?" onClose={() => setPending(null)} footer={<>
          <Button onClick={() => setPending(null)}>Cancel</Button>
          <Button busy={busy} onClick={() => runImport("merge")}>Merge</Button>
          <Button variant="danger" busy={busy} onClick={() => runImport("replace")}>Replace</Button></>}>
          <div className="fp-sub">This file contains: {[
            pending.summary.profile ? "a profile" : null, `${pending.summary.answers ?? 0} answers`, `${pending.summary.applications ?? 0} applications`,
            `${pending.summary.coverLetters ?? 0} cover letters`, `${pending.summary.documents ?? 0} documents`].filter(Boolean).join(", ")}.</div>
          <Notice tone="info" title="Merge (recommended)">Adds what's missing. Your existing values are kept{pending.profileDiff.conflicts.length ? ` — ${pending.profileDiff.conflicts.length} profile field(s) differ and will stay as they are` : ""}.
            {pending.profileDiff.added.length > 0 && ` ${pending.profileDiff.added.length} profile field(s) will be added.`}</Notice>
          <Notice title="Replace">Deletes your current profile, answers, applications and documents first, then imports the file.</Notice>
        </Dialog>
      )}

      {confirm === "history" && <ConfirmDialog title="Clear application history?" confirmLabel="Clear history" body="All tracked applications, cover letters and interview sessions will be deleted. Your profile, documents and settings stay." onClose={() => setConfirm(null)} onConfirm={async () => { await api.data.clearHistory(); setInfo("History cleared."); }} />}
      {confirm === "answers" && <ConfirmDialog title="Delete all saved answers?" confirmLabel="Delete answers" requireText="DELETE" body="FormPilot will no longer reuse your previous answers." onClose={() => setConfirm(null)} onConfirm={async () => { await api.answers.clear(); setInfo("Saved answers deleted."); }} />}
      {confirm === "reset" && <ConfirmDialog title="Reset FormPilot?" confirmLabel="Reset everything" requireText="RESET" body="This permanently deletes your profile, documents, answers, applications and settings from this computer. Export a backup first if you might need them." onClose={() => setConfirm(null)}
        onConfirm={async () => { await api.data.reset().catch(() => {}); await clearAllData(); window.location.reload(); }} />}
    </div>
  );
}
