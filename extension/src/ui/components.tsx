import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, Loader2, X } from "lucide-react";
import { describeError, FriendlyError } from "../shared/api";

// ─── Basics ───────────────────────────────────────────────────────────────────────

export function Spinner({ size = 14 }: { size?: number }) {
  return <Loader2 size={size} className="fp-spin" aria-hidden="true" />;
}

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" | "default"; size?: "sm" | "md"; icon?: boolean; block?: boolean; busy?: boolean };
export function Button({ variant = "default", size = "md", icon, block, busy, className = "", children, disabled, ...rest }: BtnProps) {
  const cls = ["fp-btn", variant !== "default" ? variant : "", size === "sm" ? "sm" : "", icon ? "icon" : "", block ? "block" : "", className].filter(Boolean).join(" ");
  return (
    <button type="button" {...rest} className={cls} disabled={disabled || busy} aria-busy={busy || undefined}>
      {busy && <Spinner size={12} />}
      {children}
    </button>
  );
}

export function Card({ children, className = "", tone, tight }: { children: React.ReactNode; className?: string; tone?: "ai" | "warn" | "soft"; tight?: boolean }) {
  return <section className={`fp-card ${tone ?? ""} ${tight ? "tight" : ""} ${className}`}>{children}</section>;
}

export function Badge({ children, tone = "neutral", icon }: { children: React.ReactNode; tone?: "neutral" | "ok" | "warn" | "ai" | "danger" | "primary"; icon?: React.ReactNode }) {
  return <span className={`fp-badge ${tone === "neutral" ? "" : tone}`}>{icon}{children}</span>;
}

export function Switch({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }) {
  const id = useId();
  return (
    <div className="fp-row" style={{ alignItems: "flex-start", justifyContent: "space-between" }}>
      <label htmlFor={id} style={{ cursor: "pointer", flex: 1 }}>
        <div style={{ fontWeight: 600 }}>{label}</div>
        {description && <div className="fp-help">{description}</div>}
      </label>
      <span className="fp-switch"><input id={id} type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} /><span /></span>
    </div>
  );
}

export function Field({ label, help, children, htmlFor }: { label: string; help?: string; children: React.ReactNode; htmlFor?: string }) {
  return (
    <div>
      <label className="fp-label" htmlFor={htmlFor}>{label}</label>
      {children}
      {help && <div className="fp-help">{help}</div>}
    </div>
  );
}

export function TextInput({ label, help, value, onChange, ...rest }: { label: string; help?: string; value: string; onChange: (v: string) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value">) {
  const id = useId();
  return (
    <Field label={label} help={help} htmlFor={id}>
      <input id={id} className="fp-input" value={value} onChange={(e) => onChange(e.target.value)} {...rest} />
    </Field>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange, label }: { tabs: { id: T; label: string; icon?: React.ReactNode }[]; value: T; onChange: (v: T) => void; label: string }) {
  const onKey = (e: React.KeyboardEvent) => {
    const i = tabs.findIndex((t) => t.id === value);
    if (e.key === "ArrowRight") onChange(tabs[(i + 1) % tabs.length].id);
    if (e.key === "ArrowLeft") onChange(tabs[(i - 1 + tabs.length) % tabs.length].id);
  };
  return (
    <div className="fp-tabs" role="tablist" aria-label={label} onKeyDown={onKey}>
      {tabs.map((t) => (
        <button key={t.id} role="tab" className="fp-tab" aria-selected={value === t.id} tabIndex={value === t.id ? 0 : -1} onClick={() => onChange(t.id)}>
          {t.icon}{t.label}
        </button>
      ))}
    </div>
  );
}

// ─── Empty state, notices, errors ────────────────────────────────────────────────────

export function EmptyState({ icon, title, body, action }: { icon: React.ReactNode; title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="fp-empty fp-fade">
      <div className="ico" aria-hidden="true">{icon}</div>
      <h3 className="fp-h2" style={{ fontSize: 14 }}>{title}</h3>
      <p className="fp-sub" style={{ margin: 0, maxWidth: 270 }}>{body}</p>
      {action}
    </div>
  );
}

export function Notice({ tone = "warn", title, children, action }: { tone?: "warn" | "danger" | "info" | "ok"; title?: string; children?: React.ReactNode; action?: React.ReactNode }) {
  const Icon = tone === "ok" ? CheckCircle2 : tone === "info" ? Info : AlertTriangle;
  return (
    <div className={`fp-notice ${tone === "warn" ? "" : tone}`} role={tone === "danger" ? "alert" : "status"}>
      <Icon size={16} style={{ flex: "none", marginTop: 2 }} aria-hidden="true" />
      <div style={{ flex: 1, minWidth: 0 }}>
        {title && <div style={{ fontWeight: 700 }}>{title}</div>}
        {children && <div className="fp-sub">{children}</div>}
        {action && <div style={{ marginTop: 8 }}>{action}</div>}
      </div>
    </div>
  );
}

/** Friendly error with an optional retry. Raw details are tucked behind "Developer details". */
export function ErrorNotice({ error, onRetry, onSettings }: { error: unknown; onRetry?: () => void; onSettings?: () => void }) {
  const f: FriendlyError = describeError(error);
  return (
    <div className="fp-notice danger" role="alert">
      <AlertTriangle size={16} style={{ flex: "none", marginTop: 2 }} aria-hidden="true" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700 }}>{f.title}</div>
        <div className="fp-sub">{f.message}</div>
        <div className="fp-row" style={{ marginTop: 8 }}>
          {onRetry && f.action !== "settings" && <Button size="sm" onClick={onRetry}>Retry</Button>}
          {onSettings && f.action === "settings" && <Button size="sm" onClick={onSettings}>Open settings</Button>}
        </div>
        {f.debug && <details><summary>Developer details</summary><code style={{ wordBreak: "break-all" }}>{f.debug}</code></details>}
      </div>
    </div>
  );
}

