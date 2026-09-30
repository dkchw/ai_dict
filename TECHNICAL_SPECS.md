# Technical Specifications: AI Dict

This document is the **single source of truth** for the technical architecture and implementation details of AI Dict. It covers technology versions, file structures, the database schema, all REST API contracts, the offline Machine Translation pipeline, frontend state management, and the browser extension integration.

> For architectural philosophy, design choices, and trade-offs, see [DESIGN.md](file:///run/host/home/dkchw/Documents/Code/Ongoing/Repo/AI_Dict/DESIGN.md).  
> For agent/contributor operational guidelines and build contracts, see [AGENTS.md](file:///run/host/home/dkchw/Documents/Code/Ongoing/Repo/AI_Dict/AGENTS.md).  
> For the browser extension user and developer guide, see [extension/README.md](file:///run/host/home/dkchw/Documents/Code/Ongoing/Repo/AI_Dict/extension/README.md).

---

## 1. Technology Stack

| Layer | Technology | Version | Purpose |
|---|---|---|---|
| **Backend Framework** | FastAPI | `>=0.110.0` | Async REST API & static asset delivery |
| **Backend Runtime** | Python | `>=3.10` (tested 3.11+) | Core application runtime |
| **ASGI Server** | Uvicorn | `>=0.29.0` | High-performance ASGI server |
| **Database ORM** | SQLModel | `>=0.0.16` | Pydantic + SQLAlchemy ORM integration |
| **Database Engine** | SQLite | 3.x | Embedded local-first storage |
| **MT Engine (Desktop)**| CTranslate2 | `>=4.8.2` | Fast CPU int8 inference engine for NLLB |
| **Tokenization** | Tokenizers / SentencePiece | `>=0.23.2` / `>=0.2.2` | Fast BPE tokenization for NLLB-200 |
| **Model Hub** | Hugging Face Hub | `>=1.32.0` | Auto-downloading & disk cache management |
| **Language Detection**| Langdetect + Regex | `>=1.0.9` | Script heuristics + ISO code detection |
| **Frontend Framework**| React | `^19.2.8` | Declarative UI components & state |
| **Frontend Build** | Vite | `^8.2.0` | Next-gen frontend bundling |
| **CSS Framework** | TailwindCSS | `^4.3.3` | Utility-first responsive styling |
| **Vite Tailwind Plugin**| `@tailwindcss/vite` | `^4.3.3` | Vite compiler integration for Tailwind v4 |
| **Icons** | Lucide React | `^1.31.0` | Consistent UI icon library |
| **Markdown Rendering**| `react-markdown` + `remark-gfm` | `^10.1.0` / `^4.0.1` | GitHub-flavored markdown parsing |
| **Diagrams & Math** | `mermaid` + `rehype-katex` | `^11.4.1` / `^7.0.1` | Dynamic diagrams and LaTeX math parsing |
| **LLM Gateway** | OpenRouter API / Ollama | v1 / local | Unified access to Claude, GPT-4, DeepSeek, etc. |
| **Extension Standard**| Chrome Extensions MV3 | Manifest V3 | Cross-browser Chromium extension |
| **Android Framework** | Kotlin / Jetpack Compose | `1.9+` / Compose BOM | Native Android declarative UI |
| **Android Database**  | Room SQLite (AndroidX) | `2.6.1` | Reactive SQLite persistence on mobile |
| **Android MT Engine** | Google ML Kit Translate | `17.0.3` | On-device NNAPI accelerated offline MT |
| **Android Network**   | OkHttp 4 + SSE | `4.12.0` | Streaming HTTP/2 & Server-Sent Events |

---

## 2. Directory Structure

```
ai_dict/
├── src/
│   └── ai_dict/
│       ├── __init__.py
│       ├── cli.py                  # CLI entry point (Typer + Uvicorn starter)
│       ├── server.py               # FastAPI application: REST routes, static file serving
│       ├── ai.py                   # Async LLM integration, OpenRouter, reasoning budgets, lenses
│       ├── mt.py                   # Offline MT engine: CTranslate2, NLLB-200, Flores mappings
│       ├── db.py                   # SQLModel table models, database engine & session dependency
│       ├── config.py               # Settings loader, platformdirs user data path resolution
│       ├── system_prompt.txt       # Default system prompt template for Search mode
│       └── static/                 # Pre-compiled static assets built from frontend/
│           ├── index.html
│           ├── icon.png
│           └── assets/             # Bundled JS and CSS chunks
├── frontend/
│   ├── src/
│   │   ├── App.jsx                 # Root React component: global state, navigation, layout
│   │   ├── main.jsx                # ReactDOM createRoot entry point
│   │   ├── App.css / index.css     # Base styles and Tailwind CSS directives
│   │   └── components/
│   │       ├── SearchTab.jsx       # Word lookup mode (etymology, collocations, nuances)
│   │       ├── CompareTab.jsx      # Multi-word side-by-side comparison mode
│   │       ├── ExplainTab.jsx      # Sentence & paragraph structural breakdown mode
│   │       ├── TranslationTab.jsx  # Nuanced LLM conceptual translation mode
│   │       ├── QuickLlmTab.jsx     # Quick LLM analytical lens workbench (Ling Flash)
│   │       ├── MtTab.jsx           # Fast offline CTranslate2 NLLB machine translation UI
│   │       ├── CorrectionTab.jsx   # Grammar correction & editing mode
│   │       ├── LlmTab.jsx          # Dedicated LLM research mode with session history
│   │       ├── FlashcardTab.jsx    # Spaced repetition study deck & active recall UI
│   │       ├── SettingsTab.jsx     # App configuration: API keys, prompts, models, lenses
│   │       ├── MarkdownRenderer.jsx# GitHub Flavored Markdown renderer with KaTeX math
│   │       ├── Mermaid.jsx         # Interactive dynamic Mermaid diagram renderer
│   │       ├── HoverReviewPopup.jsx# Floating fixed-position preview popup for sidebar items
│   │       ├── PronunciationModal.jsx # Audio pronunciation breakdown modal
│   │       ├── SpeechButton.jsx    # Native SpeechSynthesis TTS button
│   │       ├── StarRating.jsx      # 1–5 star rating interactive component
│   │       └── ChatMessageActions.jsx # Copy, branch, and inspect actions for chat items
│   ├── package.json
│   ├── vite.config.js
│   └── public/
├── extension/                      # Chrome / Chromium Manifest V3 Extension
│   ├── manifest.json               # Manifest V3 specification & permissions
│   ├── background.js               # Service worker for background messaging and context menus
│   ├── content.js                  # Injected script: Shadow DOM host, events, video handlers
│   ├── content.css                 # Tokyo Night / Dark themed styles for extension cards
│   ├── popup.html / popup.js       # Extension toolbar action popup (quick search & lens mode)
│   ├── popup.css                   # Toolbar popup styling
│   ├── options.html / options.js   # Extension settings & external dictionary management
│   ├── options.css                 # Options page styling
│   ├── rules.json                  # Declarative net request rules
│   └── icons/                      # Extension icons (16, 32, 48, 128 px)
├── android/                        # Native Android Mobile Application
│   ├── app/
│   │   ├── build.gradle.kts        # Dependencies, compileSdk 34, versioning
│   │   └── src/main/java/com/aidict/app/
│   │       ├── MainActivity.kt           # Full Jetpack Compose host
│   │       ├── PopupActivity.kt          # System PROCESS_TEXT floating card
│   │       ├── TranslateActivity.kt      # System TRANSLATE intent receiver
│   │       ├── FloatingBubbleService.kt  # WindowManager overlay service
│   │       ├── BackgroundSyncService.kt  # Uninterrupted foreground streaming service
│   │       ├── data/                     # Room AppDatabase, Entities, DAO, LlmRepository
│   │       ├── ui/                       # Compose screens, viewmodels, dialogs
│   │       └── utils/                    # DefaultPrompts (Lenses), AutoUpdater, LanguageManager
│   ├── build_and_push.sh           # Automated version increment, build, and git pusher
│   ├── release_latest.apk          # Pre-compiled standalone APK
│   └── README.md                   # Dedicated Android architecture & build guide
├── .github/workflows/
│   └── auto_release.yml            # Automated GitHub release action triggered on APK push
├── pyproject.toml                  # Python package configuration and dependencies
├── AGENTS.md                       # Autonomous agent & contributor operations guide
├── DESIGN.md                       # Design philosophy, architectural principles, trade-offs
├── TECHNICAL_SPECS.md              # This technical specification
├── CROSS_PLATFORM_SPEC.md          # Monorepo cross-platform parity and synchronization rules
└── README.md                       # Project overview, installation, and quickstart
```

---

## 3. Database Schema

The SQLite database is stored at `~/.local/share/ai_dict/ai_dict.db` (Linux), determined by `platformdirs.user_data_dir("ai_dict")`.

### 3.1 `Profile`
User learning namespaces that isolate histories, settings, and study sessions.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | Integer | No | PK (Auto) | Unique profile identifier |
| `name` | String | No | — (Unique, Indexed) | Profile name (e.g., "Spanish Study") |
| `rank` | Integer | No | `0` | Sort order index for UI display |
| `is_default` | Boolean | No | `False` | Immutable flag; default profile cannot be deleted |
| `created_at` | DateTime | No | `utcnow()` | Profile creation timestamp (UTC) |

---

### 3.2 `Word`
Lookup history for dictionary word searches (Search mode).

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | Integer | No | PK (Auto) | Unique word record identifier |
| `profile_id` | Integer | No | `1` (FK) | Scoped Profile ID |
| `term` | String | No | — (Indexed) | Searched word or phrase |
| `language` | String | Yes | `None` | AI-detected language (e.g., "French") |
| `lemma` | String | Yes | `None` | AI-detected base form (e.g., "courir") |
| `search_count` | Integer | No | `1` | Total times this word was searched |
| `view_count` | Integer | No | `1` | Total times this word entry was viewed |
| `color` | String | Yes | `None` | Color bookmark (`"red"`, `"orange"`, `"yellow"`, `"green"`, `"blue"`) |
| `stars` | Integer | Yes | `0` | Star rating (0 to 5) |
| `tag` | String | Yes | `None` | Freeform text tag |
| `session_id` | String | Yes | `None` | Temporal session identifier (e.g., "2026-09-24") |
| `created_at` | DateTime | No | `utcnow()` | Creation timestamp (UTC) |
| `updated_at` | DateTime | No | `utcnow()` | Last searched / updated timestamp (UTC) |

---

### 3.3 `ChatMessage`
Follow-up conversational questions and AI responses linked to a `Word`.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | Integer | No | PK (Auto) | Unique chat message identifier |
| `word_id` | Integer | No | FK (Indexed) | Target `Word.id` |
| `role` | String | No | — | Message sender (`"user"` or `"assistant"`) |
| `content` | String | No | — | Raw Markdown response or user question |
| `session_id` | String | Yes | `None` | Optional session tag |
| `created_at` | DateTime | No | `utcnow()` | Message timestamp (UTC) |

---

### 3.4 `Comparison` & `ComparisonChat`
Multi-word comparative analysis history.

**`Comparison` Table:**
- `id` (PK), `profile_id` (FK), `terms` (String, indexed, comma-separated words).
- `search_count` (int), `view_count` (int), `color` (optional string), `stars` (0-5), `tag` (optional string), `session_id` (optional string).
- `created_at`, `updated_at` (DateTime UTC).

**`ComparisonChat` Table:**
- `id` (PK), `comparison_id` (FK to `Comparison.id`, indexed).
- `role` (`"user"` | `"assistant"`), `content` (Markdown), `session_id`, `created_at`.

---

### 3.5 `Explain` & `ExplainChat`
Sentence and paragraph structural breakdown history.

**`Explain` Table:**
- `id` (PK), `profile_id` (FK), `text` (String, indexed source text).
- `search_count` (int), `view_count` (int), `color` (optional string), `stars` (0-5), `tag` (optional string), `session_id` (optional string).
- `created_at`, `updated_at` (DateTime UTC).

**`ExplainChat` Table:**
- `id` (PK), `explain_id` (FK to `Explain.id`, indexed).
- `role` (`"user"` | `"assistant"`), `content` (Markdown), `session_id`, `created_at`.

---

### 3.6 `Translation` & `TranslationChat`
Nuanced conceptual translation history.

**`Translation` Table:**
- `id` (PK), `profile_id` (FK), `text` (String, indexed source text), `source_lang` (string), `target_lang` (string).
- `search_count` (int), `view_count` (int), `color` (optional string), `stars` (0-5), `tag` (optional string), `session_id` (optional string).
- `created_at`, `updated_at` (DateTime UTC).

**`TranslationChat` Table:**
- `id` (PK), `translation_id` (FK to `Translation.id`, indexed).
- `role` (`"user"` | `"assistant"`), `content` (Markdown), `session_id`, `created_at`.

---

### 3.7 `Correction` & `CorrectionChat`
Text correction and grammar revision history.

**`Correction` Table:**
- `id` (PK), `profile_id` (FK), `text` (String, indexed source text).
- `source_lang` (optional string), `target_lang` (optional string).
- `mode_type` (`"both"` for correction + translation, or `"correction_only"`).
- `search_count`, `view_count`, `color`, `stars`, `tag`, `session_id`, `created_at`, `updated_at`.

**`CorrectionChat` Table:**
- `id` (PK), `correction_id` (FK to `Correction.id`, indexed).
- `role` (`"user"` | `"assistant"`), `content` (Markdown), `session_id`, `created_at`.

---

### 3.8 `LlmRecord` & `LlmRecordChat`
Dedicated freeform LLM exploration and custom prompt history.

**`LlmRecord` Table:**
- `id` (PK), `profile_id` (FK), `text` (String, indexed prompt/query).
- `source_lang`, `target_lang`, `mode_type`, `search_count`, `view_count`, `color`, `stars`, `tag`, `session_id`, `created_at`, `updated_at`.

**`LlmRecordChat` Table:**
- `id` (PK), `record_id` (FK to `LlmRecord.id`, indexed).
- `role`, `content`, `session_id`, `created_at`.

---

### 3.9 `MtRecord`
Local offline Machine Translation history (CTranslate2 NLLB-200).

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | Integer | No | PK (Auto) | Record identifier |
| `profile_id` | Integer | No | `1` (FK) | Scoped Profile ID |
| `text` | String | No | — (Indexed) | Source input text |
| `translated_text`| String | No | — | Translated output text (editable) |
| `source_lang` | String | Yes | `None` | Source language label / code |
| `target_lang` | String | Yes | `None` | Target language label / code |
| `detected_source`| String | Yes | `None` | Auto-detected source language name |
| `level` | String | Yes | `"standard"`| Model quality level |
| `model_name` | String | Yes | `None` | Human-readable engine string (e.g. "Facebook NLLB-200 (600M int8)") |
| `search_count` | Integer | No | `1` | Frequency count |
| `view_count` | Integer | No | `1` | View count |
| `color` | String | Yes | `None` | Bookmark color tag |
| `stars` | Integer | Yes | `0` | Star rating (0 to 5) |
| `tag` | String | Yes | `None` | Freeform text tag |
| `session_id` | String | Yes | `None` | Study session identifier |
| `created_at` | DateTime | No | `utcnow()` | Creation timestamp (UTC) |
| `updated_at` | DateTime | No | `utcnow()` | Last updated timestamp (UTC) |

---

### 3.10 `AppSetting`
Key-value store for global and profile-specific configuration.

| Column | Type | Nullable | Description |
|---|---|---|---|
| `key` | String | PK | Setting configuration key |
| `value` | String | No | Setting configuration value |

**Canonical Setting Keys:**
- `OPENROUTER_API_KEY`: User's OpenRouter API key.
- `MAIN_MODEL`: Model ID for Search and Explain modes (e.g., `deepseek/deepseek-v4-flash-0731`).
- `CHAT_MODEL`: Model ID for follow-up conversational messages.
- `COMPARE_MODEL`: Model ID for Word Comparison mode.
- `TRANSLATION_MODEL`: Model ID for Conceptual Translation mode.
- `CONVERSATION_MODEL`: Model ID for Conversation mode.
- `CORRECTION_MODEL`: Model ID for Text Correction mode.
- `MAIN_REASONING`: Reasoning effort for Search (`none`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max`).
- `COMPARE_REASONING` / `CHAT_REASONING` / `TRANSLATION_REASONING`: Per-mode reasoning efforts.
- `DICT_PROMPT`: Custom system prompt for Search mode.
- `COMPARE_PROMPT` / `EXPLAIN_PROMPT` / `TRANSLATE_PROMPT` / `CORRECTION_PROMPT`: Custom system prompts.
- `SEARCH_SOURCE_LANG` / `SEARCH_TARGET_LANG`: Default language dropdown defaults.
- `INTERNAL_TABS`: `"true"` | `"false"` — toggles browser-tab strip vs. clean segmented control.
- `MT_LEVEL`: `"standard"` (Facebook NLLB-200 600M int8).
- `MT_DEFAULT_IN_EXTENSION`: `"true"` | `"false"` — whether the browser extension defaults to MT mode.
- `OLLAMA_FALLBACK_ENABLED`: `"true"` | `"false"` — fallback to local Ollama if OpenRouter fails.
- `OLLAMA_BASE_URL`: Local Ollama API URL (default `http://127.0.0.1:11434/v1`).
- `OLLAMA_MODEL`: Specific model to target in local Ollama.

---

### 3.11 `ExternalLinkTemplate`
Configurable external dictionary URL templates with dynamic token replacement (`{{str}}` and `{{lemma}}`).

| Column | Type | Nullable | Description |
|---|---|---|---|
| `id` | Integer | PK (Auto) | Template ID |
| `name` | String | No | Button label (e.g., "Cambridge", "LEO", "Wiktionary") |
| `language` | String | No | Target ISO language code or `"all"` |
| `url_template` | String | No | URL pattern (e.g., `https://dictionary.cambridge.org/dictionary/english/{{str}}`) |
| `icon_url` | String | No | Favicon or icon URL |

---

## 4. REST API Catalog

All application endpoints are served under the `/api/` prefix.

### 4.1 Search (Word Mode)
- **`POST /api/search`**
  - **Body:** `{ term: str, session_id?: str, profile_id?: int, source_language?: str, target_language?: str }`
  - **Behavior:** Queries LLM via `explain_word()`, extracts `language` and `lemma` via regex, persists new `Word` record and initial assistant `ChatMessage`. Increments `search_count` on duplicate.
  - **Returns:** `{ word: Word, explanation: str, chats: List[ChatMessage] }`
- **`GET /api/words?profile_id={id}`**
  - **Returns:** List of `Word` objects ordered by `updated_at DESC`.
- **`GET /api/words/{id}/chats`**
  - **Returns:** List of `ChatMessage` objects for the specified word.
- **`POST /api/chat`**
  - **Body:** `{ word_id: int, content: str }`
  - **Behavior:** Appends user message, calls LLM with conversation history, streams assistant response, saves assistant message.
- **`POST /api/words/{id}/regenerate`**
  - **Body:** `{ model: str, source_language?: str, target_language?: str }`
  - **Behavior:** Forces a re-query to the LLM with the specified model, overwriting the initial explanation.
- **`PATCH /api/words/{id}/color`** — Update bookmark color (`{ color: str | null }`).
- **`PATCH /api/words/{id}/stars`** — Update star rating (`{ stars: int }`).
- **`PATCH /api/words/{id}/tag`** — Update tag string (`{ tag: str | null }`).
- **`PATCH /api/words/{id}/rename`** — Rename word term (`{ term: str }`).
- **`PATCH /api/words/{id}/session`** — Reassign to session (`{ session_id: str | null }`).
- **`POST /api/words/{id}/move`** — Move word to another profile (`{ target_profile_id: int }`).
- **`DELETE /api/words/{id}`** — Delete word and all child chat messages.
- **`DELETE /api/words?profile_id={id}`** — Delete all words in a profile.

---

### 4.2 Offline Machine Translation (`/api/mt/*`)
- **`POST /api/mt/translate`**
  - **Body:**
    ```json
    {
      "text": "Bonjour le monde",
      "source_lang": "fra_Latn",
      "target_lang": "eng_Latn",
      "level": "standard",
      "profile_id": 1,
      "session_id": "2026-09-24",
      "save_history": false
    }
    ```
  - **Behavior:** 
    1. Normalizes source/target language strings to Flores-200 codes (detects script if set to `"auto"`).
    2. Runs synchronous CTranslate2 inference offloaded to a thread pool via `asyncio.to_thread`.
    3. If `save_history` is `true`, persists or updates an `MtRecord` in the database. If `false` (default for extension), returns translation without database writes.
  - **Returns:**
    ```json
    {
      "original_text": "Bonjour le monde",
      "translated_text": "Hello world",
      "source_lang": "French",
      "target_lang": "English",
      "detected_source": "French",
      "model": "Facebook NLLB-200 (600M int8)",
      "engine": "nllb",
      "level": "standard",
      "is_offline": true,
      "record": { ... } // null if save_history is false
    }
    ```
- **`GET /api/mt/status?profile_id={id}`**
  - **Returns:** Engine readiness, download status, and local Ollama status.
- **`POST /api/mt/download`**
  - **Body:** `{ "level": "standard" }`
  - **Behavior:** Triggers non-blocking background download of NLLB model files if not already cached.
- **`GET /api/mt/records?profile_id={id}`** — List saved MT records.
- **`GET /api/mt/records/{record_id}`** — Get record by ID and increment `view_count`.
- **`PATCH /api/mt/records/{record_id}/translation`**
  - **Body:** `{ "translated_text": "Updated manual translation" }`
  - **Behavior:** Updates translated text in place (used for user inline edits with debouncing).
- **`PATCH /api/mt/records/{record_id}/color`** — Update MT bookmark color.
- **`PATCH /api/mt/records/{record_id}/stars`** — Update MT star rating.
- **`PATCH /api/mt/records/{record_id}/tag`** — Update MT tag.
- **`PATCH /api/mt/records/{record_id}/rename`** — Rename MT source text.
- **`PATCH /api/mt/records/{record_id}/session`** — Reassign session.
- **`POST /api/mt/records/{record_id}/move`** — Move record to another profile.
- **`GET /api/mt/records/{record_id}/preview`** — Return Markdown formatted preview text.
- **`DELETE /api/mt/records/{record_id}`** — Delete single MT record.
- **`DELETE /api/mt/records?profile_id={id}`** — Delete all MT records in profile.

---

### 4.3 Profiles & Study Sessions
- **`GET /api/profiles`** — Returns all profiles sorted by `rank ASC`.
- **`POST /api/profiles`** — Create new profile (`{ name: str }`).
- **`PATCH /api/profiles/{id}/rename`** — Rename profile.
- **`PATCH /api/profiles/{id}/set_default`** — Set profile as default.
- **`POST /api/profiles/reorder`** — Update rank order of profiles.
- **`DELETE /api/profiles/{id}`** — Cascade delete profile and all associated data.
- **`GET /api/sessions?profile_id={id}`** — Returns unique session names with entry count aggregations across all modes.
- **`POST /api/sessions/move`** — Move all entries in a session to a target profile.
- **`POST /api/sessions/rename`** — Rename a session string across all tables.
- **`DELETE /api/sessions/{session_id}?profile_id={id}`** — Delete all items associated with a session.

---

### 4.4 App Settings & Data Backup
- **`GET /api/settings`** — Returns all key-value settings as a JSON dictionary.
- **`POST /api/settings`** — Upsert setting key-value pair (`{ key: str, value: str }`).
- **`GET /api/data/export_zip`** — Streams a timestamped `.zip` containing the live `ai_dict.db` file.
- **`POST /api/data/import_zip`** — Accepts an uploaded `.zip` archive, validates SQLite magic headers, replaces local database, and re-initializes engine.

---

### 4.5 Quick LLM & Analytical Lenses (`/api/simple-llm/*`)
Engineered for ultra-fast, ephemeral lookups with zero automatic database saving and interchangeable analytical lenses (Ling Flash):

- **`GET /api/simple-llm/prompts`**
  - **Behavior:** Returns an array of analytical lenses ordered by user configuration or default preset sequence.
  - **Returns:** `List[{ id: str, title: str, prompt: str, emoji?: str, is_default?: bool, is_custom?: bool }]`
- **`POST /api/simple-llm/prompts`**
  - **Body:** `{ id?: str, title: str, prompt: str, emoji?: str, is_default?: bool }`
  - **Behavior:** Upserts a custom analytical lens, updating prompt contents, emoji icons, or title.
  - **Returns:** Updated list of all lenses.
- **`DELETE /api/simple-llm/prompts/{prompt_id}`**
  - **Behavior:** Deletes custom lens or marks a built-in lens as deleted.
  - **Returns:** Updated list of remaining lenses.
- **`POST /api/simple-llm/prompts/reorder`**
  - **Body:** `{ order: List[str] }`
  - **Behavior:** Persists a new display ranking order for lenses.
  - **Returns:** Reordered lenses list.
- **`POST /api/simple-llm/prompts/reset`**
  - **Behavior:** Resets lens configurations back to factory presets.
- **`POST /api/simple-llm/lookup`**
  - **Body:** `{ text: str, prompt_key?: str, model?: str, profile_id?: int }`
  - **Behavior:** Executes an ephemeral, fast LLM inquiry through the selected lens using `lookup_simple_llm()`. Does NOT save to database automatically.
  - **Returns:** `{ content: str, model: str, prompt_key: str }`
- **`POST /api/simple-llm/save`**
  - **Body:** `{ text: str, content: str, model?: str, profile_id?: int, session_id?: str, stars?: int, color?: str }`
  - **Behavior:** Explicitly saves an ephemeral Quick LLM result into SQLite as a permanent `LlmRecord`.
  - **Returns:** `{ record: LlmRecord }`

---

## 5. Offline MT Pipeline Architecture (`mt.py`)

The offline machine translation subsystem is engineered for zero-cost, private, and sub-second translation:

```
[Raw Text Input] 
       │
       ▼
1. Language Resolution & Heuristics
   ├─ If specified: Maps name/ISO to Flores-200 (e.g. "German" -> "deu_Latn")
   └─ If "Auto": Checks Unicode blocks (CJK, Arabic, Cyrillic) -> Langdetect fallback
       │
       ▼
2. Engine Selection & Cache Verification
   ├─ Verifies cached CTranslate2 files (model.bin, tokenizer.json, shared_vocabulary.txt)
   └─ If missing: Starts background thread download & attempts local Ollama fallback
       │
       ▼
3. CTranslate2 CPU Inference (asyncio.to_thread)
   ├─ Tokenize via tokenizers.Tokenizer (BPE)
   ├─ Inject source token prefix: [src_lang, ..., "</s>"]
   ├─ Force target token prefix: [[tgt_lang]]
   ├─ Execute translator.translate_batch(beam_size=2, max_batch_size=32)
   └─ Decode output IDs, stripping special tokens
       │
       ▼
4. Output Packaging & Optional Persistence
   ├─ Return JSON translation payload
   └─ If save_history=true: Persist MtRecord in SQLite
```

### Threading Model:
CTranslate2 executes C++ multithreaded OpenMP code. To avoid blocking FastAPI's async event loop:
- All translation runs inside `asyncio.to_thread(translate_with_ct2, ...)`.
- CTranslate2 is initialized with `inter_threads=1` and `intra_threads=4` (optimizing for 4 CPU cores without thread thrashing).

---

## 6. Frontend Architecture & State Management

### 6.1 State Centralization in `App.jsx`
The React application maintains a flat state structure in [`App.jsx`](file:///run/host/home/dkchw/Documents/Code/Ongoing/Repo/AI_Dict/frontend/src/App.jsx):

```jsx
// Active mode: 'search' | 'compare' | 'explain' | 'translation' | 'mt' | 'correction' | 'flashcards' | 'settings'
const [activeMode, setActiveMode] = useState('search');

// Global Tab Collections
const [searchTabs, setSearchTabs] = useState([...]);
const [compareTabs, setCompareTabs] = useState([...]);
const [mtTabs, setMtTabs] = useState([...]);

// Profiles
const [profiles, setProfiles] = useState([]);
const [activeProfile, setActiveProfile] = useState(null);

// History Records
const [words, setWords] = useState([]);
const [mtRecords, setMtRecords] = useState([]);
```

### 6.2 The Flashcard Engine (`FlashcardTab.jsx`)
The Flashcard system implements an active recall loop:
1. **Deck Generation:** Queries stored `Word`, `Comparison`, `Explain`, and `MtRecord` items filtered by active profile and optionally by color bookmark or star rating.
2. **Card State Machine:**
   - `currentIndex`: Tracks the active card in the deck.
   - `isFlipped`: Boolean tracking front (term/prompt) vs. back (Markdown explanation).
   - `layoutMode`: `'1col'` (single central card) vs. `'2col'` (front and back visible side-by-side).
   - `flipAnimation`: `'flip'` (3D CSS perspective rotation) vs. `'instant'` (zero-latency flip for speed study).
   - `isFullscreen`: Distraction-free full-viewport overlay.
3. **Keyboard Shortcuts:**
   - `Space` / `Enter`: Toggle card flip.
   - `ArrowLeft` / `ArrowRight`: Navigate previous / next card.
   - `ArrowUp` / `ArrowDown`: Advance cards or spread view.

### 6.3 Dynamic Hover Review Popup (`HoverReviewPopup.jsx`)
Provides instant full Markdown reading when hovering over any sidebar history item:
- **Positioning Engine:** Computed with dynamic viewport clamping:
  ```javascript
  const x = Math.min(cursor.x + 16, window.innerWidth - popupWidth - 8);
  const y = Math.min(cursor.y, window.innerHeight - popupHeight - 8);
  ```
- **Interactive Resizing:** 8-direction resize handles update width/height and persist values in `localStorage.getItem('hoverPopupWidth')`.

### 6.4 Markdown & Dynamic Mermaid Rendering Engine (`MarkdownRenderer.jsx`, `Mermaid.jsx`)
LLM responses often return rich structural breakdowns, linguistics trees, math equations, or conceptual diagrams:
- **Math Formulae:** Parsed via `remark-math` and rendered through `rehype-katex` with high-contrast formatting.
- **Mermaid Diagrams:** Dynamic `<Mermaid chart={...} />` component parses code blocks with language `mermaid`:
  - Asynchronously renders SVG diagrams (`mermaid.render`).
  - Supports zoom, pan, and full SVG export.
  - Automatically matches the active UI theme (Dark / Light / Tokyo Night).
  - Gracefully falls back to syntax-highlighted code blocks if diagram syntax contains errors.

---

## 7. Browser Extension Technical Architecture

### 7.1 Manifest V3 & Component Layout
The extension ([`extension/`](file:///run/host/home/dkchw/Documents/Code/Ongoing/Repo/AI_Dict/extension/)) operates under Chrome Manifest V3:
- **Background Service Worker (`background.js`):** Listens for shortcut commands (`Alt+Shift+D`), initializes context menus, and routes storage sync events.
- **Content Script (`content.js`):** Injected on all pages (`<all_urls>`). Manages text selection, floating trigger bubble, Simple MT card, and Full Feature card.
- **Isolated Shadow Root (`#ai-dict-extension-root`):** All DOM nodes are enclosed in an open Shadow DOM to isolate styles completely from host web pages.

### 7.2 Fullscreen Video & Subtitle Piercing Algorithm

```
[User Selects Subtitle Text on YouTube / Netflix]
       │
       ▼
1. Event Capture Phase Listener
   ├─ window.addEventListener('mouseup', handler, true)
   └─ Captures event BEFORE video player's e.stopPropagation() fires
       │
       ▼
2. Shadow DOM Selection Piercing (getDeepSelection)
   ├─ Traverses through document.activeElement and open shadow roots
   └─ Extracts clean text even from isolated custom web components
       │
       ▼
3. Fullscreen Host Re-Parenting
   ├─ Checks if document.fullscreenElement exists (e.g. div#movie_player)
   ├─ If fullscreen: Moves #ai-dict-extension-root INSIDE fullscreen container
   └─ Prevents extension card from being hidden beneath fullscreen video
       │
       ▼
4. Event Shielding on Extension Elements
   ├─ stopPropagation() on mousedown/mouseup: Prevents video from toggling pause
   └─ stopPropagation() on keydown/keyup: Blocks YouTube shortcuts ('k','f','m','j','l')
       │
       ▼
5. Smart Subtitle Geometric Flip
   ├─ Calculates distance from bottom of viewport: (window.innerHeight - rect.bottom)
   ├─ If distance < 90px: Renders bubble/card ABOVE selection instead of below
   └─ Prevents card from rendering offscreen or occluding the next subtitle line
```

### 7.3 Dual-Mode UI Contract in Extension
- **Simple MT Card:**
  - Lightweight, instant translation card (Google Translate feel).
  - Editable translated text with debounced auto-save.
  - Quick action buttons: Listen (TTS), Copy, Swap Languages, Regenerate.
  - Zero-Memory Contract: `save_history: false` by default.
- **Full Feature Card:**
  - Multi-tab assistant: Definitions, Grammar breakdown, Follow-up chat, External dictionaries.
  - Saves lookups to the active profile in SQLite.
- **1-Click Escalation:** The header contains a button (`✨ LLM Mode` / `⚡ MT Mode`) allowing the user to seamlessly toggle between the two cards while retaining the currently entered text.
