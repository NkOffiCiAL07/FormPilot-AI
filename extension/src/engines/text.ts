// Text normalisation + fuzzy matching helpers shared by the scanner and resolver.

const FILLER = new Set(["your", "the", "please", "enter", "provide", "what", "is", "are", "you", "a", "an", "of", "do", "does", "have", "type", "input", "select", "choose", "required", "optional", "mandatory", "my"]);

// "firstName_1" → "first Name 1"
export function splitIdentifier(s: string): string {
  return s.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_\-.:[\]/]+/g, " ");
}

export function normalize(s: string): string {
  return splitIdentifier(String(s ?? ""))
    .toLowerCase()
    .replace(/[*?!:()[\]{}<>"'`´’|\\/,;]+/g, " ")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9À-ɏ+#. ]+/g, " ")
    .replace(/\.(?=\s|$)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenize(s: string): string[] {
  return normalize(s).split(" ").filter(Boolean);
}

export function stripFiller(tokens: string[]): string[] {
  const out = tokens.filter((t) => !FILLER.has(t));
  return out.length ? out : tokens;
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

// Tolerate typos in longer words ("adress", "pohne" is too far; "linkdin" is fine)
export function tokenEq(a: string, b: string): boolean {
  if (a === b) return true;
  const max = Math.max(a.length, b.length);
  // Typos are rarely in the first letter, and short words ("state"/"estate") are too easily confused.
  if (Math.min(a.length, b.length) < 6 || a[0] !== b[0]) return false;
  return levenshtein(a, b) <= (max >= 9 ? 2 : 1);
}

export interface PhraseScore { score: number; kind: "exact" | "contained" | "fuzzy" | "unordered" | "none" }

// How well does `phrase` describe `signal`? 1 = the signal is the phrase; lower = weaker evidence.
export function matchPhrase(signalTokens: string[], phraseTokens: string[]): PhraseScore {
  if (!signalTokens.length || !phraseTokens.length) return { score: 0, kind: "none" };
  const S = stripFiller(signalTokens);
  const P = phraseTokens;
  const n = P.length;

  const find = (eq: (a: string, b: string) => boolean): number => {
    for (let i = 0; i + n <= S.length; i++) {
      let ok = true;
      for (let j = 0; j < n; j++) if (!eq(S[i + j], P[j])) { ok = false; break; }
      if (ok) return i;
    }
    return -1;
  };

  if (S.length === n) {
    if (find((a, b) => a === b) === 0) return { score: 1, kind: "exact" };
    if (find(tokenEq) === 0) return { score: 0.85, kind: "fuzzy" };
  }
  if (find((a, b) => a === b) >= 0) {
    // A lone generic word inside a longer text is weak evidence ("name" in "company name")
    if (n === 1 && P[0].length < 5) return { score: 0.62, kind: "contained" };
    return { score: 0.78 + 0.2 * (n / S.length), kind: "contained" };
  }
  if (find(tokenEq) >= 0) return { score: 0.66 + 0.15 * (n / S.length), kind: "fuzzy" };
  if (n > 1 && P.every((p) => S.some((s) => s === p))) return { score: 0.6, kind: "unordered" };
  return { score: 0, kind: "none" };
}

export function hasWord(text: string, word: string): boolean {
  return tokenize(text).includes(word);
}

export function containsPhrase(text: string, phrase: string): boolean {
  const k = matchPhrase(tokenize(text), tokenize(phrase)).kind;
  return k === "contained" || k === "exact";
}
