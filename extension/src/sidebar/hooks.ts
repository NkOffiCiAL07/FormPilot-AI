import { useCallback, useEffect, useState } from "react";
import type { TabState } from "../background/state";
import type { Decisions } from "./review";

/** The tab the user is looking at (the side panel is shared across the window's tabs). */
export function useActiveTab(): number | null {
  const [id, setId] = useState<number | null>(null);
  useEffect(() => {
    // ?tab=<id> pins the panel to one tab (handy for debugging / opening the panel in its own tab)
    const pinned = Number(new URLSearchParams(location.search).get("tab"));
    if (pinned) { setId(pinned); return; }
    const refresh = () => chrome.tabs.query({ active: true, currentWindow: true }, ([t]) => setId(t?.id ?? null));
    refresh();
    chrome.tabs.onActivated.addListener(refresh);
    chrome.tabs.onUpdated.addListener(refresh);
    chrome.windows?.onFocusChanged.addListener(refresh);
    return () => { chrome.tabs.onActivated.removeListener(refresh); chrome.tabs.onUpdated.removeListener(refresh); chrome.windows?.onFocusChanged.removeListener(refresh); };
  }, []);
  return id;
}

export function useTabState(tabId: number | null): { state: TabState | null; loaded: boolean } {
  const [state, setState] = useState<TabState | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (tabId === null) return;
    setLoaded(false);
    const key = `tab_${tabId}`;
    chrome.storage.session.get(key, (d) => { setState((d[key] as TabState) ?? null); setLoaded(true); });
    const l = (c: Record<string, chrome.storage.StorageChange>, area: string) => { if (area === "session" && c[key]) setState((c[key].newValue as TabState) ?? null); };
    chrome.storage.onChanged.addListener(l);
    return () => chrome.storage.onChanged.removeListener(l);
  }, [tabId]);
  return { state, loaded };
}

/** Accept / reject / edit decisions survive closing and reopening the panel. */
export function useDecisions(tabId: number | null, url: string | undefined) {
  const [decisions, setDecisions] = useState<Decisions>({});
  const key = tabId === null ? null : `ui_${tabId}`;
  useEffect(() => {
    if (!key) return;
    chrome.storage.session.get(key, (d) => {
      const saved = d[key] as { url: string; decisions: Decisions } | undefined;
      setDecisions(saved && saved.url === url ? saved.decisions : {});
    });
  }, [key, url]);
  const persist = useCallback((next: Decisions) => { if (key) chrome.storage.session.set({ [key]: { url, decisions: next } }); }, [key, url]);
  const patch = useCallback((fieldId: string, p: Partial<Decisions[string]>) => {
    setDecisions((cur) => { const next = { ...cur, [fieldId]: { ...cur[fieldId], ...p } }; persist(next); return next; });
  }, [persist]);
  const clear = useCallback((fieldIds?: string[]) => {
    setDecisions((cur) => { const next = fieldIds ? Object.fromEntries(Object.entries(cur).filter(([k]) => !fieldIds.includes(k))) : {}; persist(next); return next; });
  }, [persist]);
  const set = useCallback((next: Decisions) => { setDecisions(next); persist(next); }, [persist]);
  return { decisions, patch, clear, set };
}

export const send = <T = unknown>(type: string, payload?: Record<string, unknown>): Promise<T> =>
  new Promise((resolve) => chrome.runtime.sendMessage({ type, payload }, (res) => resolve(res as T)));
