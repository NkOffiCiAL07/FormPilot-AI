import { ExtMessage, FieldResult, FillStats, NormalizedField, PageContext, UserProfile, emptyPageContext, normalizeProfile } from "../shared/types";
import { api, describeError, ApiError, JobAnalysis } from "../shared/api";
import { AppSettings, getSettings, queueOfflineApplication } from "../shared/storage";
import { guessCompany, guessRole, domainOf } from "../shared/jobMeta";
import { resolveAllFields, resolveField, resolveWithDef, buildSummary, Thresholds, questionText } from "../engines/profileResolver";
import { REGISTRY, REGISTRY_KEYS, getDef } from "../engines/fieldRegistry";
import { allTabIds, dropTab, emptyTab, loadTab, saveTab, TabState, withTab } from "./state";

// ─── Helpers ───────────────────────────────────────────────────────────────────────

async function getProfile(): Promise<UserProfile> {
  const d = await chrome.storage.local.get("profile");
  return normalizeProfile(d.profile);
}

function thresholds(s: AppSettings): Thresholds {
  return { auto: s.autoThreshold, review: s.reviewThreshold, autoFillHigh: s.autoFillHigh, reviewMedium: s.reviewMedium };
}

let apiCache: { online: boolean; ts: number } | null = null;
async function apiOnline(force = false): Promise<boolean> {
  if (!force && apiCache && Date.now() - apiCache.ts < 10_000) return apiCache.online;
  try { await api.health(); apiCache = { online: true, ts: Date.now() }; flushOffline(); }
  catch { apiCache = { online: false, ts: Date.now() }; }
  return apiCache.online;
}

import { hasLegacyData, migrateLegacyData } from "../shared/storage";
async function flushOffline() { if (await hasLegacyData()) migrateLegacyData().catch(() => {}); }

const isAiSource = (r: FieldResult) => r.source === "ai_generated" || r.source === "answer_memory" || r.status === "memory";

async function push(tabId: number, st: TabState) {
  await saveTab(tabId, st);
  chrome.action.setBadgeText({ text: st.fields.length ? String(st.fields.length) : "", tabId }).catch(() => {});
  chrome.action.setBadgeBackgroundColor({ color: "#4f6ef7", tabId }).catch(() => {});
  chrome.tabs.sendMessage(tabId, { type: "FIELDS_ANALYZED", payload: { results: st.results } }).catch(() => {});
}

async function broadcast(tabId: number, msg: ExtMessage, frameId?: number): Promise<unknown[]> {
  if (frameId !== undefined) return [await chrome.tabs.sendMessage(tabId, msg, { frameId }).catch(() => undefined)];
  const frames = (await chrome.webNavigation.getAllFrames({ tabId }).catch(() => null)) ?? [{ frameId: 0 }];
  return Promise.all(frames.map((f) => chrome.tabs.sendMessage(tabId, msg, { frameId: f.frameId }).catch(() => undefined)));
}

async function activeTabId(): Promise<number | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id;
}

// ─── Page / job context ──────────────────────────────────────────────────────────────

function jobContext(st: TabState) {
  const j = st.job?.job;
  return {
    company: j?.company || st.page?.company || guessCompany(st.url, st.title),
    role: j?.title || st.page?.role || guessRole(st.title),
    location: j?.location || st.page?.location || "",
    jobDescription: st.page?.description ?? "",
  };
}

// ─── Resolution ────────────────────────────────────────────────────────────────────────

// Recompute deterministic results; keep AI drafts and anything the user already has values for.
function reresolve(st: TabState, profile: UserProfile, th: Thresholds, opts: { keepAi: boolean } = { keepAi: true }): FieldResult[] {
  const byId = new Map(st.results.map((r) => [r.fieldId, r]));
  return st.fields.map((f) => {
    const old = byId.get(f.id);
    if (old && opts.keepAi && isAiSource(old) && (old.value || old.status === "needs_input")) return old;
    if (old && old.source === "ai_classified") {
      const def = old.canonicalKey ? getDef(old.canonicalKey) : undefined;
      if (def) return resolveWithDef(f, def, profile, th, Math.min(old.confidence, 0.75), old.reason, "ai_classified");
    }
    return resolveField(f, profile, th);
  });
}