// ─── Dialog (focus trap, Esc, labelled) ──────────────────────────────────────────────

export function Dialog({ title, onClose, children, footer }: { title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const node = ref.current!;
    const focusables = () => Array.from(node.querySelectorAll<HTMLElement>('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')).filter((e) => !e.hasAttribute("disabled"));
    (focusables()[0] ?? node).focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); onClose(); }
      if (e.key === "Tab") {
        const f = focusables();
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    node.addEventListener("keydown", onKey);
    return () => { node.removeEventListener("keydown", onKey); prev?.focus?.(); };
  }, [onClose]);
  return (
    <div className="fp-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="fp-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={ref} tabIndex={-1}>
        <div className="fp-row" style={{ marginBottom: 10 }}>
          <h2 id={titleId} className="fp-h1" style={{ fontSize: 15, flex: 1 }}>{title}</h2>
          <Button variant="ghost" icon aria-label="Close dialog" onClick={onClose}><X size={16} /></Button>
        </div>
        <div className="fp-col">{children}</div>
        {footer && <div className="fp-row" style={{ justifyContent: "flex-end", marginTop: 14 }}>{footer}</div>}
      </div>
    </div>
  );
}

/** Dangerous actions: explicit confirmation, optional "type the word" guard. */
export function ConfirmDialog({ title, body, confirmLabel, onConfirm, onClose, requireText }: {
  title: string; body: React.ReactNode; confirmLabel: string; onConfirm: () => void | Promise<void>; onClose: () => void; requireText?: string;
}) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const ok = !requireText || typed === requireText;
  return (
    <Dialog title={title} onClose={onClose} footer={<>
      <Button onClick={onClose}>Cancel</Button>
      <Button variant="danger" busy={busy} disabled={!ok} onClick={async () => { setBusy(true); try { await onConfirm(); } finally { setBusy(false); onClose(); } }}>{confirmLabel}</Button>
    </>}>
      <div className="fp-sub">{body}</div>
      {requireText && <TextInput label={`Type ${requireText} to confirm`} value={typed} onChange={setTyped} autoComplete="off" />}
    </Dialog>
  );
}

// ─── Visuals ─────────────────────────────────────────────────────────────────────────

export function ScoreRing({ value, size = 64, label }: { value: number | null; size?: number; label?: string }) {
  const r = (size - 8) / 2, c = 2 * Math.PI * r;
  const v = value == null ? 0 : Math.max(0, Math.min(100, value));
  const gid = useId();
  return (
    <div style={{ position: "relative", width: size, height: size, flex: "none" }} role="img" aria-label={value == null ? "No score" : `${label ?? "Score"} ${v} percent`}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <defs><linearGradient id={gid} x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#6366f1" /><stop offset="100%" stopColor="#a855f7" /></linearGradient></defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--neutral-soft)" strokeWidth="6" />
        {value != null && <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={`url(#${gid})`} strokeWidth="6" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - v / 100)} style={{ transition: "stroke-dashoffset .6s ease" }} />}
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", fontWeight: 800, fontSize: size * 0.27 }}>{value == null ? "–" : `${v}%`}</div>
    </div>
  );
}

export function Skeleton({ h = 14, w = "100%" }: { h?: number; w?: number | string }) {
  return <div className="fp-skel" style={{ height: h, width: w }} aria-hidden="true" />;
}

// ─── Async helper ───────────────────────────────────────────────────────────────────

export function useAsync<T>(fn: () => Promise<T>, deps: React.DependencyList = []) {
  const [state, setState] = useState<{ data: T | null; error: unknown; loading: boolean }>({ data: null, error: null, loading: true });
  const run = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try { setState({ data: await fn(), error: null, loading: false }); }
    catch (e) { setState({ data: null, error: e, loading: false }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { run(); }, [run]);
  return { ...state, reload: run, setData: (d: T) => setState((s) => ({ ...s, data: d })) };
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}
