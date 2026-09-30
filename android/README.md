# AI Dict for Android 🤖 📱

Native Android mobile application for **AI Dict**, engineered with Kotlin, Jetpack Compose, Material Design 3, Room SQLite, and Google ML Kit on-device translation.

---

## 🏗️ Architecture & Tech Stack

- **UI Framework:** Kotlin 1.9+, Jetpack Compose, Material Design 3 (`androidx.compose.material3`).
- **Local Database:** Room SQLite with reactive Kotlin `Flow<List<Word>>` and cascading chat messages.
- **Offline Machine Translation:** Google ML Kit On-Device Translation (`com.google.mlkit:translate:17.0.3`) with ~30MB on-demand language packs accelerated by NNAPI.
- **LLM Gateway:** OkHttp 4 with Server-Sent Events (SSE) streaming direct to OpenRouter API (Claude 3.5/3.7, DeepSeek R1/V3, GPT-4o, etc.).
- **Background Execution:** `BackgroundSyncService` running as an Android Foreground Service with `PARTIAL_WAKE_LOCK` to guarantee uninterrupted multi-minute reasoning streams.
- **Target SDK:** `compileSdk = 34`, `targetSdk = 34`, `minSdk = 26` (Android 8.0 Oreo+).

---

## ✨ Key Mobile Features

1. **Four Dedicated Learning Modes:**
   - 📚 **Dictionary Mode:** Deep dive into vocabulary with IPA phonetics, etymology, CEFR levels, collocations, and contextual example sentences.
   - ⚖️ **Compare Mode:** Side-by-side nuance and register analysis between synonyms (e.g., *affect* vs. *effect*, *comprehend* vs. *understand*).
   - 🗣️ **Translate Mode:** Reverse conceptual translation exploring nuanced colloquial and idiomatic equivalents.
   - 🧠 **Explain Mode:** Grammatical and syntactic breakdown of complex literary excerpts or sentences.

2. **Quick LLM / Analytical Lenses (Ling Flash):**
   - Instant, focused linguistic analysis via analytical lenses:
     - ⚡ **Quick Glance:** Ultra-concise definition & grammar overview.
     - 🔍 **Grammar & Structure:** Clause breakdown, inflection, and syntax tree.
     - 🎭 **Nuance & Idioms:** Connotations, register, and cultural context.
     - 👶 **ELI5:** Plain-language explanation for beginners.
     - 📋 **TL;DR:** One-line summary and core meaning.
     - 💬 **Dialogues:** Natural conversational scripts using the term.
     - 🩺 **Medical / Technical:** Specialized anatomical, clinical, or technical explanations.
     - ❓ **Socratic Questions:** Active recall prompts and retention questions.

3. **System-Wide Floating Bubble (`SYSTEM_ALERT_WINDOW`):**
   - Draggable overlay bubble accessible across all Android apps (e.g., YouTube, Kindle, Twitter, Chrome).
   - Tap to expand into a compact lookup card without leaving your current app.

4. **Android System Integration:**
   - **`ACTION_PROCESS_TEXT`:** Select any text in any app, tap "AI Dict" in the context menu to launch instant lookup in `PopupActivity`.
   - **`ACTION_TRANSLATE`:** Serves as a system-registered translation provider.

5. **Built-in Auto Updater:**
   - In-app update checker querying GitHub Releases:
     `https://api.github.com/repos/dkchw/ai_dict/releases/latest`
   - Automatically downloads and triggers Android package installer with `FileProvider`.

---

## 📁 Source Code Organization

