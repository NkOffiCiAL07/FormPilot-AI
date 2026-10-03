// Guessing company / role from a URL + page title. Pure functions (no DOM) so they're easy to test.

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

export function domainOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}

const ATS_HOSTS = /(greenhouse\.io|lever\.co|workday|myworkdayjobs|ashbyhq|smartrecruiters|icims|taleo|bamboohr|jobvite|breezy|workable|rippling|recruitee|teamtailor|linkedin|indeed|glassdoor|naukri|wellfound|angel\.co)/i;

export function guessCompany(url: string, title: string): string {
  try {
    const host = domainOf(url);
    let m = url.match(/(?:boards|job-boards)\.greenhouse\.io\/([^/?#]+)/i) || url.match(/lever\.co\/([^/?#]+)/i)
      || url.match(/ashbyhq\.com\/([^/?#]+)/i) || url.match(/smartrecruiters\.com\/([^/?#]+)/i) || url.match(/workable\.com\/([^/?#]+)/i);
    if (m) return cap(decodeURIComponent(m[1]).replace(/[-_]/g, " "));
    if (/myworkdayjobs\.com|\.workday\.com/.test(host)) return cap(host.split(".")[0]);
    if (/\.(rippling|bamboohr|jobvite|breezy|recruitee|teamtailor)\./.test(host)) return cap(host.split(".")[0]);
    const at = title.match(/\s(?:at|@)\s(.+?)(?:\s[-|–—]|$)/i);
    if (at) return at[1].trim();
    const parts = title.split(/\s[|–—-]\s/).map((s) => s.trim()).filter(Boolean);
    if (parts.length > 1 && !ATS_HOSTS.test(host)) return parts[parts.length - 1];
    if (!ATS_HOSTS.test(host)) return cap(host.split(".")[0]);
  } catch { /* fall through */ }
  return "";
}

export function guessRole(title: string): string {
  return (title || "")
    .replace(/\s(?:at|@)\s.*$/i, "")
    .replace(/\s[|–—-]\s.*$/, "")
    .replace(/^(?:job application|apply(?: now)?)(?:\s*(?:for|[:–—-]))?\s*/i, "")
    .trim() || title;
}
