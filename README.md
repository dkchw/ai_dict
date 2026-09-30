# AI Dict

AI Dict is an **AI-powered dictionary, language learning, and translation workbench** engineered for deep, contextual, and durable language study. It bridges state-of-the-art Large Language Models (LLMs) and high-speed local offline Machine Translation (NLLB-200) into a unified, local-first application — giving you an interactive language tutor, dictionary, and flashcard review system that grows with your personal learning journey.

Unlike traditional static dictionaries, AI Dict operates on a **dual-track architecture**:
1. **Instant Offline Machine Translation:** Powered by Meta's NLLB-200 running locally on your CPU via CTranslate2 — sub-second, zero-cost, completely offline translation across 200+ languages.
2. **Deep LLM Inquiry:** Powered by leading AI models (Claude 3.5/3.7, DeepSeek R1/V3, GPT-4o, or local Ollama) — exhaustive etymology, cultural register, grammar breakdowns, and multi-turn follow-up conversations.

All data is stored locally in your private SQLite database. Zero telemetry. Zero accounts. Zero cloud lock-in.

---

## ✨ Feature Matrix

| Mode / Feature | Description | Engine / Model |
|---|---|---|
| **Intelligent Word Search** | Deep, contextual word explanations: etymology, connotations, collocations, CEFR levels, and example sentences. | OpenRouter LLM / Ollama |
| **Word Comparison** | Compare 2+ words side-by-side to understand nuanced differences in tone, formality, and usage constraints. | OpenRouter LLM / Ollama |
| **Text Explanation** | Paste complex sentences or literary excerpts for full grammatical breakdowns, idioms, and syntax parsing. | OpenRouter LLM / Ollama |
| **Conceptual Translation** | Nuanced, culturally accurate translations explaining tone, idioms, and contextual alternatives. | OpenRouter LLM / Ollama |
| **Offline Machine Translation** | Instant dual-box MT (Google Translate style). Fast, free, runs on CPU, fully offline. Editable translations with auto-save. | CTranslate2 + NLLB-200 (int8) |
| **Quick LLM (Ling Flash)** | Instant, focused linguistic lookup through interchangeable analytical lenses (Grammar, Nuance, ELI5, TL;DR, Dialogues, Socratic). | OpenRouter LLM / Ollama |
| **Spaced Repetition Flashcards** | Review vocabulary decks with active recall. 1-col/2-col layouts, instant vs. 3D flip animations, fullscreen mode, keyboard controls. | Native React UI + SQLite |
| **Text Correction & Polish** | Proofread and edit text with detailed grammatical explanations, style suggestions, and translation comparisons. | OpenRouter LLM / Ollama |
| **Browser Extension (MV3)** | Definer replacement. Instant text selection bubble, double-click lookup, YouTube/Netflix subtitle piercing, and 1-click MT/LLM toggling. | Manifest V3 (Shadow DOM) |
| **Follow-up Chat** | Ask the AI follow-up questions directly inside any search, comparison, or explanation result with full context retention. | OpenRouter / Ollama Streaming |
| **Profiles & Study Sessions** | Separate learning contexts (e.g., "German C1", "Medical Spanish"). Temporal session grouping (`YYYY-MM-DD` or named units). | Scoped SQLite Tables |
| **Color Tags & Star Ratings** | Color bookmarks (Red, Orange, Yellow, Green, Blue) and 1–5 star ratings for vocabulary curation and flashcard filtering. | SQLite Metadata |
| **Dynamic Hover Preview** | Hover over any history item in the sidebar to view its full Markdown explanation in a resizable floating popup. | Fixed Viewport Clamped UI |
| **External Dictionary Links** | Dynamic link buttons to Cambridge, LEO, Duden, Wiktionary, etc., populated automatically with detected language and lemma. | Configurable URL Templates |
| **1-Click Backup & Restore** | Export and import your entire SQLite database and configuration as a timestamped `.zip` archive. | Native ZIP Streaming |

