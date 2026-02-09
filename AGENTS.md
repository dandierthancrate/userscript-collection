# 🧠 Agents & Architecture (Technical Reference)

> **Scope**: This document provides a deep technical dive into the architecture, logic, and patterns used across the userscript collection. It is intended for developers and AI agents to understand the internal workings of the codebase.

## 🏗️ Core Architecture

### Philosophy
-   **No-Build**: Pure ES6+ JavaScript. No Webpack, no Babel, no external dependencies.
-   **Performance-First**: Logic is optimized for V8 (Chrome/Brave). Heavy operations are offloaded to `DecompressionStream` or web workers where possible.
-   **State Management**: Hybrid approach using `GM_getValue`/`GM_setValue` for persistence and local `state` objects for runtime speed.

### Shared Patterns
While scripts are standalone, they share architectural patterns:

#### 1. Service / Manager Pattern
Complex logic is encapsulated in static classes to separate concerns from the UI/Event loop.
-   **`GatewayManager`**: Handles multi-origin fetching with failover and racing (e.g., Arweave gateways).
-   **`Storage`**: A wrapper around `GM_*` APIs to provide typed getters/setters and default values.
-   **`RulesManager`**: Fetches, parses, and caches complex external rule sets (e.g., ClearURLs JSON).

#### 2. Observer Pattern (SPA Handling)
Since target sites (Spotify, Steam, YouTube) are Single Page Applications (SPAs), `MutationObserver` and `IntersectionObserver` are used extensively.
-   **Throttling**: Observer callbacks are throttled (`OBSERVER_THROTTLE_MS`) to prevent main-thread blocking.
-   **Specific Targeting**: Observers use specific `attributeFilter` or check `nodeType` to ignore irrelevant DOM changes.
-   **Visibility Awareness**: Observers disconnect when the tab is hidden (`document.hidden`) to save resources.

#### 3. Network Racing
To ensure speed and resilience, especially for decentralized storage (Arweave) or archives:
-   **Latency Racing**: `GatewayManager` or `MirrorManager` fires parallel `HEAD`/`GET` requests to multiple endpoints and uses the first successful response (`Promise.any` or equivalent logic).

---

## 📦 Agent Reference

### 1. Spotify LLM Lyrics Translator
**Type**: Active Agent (Overlay)
**Source**: [`spotify-llm-lyrics-translator.user.js`](./spotify-llm-lyrics-translator.user.js)

**Core Logic**:
Injects real-time translated lyrics into the Spotify Web Player by capturing lyric lines from the DOM and sending them to an LLM.

-   **Pipeline**:
    1.  **Observer**: Detects new lyric lines (`[data-testid="lyrics-line"]`).
    2.  **Filter**: Checks compatibility (removes ♪, checks if already English/Instrumental).
    3.  **Queue**: Batches lines to minimize API calls (`MAX_BATCH_SIZE`).
    4.  **LLM**: Sends batch to Groq/Cerebras with a strict JSON system prompt.
    5.  **Injection**: Inserts translated text into the DOM, bypassing React hydration issues by appending plain DOM nodes.

-   **Key Technologies**:
    -   **LLM API**: OpenAI-compatible endpoints (Groq/Cerebras).
    -   **Smart Skip**: A heuristic that calculates the ratio of "SKIP" responses in a batch. If >65% are skipped (instrumental/english), the agent "gives up" for the session to save tokens.
    -   **Caching**: Multi-layer caching:
        -   `normalizationCache`: Memoizes whitespace/lowercase normalization.
        -   `runtimeCache`: LRU cache (map) of translations to prevent re-fetching (persisted via `GM_setValue`).

### 2. Romheaven Steam Assistant
**Type**: Enhancement Tool (Injection)
**Source**: [`romheaven-steam-assistant.user.js`](./romheaven-steam-assistant.user.js)

**Core Logic**:
Injects a download panel into Steam store pages that fetches "Clean Steam Files" from the Romheaven repository (stored on Arweave).

-   **Pipeline**:
    1.  **SteamCMD**: Fetches the current public `buildid` for the game from `api.steamcmd.net`.
    2.  **GraphQL**: Queries the Arweave network for a transaction matching the specific File-ID and AppID.
    3.  **Gateway Race**: Races requests against `arweave.net`, `ar-io.net`, etc., to find the file metadata.
    4.  **Decompression**: Downloads a compressed metadata blob and uses the browser's native `DecompressionStream` (gzip) to parse it.
    5.  **Validation**: Compares the repository's build ID with Steam's live build ID to warn about outdated files.

-   **Key Technologies**:
    -   **Arweave / GraphQL**: Decentralized storage querying.
    -   **DecompressionStream**: Native stream API for high-performance decompression without libraries.