// ─── Enrichment: job analysis → LLM field classification → open-ended answers ────────────

async function enrich(tabId: number, gen: number, opts: { forceNewAnswers?: boolean; fieldIds?: string[]; notes?: Record<string, string> } = {}) {
  const check = async (): Promise<TabState | null> => {
    const st = await loadTab(tabId);
    return st.generation === gen ? st : null;
  };
  let st = await check();
  if (!st) return;

  const online = await apiOnline();
  if (!online) {
    st.apiOnline = false;
    st.ai = { code: "API_OFFLINE", message: describeError(new ApiError("", "API_OFFLINE")).message };
    st.jobStatus = st.jobStatus === "running" ? "idle" : st.jobStatus;
    st.answersStatus = "idle";
    await push(tabId, st);
    return;
  }
  st.apiOnline = true;
  const profile = await getProfile();
  const settings = await getSettings();
  const th = thresholds(settings);

  // 1 ─ job analysis (deterministic + match + resume recommendation)
  const text = st.page?.description || "";
  if ((text.length > 80 || st.page?.role) && st.jobUrl !== st.url) {
    st.jobStatus = "running"; st.ai = null;
    await push(tabId, st);
    try {
      const ctx = jobContext(st);
      const job: JobAnalysis = await api.jobs.analyze({ title: ctx.role, company: ctx.company, url: st.url, text, profile });
      st = await check(); if (!st) return;
      st.job = job; st.jobUrl = st.url; st.jobStatus = "done";
      if (job.aiError) st.ai = { code: "ERROR", message: job.aiError };
    } catch (e) {
      st = await check(); if (!st) return;
      st.jobStatus = "error";
      const f = describeError(e);
      st.ai = { code: e instanceof ApiError ? e.code : "ERROR", message: f.message, debug: f.debug };
    }
    await push(tabId, st);
  }

  // 2 ─ local LLM classifies fields the deterministic resolver couldn't place (labels only, constrained to known keys)
  const unmatched = st.results.filter((r) => r.source === "no_match" && r.normalizedField.label && !["file", "password"].includes(r.normalizedField.fieldType)).slice(0, 15);
  if (unmatched.length) {
    try {
      const { matches } = await api.analyze.classify({
        fields: unmatched.map((r) => ({ id: r.fieldId, label: r.normalizedField.label, name: r.normalizedField.name, placeholder: r.normalizedField.placeholder, fieldType: r.normalizedField.fieldType, sectionContext: r.normalizedField.sectionContext })),
        keys: REGISTRY_KEYS,
      });
      st = await check(); if (!st) return;
      for (const m of matches) {
        const idx = st.results.findIndex((r) => r.fieldId === m.id);
        const def = getDef(m.key);
        if (idx < 0 || !def) continue;
        st.results[idx] = resolveWithDef(st.results[idx].normalizedField, def, profile, th, m.confidence, "Identified by your local AI from the field text — please verify", "ai_classified");
      }
      await push(tabId, st);
    } catch { /* classification is best-effort */ }
  }

  // 3 ─ open-ended answers
  st = await check(); if (!st) return;
  const targets = st.results.filter((r) => {
    if (opts.fieldIds) return opts.fieldIds.includes(r.fieldId);
    return r.status === "ai" && !r.value && r.source === "ai_pending";
  });
  if (!targets.length) { st.answersStatus = "done"; await push(tabId, st); return; }

  st.answersStatus = "running";
  await push(tabId, st);
  try {
    const ctx = jobContext(st);
    const resumeId = st.resumeId ?? st.job?.recommendedResume?.id ?? null;
    const { results: out, ai } = await api.analyze.answers({
      fields: targets.map((t) => ({ ...t.normalizedField, label: questionText(t.normalizedField) })),
      profile, company: ctx.company, role: ctx.role, jobDescription: ctx.jobDescription, resumeId, forceNew: !!opts.forceNewAnswers, notes: opts.notes,
    });
    st = await check(); if (!st) return;
    for (const o of out) {
      const idx = st.results.findIndex((r) => r.fieldId === o.fieldId);
      if (idx < 0) continue;
      st.results[idx] = { ...st.results[idx], ...(o as FieldResult), normalizedField: st.results[idx].normalizedField, canonicalKey: undefined, requiresReview: true };
    }
    st.answersStatus = ai.ok ? "done" : "error";
    st.ai = ai.ok ? st.ai : { code: ai.code ?? "ERROR", message: ai.error ?? "AI unavailable", debug: ai.debug };
  } catch (e) {
    st = await check(); if (!st) return;
    const f = describeError(e);
    st.answersStatus = "error";
    st.ai = { code: e instanceof ApiError ? e.code : "ERROR", message: f.message, debug: f.debug };
    // never leave a field spinning
    for (const t of targets) {
      const idx = st.results.findIndex((r) => r.fieldId === t.fieldId);
      if (idx >= 0 && st.results[idx].status === "ai" && !st.results[idx].value) {
        st.results[idx] = { ...st.results[idx], status: "needs_input", needsUserInput: true, source: "ai_unavailable", reason: f.title, userPrompt: f.message };
      }
    }
  }
  await push(tabId, st);
}