---

## 🏛️ Architecture Overview

┌────────────────────────────────────────────────────────────────────────┐
│                        User Client Layer                               │
├───────────────────┬───────────────────┬────────────────────────────────┤
│ Browser Extension │ React SPA Web UI  │   Native Android Mobile App    │
│ (Manifest V3)     │ (React 19 / Vite) │  (Kotlin / Jetpack Compose)    │
│ - Bubble & Card   │ - Multi-tab Modes │  - 24/7 Foreground Engine      │
│ - Subtitle Pierce │ - Flashcards Deck │  - System Bubble & PROCESS_TEXT│
│ - Instant MT/LLM  │ - Full Management │  - Google ML Kit On-Device MT  │
└─────────┬─────────┴─────────┬─────────┴───────────────┬────────────────┘
          │                   │                         │
          │ HTTP REST API     │ HTTP REST API           │ Direct OkHttp / SSE
          ▼                   ▼                         ▼
┌───────────────────────────────────────┐   ┌────────────────────────────┐
│ FastAPI Backend Server (Port 4321)    │   │ Android App Core (Local)   │
│ - server.py: Fat Controller & SPA host│   │ - Room SQLite Database     │
│ - mt.py: CTranslate2 + NLLB-200 (CPU) │   │ - Google ML Kit Engine     │
│ - ai.py: OpenRouter / Ollama Gateway  │   │ - LlmRepository + Streaming│
│ - db.py: SQLModel SQLite Engine       │   │ - BackgroundSyncService    │
└───────────────────┬───────────────────┘   └─────────────┬──────────────┘
                    │                                     │
                    ▼                                     ▼
        ┌─────────────────────────────────────────────────────┐
        │ OpenRouter AI Gateway (Claude, DeepSeek, GPT-4o)    │
        └─────────────────────────────────────────────────────┘
```

- **PC Backend:** Python 3.10+ (tested on 3.11+), FastAPI, SQLModel, Uvicorn, CTranslate2, Tokenizers, SentencePiece.
- **PC Frontend:** React 19, Vite 8, TailwindCSS 4, Lucide React, react-markdown.
- **PC Extension:** Chrome Manifest V3, Shadow DOM style encapsulation, deep selection traversal.
- **Android App:** Kotlin 1.9+, Jetpack Compose, Room SQLite, Google ML Kit (Translate & Language ID), OkHttp SSE, compileSdk 34.

---

## 🚀 Installation & Setup

### Prerequisites
- Python 3.10 or higher (Python 3.11+ recommended)
- Node.js 18+ (tested on Node 20+)
- `uv` (recommended) or `pip`

### Step 1: Clone the Repository
```bash
git clone https://github.com/yourusername/ai_dict.git
cd ai_dict
```

### Step 2: Install Python Backend Dependencies
Using `uv` (recommended):
```bash
uv pip install -e .
```
Or standard `pip`:
```bash
pip install -e .
```

### Step 3: Build the Frontend Static Assets
```bash
cd frontend
npm install
npm run build
cd ..
```
*Note: The FastAPI backend serves the pre-compiled assets from `src/ai_dict/static/`.*

### Step 4: Launch AI Dict
```bash
ai_dict
```
Open your browser and navigate to:
```
http://127.0.0.1:4321
```

---

## 🧩 Installing the Chrome Extension

AI Dict includes a powerful companion Chrome Extension that brings instant lookups and subtitle translation to any webpage, YouTube video, or HTML5 player:

1. Open Chrome / Brave / Edge and navigate to `chrome://extensions/`.
2. Toggle on **Developer mode** in the top-right corner.
3. Click **Load unpacked** and select the `extension/` directory inside this repository.
4. Pin the **AI Dict** icon to your browser toolbar.
5. Highlight any text on any page or video to trigger the floating lookup bubble!