### 3. Share Archive
**Type**: Utility Agent (Background/Menu)
**Source**: [`share-archive.user.js`](./share-archive.user.js)

**Core Logic**:
A privacy tool that strips tracking parameters from URLs using ClearURLs rules and archives them via `archive.today`.

-   **Pipeline**:
    1.  **Rule Initialization**: Fetches `data.min.json` from the ClearURLs repo and compiles Regex patterns.
    2.  **Mirror Selection**: Latency-tests all `archive.*` TLDs (today, is, ph, etc.) and ranks them.
    3.  **URL Cleaning**:
        -   Applies platform-specific handlers (YouTube Shorts -> Watch, Google Redirects -> Target).
        -   Applies ClearURLs regex replacements.
        -   Manually strips known tracking params (`utm_`, `fbclid`, etc.).
    4.  **Action**: Opens the cleaned URL in the fastest archive mirror.

-   **Key Technologies**:
    -   **Regex Compilation**: Pre-compiles thousands of tracking rules for efficient matching.
    -   **Mirror Racing**: Dynamic selection of the best archive domain.

### 4. Nyaa Linker
**Type**: Enhancement Tool (Injection)
**Source**: [`nyaa-linker-userscript.user.js`](./nyaa-linker-userscript.user.js)

**Core Logic**:
Adds "Search Nyaa" buttons to anime/manga databases (MAL, AniList, Kitsu, etc.) by extracting and normalizing titles.

-   **Pipeline**:
    1.  **Site Adapter**: Sub-objects in `SITES` array define specific selectors for each supported site.
    2.  **Title Normalization**: `getBaseTitle()` strips seasons ("Season 2"), Part numbers ("Part 1"), and special characters to create a "base" query.
    3.  **Query Generation**: Generates complex search queries (e.g., `("Title"|"Base Title")`) to maximize hit rate.
    4.  **UI Injection**: Inserts buttons matching the target site's native UI style.

-   **Key Technologies**:
    -   **Strategy Pattern**: `SITES` array decouples site-specific DOM logic from the core linker logic.
    -   **SPA Awareness**: `awaitLoadOf` utility waits for specific elements to appear before injecting.

---

## 🛠️ Utilities & Tools

### 5. Disable YouTube Autoplay
**Source**: [`disable-youtube-channel-autoplay.user.js`](./disable-youtube-channel-autoplay.user.js) / [`disable-youtube-playlist-autoplay.user.js`](./disable-youtube-playlist-autoplay.user.js)
-   **Logic**:
    -   **Channel**: Detects `/channel/` paths, targets `#c4-player` (the banner video player), and forces `.pauseVideo()`.
    -   **Playlist**: Resets the `autoplay` toggle state on `yt-navigate-finish` events.
    -   **Optimization**: Uses specific `yt-navigate-finish` event listeners rather than heavy polling.

### 6. Enable Copy & Right Click
**Source**: [`enable-copy-and-right-click.user.js`](./enable-copy-and-right-click.user.js)
-   **Modes**:
    -   **Basic**: Stops event propagation for `contextmenu`, `copy`, `selectstart`.
    -   **Aggressive**: Patches `EventTarget.prototype.addEventListener` to block sites from even registering blocking listeners.
-   **Logic**: Injects CSS to force `user-select: text !important` and clears inline `on*` handlers.

### 7. Grok Rate Limit Display
**Source**: [`grok-rate-limit-display.user.js`](./grok-rate-limit-display.user.js)
-   **Logic**:
    -   **Model Detection**: Identifies the active LLM by parsing specific SVG path definitions in the model selector.
    -   **Polling**: Hits `/rest/rate-limits` to fetch quota.
    -   **UI Injection**: Uses `animationstart` on a specific selector (`.query-bar`) as a high-performance alternative to `MutationObserver` for detecting element insertion.

---

## 🛡️ Security & Privacy

### Script Security
-   **Content Injection**: Scripts prefer `textContent` over `innerHTML` to prevent XSS. When HTML is required, elements are built programmatically (`createElement`).
-   **Strict `@connect`**: All scripts declare exact domains in metadata. No wildcard access (`*`) is allowed unless absolutely necessary (e.g., `share-archive` needs to reach `archive.*` mirrors).

### Data Privacy
-   **Local Processing**: All logic runs client-side.
-   **API Keys**: Keys (Groq/Cerebras) are stored in `GM_setValue` (browser's extension storage) and never transmitted except to the official API endpoints.

---

## ⚡ Performance Guidelines

1.  **Loops**: Avoid `getBoundingClientRect` inside loops. Cache read values.
2.  **Regex**: Memoize expensive regex operations or text normalizations.
3.  **Storage**: Throttle `GM_setValue`. It is a blocking synchronous I/O operation in some managers.
4.  **DOM**: Minimize reflows. Append elements in batches or use `DocumentFragment`.