// ─── Scan handling ─────────────────────────────────────────────────────────────────────

async function onFormScanned(tabId: number, frameId: number, fields: NormalizedField[], tab: chrome.tabs.Tab | undefined) {
  return withTab(tabId, async () => {
    const st = await loadTab(tabId);
    const known = new Set(st.fields.map((f) => f.id));
    const novel = fields.filter((f) => !known.has(f.id));
    st.url = tab?.url || st.url; st.title = tab?.title || st.title;
    if (!novel.length && st.results.length) return;

    const [profile, settings] = [await getProfile(), await getSettings()];
    const th = thresholds(settings);
    st.fields = [...st.fields, ...novel];
    for (const f of novel) st.frames[f.id] = frameId;
    st.results = [...st.results, ...resolveAllFields(novel, profile, th)];
    st.answersStatus = st.results.some((r) => r.status === "ai" && !r.value) ? "running" : st.answersStatus;
    await push(tabId, st);
    if (settings.autoFillOnDetect) {
      const ready = st.results.filter((r) => r.status === "auto" && r.value && novel.some((f) => f.id === r.fieldId));
      if (ready.length) {
        await doFill({ tabId, items: ready.map((r) => ({ fieldId: r.fieldId, value: r.value })),
          accepted: ready.map((r) => ({ fieldId: r.fieldId, value: r.value, label: questionText(r.normalizedField), key: r.canonicalKey, source: r.source, confidence: r.confidence, isAnswer: false })) });
      }
    }
    enrich(tabId, st.generation).catch(() => {});
  });
}

async function onPageContext(tabId: number, ctx: PageContext, tab: chrome.tabs.Tab | undefined) {
  return withTab(tabId, async () => {
    const st = await loadTab(tabId);
    const richer = !st.page || ctx.description.length >= st.page.description.length;
    if (!richer) return;
    const changed = !st.page || st.page.description !== ctx.description || st.page.role !== ctx.role;
    st.page = { ...ctx, url: tab?.url || ctx.url };
    st.url = tab?.url || st.url; st.title = tab?.title || ctx.title;
    await saveTab(tabId, st);
    if (changed && st.fields.length) enrich(tabId, st.generation).catch(() => {});
    else if (changed) await push(tabId, st);
  });
}

async function resetTab(tabId: number, keepResume = false) {
  return withTab(tabId, async () => {
    const old = await loadTab(tabId);
    const st = emptyTab();
    st.generation = old.generation + 1;
    if (keepResume) st.resumeId = old.resumeId;
    await saveTab(tabId, st);
    chrome.action.setBadgeText({ text: "", tabId }).catch(() => {});
  });
}

// ─── Filling, undo, saving ─────────────────────────────────────────────────────────────

interface FillRequest {
  tabId: number;
  items: { fieldId: string; value: string }[];
  accepted: { fieldId: string; value: string; label: string; key?: string; source: string; confidence: number; question?: string; isAnswer: boolean; reusedId?: string }[];
}

