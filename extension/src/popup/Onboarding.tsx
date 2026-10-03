import React, { useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Bot, Check, FileText, Rocket, ScanSearch, SlidersHorizontal, User } from "lucide-react";
import { api, ApiError, AiStatus } from "../shared/api";
import { AppSettings } from "../shared/storage";
import { UserProfile } from "../shared/types";
import { ExportFile, mergeProfile, parseExport, validateExport } from "../shared/dataTransfer";
import { Button, ErrorNotice, Field, Notice, TextInput } from "../ui/components";

const STEPS = ["Welcome", "Profile", "Resume", "AI", "Autofill", "Demo"] as const;

const PRESETS = {
  cautious: { label: "Cautious", desc: "Everything waits for your review.", s: { autoFillHigh: false, reviewMedium: true, autoThreshold: 0.95, reviewThreshold: 0.8 } },
  balanced: { label: "Balanced", desc: "Obvious fields fill automatically; others are highlighted.", s: { autoFillHigh: true, reviewMedium: true, autoThreshold: 0.9, reviewThreshold: 0.7 } },
  fast: { label: "Fast", desc: "Fill more by itself. You still review AI answers and salary.", s: { autoFillHigh: true, reviewMedium: true, autoThreshold: 0.8, reviewThreshold: 0.6 } },
} as const;

export default function Onboarding({ profile, saveProfile, update, onDone }: {
  profile: UserProfile; saveProfile: (p: UserProfile) => void; update: (p: Partial<AppSettings>) => Promise<AppSettings>; onDone: () => void;
}) {
  const [step, setStep] = useState(0);
  const [p, setP] = useState(profile);
  const [preset, setPreset] = useState<keyof typeof PRESETS>("balanced");
  const set = (patch: Partial<UserProfile>) => setP((x) => ({ ...x, ...patch }));

  function next() {
    if (step === 1) saveProfile(p);
    if (step === 4) update(PRESETS[preset].s);
    setStep((s) => s + 1);
  }
  async function finish() { await update({ onboardingComplete: true }); onDone(); }

  return (
    <div className="fp-screen" style={{ minHeight: "100%" }}>
      <div className="fp-row" role="progressbar" aria-valuemin={1} aria-valuemax={STEPS.length} aria-valuenow={step + 1} aria-label={`Step ${step + 1} of ${STEPS.length}: ${STEPS[step]}`}>
        {STEPS.map((_, i) => <div key={i} className="fp-bar" style={{ flex: 1, height: 5 }}><i style={{ width: i <= step ? "100%" : "0%" }} /></div>)}
      </div>

      {step === 0 && (
        <div className="fp-col fp-fade" style={{ gap: 12, textAlign: "center", alignItems: "center", paddingTop: 12 }}>
          <div className="fp-logo" style={{ width: 64, height: 64, background: "var(--brand-gradient)" }}><Rocket size={28} color="#fff" /></div>
          <h1 className="fp-h1" style={{ fontSize: 22 }}>Welcome to FormPilot</h1>
          <p className="fp-sub" style={{ margin: 0 }}>Fill job applications in seconds — privately. FormPilot understands the form, fills what's certain, drafts answers with an AI model on your own computer, and lets you review everything before it touches the page.</p>
          <Notice tone="ok" title="Nothing leaves your computer">No cloud AI, no accounts. This takes about two minutes.</Notice>
        </div>
      )}

      {step === 1 && <ProfileStep p={p} set={set} onImport={(imp) => { setP(imp); saveProfile(imp); setStep(2); }} />}
      {step === 2 && <ResumeStep />}
      {step === 3 && <AiStep />}

      {step === 4 && (
        <div className="fp-col fp-fade">
          <h1 className="fp-h1"><SlidersHorizontal size={16} /> How much should FormPilot do on its own?</h1>
          {(Object.keys(PRESETS) as (keyof typeof PRESETS)[]).map((k) => (
            <label key={k} className="fp-card tight" style={{ cursor: "pointer", borderColor: preset === k ? "var(--primary)" : undefined }}>
              <div className="fp-row"><input type="radio" name="preset" checked={preset === k} onChange={() => setPreset(k)} /><div><strong>{PRESETS[k].label}{k === "balanced" ? " (recommended)" : ""}</strong><div className="fp-sub">{PRESETS[k].desc}</div></div></div>
            </label>
          ))}
          <div className="fp-help">You can fine-tune thresholds any time in Settings → Fill.</div>
        </div>
      )}

      {step === 5 && (
        <div className="fp-col fp-fade">
          <h1 className="fp-h1">How it works</h1>
          {[[ScanSearch, "1 · Detect", "Open a job application. FormPilot finds the form and reads the job."], [Check, "2 · Review", "Open the side panel. Sure things are filled; uncertain ones are highlighted with a reason."], [Bot, "3 · Draft", "Open questions get a draft from your profile. Missing facts are flagged — never invented."], [Rocket, "4 · Fill & track", "Accept, edit or reject each item, fill, undo if needed. The application is saved to your tracker."]].map(([Icon, t, d], i) => {
            const I = Icon as typeof Check;
            return <div key={i} className="fp-card tight fp-row" style={{ alignItems: "flex-start" }}><I size={18} style={{ color: "var(--primary)", flex: "none" }} aria-hidden="true" /><div><strong>{t as string}</strong><div className="fp-sub">{d as string}</div></div></div>;
          })}
        </div>
      )}

      <div className="fp-spacer" />
      <div className="fp-row">
        {step > 0 && <Button onClick={() => setStep(step - 1)}><ArrowLeft size={14} /> Back</Button>}
        <span className="fp-spacer" />
        {step === 5 ? <Button variant="primary" onClick={finish}>Start using FormPilot</Button>
          : <><Button variant="ghost" onClick={step === 0 ? finish : () => setStep(step + 1)}>{step === 0 ? "Skip setup" : "Skip"}</Button><Button variant="primary" onClick={next}>{step === 0 ? "Get started" : "Continue"} <ArrowRight size={14} /></Button></>}
      </div>
    </div>
  );
}

