# Android Port Specifications: AI Dict

This document is a comprehensive technical specification designed for developers looking to port **AI Dict** into a native Android application (e.g., using Kotlin/Jetpack Compose or Flutter). 

It details the core features, exact database schemas, required API integrations, and UX paradigms that make the current web app functional.

---

## 1. Core Feature Requirements

An Android port must implement the following 5 main feature modes, unified by a global settings and profile system:

### 1.1 Search Mode (Dictionary)
*   **Function:** Look up any word/phrase. The AI returns an explanation formatted in Markdown (etymology, nuances, usage).
*   **Languages:** Users can specify a `Source Language` and a `Target Language`.
*   **Chat:** Users can open a follow-up chat context below the explanation to ask the AI questions.
*   **External Links:** Based on the AI's detected language/lemma, dynamically generate buttons linking to external websites (e.g., Wiktionary).

### 1.2 Compare Mode
*   **Function:** Input 2 or more words (comma-separated). The AI explains the subtle differences, register, and connotations between them.
*   **Chat:** Supports follow-up chat.

### 1.3 Explain Mode (Text)
*   **Function:** Paste full sentences or paragraphs. The AI breaks down the grammar, vocabulary, and meaning of the entire block.
*   **Chat:** Supports follow-up chat.

### 1.4 Translation Mode
*   **Function:** Translates large texts with deep nuance. Users select `Source` and `Target` languages.
*   **Chat:** Supports follow-up chat.

### 1.5 Profiles & History
*   **Profiles:** Users can create, rename, delete, and reorder Profiles (e.g., "Spanish Learning", "Work"). One profile can be marked as `Default` (undeletable).
*   **History Grouping:** All queries are saved to the local database and attached to the currently active Profile. History should be grouped visually by "Session" (e.g., "Today", "Yesterday", or custom named study sessions).
*   **Bookmarks:** Users can tag history items with colors indicating difficulty (Red/Forgot, Orange/Hard, Yellow/Medium, Green/Easy, Blue/Research).

---

## 2. API & Integration Requirements

The Android app will replace the React frontend but will either need to:
1. Connect to the existing Python FastAPI backend running on a host machine/server.
2. OR, completely replicate the backend logic by executing HTTP requests directly to the LLM Provider from the Android app and using Android Room for the database.

### 2.1 LLM Provider Integration
*   **Provider:** OpenRouter (`openrouter.ai/api/v1/chat/completions`) or direct OpenAI API.
*   **Streaming:** The app MUST support Server-Sent Events (SSE) to stream the markdown chunks live to the UI to reduce perceived latency.
*   **JSON Mode:** The AI is instructed to return structured data in specific formats. Some responses rely on Regex extraction (e.g., looking for `* **Language**: French` in the Markdown).

---

## 3. Database Schema (SQLite / Room)

If replicating the local backend using Android Room, the following tables and relationships are required. All entities should auto-generate a timestamp (`created_at`).

### `Profile`
*   `id` (Int, PK)
*   `name` (String, Unique)
*   `rank` (Int) - Used for UI sorting
*   `is_default` (Boolean) - Protects from deletion

### `AppSetting`
*   `key` (String, PK) - e.g., `OPENROUTER_API_KEY`, `SEARCH_SOURCE_LANG`, `SEARCH_TARGET_LANG`
*   `value` (String)

### `Word` (Search History)
*   `id` (Int, PK)
*   `profile_id` (Int, FK -> Profile)
*   `term` (String)
*   `language` (String) - Detected by AI
*   `lemma` (String) - Detected base form by AI
*   `color` (String) - Bookmark color (e.g., "red", "green")
*   `search_count` (Int) - Increments if searched again
*   `session_id` (String) - Grouping ID (e.g., YYYY-MM-DD)

### `ChatMessage` (Follow-ups for Words)
*   `id` (Int, PK)
*   `word_id` (Int, FK -> Word)
*   `role` (String) - "user" or "assistant"
*   `content` (String)

### `Comparison` & `ComparisonChat`
*   `id` (Int, PK)
*   `profile_id` (Int, FK)
*   `words` (String)
*   `explanation` (String)
*   `session_id` (String)
*   *(ComparisonChat replicates ChatMessage schema pointing to Comparison)*

### `Explain` & `ExplainChat`
*   `id` (Int, PK)
*   `profile_id` (Int, FK)
*   `text` (String)
*   `explanation` (String)
*   `session_id` (String)
*   *(ExplainChat replicates ChatMessage schema pointing to Explain)*

### `Translation` & `TranslationChat`
*   `id` (Int, PK)
*   `profile_id` (Int, FK)
*   `source_text` (String)
*   `source_lang` (String)
*   `target_lang` (String)
*   `translation` (String)
*   `session_id` (String)
*   *(TranslationChat replicates ChatMessage schema pointing to Translation)*

---

## 4. UX / UI Paradigms

*   **Markdown Rendering:** The Android app must utilize a robust Markdown rendering library (e.g., `Markwon` for Android Views, or `Compose Markdown`) that supports GFM (Tables, Lists, Bold, Italic).
*   **Hover/Preview:** The web app allows users to "hover" over history items to preview the explanation without opening a new screen. On mobile, this should translate to a **Bottom Sheet** or a **Long-Press Peek** interaction.
*   **Tab Management:** The web app uses a horizontal scrolling tab bar to keep multiple searches open. A mobile port should use a ViewPager or a standard Stack-based navigation where users can easily go back to previous searches without reloading them from the DB.
*   **Backup & Restore:** The app must allow exporting the entire local SQLite `.db` file to the user's Android Downloads folder, and importing it back to seamlessly transfer data across devices.