async function doFill(req: FillRequest): Promise<FillStats> {
  const st = await loadTab(req.tabId);
  const byFrame = new Map<number, { fieldId: string; value: string; field?: NormalizedField }[]>();
  for (const it of req.items) {
    const field = st.fields.find((f) => f.id === it.fieldId);
    const frame = st.frames[it.fieldId] ?? 0;
    (byFrame.get(frame) ?? byFrame.set(frame, []).get(frame)!).push({ ...it, field });
  }
  const total: FillStats = { success: 0, failed: 0, skipped: 0, filled: [] };
  await Promise.all(Array.from(byFrame.entries()).map(async ([frameId, items]) => {
    const res = (await chrome.tabs.sendMessage(req.tabId, { type: "FILL_FORM", payload: { items } }, { frameId }).catch(() => undefined)) as { stats?: FillStats } | undefined;
    if (!res?.stats) { total.failed += items.length; return; }
    total.success += res.stats.success; total.failed += res.stats.failed; total.skipped += res.stats.skipped; total.filled.push(...res.stats.filled);
  }));
  if (total.success > 0) saveApplication(req, total.filled).catch(() => {});
  return total;
}

// Persist what was filled: application record, per-field values, and approved answers (→ answer memory).
async function saveApplication(req: FillRequest, filledIds: string[], status?: "saved" | "applied") {
  const st = await loadTab(req.tabId);
  if (!st.url) return;
  const ctx = jobContext(st);
  const record = {
    url: st.url, company: ctx.company, role: ctx.role, location: ctx.location, ...(status ? { status } : {}),
    resumeId: st.resumeId ?? st.job?.recommendedResume?.id ?? undefined,
    matchScore: st.job?.match.score ?? undefined, job: st.job?.job,
  };
  if (!(await apiOnline())) { await queueOfflineApplication({ company: record.company, role: record.role, url: st.url, status: status ?? "saved" }); return; }
  const accepted = req.accepted.filter((a) => filledIds.includes(a.fieldId));
  try {
    const { application } = await api.applications.upsert(record as never);
    await api.applications.saveFields(application.id, {
      fields: accepted.filter((a) => !a.isAnswer).map((a) => ({ label: a.label, key: a.key, value: a.value, source: a.source, confidence: a.confidence })),
      answers: accepted.filter((a) => a.isAnswer).map((a) => ({ question: a.question || a.label, answer: a.value, approved: true })),
    });
    for (const a of accepted.filter((x) => x.isAnswer && x.value.trim())) {
      // the user reviewed and accepted this answer → it becomes reusable memory
      await api.answers.save({ question: a.question || a.label, answer: a.value, company: ctx.company, role: ctx.role, approved: true });
      if (a.reusedId) api.answers.markUsed(a.reusedId).catch(() => {});
    }
    st.applicationId = application.id;
    await saveTab(req.tabId, st);
  } catch { /* surfaced next time the user opens the panel */ }
}

async function setApplicationStatus(tabId: number, status: "saved" | "applied") {
  const st = await loadTab(tabId);
  if (!st.url) return;
  const ctx = jobContext(st);
  if (!(await apiOnline())) { await queueOfflineApplication({ company: ctx.company, role: ctx.role, url: st.url, status }); return; }
  const { application } = await api.applications.upsert({
    url: st.url, company: ctx.company, role: ctx.role, location: ctx.location, status,
    resumeId: st.resumeId ?? st.job?.recommendedResume?.id ?? null, matchScore: st.job?.match.score ?? null, job: st.job?.job,
  } as never);
  st.applicationId = application.id;
  await saveTab(tabId, st);
}

// ─── Profile / settings changes ────────────────────────────────────────────────────────

async function reresolveAllTabs() {
  const [profile, settings] = [await getProfile(), await getSettings()];
  const th = thresholds(settings);
  for (const id of await allTabIds()) {
    await withTab(id, async () => {
      const st = await loadTab(id);
      if (!st.fields.length) return;
      st.results = reresolve(st, profile, th);
      await push(id, st);
    });
  }
}