function ProfileStep({ p, set, onImport }: { p: UserProfile; set: (x: Partial<UserProfile>) => void; onImport: (p: UserProfile) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState<unknown>(null);
  async function pick(f?: File | null) {
    if (!f) return;
    const { data, error } = parseExport(await f.text());
    const v = data && validateExport(data);
    if (!data || !v?.ok) { setErr(new ApiError(error ?? v?.errors.join(" ") ?? "Invalid file", "INVALID_IMPORT")); return; }
    onImport(mergeProfile(p, (data as ExportFile).profile ?? {}));
  }
  return (
    <div className="fp-col fp-fade">
      <h1 className="fp-h1"><User size={16} /> Create your profile</h1>
      <div className="fp-sub">The essentials — you can add the rest later.</div>
      <div className="fp-row"><div style={{ flex: 1 }}><TextInput label="First name" value={p.firstName} onChange={(v) => set({ firstName: v })} /></div><div style={{ flex: 1 }}><TextInput label="Last name" value={p.lastName} onChange={(v) => set({ lastName: v })} /></div></div>
      <TextInput label="Email" type="email" value={p.email} onChange={(v) => set({ email: v })} />
      <TextInput label="Phone" value={p.phone} onChange={(v) => set({ phone: v })} />
      <div className="fp-row"><div style={{ flex: 1 }}><TextInput label="Current job title" value={p.currentTitle} onChange={(v) => set({ currentTitle: v })} /></div><div style={{ flex: 1 }}><TextInput label="Company" value={p.currentCompany} onChange={(v) => set({ currentCompany: v })} /></div></div>
      <Button size="sm" onClick={() => ref.current?.click()}>Or import a FormPilot export</Button>
      <input ref={ref} type="file" hidden accept=".json,application/json" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} aria-label="Import a FormPilot export file" />
      {err ? <ErrorNotice error={err} /> : null}
    </div>
  );
}

function ResumeStep() {
  const [file, setFile] = useState<File | null>(null);
  const [role, setRole] = useState("");
  const [skills, setSkills] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [err, setErr] = useState<unknown>(null);
  const ref = useRef<HTMLInputElement>(null);
  async function upload() {
    if (!file) return;
    setState("busy"); setErr(null);
    try { await api.documents.upload(file, { category: "resume", name: file.name.replace(/\.[^.]+$/, ""), targetRole: role, skills: skills.split(",").map((s) => s.trim()).filter(Boolean), isDefault: true }); setState("done"); }
    catch (e) { setErr(e); setState("idle"); }
  }
  return (
    <div className="fp-col fp-fade">
      <h1 className="fp-h1"><FileText size={16} /> Add your resume</h1>
      <div className="fp-sub">FormPilot picks the best resume for each job. You can add more later in Docs.</div>
      {state === "done" ? <Notice tone="ok" title="Resume added">Saved on this computer only.</Notice> : (<>
        <Button onClick={() => ref.current?.click()}>{file ? file.name : "Choose a PDF / Word / text file"}</Button>
        <input ref={ref} type="file" hidden accept=".pdf,.doc,.docx,.txt,.md" onChange={(e) => setFile(e.target.files?.[0] ?? null)} aria-label="Choose your resume file" />
        <TextInput label="Target role" value={role} onChange={setRole} placeholder="e.g. Backend Engineer" />
        <TextInput label="Key skills" value={skills} onChange={setSkills} help="Comma-separated. Used to match resumes to jobs." />
        <Button variant="primary" busy={state === "busy"} disabled={!file} onClick={upload}>Upload resume</Button>
        {err ? <ErrorNotice error={err} onRetry={upload} /> : null}
      </>)}
    </div>
  );
}

function AiStep() {
  const [st, setSt] = useState<AiStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [model, setModel] = useState("");
  async function test() {
    setBusy(true);
    try { const s = await api.settings.testAi({ model }); setSt(s); if (s.online && !model && s.model) setModel(""); }
    catch (e) { setSt({ online: false, models: [], model: null, error: e instanceof ApiError ? e.message : "Couldn't test the connection.", code: e instanceof ApiError ? e.code : undefined }); }
    setBusy(false);
  }
  return (
    <div className="fp-col fp-fade">
      <h1 className="fp-h1"><Bot size={16} /> Connect your local AI</h1>
      <div className="fp-sub">FormPilot uses <strong>Ollama</strong>, running on this computer, to draft answers. It's optional — basic autofill works without it.</div>
      <Button variant="primary" onClick={test} busy={busy}>Test connection</Button>
      {st?.online && st.models.length > 0 && (
        <Field label="Model">
          <select className="fp-select" value={model} onChange={async (e) => { setModel(e.target.value); await api.settings.save({ ai: { model: e.target.value } }).catch(() => {}); }} aria-label="Model">
            <option value="">Automatic ({st.model})</option>{st.models.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </Field>
      )}
      {st && (st.online ? <Notice tone={st.model ? "ok" : "warn"} title={st.model ? `Connected · ${st.model}` : "Connected, but no model installed"}>{st.model ? "You're all set." : "Run `ollama pull llama3.2`, then test again."}</Notice>
        : <ErrorNotice error={new ApiError(st.error || "Ollama isn't running. Start Ollama and try again.", st.code || "OLLAMA_UNAVAILABLE")} onRetry={test} />)}
      <div className="fp-help">Don't have Ollama? Get it at ollama.com, then run <code>ollama pull llama3.2</code>.</div>
    </div>
  );
}
