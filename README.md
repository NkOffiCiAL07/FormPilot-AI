# FormPilot AI

A private, local-first AI assistant for job applications. It runs as a Chrome extension (Manifest V3) plus a small local server, and uses a model running **on your own computer** through [Ollama](https://ollama.com).

> Open an application page → FormPilot detects the form and reads the job → recommends a resume → fills what is certain → drafts answers for open questions → highlights anything uncertain → you review, edit, accept or reject → fill → it's saved to your tracker and the answers you approved become reusable.

FormPilot is **not** an "AI that blindly fills everything":

```
Understand → Suggest → Explain → Review → Fill
```

| Kind of field | What happens |
|---|---|
| Deterministic (name, email, company …) | Matched from your profile with a confidence score and a reason. High confidence fills automatically. |
| Ambiguous / commercial (salary, notice period, sponsorship, relocation) | Filled only after you see it ("Review"). |
| Open-ended ("Why do you want to work here?") | The local model drafts it from *your* profile and resume. You accept, edit or regenerate. Missing facts are flagged, never invented. |
| Personal / legal (gender, ethnicity, disability, veteran status, ID numbers, agreements) | Never filled. You answer these yourself. |

## Privacy and security

* **Everything stays on your machine.** Profile, resumes, answers and history live in a local SQLite file. AI runs in local Ollama. There is no cloud AI provider in the code, and the Ollama URL is rejected unless it is `localhost`.
* The local API binds to `127.0.0.1` only. Requests from web pages (CSRF, DNS rebinding) are rejected by Origin / Host checks; only the extension may call it.
* **Web page content is untrusted.** Job descriptions and field labels are sanitized, fenced as `<untrusted_data>` and the model is told never to follow instructions inside them. Model output is scrubbed of URLs/e-mails that weren't yours, and prompts only receive the minimal profile fields a task needs (never date of birth, street address, salary, phone or e-mail). There are tests with malicious pages.
* Documents are never uploaded anywhere. Uploaded files get random names and a whitelisted extension; previews are served with a sandboxing CSP.
* Destructive actions (clear history, delete answers, reset) need explicit confirmation; imports offer **Merge / Replace / Cancel** and never silently overwrite.

## Architecture

```
Chrome extension (MV3)
├── content script   scan forms (incl. shadow DOM, iframes) · fill / undo · page + job context · hotkeys
├── background (SW)  per-tab state in chrome.storage.session · resolve → enrich (job analysis,
│                    LLM field classification, open-ended answers) · save application · API client
├── popup            Home · Profile · Docs · Applications/Answers · Settings · Onboarding
└── side panel       Review (accept / edit / reject / regenerate / undo) · Job · Cover letter · Interview prep
          │  fetch (extension origin only)
          ▼
Local API  (Node 22+, Express, SQLite)  http://127.0.0.1:3710
├── routes   analyze · jobs · documents · applications · answers · cover-letter · interview-prep · settings · data
├── ai/      AIProvider ─ OllamaProvider · MockProvider    prompts (trust boundary) · tasks · JSON validation
└── services job analysis · explainable match · resume ranking · answer-memory similarity · text extraction
          │
          ▼
Ollama (local)  e.g. llama3.2, qwen3, …
```

Engines (`extension/src/engines`) are pure and unit-tested:

* `formScanner.ts` – gathers many signals per field: label, `aria-label`/`labelledby`, `autocomplete`, name/id/`data-*` hints, placeholder, fieldset legend / radiogroup question, section heading, nearby text, repeated blocks (employment #2 …).
* `fieldRegistry.ts` – the canonical fields and the many ways forms word them (add a field = add one entry).
* `profileResolver.ts` – deterministic matching: whole-word phrase scoring, light fuzzy matching, signal weighting, corroboration, ambiguity penalty → `{ field, value, source, confidence, reason, requiresReview }`.
* `choices.ts` – maps a profile value onto a select/radio option (yes/no, country aliases, experience ranges, degree levels) and adapts it to the input type.
* `autofill.ts` – React/Vue/Angular-safe filling with per-field and bulk undo.

The LLM is used **only** for open-ended questions, for fields the deterministic resolver could not place (and then only to choose from the known field list), and for job/letter/interview tasks.

### Confidence thresholds (configurable in Settings → Fill)

| Confidence | Behaviour |
|---|---|
| ≥ 90 % | filled automatically |
| 70 – 89 % | filled but highlighted for review |
| < 70 % | never filled automatically — shown as a suggestion |

## Install

Requirements: **Node 22.13+** (uses the built-in `node:sqlite`), **Chrome**, and optionally **Ollama**.

### 1. Local API

```bash
cd local-api
npm install
npm start            # http://127.0.0.1:3710   (npm run dev to auto-restart)
```

Data lives in `local-api/data/` (git-ignored): `formpilot.db` and `documents/`.

### 2. Ollama (for AI features — optional)

```bash
# install from https://ollama.com, then pull any model, e.g.
ollama pull llama3.2
```

Leave **Model = Automatic** in Settings → AI to use the first installed model, or pick one. Basic autofill works without Ollama.

### 3. Extension

```bash
cd extension
npm install
npm run build        # outputs extension/dist
```

In Chrome: `chrome://extensions` → enable **Developer mode** → **Load unpacked** → select `extension/dist`. Pin FormPilot, click it, and follow the onboarding.

Keyboard: `Alt+Shift+F` open side panel, `Alt+Shift+S` rescan (change at `chrome://extensions/shortcuts`). Quick-copy hotkeys (type or copy your e-mail, phone, …) are configured in Settings → Keys.

> Upgrading from 0.1? Restart the local API so it picks up the new version. Documents and history saved by the old version are migrated into the local database automatically the first time the popup opens with the API running.

## Development

| Where | Command | What |
|---|---|---|
| `extension` | `npm run dev` | rebuild on change (reload the unpacked extension in Chrome) |
| | `npm run build` | production build (main bundle + self-contained content script) |
| | `npm test` | Vitest + jsdom: scanner, resolver, autofill, review logic, page context, import/export |
| | `npm run lint` | `tsc --noEmit` |
| `local-api` | `npm test` | `node --test`: AI pipeline, prompt-injection, routes, security, migrations |
| | `npm run lint` | syntax-checks every file |
| `e2e` | `npm install && npm test` | **real Chrome** end-to-end (see below) |

### End-to-end test

`e2e/` builds the extension, starts the real local API (own port and temp database), a *fake* Ollama and a sample job page, launches Chrome for Testing with the extension loaded, and checks the whole flow: scan → resolve → AI drafts → fill → undo → resume attach → submit detection → tracker + answer memory, plus screenshots of every screen in light and dark (`e2e/shots/`). The first run downloads Chrome for Testing (branded Chrome ignores `--load-extension`); set `CHROME_PATH` to use your own.

### Database

`local-api/src/db/migrations.js` holds ordered, additive migrations recorded in `schema_migrations` and run in a transaction — never edit a shipped migration, append a new one. Tables: `profile`, `documents`, `resumes`, `applications`, `application_fields`, `answers`, `answer_memory`, `cover_letters`, `interview_sessions`, `settings`, plus the legacy `application_history` (migrated into `applications`).

### AI providers

`ai/provider.js` defines the transport interface (`chat`, `status`, `listModels`). `OllamaProvider` is the default; `MockProvider` is used by tests (`FORMPILOT_MOCK_AI=1` for local experiments). Prompts and result validation live in `ai/prompts.js` / `ai/tasks.js`, so another provider needs no application changes. Typed errors (`OLLAMA_UNAVAILABLE`, `MODEL_UNAVAILABLE`, `TIMEOUT`, `MALFORMED_RESPONSE`) are turned into friendly UI messages; raw details sit behind "Developer details".

### Export format

```json
{ "app": "formpilot-ai", "version": 1, "exportedAt": "…",
  "profile": {}, "preferences": {}, "answers": [], "applications": [],
  "coverLetters": [], "documents": [ { "name": "…", "data": "<base64>" } ] }
```

Import validates the file (JSON, version compatibility, shapes) before touching anything.

## Debugging

* Background logs: `chrome://extensions` → FormPilot → *service worker*. Page logs: DevTools console on the application page (`[FormPilot]`).
* Per-tab analysis state: DevTools on the service worker → `chrome.storage.session.get(null)`.
* API health: `curl -H "Origin: chrome-extension://x" http://127.0.0.1:3710/health`.
* Side panel in a normal tab (for DevTools): `chrome-extension://<id>/sidepanel.html?tab=<tabId>`.
* Ollama checks live in Settings → AI → *Test connection*.

## Project layout

```
extension/src/{background,content,engines,popup,sidebar,shared,ui}   extension/tests
local-api/src/{routes,ai,services,db,middleware}                     local-api/test
e2e/                                                                  real-browser test
```

## Limits worth knowing

* The match percentage compares your stored skills/details with the posting. It is explainable and **not** a hiring prediction.
* Resume text is extracted locally on a best-effort basis (text, DOCX, text-based PDFs). Adding key skills to a resume improves matching.
* Some sites block scripted file attachment; FormPilot then downloads the file and highlights the upload area.
* Closed shadow roots and cross-origin iframes without a content script match cannot be scanned.