> For full extension documentation, keyboard shortcuts, and video configuration, see [extension/README.md](file:///run/host/home/dkchw/Documents/Code/Ongoing/Repo/AI_Dict/extension/README.md).

---

## 📱 Native Android Mobile App

AI Dict includes a full-featured native Android app (`android/`) designed with Jetpack Compose, Room SQLite, and Google ML Kit on-device translation:

### Features on Android:
- **System-wide Floating Bubble:** Draggable overlay that floats above all apps (YouTube, Kindle, Twitter, Chrome).
- **Text Selection Integration (`PROCESS_TEXT`):** Select text anywhere on Android to trigger instant AI explanations without switching apps.
- **System Translation Provider:** Handles standard Android `TRANSLATE` intents.
- **24/7 Background Protection:** `BackgroundSyncService` maintains long-running LLM streaming and reasoning with a persistent foreground service and wake lock.
- **Offline ML Kit Engine:** Fast on-device offline translation using lightweight (~30MB) language packs.

### Building & Installing the APK:
1. **Pre-built APK:** Download or install `android/release_latest.apk`.
2. **Build from source:**
   ```bash
   cd android
   ./gradlew assembleRelease
   ```
3. **Automated Release Script:**
   ```bash
   cd android
   ./build_and_push.sh "Release title / notes"
   ```
   *(Bumps version code, builds signed release APK, updates `release_latest.apk`, and pushes to GitHub triggering the `.github/workflows/auto_release.yml` pipeline).*

---

## ⚙️ Initial Configuration

On your first launch, click the **Settings** gear icon (⚙️) in the sidebar:

1. **OpenRouter API Key:** Enter your OpenRouter API key (get one at [openrouter.ai](https://openrouter.ai)).
2. **Model Selection:** Select your preferred primary LLM (e.g., `deepseek/deepseek-v4-flash-0731` or `anthropic/claude-3.5-sonnet`).
3. **Reasoning Effort:** Configure thinking budgets per mode (`none`, `low`, `medium`, `high`, `max`).
4. **Offline MT Engine:** The NLLB-200 600M model (~600MB) will automatically download on your first MT lookup on PC. On Android, language packs download on-demand.
5. **Local Ollama Fallback (Optional):** Enable Ollama fallback if you want local LLM capability when offline on PC.

---

## 📚 Documentation Index

For comprehensive documentation, consult the dedicated guides:

- [CROSS_PLATFORM_SPEC.md](file:///run/host/home/dkchw/Documents/Code/Ongoing/Repo/AI_Dict/CROSS_PLATFORM_SPEC.md) — Definitive cross-platform monorepo architecture, feature matrix, technical mismatch justifications, and sync protocols.
- [DESIGN.md](file:///run/host/home/dkchw/Documents/Code/Ongoing/Repo/AI_Dict/DESIGN.md) — Architectural philosophy, design principles, dual-track MT/LLM strategy, security considerations, and trade-offs.
- [TECHNICAL_SPECS.md](file:///run/host/home/dkchw/Documents/Code/Ongoing/Repo/AI_Dict/TECHNICAL_SPECS.md) — Complete technical specification, SQLite database schema, REST API catalog, CTranslate2 threading details, and frontend state machine.
- [AGENTS.md](file:///run/host/home/dkchw/Documents/Code/Ongoing/Repo/AI_Dict/AGENTS.md) — Operational guidelines for AI coding agents and human contributors, build contracts, database migration protocols, and common pitfalls.
- [android/README.md](file:///run/host/home/dkchw/Documents/Code/Ongoing/Repo/AI_Dict/android/README.md) — Native Android application architecture, Jetpack Compose, Room SQLite, ML Kit offline MT, and build workflows.
- [extension/README.md](file:///run/host/home/dkchw/Documents/Code/Ongoing/Repo/AI_Dict/extension/README.md) — Browser extension architecture, YouTube/Netflix subtitle piercing, event shielding, and usage guide.

---

## 📄 License

Licensed under the Apache License 2.0. See [LICENSE](LICENSE) for details.
