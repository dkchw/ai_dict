# AI Agent Guidelines for AI Dict

This document is the **operating manual for autonomous AI coding agents and human contributors** working on the AI Dict repository. Read this **before making any code modifications**.

> For design philosophy and architectural thinking, read [DESIGN.md](file:///run/host/home/dkchw/Documents/Code/Ongoing/Repo/AI_Dict/DESIGN.md).  
> For the complete technical specifications, database schema, and API contracts, read [TECHNICAL_SPECS.md](file:///run/host/home/dkchw/Documents/Code/Ongoing/Repo/AI_Dict/TECHNICAL_SPECS.md).  
> For the browser extension guide, read [extension/README.md](file:///run/host/home/dkchw/Documents/Code/Ongoing/Repo/AI_Dict/extension/README.md).

---

## 1. Core Architecture: What You Need to Know Immediately

### 1.1 Tech Stack Summary
- **Backend:** Python 3.10+ (tested 3.11+), FastAPI, Uvicorn, SQLModel (Pydantic + SQLAlchemy). Entry point: [`src/ai_dict/server.py`](file:///run/host/home/dkchw/Documents/Code/Ongoing/Repo/AI_Dict/src/ai_dict/server.py).
- **Offline MT:** CTranslate2 int8 inference engine running Facebook NLLB-200 (600M distilled) on CPU: [`src/ai_dict/mt.py`](file:///run/host/home/dkchw/Documents/Code/Ongoing/Repo/AI_Dict/src/ai_dict/mt.py).
- **Frontend:** React 19, Vite 8, TailwindCSS 4 (`@tailwindcss/vite`). Entry point: [`frontend/src/App.jsx`](file:///run/host/home/dkchw/Documents/Code/Ongoing/Repo/AI_Dict/frontend/src/App.jsx).
- **Database:** SQLite local file (`~/.local/share/ai_dict/ai_dict.db` on Linux), managed via SQLModel: [`src/ai_dict/db.py`](file:///run/host/home/dkchw/Documents/Code/Ongoing/Repo/AI_Dict/src/ai_dict/db.py).
- **LLM Gateway:** OpenRouter API (Claude, GPT-4o, DeepSeek, etc.) + optional local Ollama fallback: [`src/ai_dict/ai.py`](file:///run/host/home/dkchw/Documents/Code/Ongoing/Repo/AI_Dict/src/ai_dict/ai.py).
- **Browser Extension:** Chrome Manifest V3 with Shadow DOM isolation, deep subtitle piercing, and video event shielding: [`extension/`](file:///run/host/home/dkchw/Documents/Code/Ongoing/Repo/AI_Dict/extension/).
- **Android Mobile App:** Kotlin 1.9+, Jetpack Compose, Room SQLite, Google ML Kit (Translate & Language ID), OkHttp SSE, compileSdk 34: [`android/`](file:///run/host/home/dkchw/Documents/Code/Ongoing/Repo/AI_Dict/android/).

---

### 1.2 The Build Contract (CRITICAL)
**If you touch ANY file inside `frontend/`**, you MUST run:
```bash
cd frontend && npm run build
```
The FastAPI backend serves pre-compiled static assets directly from `src/ai_dict/static/`. There is **no hot module reloading (HMR)** in production mode. Any frontend changes will remain completely invisible to the user until you build.

After building:
1. Advise the user to **hard-refresh their browser** (`Ctrl+Shift+R` or `Cmd+Shift+R`).

---

### 1.3 Backend Changes Contract
Changes to Python files (`server.py`, `ai.py`, `mt.py`, `db.py`, `config.py`) require the user to **restart the backend server** (`ai_dict` command).

---

### 1.4 Android Compilation & Parity Contract
**If you touch ANY file inside `android/`**, you MUST verify compilation:
```bash
cd android && ./gradlew compileDebugKotlin
```
To assemble a fresh debug or release package:
```bash
cd android && ./gradlew assembleDebug
# Or automated release with git push:
cd android && ./build_and_push.sh "Commit message"
```

> [!IMPORTANT]
> **Cross-Platform Synchronous Rule:** When you update a prompt, add an analytical lens, introduce a setting key, or modify a feature on PC, you **MUST simultaneously update the corresponding Android implementation** (see [CROSS_PLATFORM_SPEC.md](file:///run/host/home/dkchw/Documents/Code/Ongoing/Repo/AI_Dict/CROSS_PLATFORM_SPEC.md)). Do not leave the mobile app out of sync.

### 1.5 Android Auto-Updater & Release Asset Contract
- The Android app includes an in-app updater ([`AutoUpdater.kt`](file:///run/host/home/dkchw/Documents/Code/Ongoing/Repo/AI_Dict/android/app/src/main/java/com/aidict/app/utils/AutoUpdater.kt)) targeting `https://api.github.com/repos/dkchw/ai_dict/releases/latest`.
- The GitHub Actions workflow ([`.github/workflows/auto_release.yml`](file:///run/host/home/dkchw/Documents/Code/Ongoing/Repo/AI_Dict/.github/workflows/auto_release.yml)) triggers on push to `main` when `android/release_latest.apk` changes.
- The release asset MUST follow the naming convention `ai_dict_v<version>.apk` (e.g. `ai_dict_v7.22.apk`). `AutoUpdater.kt` checks for release assets ending in `.apk`.
- Never alter the target repository in `AutoUpdater.kt` back to the archived standalone repository.

---

## 2. SPA Routing: The Catch-All Rule

The FastAPI application uses a client-side SPA fallback route at the **absolute bottom** of [`src/ai_dict/server.py`](file:///run/host/home/dkchw/Documents/Code/Ongoing/Repo/AI_Dict/src/ai_dict/server.py):

```python
@app.get("/{full_path:path}")
async def serve_frontend(full_path: str):
    return FileResponse("...index.html")
```

This route catches all unmatched GET requests and returns `index.html` to enable React SPA routing (e.g., `/search`, `/compare`, `/mt`).

> [!CAUTION]
> **ALL new API endpoints MUST be registered ABOVE this catch-all route.**  
> If an endpoint is placed below the catch-all, FastAPI will match the wildcard route first and return HTML instead of JSON, silently breaking frontend API calls.

---

## 3. Database Rules & Schema Evolution

### 3.1 No Migration Framework (No Alembic)
There is deliberately no Alembic migration tool. Schema changes work through this strict 3-step contract:

1. **Update the SQLModel in `db.py`:** Add the new column with a sensible default:
   ```python
   new_field: Optional[str] = Field(default=None)
   ```
2. **Execute an `ALTER TABLE` against the live SQLite database:**
   ```python
   import sqlite3, os
   from platformdirs import user_data_dir
   
   db_path = os.path.join(user_data_dir("ai_dict"), "ai_dict.db")
   conn = sqlite3.connect(db_path)
   conn.execute("ALTER TABLE <tablename> ADD COLUMN <colname> <TYPE> DEFAULT <val>")
   conn.commit()
   conn.close()
   ```
3. **Restart the backend server.**

> [!WARNING]
> **Skipping step 2 will cause runtime 500 crashes.** SQLModel queries select all defined fields. If a column exists in Python but is missing from SQLite, queries will immediately raise `sqlite3.OperationalError: no such column`.

---

### 3.2 SQLModel Object Staleness After Commit
SQLModel (and SQLAlchemy) expires all instance attributes when `session.commit()` is called. If you attempt to access an object's attributes or call `obj.model_dump()` after committing, an implicit lazy-load query is executed.

**The Golden Pattern:**
```python
session.add(record)
session.commit()
session.refresh(record)  # ← REQUIRED before accessing record fields or dumping JSON
return record.model_dump()
```

---

### 3.3 Strict Profile Scoping
Every major table (`Word`, `Comparison`, `Explain`, `Translation`, `Correction`, `LlmRecord`, `MtRecord`) has a `profile_id` column.
- Always filter queries by the active `profile_id`:
  ```python
  records = session.exec(select(MtRecord).where(MtRecord.profile_id == active_profile_id)).all()
  ```
- Failure to filter by `profile_id` will bleed one user's study profile into another.

---

## 4. Browser Extension Development Rules

When working on files in [`extension/`](file:///run/host/home/dkchw/Documents/Code/Ongoing/Repo/AI_Dict/extension/):

### 4.1 Shadow DOM Style Encapsulation
- The extension card and floating selection bubble are rendered inside an isolated `ShadowRoot` (`#ai-dict-extension-root`).
- Do NOT rely on global page CSS. All styling must reside inside [`extension/content.css`](file:///run/host/home/dkchw/Documents/Code/Ongoing/Repo/AI_Dict/extension/content.css) and be injected directly into the shadow root.
- Do NOT use inline `<style>` blocks that violate strict Content Security Policies (CSP) on sites like GitHub or Twitter.

### 4.2 The Zero-Memory Contract for Machine Translation
- The browser extension defaults to **Simple MT mode**.
- All extension requests to `POST /api/mt/translate` MUST include:
  ```json
  "save_history": false
  ```
  unless the user explicitly clicks a bookmark button or toggles persistence. This prevents ephemeral web selections from flooding the user's permanent SQLite database.

### 4.3 Video Player Event Shielding (YouTube, Netflix, Coursera)
- **Keyboard Shielding:** All input fields and textareas rendered inside the extension shadow root MUST stop event propagation:
  ```javascript
  inputEl.addEventListener("keydown", (e) => e.stopPropagation());
  inputEl.addEventListener("keyup", (e) => e.stopPropagation());
  ```
  Without this, typing the letter `f` toggles YouTube fullscreen, typing `k` or `space` pauses video playback, and `m` mutes audio.
- **Mouse Shielding:** Clicks inside the extension card must call `e.stopPropagation()` so the host video player does not toggle pause.

### 4.4 Fullscreen Host Re-Parenting
- When a video goes fullscreen (`document.fullscreenElement`), any element attached directly to `document.body` is hidden behind the fullscreen canvas.
- Listen for `fullscreenchange` and dynamically re-parent `#ai-dict-extension-root` into `document.fullscreenElement || document.body`.

---

## 5. Offline MT Engine Guidelines (`mt.py`)

When modifying [`src/ai_dict/mt.py`](file:///run/host/home/dkchw/Documents/Code/Ongoing/Repo/AI_Dict/src/ai_dict/mt.py):

### 5.1 Never Block the Async Event Loop
- CTranslate2 inference (`translator.translate_batch`) is CPU-bound C++ execution.
- NEVER call `translate_with_ct2()` directly in an `async def` FastAPI route.
- ALWAYS offload to a worker thread:
  ```python
  translated = await asyncio.to_thread(translate_with_ct2, text, src_code, tgt_code, repo_id)
  ```

### 5.2 Flores-200 Language Codes
- NLLB-200 requires Flores-200 language identifiers (`eng_Latn`, `deu_Latn`, `fra_Latn`, `vie_Latn`, `zho_Hans`).
- Always pass user inputs through `to_flores_code()` before calling CTranslate2.
- Clean language inputs using `clean_lang_input()` to strip emoji flags (`🇺🇸 EN` -> `eng_Latn`).

---

## 6. LLM & System Prompt Contracts (`ai.py`)

### 6.1 Prompt → Regex Parsing Contract
The Search system prompt instructs the AI to include:
```markdown
* **Language**: French
* **Base form (lemma)**: courir
```
The backend parses these with regex in `extract_language_and_lemma()`:
```python
re.search(r'\*\*Language:?\*\*:?\s*([^\n]+)', content)
re.search(r'\*\*Base form \(lemma\):?\*\*:?\s*([^\n]+)', content)
```
> [!IMPORTANT]
> If you modify the system prompt format in `system_prompt.txt` or `ai.py`, you **MUST update these regex patterns** to match. Otherwise, language and lemma fields will be saved as `None`.

### 6.2 Reasoning Effort Parameter
When applying OpenRouter's reasoning budget via `apply_reasoning_level()`, inject the configuration into `extra_body`:
```python
kwargs["extra_body"] = {"reasoning": {"effort": level}}
```
Always wrap calls in a fallback handler: if a user selects a model that does not support the reasoning parameter, catch the `400 Bad Request` and retry without the reasoning block.

### 6.3 Quick LLM & Analytical Lenses Contract
- **Zero-Save by Default:** Quick LLM requests (`POST /api/simple-llm/lookup`) are strictly ephemeral and MUST NOT write to SQLite history automatically. Persistence only occurs if the user explicitly triggers a bookmark or save action (`POST /api/simple-llm/save`).
- **Prompt Synchronization:** When modifying built-in lenses in `SIMPLE_LLM_PROMPTS` ([`src/ai_dict/ai.py`](file:///run/host/home/dkchw/Documents/Code/Ongoing/Repo/AI_Dict/src/ai_dict/ai.py)), you MUST update `QUICK_LLM_PRESETS` in Android's [`DefaultPrompts.kt`](file:///run/host/home/dkchw/Documents/Code/Ongoing/Repo/AI_Dict/android/app/src/main/java/com/aidict/app/utils/DefaultPrompts.kt) to ensure uniform lens behavior.

---

## 7. Frontend State Management

### 7.1 Global vs. Local State
- **Global State in `App.jsx`:** Tab arrays (`searchTabs`, `compareTabs`, `mtTabs`), active tab IDs, history arrays (`words`, `mtRecords`), active profile, and theme.
- **Local State in Components:** `SearchTab.jsx`, `MtTab.jsx`, `FlashcardTab.jsx`, etc., manage their own form fields, input states, and loading indicators.
- **Upward Communication:** Child tabs update `App.jsx` only via the `onUpdateTab(tabId, changes)` callback.

### 7.2 Hover Review Popup Geometry
The `HoverReviewPopup` uses `fixed` CSS positioning with dynamic viewport clamping:
```javascript
const x = Math.min(cursor.x + 16, window.innerWidth - popupWidth - 8);
const y = Math.min(cursor.y, window.innerHeight - popupHeight - 8);
```
Never convert the popup to `absolute` positioning relative to a scrollable container; doing so will cause clipping and incorrect coordinate calculations.

---

## 8. Standard Contributor Workflow

Follow this checklist for every task:

```
1. Read DESIGN.md to understand the architectural intent and trade-offs.
2. Read CROSS_PLATFORM_SPEC.md to understand parity, platform divergences, and sync rules.
3. Read TECHNICAL_SPECS.md for exact table schemas, endpoints, and types.
4. Make Backend Changes (if applicable):
   - If db.py modified -> Run raw SQL ALTER TABLE script against live DB.
   - Test routes using FastAPI TestClient or curl.
5. Make Frontend Changes (if applicable):
   - Run: cd frontend && npm run build
6. Make Android Changes (if applicable):
   - If prompts/features changed -> Update DefaultPrompts.kt & LlmRepository.kt.
   - Verify build: cd android && ./gradlew compileDebugKotlin
   - If releasing: cd android && ./build_and_push.sh "Version notes"
7. Make Extension Changes (if applicable):
   - Reload unpacked extension in chrome://extensions/
8. Verification:
   - Hard-refresh browser (Ctrl+Shift+R).
   - If Python changed -> restart backend (ai_dict command).
```

---

## 9. Comprehensive Pitfall & Conflict Matrix

| Symptom / Error | Root Cause | Exact Solution |
|---|---|---|
| `OperationalError: no such column: <col>` | Added column to `db.py` without updating live SQLite file. | Run one-off `ALTER TABLE <table> ADD COLUMN <col> <TYPE>` script on live DB. |
| API endpoint returns HTML `<!DOCTYPE html>` | Route was added below the catch-all `@app.get("/{full_path:path}")`. | Move the route ABOVE the catch-all handler in `server.py`. |
| Changes in `frontend/src/*` don't show up in browser | Static files were not compiled, or browser cached old assets. | Run `cd frontend && npm run build`, then hard-refresh browser (`Ctrl+Shift+R`). |
| Android build fails with Unresolved Reference | Modified Kotlin data class or method signature without updating callers. | Run `cd android && ./gradlew compileDebugKotlin` to identify mismatched types or call sites. |
| Android MT fails or reports missing model | ML Kit language pack has not been downloaded on-device yet. | In Android Settings, open "Manage Offline Models" or ensure internet is enabled for the initial ~30MB pack download. |
| `AttributeError` or blank fields after `session.commit()` | SQLModel expired instance attributes on commit. | Add `session.refresh(obj)` immediately after `session.commit()`. |
| Typing in extension card toggles YouTube fullscreen or pauses video | Host video player captured global keydown events on `window`. | Add `e.stopPropagation()` to `keydown` and `keyup` listeners on all inputs/textareas. |
| Extension card invisible in video fullscreen mode | Extension root is appended to `document.body`, which is layered under fullscreen container. | Re-parent `#ai-dict-extension-root` into `document.fullscreenElement`. |
| Text selection in extension returns empty string on web components | Standard `window.getSelection()` cannot cross open shadow roots. | Use recursive `getDeepSelection()` crawler across shadow boundaries. |
| 400 Bad Request on OpenRouter API call | Reasoning effort was passed to a model that rejects `extra_body.reasoning`. | Catch 400 and retry request without `reasoning` parameter. |
| FastAPI server freezes during offline MT | CTranslate2 inference ran synchronously on the async event loop. | Offload CTranslate2 call to thread pool via `await asyncio.to_thread(...)`. |
| Extension queries flood SQLite database | `save_history` flag omitted in extension MT request. | Set `"save_history": false` in payload for ephemeral lookups. |
