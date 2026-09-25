# AI Dict Browser Extension (Definer Replacement)

A modern, high-performance Chromium extension (Manifest V3) that connects your web browser directly to your local **AI Dict** backend. Designed as a full-featured replacement for Definer, it provides instant text lookups, offline machine translation, and deep LLM language assistance on any webpage, YouTube video, or HTML5 fullscreen player.

---

## ✨ Core Features & Highlights

### 1. Dual-Mode Interface: Simple MT vs. Full Feature LLM
The extension provides two distinct modes tailored for different reading workflows:

- ⚡ **Simple MT Card (Default):**
  - **Google Translate Experience:** Instant, distraction-free machine translation powered by local offline NLLB-200.
  - **Zero-Memory Contract:** Lookups in this mode do **not** pollute your permanent dictionary history (`save_history: false` by default).
  - **Inline Editable Output:** Edit the translated text directly in place; edits auto-save with debounced updates.
  - **Action Toolbar:** 
    - 🔄 **Swap Languages:** Instantly swap source and target languages.
    - 🔁 **Regenerate:** Re-run the translation with one click.
    - 📋 **Copy:** Copy source or translated text to clipboard.
    - 🔊 **Text-to-Speech:** Listen to native pronunciation.
  - **1-Click Escalation:** Click `✨ LLM Mode` in the header or bottom bar to escalate the text to full LLM analysis without losing context.

- 🎓 **Full Feature Assistant Card:**
  - **Comprehensive Breakdown:** Definitions, grammatical analysis, etymology, and CEFR level.
  - **Multi-Tab Layout:** Seamlessly switch between Definition, Grammar, and Follow-up Chat.
  - **Interactive Chat:** Ask follow-up questions directly within the floating card.
  - **Automatic Persistence:** Lookups in this mode are automatically saved to your active profile in SQLite.
  - **Bookmark Tagging:** 1-Click color tagging (🔴 Forgot, 🟠 Hard, 🟡 Medium, 🟢 Easy, 🔵 Research) and 1–5 star ratings.

---

### 2. Fullscreen Video & Subtitle Piercing (YouTube, Netflix, HTML5)
The extension overcomes traditional browser extension limitations on video platforms:

- 🛡️ **Event Capture Phase Listeners:**
  - Standard `mouseup` and `dblclick` events are swallowed by video players via `e.stopPropagation()`.
  - AI Dict listens on the **capture phase** (`window.addEventListener("mouseup", handler, true)`), guaranteeing that subtitle text selections are detected before the video player can discard them.
- 📺 **HTML5 Fullscreen Re-Parenting:**
  - In fullscreen mode, elements attached to `document.body` are rendered behind the fullscreen video player.
  - The extension observes `fullscreenchange` and dynamically moves the `#ai-dict-extension-root` host container inside `document.fullscreenElement` (e.g., `div#movie_player.ytp-fullscreen`).
- ⌨️ **Keyboard & Mouse Event Shielding:**
  - Input fields and textareas call `e.stopPropagation()` on `keydown`, `keyup`, and `keypress`. Typing inside the extension will **never** trigger YouTube player shortcuts (e.g., `f` for fullscreen, `m` for mute, `k`/`space` for pause, `j`/`l` for seek).
  - Clicking inside the card prevents the underlying video player from toggling playback.
- 📐 **Smart Subtitle Flip Geometry:**
  - Subtitles typically appear near the bottom edge of the screen.
  - If a selection is within 90px of the bottom viewport boundary, the floating bubble and card automatically flip to appear **above** the selection, preventing off-screen overflow.
- 🔍 **Deep Selection Piercing (`getDeepSelection`):**
  - Traverses open Shadow DOM roots (e.g., custom subtitle elements, web components) where standard `window.getSelection()` returns empty strings.

---

### 3. Selection Bubble & Trigger Controls
- **Floating Lookup Bubble:** Select any text to display the sleek AI Dict trigger icon. Placed at the lower-right anchor to avoid obscuring browser selection controls.
- **Double-Click Word Lookup:** Instantly queries single words upon double-clicking.
- **Modifier Key Options:** Require holding `Alt`, `Ctrl`, or `Shift` before showing the bubble or card (configurable in Options).
- **Domain Blacklist:** Disable the extension on specific websites (banking, intranet, code editors).

---

### 4. Resizable & Permanent Window Geometry
- Drag handles on edges and corners allow resizing the floating card to any dimension.
- Your preferred dimensions are saved in `chrome.storage.local` and restored on every subsequent lookup.

---

### 5. External Dictionary Integration
Instant one-click access to authoritative external dictionaries matching the detected language:
- **Cambridge Dictionary** (EN)
- **LEO Dictionary** (DE)
- **Duden** (DE)
- **Wiktionary** (Multilingual)
- **DeepL** & **Google Translate**
- **WordReference**

Manage, reorder, and add custom link templates using `{{str}}` and `{{lemma}}` placeholders in the extension Options page.

---

## 🚀 Installation & Reloading Guide

### Supported Browsers
- Google Chrome
- Brave Browser
- Microsoft Edge
- Opera / Vivaldi / Any Chromium-based browser

### Installation Steps
1. Open your browser and navigate to:
   ```
   chrome://extensions/
   ```
2. Enable **Developer mode** via the toggle switch in the top-right corner.
3. Click the **Load unpacked** button.
4. Select the `extension/` folder located in this repository.
5. Pin the **AI Dict** icon to your browser toolbar for quick access.

### Reloading After Code Changes
When modifying files in `extension/` (`content.js`, `content.css`, `popup.js`, etc.):
1. Go back to `chrome://extensions/`.
2. Find the **AI Dict** extension card.
3. Click the **Reload** circular arrow icon (🔄).
4. Refresh any active browser tabs to load the updated content script.

---

## 🛠️ Architecture & Technical Layout

```
extension/
├── manifest.json       # Manifest V3 manifest, permissions, and host declarations
├── background.js       # Background service worker (shortcuts, context menus, storage sync)
├── content.js          # Injected script: Shadow DOM host, event capture, video handlers
├── content.css         # Stylesheet injected into ShadowRoot (Tokyo Night & Dark themes)
├── popup.html / js     # Toolbar action quick lookup popup
├── options.html / js   # Options & external dictionary manager
├── rules.json          # Declarative net request rules
└── icons/              # Extension icons (16px, 32px, 48px, 128px)
```

### Component Breakdown:
1. **Isolated Shadow DOM (`#ai-dict-extension-root`):**
   - Renders the trigger bubble, Simple MT card, and Full Feature card.
   - Prevents host page styles (CSS resets, Bootstrap, Tailwind) from bleeding into the extension.
2. **Localhost Communication:**
   - Communicates directly with the local FastAPI server at `http://127.0.0.1:4321/api/`.
   - Fetches active profiles, settings, external link templates, and runs translations.
3. **Chrome Storage Synchronization:**
   - Caches active profile, card dimensions (`popupWidth`, `popupHeight`), modifier key settings, and theme preferences.

---

## ⚙️ Options & Customization

Click the AI Dict extension icon in your toolbar and select **Options** (or right-click the icon and choose "Options"):
- **Default Lookup Mode:** Choose whether the extension defaults to Simple MT or Full Feature LLM.
- **Active Profile:** Set the default profile used for extension lookups.
- **Trigger Behavior:** Configure double-click lookups, selection bubble delay, and modifier keys.
- **External Dictionaries:** Add custom URL templates (e.g. `https://en.wiktionary.org/wiki/{{str}}`).
- **Domain Blacklist:** Add domains where the extension should remain inactive.