// ─── Message router ──────────────────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message: ExtMessage, sender, sendResponse) => {
  const senderTabId = sender.tab?.id;
  const p = (message.payload ?? {}) as Record<string, any>;

  (async () => {
    const tabId: number | undefined = p.tabId ?? senderTabId ?? (["SCAN_FORM", "REANALYZE", "OPEN_SIDEPANEL", "FILL_FORM", "UNDO_FILL", "SCROLL_TO_FIELD", "CLICK_FILE_INPUT", "HIGHLIGHT_UPLOAD_AREA", "SET_RESUME", "REGENERATE_FIELD", "SAVE_APPLICATION", "SET_JOB_TEXT", "ATTACH_FILE"].includes(message.type) ? await activeTabId() : undefined);

    switch (message.type) {
      case "FORM_SCANNED":
        if (senderTabId !== undefined && Array.isArray(p.fields) && p.fields.length) await onFormScanned(senderTabId, sender.frameId ?? 0, p.fields, sender.tab);
        sendResponse({ ok: true });
        break;

      case "PAGE_CONTEXT":
        if (senderTabId !== undefined && p.context) await onPageContext(senderTabId, p.context, sender.tab);
        sendResponse({ ok: true });
        break;

      case "SCAN_FORM":
        if (tabId !== undefined) await broadcast(tabId, { type: "SCAN_FORM" });
        sendResponse({ ok: true });
        break;

      case "REANALYZE": {
        if (tabId === undefined) break;
        const gen = await withTab(tabId, async () => {
          const st = await loadTab(tabId);
          const [profile, settings] = [await getProfile(), await getSettings()];
          st.generation++; st.jobUrl = ""; st.job = null; st.ai = null;
          st.results = resolveAllFields(st.fields, profile, thresholds(settings));
          await push(tabId, st);
          return st.generation;
        });
        sendResponse({ ok: true });
        enrich(tabId, gen).catch(() => {});
        await broadcast(tabId, { type: "SCAN_FORM" });
        break;
      }

      case "REGENERATE_FIELD": {
        if (tabId === undefined || !p.fieldId) break;
        const gen = await withTab(tabId, async () => {
          const st = await loadTab(tabId);
          const i = st.results.findIndex((r) => r.fieldId === p.fieldId);
          if (i >= 0) st.results[i] = { ...st.results[i], status: "ai", value: "", source: "ai_pending", reason: "Writing a new draft…", reused: undefined };
          await push(tabId, st);
          return st.generation;
        });
        sendResponse({ ok: true });
        enrich(tabId, gen, { forceNewAnswers: true, fieldIds: [p.fieldId], notes: p.notes ? { [p.fieldId]: String(p.notes) } : undefined }).catch(() => {});
        break;
      }

      case "SET_JOB_TEXT": {
        if (tabId === undefined) break;
        const gen = await withTab(tabId, async () => {
          const st = await loadTab(tabId);
          st.page = { ...(st.page ?? { ...emptyPageContext, url: st.url, title: st.title }), description: String(p.text ?? "").slice(0, 12000), hasJobPosting: true };
          st.jobUrl = ""; st.job = null;
          await push(tabId, st);
          return st.generation;
        });
        sendResponse({ ok: true });
        enrich(tabId, gen).catch(() => {});
        break;
      }

      case "ATTACH_FILE": {
        // fetch the file from the local API here (extension context) and hand the bytes to the page's frame
        if (tabId === undefined) break;
        try {
          const st = await loadTab(tabId);
          const blob = await api.documents.blob(p.docId);
          const buf = new Uint8Array(await blob.arrayBuffer());
          let bin = ""; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
          const res = (await chrome.tabs.sendMessage(tabId, { type: "ATTACH_FILE", payload: { fieldId: p.fieldId, name: p.name, mime: blob.type || p.mime, base64: btoa(bin) } }, { frameId: st.frames[p.fieldId] ?? 0 }).catch(() => undefined)) as { ok?: boolean } | undefined;
          sendResponse({ ok: !!res?.ok });
        } catch { sendResponse({ ok: false }); }
        break;
      }

      case "SET_RESUME":
        if (tabId !== undefined) await withTab(tabId, async () => { const st = await loadTab(tabId); st.resumeId = p.resumeId ?? null; await saveTab(tabId, st); });
        sendResponse({ ok: true });
        break;

      case "FILL_FORM":
        sendResponse({ stats: tabId !== undefined ? await doFill({ tabId, items: p.items ?? [], accepted: p.accepted ?? [] }) : null });
        break;

      case "UNDO_FILL": {
        if (tabId === undefined) break;
        const res = (await broadcast(tabId, { type: "UNDO_FILL", payload: { fieldIds: p.fieldIds } })) as ({ undone?: number } | undefined)[];
        sendResponse({ undone: res.reduce((n, r) => n + (r?.undone ?? 0), 0) });
        break;
      }

      case "FORM_SUBMITTED":
        if (senderTabId !== undefined) await setApplicationStatus(senderTabId, "applied").catch(() => {});
        sendResponse({ ok: true });
        break;

      case "SAVE_APPLICATION":
        if (tabId !== undefined) await setApplicationStatus(tabId, p.status === "applied" ? "applied" : "saved").catch(() => {});
        sendResponse({ ok: true });
        break;

      case "GET_PROFILE":
        sendResponse({ profile: await getProfile() });
        break;

      case "SAVE_PROFILE": {
        const profile = normalizeProfile(p as Partial<UserProfile>);
        await chrome.storage.local.set({ profile });
        api.profile.save(profile).catch(() => {});
        await reresolveAllTabs();
        sendResponse({ ok: true });
        break;
      }

      case "SETTINGS_CHANGED":
        await reresolveAllTabs();
        sendResponse({ ok: true });
        break;

      case "API_STATUS":
        sendResponse({ online: await apiOnline(true) });
        break;

      case "OPEN_SIDEPANEL":
        if (tabId === undefined) { sendResponse({ error: "no tab" }); break; }
        await openSidePanel(tabId);
        sendResponse({ ok: true });
        break;

      case "CLICK_FILE_INPUT":
      case "SCROLL_TO_FIELD":
      case "HIGHLIGHT_UPLOAD_AREA": {
        if (tabId === undefined) break;
        const st = await loadTab(tabId);
        sendResponse({ ok: true });
        await broadcast(tabId, { type: message.type, payload: { fieldId: p.fieldId } }, st.frames[p.fieldId]);
        break;
      }

      default:
        sendResponse({ error: "unknown" });
    }
  })().catch((e) => { console.error("[FormPilot]", e); try { sendResponse({ error: String(e?.message ?? e) }); } catch { /* already responded */ } });

  return true;
});

