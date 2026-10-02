// CSS.escape with a minimal fallback for environments that lack it (jsdom).
export function cssEscape(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(value);
  return String(value).replace(/[^a-zA-Z0-9_ -￿-]/g, (c) => `\\${c}`).replace(/^(-?)(\d)/, "$1\\3$2 ");
}
