// Extracts job/page context for the side panel. EVERYTHING returned here is untrusted page content:
// it is trimmed and later only pattern-matched locally or passed to the local API inside fenced data blocks.

import { PageContext, emptyPageContext } from "../shared/types";
import { guessCompany, guessRole } from "../shared/jobMeta";

const MAX_DESC = 12000;
const JOB_WORDS = /responsibilit|requirement|qualification|experience|skills|what you.?ll|about the (role|job)|nice to have|benefits/i;

function htmlToText(html: string): string {
  const d = document.implementation.createHTMLDocument("");
  d.body.innerHTML = html;
  d.querySelectorAll("li").forEach((li) => li.insertAdjacentText("afterbegin", "- "));
  d.querySelectorAll("p,div,br,li,h1,h2,h3,h4,tr").forEach((n) => n.insertAdjacentText("beforeend", "\n"));
  return (d.body.textContent ?? "").replace(/[ \t]+/g, " ").replace(/\n\s*\n\s*\n+/g, "\n\n").trim();
}

type Json = Record<string, unknown>;
function flattenLd(node: unknown, out: Json[] = []): Json[] {
  if (Array.isArray(node)) node.forEach((n) => flattenLd(n, out));
  else if (node && typeof node === "object") {
    out.push(node as Json);
    const g = (node as Json)["@graph"];
    if (g) flattenLd(g, out);
  }
  return out;
}

const isType = (n: Json, t: string) => ([] as unknown[]).concat(n["@type"] ?? []).some((x) => String(x).toLowerCase() === t);
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

function fromJsonLd(): Partial<PageContext> | null {
  for (const s of Array.from(document.querySelectorAll('script[type="application/ld+json"]'))) {
    let data: unknown;
    try { data = JSON.parse(s.textContent || ""); } catch { continue; }
    const job = flattenLd(data).find((n) => isType(n, "jobposting"));
    if (!job) continue;
    const org = job.hiringOrganization as Json | string | undefined;
    const loc = ([] as Json[]).concat((job.jobLocation as Json | Json[]) ?? [])[0];
    const addr = (loc?.address ?? {}) as Json;
    const location = [str(addr.addressLocality), str(addr.addressRegion), str(addr.addressCountry) || str((addr.addressCountry as Json | undefined)?.name)]
      .filter(Boolean).join(", ") || (str(job.jobLocationType).toUpperCase() === "TELECOMMUTE" ? "Remote" : "");
    return {
      role: str(job.title),
      company: typeof org === "string" ? org.trim() : str(org?.name),
      location,
      description: htmlToText(str(job.description)).slice(0, MAX_DESC),
      hasJobPosting: true,
    };
  }
  return null;
}

function fromDom(): string {
  const candidates = Array.from(document.querySelectorAll<HTMLElement>(
    "#job-description,.job-description,[class*='job-description' i],[class*='jobdescription' i],[data-automation-id*='jobPostingDescription'],[class*='posting' i],main,[role=main],article",
  ));
  let best = "";
  for (const c of candidates) {
    const t = (c.innerText || "").trim();
    if (t.length > best.length && t.length > 300 && JOB_WORDS.test(t) && c.querySelectorAll("input,select,textarea").length < 25) best = t;
  }
  return best.replace(/\n{3,}/g, "\n\n").slice(0, MAX_DESC);
}

export function extractPageContext(topUrl = location.href, topTitle = document.title): PageContext {
  const ld = fromJsonLd();
  const h1 = document.querySelector("h1")?.textContent?.trim() ?? "";
  const site = document.querySelector<HTMLMetaElement>('meta[property="og:site_name"]')?.content?.trim() ?? "";
  const ogTitle = document.querySelector<HTMLMetaElement>('meta[property="og:title"]')?.content?.trim() ?? "";
  const description = ld?.description || fromDom();
  const title = ogTitle || topTitle;
  return {
    ...emptyPageContext,
    url: topUrl,
    title: topTitle,
    role: ld?.role || (h1 && h1.length < 120 ? h1 : guessRole(title)),
    company: ld?.company || site || guessCompany(topUrl, title),
    location: ld?.location || "",
    description,
    hasJobPosting: !!ld?.hasJobPosting || description.length > 300,
  };
}
