# 🛠️ Userscript Collection - Gemini Context

This repository is a curated collection of browser userscripts designed to enhance various
websites (YouTube, Spotify, Steam, etc.). The scripts are optimized for performance and
intended for use with userscript managers like **ScriptCat** or **Tampermonkey** on
Chromium-based browsers.

## 📂 Project Structure

The repository consists of individual JavaScript files (`.user.js`) in a flat structure.
Each file is a standalone script.

### Key Files & Scripts

| File | Description |
| :--- | :--- |
| `spotify-llm-lyrics-translator.user.js` | **Complex:** Translates Spotify lyrics using LLM APIs. Features a robust UI, caching, and settings menu. |
| `disable-youtube-channel-autoplay.user.js` | **Simple:** Prevents channel trailers from autoplaying on YouTube. |
| `enable-copy-right-click-fork.user.js` | **Utility:** Force-enables right-click and copy on restricted sites. |
| `disable-youtube-playlist-autoplay.user.js` | Stops video playback at the end of a video to prevent playlist auto-advance. |
| `fix-missing-spotify-lyrics-fork.user.js` | Fetches missing lyrics from external sources for Spotify. |
| `grok-rate-limit-display-fork.user.js` | Displays rate limits on grok.com. |
| `share-archive.user.js` | **Utility:** Archives pages to archive.today with ClearURLs integration, platform-specific optimizations, and tracking param removal. |
| `README.md` | User-facing documentation and installation links. |

## 💻 Development Conventions

When modifying or creating scripts in this repository, adhere to the following standards:

### 1. Script Architecture

* **IIFE:** All scripts must be wrapped in an Immediately Invoked Function Expression to
    prevent global scope pollution.

    ```javascript
    (function () {
        'use strict';
        // Code here
    })();
    ```

* **Strict Mode:** Always use `'use strict';`.
* **Metadata Block:** Every script **must** begin with a `// ==UserScript==` block
    containing basic metadata (@name, @version, @match, @grant, @license).

### 2. Coding Style

* **Modern JavaScript:** Use `const`/`let` (no `var`), arrow functions, and async/await.
* **Performance:**
  * Use `MutationObserver` for dynamic content instead of `setInterval` whenever possible.
  * Throttle/debounce expensive operations and minimize DOM reflows.
* **Configuration:**
  * Use `const CONFIG = { ... }` at the top of the function for hardcoded values.
  * Use `GM_registerMenuCommand` to expose user-configurable settings.
  * Use `GM_getValue` / `GM_setValue` for persistent user preferences.

### 3. External Interactions

* **Cross-Origin Requests:** Use `GM_xmlhttpRequest` for API calls (e.g., LLM APIs).
* **Styling:** Inject CSS using `GM_addStyle` or by creating `<style>` elements.

## 🚀 Installation & Testing

Since there is no build step, testing involves:

1. **Local Install:** Copy the content of the `.user.js` file.
2. **Paste:** Open your userscript manager (ScriptCat), create a new script, and paste.
3. **Run:** Navigate to the matched URL and verify functionality.
4. **Debug:** Use `console.log` and the browser's DevTools.

## 📜 License

All work is licensed under **GPL-3.0-or-later**. Ensure this license header is present in
all new scripts.