```
android/
├── app/
│   ├── build.gradle.kts       # Dependencies, versionCode, versionName, compileSdk
│   └── src/main/
│       ├── AndroidManifest.xml# Permissions, activities, intent-filters, services
│       ├── java/com/aidict/app/
│       │   ├── MainActivity.kt           # Full-screen Jetpack Compose host
│       │   ├── PopupActivity.kt          # Floating bottom sheet for PROCESS_TEXT
│       │   ├── TranslateActivity.kt      # Handler for android.intent.action.TRANSLATE
│       │   ├── FloatingBubbleService.kt  # Draggable WindowManager overlay service
│       │   ├── BackgroundSyncService.kt  # Foreground service with WakeLock for streaming
│       │   ├── data/
│       │   │   ├── AppDatabase.kt        # Room database declaration
│       │   │   ├── entities/Entities.kt  # Word, ChatMessage, Profile, Session models
│       │   │   ├── dao/AppDao.kt         # Reactive queries with Kotlin Flow
│       │   │   ├── LlmRepository.kt      # OpenRouter API client & SSE streamer
│       │   │   └── LocalTranslationEngine.kt # Google ML Kit on-device translation
│       │   ├── ui/
│       │   │   ├── screens/              # DictScreen, CompareScreen, SettingsScreen, etc.
│       │   │   ├── viewmodels/           # SearchViewModel, SettingsViewModel, AppViewModel
│       │   │   └── components/           # Markdown text, Dialogs, ModelPickers
│       │   └── utils/
│       │       ├── DefaultPrompts.kt     # System prompts & QUICK_LLM_PRESETS
│       │       ├── AutoUpdater.kt        # In-app update checker and APK installer
│       │       ├── LanguageManager.kt    # Starred, custom flags & language codes
│       │       └── BackupHelper.kt       # JSON export and import for user data
│       └── res/                          # Vector drawables, themes, mipmap icons
├── build.gradle.kts           # Top-level Gradle configuration
├── settings.gradle.kts        # Repository and module settings
├── build_and_push.sh          # One-click version bump, release build, and git push
└── release_latest.apk         # Compiled, distribution-ready APK
```

---

## 🛠️ Building & Releasing

### Prerequisites
- JDK 17 (Java 17 OpenJDK recommended)
- Android SDK with platform-tools and `platforms;android-34`
- Gradle 8.7 (included via `./gradlew` wrapper)

### Build Debug APK
```bash
cd android
./gradlew assembleDebug
```
Output: `android/app/build/outputs/apk/debug/app-debug.apk`

### Verify Kotlin Compilation
```bash
cd android
./gradlew compileDebugKotlin
```

### Build Release APK
```bash
cd android
./gradlew assembleRelease
```

### One-Click Automated Release
Run the automated build and push script:
```bash
cd android
./build_and_push.sh "Your release message or version notes"
```
This script automatically:
1. Increments `versionCode` and `versionName` in `android/app/build.gradle.kts`.
2. Compiles a fresh signed release APK.
3. Copies the output to `android/release_latest.apk`.
4. Commits the changes and pushes to `origin main`.
5. Triggers the GitHub Actions release workflow (`.github/workflows/auto_release.yml`), publishing `ai_dict_v<version>.apk` to GitHub Releases.

---

## 📱 Permissions Used

| Permission | Purpose |
|---|---|
| `android.permission.INTERNET` | Communicating with OpenRouter API for LLM streaming. |
| `android.permission.SYSTEM_ALERT_WINDOW` | Rendering the floating draggable bubble over third-party apps. |
| `android.permission.FOREGROUND_SERVICE` | Uninterrupted background LLM streaming and reasoning. |
| `android.permission.FOREGROUND_SERVICE_DATA_SYNC` | Android 14+ requirement for background data sync services. |
| `android.permission.WAKE_LOCK` | Keeping the CPU active while streaming lengthy reasoning outputs. |
| `android.permission.POST_NOTIFICATIONS` | Android 13+ permission for foreground service sticky notification. |
| `android.permission.REQUEST_INSTALL_PACKAGES` | Installing APK updates downloaded via `AutoUpdater`. |

---

## 🔄 Cross-Platform Parity Contract

When modifying system prompts, analytical lenses, or settings on PC, you **MUST update the corresponding Android implementation** simultaneously.

Consult [CROSS_PLATFORM_SPEC.md](../CROSS_PLATFORM_SPEC.md) for the complete parity matrix, platform divergences, and sync rules.
