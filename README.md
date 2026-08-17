# AI Dict

AI Dict is an advanced, AI-powered dictionary and language learning application that leverages modern Large Language Models (LLMs) via OpenRouter to provide deep, contextual explanations, comparisons, and translations of words and texts.

Unlike a traditional dictionary, AI Dict acts as a language tutor, providing etymology, related phrases, nuanced meaning differences, and the ability to ask follow-up questions in an interactive chat interface.

## Features

*   **Intelligent Word Search:** Get comprehensive explanations for any word in any language, including pronunciation, etymology, and example sentences.
*   **Word Comparison:** Compare two or more words to understand their subtle differences in meaning, register, and usage contexts.
*   **Text Explanation:** Paste a sentence or paragraph to get a breakdown of grammar, vocabulary, and meaning.
*   **Follow-up Chat:** Chat with the AI directly within a search result to ask follow-up questions or clarify doubts.
*   **Study Sessions & History:** Automatically groups your searches by day or by active "Study Session", allowing you to track and manage what you learn.
*   **Interactive UI:** Modern React frontend with dark mode support, horizontal tab scrolling, and a seamless "Hover Review" system that lets you peek at past searches instantly.
*   **External Integrations:** Configure dynamic links to external dictionaries (like Wiktionary or Cambridge) based on the detected language.
*   **Local Data Privacy:** All history and chat data is stored locally in an SQLite database on your machine.
*   **Customizable AI:** Configure the system prompt, main LLM, and fallback LLMs via the Settings panel.

## Architecture

*   **Backend:** Python 3.11+, FastAPI, SQLModel, Uvicorn.
*   **Frontend:** React, Vite, TailwindCSS, Lucide Icons.
*   **Database:** SQLite.
*   **AI Integration:** OpenRouter API (supports any model like GPT-4o, Claude 3.5 Sonnet, DeepSeek, Llama 3, etc.).

## Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/yourusername/ai_dict.git
    cd ai_dict
    ```

2.  **Install the backend (using `uv` or `pip`):**
    ```bash
    uv pip install -e .
    # OR
    pip install -e .
    ```

3.  **Build the frontend:**
    ```bash
    cd frontend
    npm install
    npm run build
    cd ..
    ```

4.  **Run the application:**
    ```bash
    ai_dict
    ```
    This will start the FastAPI server on `http://127.0.0.1:4321`. Open this URL in your browser.

## Configuration

When you first launch the app, go to the **Settings** tab (the gear icon) to configure:
- **OpenRouter API Key:** Required for the AI to function.
- **Main Model:** The primary model used for lookups (e.g., `anthropic/claude-3.5-sonnet`).
- **Chat/Compare Models:** Specific models used for chats or heavy comparison tasks.
- **System Prompts:** Customize how the AI formats its responses.

## License

This project is licensed under the Apache License 2.0. See the [LICENSE](LICENSE) file for details.
