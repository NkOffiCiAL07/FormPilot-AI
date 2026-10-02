// Turning a profile value into the right option of a <select> / radio group, and adapting
// values to the input type they're going into.

import { SelectOption } from "../shared/types";
import { normalize, tokenize, tokenEq } from "./text";
import { Kind } from "./fieldRegistry";

export interface OptionPick {
  value: string;
  label: string;
  /** How close the match was, 0–1. Multiplied into the field confidence. */
  quality: number;
  how: string;
}

const ALIASES: string[][] = [
  ["usa", "us", "u s", "u s a", "united states", "united states of america", "america"],
  ["uk", "u k", "united kingdom", "great britain", "gb", "britain", "england"],
  ["india", "in", "bharat"],
  ["uae", "united arab emirates"],
  ["canada", "ca"],
  ["germany", "de", "deutschland"],
  ["australia", "au"],
  ["singapore", "sg"],
];

function aliasGroup(n: string): number {
  return ALIASES.findIndex((g) => g.includes(n));
}

const YES = /^(yes|y|true|yeah|sure|i am|i do|i will|i have|i can|i would|affirmative)\b/;
const NO = /^(no|n|false|nope|i am not|i do not|i don t|i will not|i won t|i have not|i cannot|i can t|not)\b/;

export function yesNoOf(label: string): "yes" | "no" | null {
  const n = normalize(label);
  if (NO.test(n)) return "no";
  if (YES.test(n)) return "yes";
  return null;
}

const levelOf = (t: string): number => {
  const n = normalize(t);
  if (/\b(phd|ph d|doctorate|doctoral)\b/.test(n)) return 5;
  if (/\b(master|masters|msc|m sc|mtech|m tech|mba|ms|m s|m e|post ?graduate)\b/.test(n)) return 4;
  if (/\b(bachelor|bachelors|btech|b tech|bsc|b sc|be|b e|bs|b s|undergraduate|graduate)\b/.test(n)) return 3;
  if (/\b(associate|diploma)\b/.test(n)) return 2;
  if (/\b(high school|secondary|12th|10th|hsc|ssc)\b/.test(n)) return 1;
  return 0;
};

function yearsIn(text: string): number | null {
  const m = text.match(/(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : null;
}

// "3-5 years", "5+", "less than 2", "more than 10" → does `years` fall in this option?
function rangeContains(label: string, years: number): boolean {
  const l = label.toLowerCase();
  const nums = (l.match(/\d+(?:\.\d+)?/g) || []).map(Number);
  if (!nums.length) return /fresher|entry|no experience/.test(l) && years < 1;
  if (/less than|under|below|<|up to|upto|fewer/.test(l)) return years < nums[0];
  if (/more than|over|above|>|\+|plus|at least|or more|and above/.test(l)) return years >= nums[0];
  if (nums.length >= 2) return years >= nums[0] && years <= nums[1];
  return Math.floor(years) === nums[0];
}

export function pickOption(options: SelectOption[], desired: string, kind: Kind, key?: string): OptionPick | null {
  const opts = options.filter((o) => o.value !== "" || o.label);
  if (!opts.length || !desired) return null;
  const mk = (o: SelectOption, quality: number, how: string): OptionPick => ({ value: o.value, label: o.label, quality, how });

  if (kind === "yesno") {
    const want = desired.toLowerCase().startsWith("y") ? "yes" : "no";
    const hit = opts.find((o) => yesNoOf(o.label) === want || yesNoOf(o.value) === want);
    return hit ? mk(hit, 1, "yes/no") : null;
  }

  const dn = normalize(desired);

  if (key === "totalExperience") {
    const y = yearsIn(desired);
    if (y != null) {
      const hit = opts.find((o) => rangeContains(o.label, y));
      if (hit) return mk(hit, 0.95, "experience range");
    }
  }

  // exact on value or label
  for (const o of opts) if (normalize(o.label) === dn || normalize(o.value) === dn) return mk(o, 1, "exact");

  // aliases (countries)
  const g = aliasGroup(dn);
  if (g >= 0) {
    const hit = opts.find((o) => ALIASES[g].includes(normalize(o.label)) || ALIASES[g].includes(normalize(o.value)));
    if (hit) return mk(hit, 0.97, "alias");
  }

  // degree level buckets
  if (key === "degree") {
    const want = levelOf(desired);
    if (want) {
      const hit = opts.find((o) => levelOf(o.label) === want);
      if (hit) return mk(hit, 0.85, "degree level");
    }
  }

  const dt = tokenize(desired);
  // label starts with / contains the value (or vice versa) on token boundaries
  let best: { o: SelectOption; q: number } | null = null;
  for (const o of opts) {
    const ot = tokenize(o.label);
    if (!ot.length) continue;
    const sub = (a: string[], b: string[]) => a.length > 0 && b.some((_, i) => a.every((t, j) => b[i + j] === t));
    let q = 0;
    if (sub(dt, ot)) q = 0.9 - Math.min(0.2, (ot.length - dt.length) * 0.03);
    else if (sub(ot, dt)) q = 0.85 - Math.min(0.2, (dt.length - ot.length) * 0.03);
    else if (dt.length === ot.length && dt.every((t, i) => tokenEq(t, ot[i]))) q = 0.8;
    if (q > (best?.q ?? 0)) best = { o, q };
  }
  return best ? mk(best.o, best.q, "partial") : null;
}

// ── Value adaptation by input type ────────────────────────────────────────

function toIsoDate(raw: string): string | null {
  const t = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  let m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) {
    // dd/mm/yyyy unless the first part can't be a day
    const [a, b] = [Number(m[1]), Number(m[2])];
    const [day, month] = a > 12 ? [a, b] : b > 12 ? [b, a] : [a, b];
    return `${m[3]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  m = t.match(/^(\d{4})-(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-01`;
  m = t.match(/^(\d{4})$/);
  if (m) return `${m[1]}-06-01`;
  const d = new Date(t);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

export function adaptValue(key: string, kind: Kind, raw: string, inputType: string, hint: string): string {
  const v = raw.trim();
  if (!v) return v;
  if (inputType === "number") {
    const n = v.match(/\d+(?:\.\d+)?/);
    return n ? n[0] : "";
  }
  if (inputType === "date" || inputType === "month") {
    const iso = toIsoDate(v);
    if (!iso) return "";
    return inputType === "month" ? iso.slice(0, 7) : iso;
  }
  if (key === "graduationYear" && /year/.test(hint) && !/date|month/.test(hint)) {
    const y = v.match(/\d{4}/);
    if (y) return y[0];
  }
  if (key === "totalExperience" && /^\s*\d/.test(hint)) {
    const n = v.match(/\d+(?:\.\d+)?/);
    if (n) return n[0];
  }
  if (kind === "url" && inputType === "url" && !/^https?:\/\//i.test(v)) return `https://${v}`;
  return v;
}
