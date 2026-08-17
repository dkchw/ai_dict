# Technical Specifications: AI Dict

## 1. System Architecture
AI Dict is a single-page application (SPA) backed by a Python API server. The backend serves both the REST API for data and the static frontend files.

- **Backend Framework:** FastAPI (async, high performance).
- **ORM / Database:** SQLModel (Pydantic + SQLAlchemy) over SQLite.
- **Frontend Framework:** React 18 (Vite, TailwindCSS).
- **LLM Provider:** OpenRouter API (using `openai` Python package asynchronously).

## 2. Directory Structure
```
ai_dict/
├── src/
│   └── ai_dict/
│       ├── __init__.py
│       ├── cli.py         # Entry point (ai_dict command)
│       ├── server.py      # FastAPI application and endpoints
│       ├── ai.py          # LLM integration and prompt logic
│       ├── db.py          # SQLModel schemas and database initialization
│       ├── config.py      # Environment variables and data paths
│       └── static/        # Compiled frontend assets (served by FastAPI)
├── frontend/
│   ├── src/
│   │   ├── App.jsx        # Main React component and router/layout
│   │   ├── components/    # Tab components (Search, Compare, Explain)
│   │   ├── index.css      # Tailwind directives
│   │   └── main.jsx       # React entry
│   ├── package.json
│   ├── tailwind.config.js
│   └── vite.config.js
├── pyproject.toml
└── README.md
```

## 3. Database Schema
The SQLite database is stored locally via `platformdirs` (e.g., `~/.local/share/ai_dict/ai_dict.db`).

### Core Models
- `Word`: Represents a dictionary lookup. Fields: `id`, `term`, `language`, `lemma`, `search_count`, `color`, `session_id`, `created_at`, `updated_at`.
- `ChatMessage`: Stores follow-up questions/answers for a specific `Word`. Fields: `id`, `word_id`, `role`, `content`, `session_id`, `created_at`.
- `Comparison`: Represents a comparison between multiple terms.
- `ComparisonChat`: Follow-up messages for a comparison.
- `Explain`: Represents a full-text explanation request.
- `ExplainChat`: Follow-up messages for an explanation.
- `AppSetting`: Key-value store for app configuration (API keys, models).
- `ExternalLinkTemplate`: User-defined templates for external dictionary links.

## 4. API Endpoints

### Word Search
- `POST /api/search`: Looks up a word. Creates it via LLM if it doesn't exist, or increments `search_count` and updates `session_id` if it does.
- `POST /api/chat`: Add a follow-up chat message to a word.
- `GET /api/words/{id}/chats`: Retrieve chat history for a word.
- `POST /api/words/{id}/regenerate`: Force re-fetch the explanation from the LLM.
- `DELETE /api/words/{id}`: Delete a word.
- `GET /api/words`: Get all history.

### Comparison
- `POST /api/comparisons/search`: Compares multiple words (comma separated).
- `POST /api/comparisons/chat`: Follow-up chat for a comparison.
- `DELETE /api/comparisons/{id}`: Delete a comparison.

### Explain Text
- `POST /api/explains/search`: Explains a block of text.
- `POST /api/explains/chat`: Follow-up chat for text explanation.
- `DELETE /api/explains/{id}`: Delete an explanation.

### Sessions & Data Management
- `DELETE /api/sessions/{session_id}`: Deletes all Words, Comparisons, and Explains belonging to a specific session.
- `POST /api/settings`: Update a specific app setting.

## 5. Frontend UI/UX
- **Tab System:** Uses a horizontal, scrollable tab bar to keep multiple searches open simultaneously without losing context. Tab states are managed in `App.jsx` and passed down.
- **Hover Review Popup:** A dynamically positioned `fixed` popup that allows users to preview the markdown explanation of a word from their history without clicking it. Position is calculated against the viewport edges to prevent clipping.
- **Local Storage:** Frontend configuration (e.g., UI theme, hover window state, active study session) is persisted in browser `localStorage`.
- **Markdown Rendering:** Responses from the LLM are rendered using `react-markdown` with `remark-gfm` for tables and lists.

## 6. AI & Prompt Engineering
- **OpenRouter:** The backend makes asynchronous calls to `openrouter.ai/api/v1/chat/completions`.
- **Regex Extraction:** The backend parses the markdown response to dynamically extract the detected `Language` and `Base form (lemma)` to store structurally in the database, allowing features like targeted external links.
- **System Prompts:** Users can override the default prompts. Default prompts instruct the AI to output highly structured markdown including Etymology, Meanings, Usage Notes, and Learning Notes.
