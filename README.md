# FormPilot AI

AI-powered universal form-filling Chrome extension. Fill any web form intelligently using your local profile — job applications, scholarship forms, rental applications, government forms, and more.

## Architecture

```
Chrome Extension (MV3)
    │
    ├── Content Script — Universal Form Scanner + Autofill Engine
    ├── Background Service Worker — Orchestration + Profile
    ├── Popup — Profile management + Dashboard
    └── Side Panel — Review & fill UI
         │
         ▼
Local API (Node.js + Express + SQLite) — http://127.0.0.1:3710
    │
    └── Ollama (local LLM) — AI answer generation
```

## Features

- **Universal form scanner** — works on any website, not just specific ATS platforms
- **Semantic field understanding** — maps "Present Employer", "Current Organization", "Employer Name" all to the same profile field
- **Confidence scoring** — auto-fills high-confidence fields, asks for low-confidence ones
- **AI answer generation** — generates personalized answers for open-ended questions via Ollama
- **Local-first & private** — profile and documents stored locally, nothing sent to the cloud
- **Document manager** — store multiple resumes and let AI pick the best one per job
- **Answer memory** — reuses and adapts previous answers for similar questions

## Setup

### 1. Local API

```bash
cd local-api
npm install
npm start
```

The API runs on `http://127.0.0.1:3710` — accessible only from localhost.

### 2. Ollama (for AI features)

```bash
# Install Ollama: https://ollama.ai
ollama pull llama3.2
```

### 3. Chrome Extension

```bash
cd extension
npm install
npm run build
```

Then in Chrome:
1. Go to `chrome://extensions`
2. Enable **Developer Mode**
3. Click **Load unpacked**
4. Select the `extension/dist` folder

## Phase Roadmap

| Phase | Status | Features |
|-------|--------|----------|
| 1 | ✅ Done | MV3 scaffold, profile, form scanner, deterministic autofill |
| 2 | 🔄 Next | Ollama integration, semantic AI classification, confidence scoring |
| 3 | 📋 Planned | Document library, resume selection, file upload |
| 4 | 📋 Planned | Multi-step forms, answer memory, application history |
| 5 | 📋 Planned | Testing across Workday, Greenhouse, Lever, Ashby, university forms |

## Privacy

- All profile data stored in Chrome's local storage
- Documents stored in `local-api/data/documents/` on your machine
- Local API only accepts connections from `chrome-extension://` origins
- AI queries send only the relevant field context — not the entire page
- No telemetry, no cloud sync, no external servers in the MVP
