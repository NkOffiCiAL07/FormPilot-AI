// Quick Copy: frequently pasted profile values, usable from the popup and from global hotkeys.

import { NormalizedField, UserProfile } from "./types";
import { getDef } from "../engines/fieldRegistry";

export interface QuickItem { key: string; label: string }

export const QUICK_ITEMS: QuickItem[] = [
  { key: "fullName", label: "Full name" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "address", label: "Address" },
  { key: "linkedin", label: "LinkedIn" },
  { key: "github", label: "GitHub" },
  { key: "portfolio", label: "Portfolio" },
  { key: "currentCompany", label: "Current company" },
  { key: "currentTitle", label: "Job title" },
  { key: "expectedSalary", label: "Expected salary" },
  { key: "noticePeriod", label: "Notice period" },
  { key: "summary", label: "Summary" },
];

export function quickValue(profile: UserProfile, key: string): string {
  if (key === "address") {
    const a = profile.address;
    return [a.street, a.city, a.state, a.zip, a.country].filter(Boolean).join(", ");
  }
  return getDef(key)?.get(profile, {} as NormalizedField)?.trim() ?? "";
}

// "Alt+Shift+E" ⇄ KeyboardEvent
export function comboOf(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey) parts.push("Ctrl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  if (e.metaKey) parts.push("Meta");
  const k = e.code.startsWith("Key") ? e.code.slice(3) : e.code.startsWith("Digit") ? e.code.slice(5) : e.key.length === 1 ? e.key.toUpperCase() : e.key;
  if (!["Control", "Alt", "Shift", "Meta"].includes(e.key)) parts.push(k);
  return parts.join("+");
}

// A usable global combo needs a modifier (so it never fires while typing normally).
export const isValidCombo = (c: string) => /^(?:(?:Ctrl|Alt|Meta|Shift)\+)+[A-Z0-9]$/.test(c) && /(Ctrl|Alt|Meta)\+/.test(c);
