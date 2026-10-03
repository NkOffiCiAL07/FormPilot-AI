import { useCallback, useEffect, useState } from "react";
import { AppSettings, DEFAULT_SETTINGS, applyTheme, getSettings, onSettingsChanged, saveSettings } from "../shared/storage";
import { UserProfile, normalizeProfile } from "../shared/types";

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    getSettings().then((s) => { setSettings(s); applyTheme(s.theme); setLoaded(true); });
    return onSettingsChanged((s) => { setSettings(s); applyTheme(s.theme); });
  }, []);
  const update = useCallback(async (patch: Partial<AppSettings>) => {
    const next = await saveSettings(patch);
    setSettings(next); applyTheme(next.theme);
    chrome.runtime.sendMessage({ type: "SETTINGS_CHANGED" }).catch(() => {});
    return next;
  }, []);
  return { settings, update, loaded };
}

export function useProfile() {
  const [profile, setProfile] = useState<UserProfile>(normalizeProfile(null));
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    chrome.storage.local.get("profile", (d) => { setProfile(normalizeProfile(d.profile)); setLoaded(true); });
    const l = (c: Record<string, chrome.storage.StorageChange>, area: string) => { if (area === "local" && c.profile) setProfile(normalizeProfile(c.profile.newValue)); };
    chrome.storage.onChanged.addListener(l);
    return () => chrome.storage.onChanged.removeListener(l);
  }, []);
  const save = useCallback((p: UserProfile) => {
    const next = { ...p, updatedAt: new Date().toISOString() };
    setProfile(next);
    chrome.runtime.sendMessage({ type: "SAVE_PROFILE", payload: next }).catch(() => chrome.storage.local.set({ profile: next }));
  }, []);
  return { profile, save, loaded };
}

export function profileCompleteness(p: UserProfile): number {
  const core = [p.firstName, p.lastName, p.email, p.phone, p.address.city, p.address.country, p.currentCompany, p.currentTitle, p.totalExperience, p.skills.length ? "x" : "", p.education.length ? "x" : ""];
  return Math.round((core.filter(Boolean).length / core.length) * 100);
}