async function openSidePanel(tabId: number) {
  try {
    await chrome.sidePanel.setOptions({ tabId, path: "sidepanel.html", enabled: true });
    await chrome.sidePanel.open({ tabId });
  } catch (e) { console.error("[FormPilot] Side panel error:", e); }
}

// ─── Lifecycle ─────────────────────────────────────────────────────────────────────────

chrome.tabs.onRemoved.addListener((tabId) => { dropTab(tabId); });

// A new page (or reload) in the tab invalidates the scan.
chrome.webNavigation.onCommitted.addListener((d) => { if (d.frameId === 0) resetTab(d.tabId, true).catch(() => {}); });

// SPA route changes: only reset when the path really changed
chrome.webNavigation.onHistoryStateUpdated.addListener(async (d) => {
  if (d.frameId !== 0) return;
  const st = await loadTab(d.tabId);
  try {
    if (st.url && new URL(st.url).pathname !== new URL(d.url).pathname) await resetTab(d.tabId, true);
  } catch { /* ignore */ }
});

chrome.action.onClicked.addListener(async (tab) => { if (tab.id) await openSidePanel(tab.id); });

// Keyboard shortcuts declared in manifest "commands"
chrome.commands?.onCommand.addListener(async (command) => {
  const tabId = await activeTabId();
  if (tabId === undefined) return;
  if (command === "open-side-panel") await openSidePanel(tabId);
  if (command === "scan-form") await broadcast(tabId, { type: "SCAN_FORM" });
});

chrome.runtime.onInstalled.addListener(() => { flushOffline(); });
