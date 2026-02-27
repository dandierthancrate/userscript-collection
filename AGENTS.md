# AGENTS.md — Technical Codebase Reference

> **Purpose**: Complete technical reference for AI agents and developers working on this codebase.
> All scripts are standalone, no-build ES6+ userscripts targeting Brave/V8 via ScriptCat.

---

## Repository Layout

```
userscript-collection/
├── spotify-llm.user.js                       990 LOC  v2.21.0
├── nyaa-linker-userscript.user.js            663 LOC  v2.5.4
├── grok-rate-limit-display.user.js           477 LOC  v1.1.7
├── share-archive.user.js                     460 LOC  v1.3.4
├── romheaven-steam-assistant.user.js         283 LOC  v1.3.4
├── enable-copy-and-right-click.user.js       204 LOC  v1.9.5
├── steam-links-dropdowns.user.js             164 LOC  v1.2.7
├── fix-missing-spotify-lyrics.user.js        142 LOC  v1.1.5
├── disable-youtube-playlist-autoplay.user.js 103 LOC v1.0.12
├── disable-youtube-channel-autoplay.user.js   41 LOC  v1.0.12
├── README.md
├── LICENSE                                   GPL-3.0-or-later
└── AGENTS.md                                 (this file)
```

---

## Shared Architectural Patterns

### 1. Module Structure

Every script uses an IIFE `(function(){ 'use strict'; ... })()` or arrow IIFE `(() => { ... })()`.
Internal organization follows a consistent top-down order:

1. `CONFIG` object — all constants, thresholds, selectors, URLs
2. Utility functions/objects (`Utils`, `Storage`, helpers)
3. Service/Manager classes — encapsulate domain logic
4. UI class/rendering — DOM injection and updates
5. Orchestration (`App` object or `init()`) — ties everything together
6. Bootstrap — `App.init()`, event listeners, observers

### 2. Storage Wrapper

Scripts needing persistence wrap `GM_getValue`/`GM_setValue` in a `Storage` class/object:

| Script | Implementation | Purpose |
|---|---|---|
| `spotify-llm` | `class Storage` (static methods) | Provider keys, model IDs, LLM params, translation cache (`Map` ↔ `Object`) |
| `nyaa-linker-userscript` | `class Storage` (static methods) | Settings object (filter, category, query, hotkey, etc.) |
| `enable-copy-and-right-click` | `Store` object literal | Per-host whitelist arrays (`basicList`, `aggressiveList`) |
| `share-archive` | Direct `GM_getValue`/`GM_setValue` | ClearURLs rule cache, mirror ranking |
| `grok-rate-limit-display` | None (no persistence) | Runtime-only cache in `RateLimitManager` |

### 3. Observer Patterns

#### MutationObserver

Used in 8/10 scripts. Key strategies:

- **Throttled callbacks** — `spotify-llm` throttles container scans via `setTimeout` with `OBSERVER_THROTTLE_MS` (500ms).
- **Targeted observation** — `grok-rate-limit-display` observes only the query bar subtree to filter mutations from user input vs. model/button changes.
- **Attribute filtering** — `disable-youtube-playlist-autoplay` watches `aria-pressed` and `class` changes on specific buttons.
- **SPA navigation** — `nyaa-linker-userscript` and YouTube scripts detect URL path changes by comparing `location.href` segments on each mutation.
- **Visibility gating** — `spotify-llm` disconnects observers when `document.hidden === true` and reconnects on `visibilitychange`.

#### IntersectionObserver

Used in `spotify-llm` to lazily process lyric lines. `rootMargin: "300px 0px 300px 0px"` provides a 300px lookahead; once a line intersects, it is unobserved.

#### CSS Animation Detection

`grok-rate-limit-display` and `steam-links-dropdowns` use CSS `@keyframes` animations on target elements and listen for `animationstart` events to detect element insertion. This avoids a global MutationObserver entirely.

### 4. Input Validation & Security

**Added in 2025 refactors** — Security hardening for user inputs:

#### InputValidator Pattern (`nyaa-linker-userscript`)

```javascript
const InputValidator = {
  // Validate hotkey: single alphanumeric character only (prevent XSS)
  isValidHotkey: (key) => /^[a-zA-Z0-9]$/.test(key),
  
  // Sanitize custom text: strip script injection patterns
  sanitizeCustomText: (text) => text
    .replace(/<script[^>]*>.*?<\/script>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .trim(),
  
  // Validate settings object structure
  isValidSettings: (s) => s && typeof s === 'object' &&
    typeof s.hotkey_key_setting === 'string' &&
    typeof s.custom_text_setting === 'string'
};
```

**Usage:**
- Validate hotkey inputs (prevent special character injection)
- Sanitize custom text (strip `<script>`, `javascript:`, event handlers)
- Validate settings structure before saving to GM storage

#### Hostname Validation (`enable-copy-and-right-click`)

```javascript
addHost: (key) => {
  // Security: Validate hostname format to prevent storage pollution
  if (!/^[a-z0-9.-]+$/.test(HOST)) return;
  // ...
}
```

#### Protocol Validation (`share-archive`)

```javascript
// Sentinel Security: Block unsafe protocols
if (!['http:', 'https:'].includes(urlObj.protocol)) {
  return null; // Block javascript:, data:, file:
}
```

### 5. Query Strategies Pattern

**Extracted in 2025 refactors** — Strategy pattern for query generation (`nyaa-linker-userscript`):

```javascript
const QueryStrategies = {
  // Default: Exact match with OR fallback (quoted)
  default: (titleJap, titleEng, baseJap, baseEng, sameBase) => {
    return sameBase 
      ? `"${titleJap}"|"${titleEng}"` 
      : `"${titleJap}"|"${titleEng}"|"${baseJap}"|"${baseEng}"`;
  },
  
  // Fuzzy Default: Unquoted OR search with all variants
  fuzzy_default: (titleJap, titleEng, baseJap, baseEng, sameBase) => {
    return sameBase 
      ? `${titleJap}|${titleEng}` 
      : `${titleJap}|${titleEng}|${baseJap}|${baseEng}`;
  },
  
  // Base: Only use normalized titles
  base: (titleJap, titleEng, baseJap, baseEng, sameBase) => {
    return baseJap === baseEng 
      ? `"${titleJap}"|"${titleEng}"` 
      : `"${baseJap}"|"${baseEng}"`;
  },
  
  // Fuzzy: Japanese title only (unquoted)
  fuzzy: (titleJap) => titleJap,
  
  // Exact: Default fallback with quoted titles
  exact: (titleJap, titleEng) => `"${titleJap}"|"${titleEng}"`
};

// Usage: const strategy = QueryStrategies[queryType] || QueryStrategies.exact;
// return strategy(titleJap, titleEng, baseJap, baseEng, sameBase);
```

**Benefits:**
- Reduces cyclomatic complexity (eliminates large switch statements)
- Makes query logic testable and maintainable
- Easy to add new strategies without modifying existing code

### 6. Cache Layer with TTL

**Added in 2025 refactors** — TTL-based caching to prevent memory leaks (`spotify-llm`):

```javascript
const CACHE_TTL_MS = 3600000; // 1 hour TTL

// Cache entry: { value: any, timestamp: number }
const cache = new Map();

function getFromCache(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  // TTL check: Evict expired entries
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

function setInCache(key, value) {
  // Evict oldest if at capacity (LRU-style: delete first entry)
  if (cache.size >= 2000) {
    const oldestKey = cache.keys().next().value;
    cache.delete(oldestKey);
  }
  cache.set(key, { value, timestamp: Date.now() });
}
```

**Features:**
- Automatic TTL expiration (1 hour default)
- Capacity-based eviction (2000 entries max)
- Timestamp tracking for each entry
- Reusable helper functions (`getFromCache`, `setInCache`)

### 7. Network Patterns

#### Gateway Failover (`GatewayManager`)

`romheaven-steam-assistant` defines an ordered gateway list `['arweave.net', 'ar-io.net', 'g8way.io']` and tries each sequentially until one succeeds, throwing `GATEWAY_EXHAUSTED` if all fail.

#### Mirror Racing (`MirrorManager`)

`share-archive` fires parallel `HEAD` requests to 7 `archive.*` TLDs via `GM_xmlhttpRequest`, measures latency via `performance.now()`, sorts by fastest, and caches the ranking for 24 hours in `GM_setValue`.

#### API Rate Limiting

`spotify-llm-lyrics-translator` enforces `MIN_REQUEST_INTERVAL_MS` (5s) between LLM API calls. Error responses set dynamic backoffs (e.g. `429` → 60s, `503` → 15s) by pushing `lastRequestTimestamp` into the future.

`grok-rate-limit-display` has `CACHE_TTL` (10s) and `COOLDOWN` (2s) to prevent excessive polling of `/rest/rate-limits`.

### 5. Caching Layers

`spotify-llm-lyrics-translator` has the most complex caching:

| Cache | Key type | Max size | Eviction | Persistence |
|---|---|---|---|---|
| `runtimeCache` | Normalized lyric text | 10,000 | LRU (delete oldest) | `GM_setValue('llm_cache_v1')` |
| `normalizationCache` | Raw string | 2,000 | Delete oldest | Runtime only |
| `comparisonCache` | Raw string | 2,000 | Clear all | Runtime only |
| `hashCache` | Raw string | 2,000 | Clear all | Runtime only |

Cache save is throttled: `GM_setValue` is called at most once per 10 seconds (or when the queue empties) to avoid blocking the main thread.

### 8. DOM Injection Safety

- **`textContent` over `innerHTML`** — All scripts use `textContent` for user-visible text to prevent XSS. HTML is built programmatically via `createElement`.
- **Sibling injection** — `spotify-llm` inserts translations as siblings after `.lyrics-lyricsContent-text` (via `textEl.after(div)`) so Spotify's React hydration doesn't remove them.
- **Namespace SVGs** — `grok-rate-limit-display` creates SVG elements via `document.createElementNS('http://www.w3.org/2000/svg', ...)`.

### 9. Metadata Header Standard

All scripts follow this exact header order:
```
@name → @namespace → @version → @description → @author → @match → @exclude (if any)
→ @icon (if any) → @grant → @connect (if any) → @run-at (if any) → @license
→ @updateURL → @downloadURL
```

- `@namespace` is always `https://github.com/dandierthancrate/userscript-collection`
- `@license` is always `GPL-3.0-or-later`
- `@updateURL` / `@downloadURL` point to `raw.githubusercontent.com/.../main/<filename>`

---

## Per-Script Technical Reference

### 1. Spotify LLM Lyrics Translator

**File**: `spotify-llm-lyrics-translator.user.js` · **969 LOC** · **Grants**: `GM_xmlhttpRequest`, `GM_setValue`, `GM_getValue`, `GM_registerMenuCommand`, `GM_addStyle`, `GM_info`

**What it does**: Intercepts Spotify Web Player lyric lines, batches them, translates via LLM API (Groq or Cerebras), and injects translations into the DOM in real-time.

#### Architecture

```
Observer Layer → processLyricElement() → Cache Check → Queue
                                                         ↓
                                         processQueueLoop() (rate-limited)
                                                         ↓
                                         fetchBatchTranslation() → LLM API
                                                         ↓
                                         applyTranslationToDOM() → DOM
```

#### Key Internals

- **Provider system**: `PROVIDERS` object maps provider IDs (`groq`, `cerebras`) to URLs, storage keys. `switchProvider()` reloads the page for clean state.
- **Language detection**: Unicode range regex (`HIRAGANA`, `KATAKANA`, `CJK_UNIFIED`, `HANGUL`) determines source language for prompt selection. `needsTranslation()` is the gate.
- **Batch processing**: Queue collects lyric elements, deduplicates text via `textToId` Map, and sends up to `MAX_BATCH_SIZE` (20) lines per API call. Lines are sorted by viewport visibility tier (visible → below → above → hidden).
- **Smart Skip**: After translation, if ≥65% of batch responses are `"SKIP"` (English/instrumental), `smartSkipTriggered` is set and all remaining queue items are auto-skipped for the session. Existing translations are removed from the DOM.
- **LLM prompt**: XML-structured system prompt with language-specific grammar rules (Japanese particles, Korean speech levels, Chinese aspect markers). Includes song context from `getCurrentTrackInfo()`.
- **Reasoning suppression**: Provider-specific handling — Groq uses `include_reasoning: false` for `gpt-oss` models, `reasoning_format: "hidden"` otherwise. Cerebras always uses `reasoning_format: "hidden"`.
- **JSON repair**: `repairBrokenJson()` fixes missing commas between entries. Regex extraction `raw.match(/\{[\s\S]*\}/)` handles markdown/commentary wrapping.
- **Error handling**: `ERROR_CONFIG` maps HTTP status codes to `{ fallbackMsg, backoffMs, isFatal, shouldLog }`. Fatal errors (401, 403, 404) halt the loop entirely.
- **Menu commands**: 12+ commands for provider switching, model/key config, temperature/top_p/max_tokens, text color, smart skip toggle, cache clear.

---

### 2. Nyaa Linker Userscript

**File**: `nyaa-linker-userscript.user.js` · **576 LOC** · **Grants**: `GM_getValue`, `GM_setValue`, `GM_registerMenuCommand`

**What it does**: Injects "Search on Nyaa" buttons into anime/manga database sites (MAL, AniList, Kitsu, Anime-Planet, ANN, AniDB, LiveChart, MangaBaka).

#### Architecture

- **Strategy pattern**: `SITES` array contains 8 site adapters, each with `name`, `match` (RegExp), and `run(domain)` async function. `init()` iterates and dispatches.
- **Settings system**: `SETTINGS_CONFIG` array defines 12 settings (filter, category, query type, sort, order, hotkey, custom text, etc.) with types and defaults. Settings panel is a DOM-built grid modal.
- **Title normalization**: `getBaseTitle()` strips season numbers, part indicators, ordinals ("2nd", "third"), subtitles (after `:` or ` - `), special characters (`♡♥☆★♪∞`), and trailing punctuation.
- **Query generation**: 5 modes — `default` (quoted OR), `fuzzy_default` (unquoted OR with base titles), `fuzzy` (Japanese title only), `exact` (quoted pair), `base` (base titles only).
- **SPA handling**: `awaitLoadOf()` is an IIFE-encapsulated utility that returns a Promise. Uses a shared `MutationObserver` with a `Set` of listeners. Supports 3 match modes: `text` (element contains text), `count` (element count threshold), `container` (has children).
- **MangaBaka integration**: Listens for custom `mb:element:ready` events. Uses `mbHandled` Set to deduplicate injections. Handles both card and detail page layouts.
- **Category mapping**: `setCategory()` maps anime categories (`0_0`, `1_2`, `1_3`, `1_4`) to manga equivalents (`3_0`, `3_1`, `3_2`, `3_3`).
- **Sukebei support**: Hentai content detection (genre check) switches domain to `sukebei.nyaa.si` and adjusts category.

---

### 3. Grok Rate Limit Display

**File**: `grok-rate-limit-display.user.js` · **477 LOC** · **Grants**: `GM_addStyle`

**What it does**: Displays remaining query quota and cooldown timers for grok.com models inside the query bar.

#### Architecture

- **`ModelManager`** (static class): Detects active model via text content (`span.font-semibold`), SVG path matching (`SVG_PATTERNS`), or yellow fill class. Maps display names to API model IDs. Determines effort level (`high`, `low`, `both`) and request kind (`DEFAULT`, `REASONING`, `DEEPSEARCH`, `DEEPERSEARCH`).
- **`RateLimitManager`** (instance): Fetches `/rest/rate-limits` via native `fetch()` with `credentials: 'include'`. Has per-model, per-requestKind cache with 10s TTL and 2s cooldown between requests. `process()` normalizes API response into `{ remaining, wait, isFree, cost }` format, handling free-tier token division.
- **`RateLimitUI`** (instance): Creates a pill-shaped element injected before the submit button. Renders gauge/clock SVG icons, remaining count, divider for dual-effort models, and countdown timer. Uses Lucide-style SVG with `createElementNS`.
- **`App`** (orchestrator object): Manages `MutationObserver` on query bar (debounced 300ms), `visibilitychange` listener, 30s poll interval, input `keydown` listener (refresh after Enter), and model-specific button observers for Think/DeepSearch toggles.
- **CSS animation trick**: Instead of a global `MutationObserver`, injects a 0.001s CSS animation on `.query-bar` and listens for `animationstart` to detect element creation.
- **Free tier handling**: When `totalTokens <= 80`, divides `remainingQueries` by `cost` to show effective remaining queries.

---

### 4. Share Archive

**File**: `share-archive.user.js` · **447 LOC** · **Grants**: `GM_registerMenuCommand`, `GM_openInTab`, `GM_xmlhttpRequest`, `GM_setValue`, `GM_getValue`

**What it does**: Privacy tool that strips tracking parameters from URLs and archives/searches them via the fastest `archive.*` mirror.

#### Architecture

- **`MirrorManager`** (object literal): Tests 7 TLDs (`today`, `is`, `ph`, `vn`, `fo`, `li`, `md`) via parallel `HEAD` requests. Caches ranking for 24h.
- **`RulesManager`** (object literal): Fetches ClearURLs `data.min.json` from GitLab, caches for 7 days. `compilePatterns()` pre-compiles all provider regexes (`_urlPattern`, `_rules`, `_redirections`, `_exceptions`).
- **Platform handlers**: `PLATFORM_HANDLERS` array (6 entries) handles site-specific transforms:
  - Google redirects → extract target URL from `?url=` param
  - YouTube → shorts→watch conversion, music.→www, nested `?q=` cleaning
  - Substack → add `?no_cover=true`
  - Amazon → strip `/ref=...` from pathname
  - Telegram → prefix path with `/s/`
  - Mailchimp → remove `?e=` param
- **Fallback tracking params**: 70+ known tracking parameters in a `Set` for O(1) lookup.
- **Cleaning pipeline**: `processArchiveUrl()` → `applyClearUrls()` → platform handlers → fallback param stripping → hash removal.
- **User interaction**: Menu commands for archive/search current page. Click handler: `Ctrl+Alt+Click` = archive link, `Ctrl+Shift+Click` = search link. Runs at `document-start`.

---

### 5. Romheaven Steam Assistant

**File**: `romheaven-steam-assistant.user.js` · **283 LOC** · **Grants**: `GM_addStyle`, `GM_xmlhttpRequest`

**What it does**: Injects a download panel on Steam store pages for "Clean Steam Files" from Romheaven's Arweave-stored repository.

#### Architecture

- **`GatewayManager`** (static class): Sequential failover across 3 Arweave gateways.
- **`SteamService`** (static class): Fetches `buildid` from `api.steamcmd.net/v1/info/{appid}`.
- **`RomheavenService`** (static class):
  1. `getMetadata()` — GraphQL query to Arweave for the latest transaction matching `File-Id` tag.
  2. `getGameData(txId, appid)` — Fetches transaction data, follows `dataTxId` reference, decompresses gzipped JSON via `DecompressionStream`, finds game entry by `appid`.
  3. `getPixeldrainInfo(id)` — Checks if Pixeldrain mirror is alive.
- **`RomheavenUI`** (instance class): Builds a styled panel (`#rh-box`) with gradient background, download buttons (primary/secondary/retry). Version comparison shows ✅ if `buildId === build`, ℹ️ with SteamDB link otherwise.
- **`Utils.decompress()`**: Uses `new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'))` for native gzip decompression without libraries.
- **Parallel init**: `Promise.all([SteamService.getBuildId(), RomheavenService.getMetadata()])` for concurrent API calls.

---

### 6. Enable Copy & Right Click

**File**: `enable-copy-and-right-click.user.js` · **182 LOC** · **Grants**: `GM_registerMenuCommand`, `GM_setValue`, `GM_getValue`

**What it does**: Force-enables right-click, copy, paste, and text selection on restricted websites using a per-host whitelist.

#### Architecture

- **Three modes**: `OFF` (default), `BASIC` (capture-phase `stopPropagation` on 6 events), `AGGRESSIVE` (adds `stopImmediatePropagation` on 11 events + patches `EventTarget.prototype.addEventListener` to block registration).
- **Per-host storage**: Two arrays (`basicList`, `aggressiveList`) in `GM_setValue`. Host membership checked on each page load.
- **Two-phase activation**:
  1. **Immediate** (at `document-start`): Inject CSS `user-select: text !important`, suppress copy-protection dialogs (wraps `window.alert`/`window.confirm` to swallow messages matching `/copy|right.?click|select|protect|disable/i`), patch `addEventListener`, register capture-phase blockers.
  2. **DOM Ready**: Clear inline `on*` handlers on all elements, observe for new `draggable=true` elements.
- **Frame guard**: `if (window !== window.top) return;` — only runs in top frame.

---

### 7. Steam Links Dropdowns

**File**: `steam-links-dropdowns.user.js` · **164 LOC** · **Grants**: `GM_addStyle`

**What it does**: Adds "Find..." and "Misc" dropdown menus on Steam app pages with links to download/cheat sites.

#### Architecture

- **`DROPDOWNS`** config: Array of `{ label, items[] }` where items are either `{ header }` (section divider) or `{ name, url }` (link with `{q}` placeholder).
- **Title sanitization**: `sanitize()` strips trademark symbols, edition suffixes (Remastered, Ultimate, GOTY, etc.), VR tags, and trailing years.
- **Dropdown positioning**: Calculates via `getBoundingClientRect()`, flips above button if `< 200px` space below.
- **Singleton panel**: Only one `activePanel` at a time; clicking another closes the previous.
- **Injection point**: Targets `.apphub_OtherSiteInfo` hub, inserting before the Steam Community link. Falls back to `MutationObserver` if hub isn't loaded yet.

---

### 8. Fix Missing Spotify Lyrics

**File**: `fix-missing-spotify-lyrics.user.js` · **142 LOC** · **Grants**: `GM_xmlhttpRequest`

**What it does**: When Spotify shows "Lyrics not available", fetches lyrics from LRCLIB or lyrics.com and displays them inline.

#### Architecture

- **Provider chain**: `PROVIDERS` array (`LRCLIB` → `lyrics.com`). Falls through on failure.
- **LRCLIB**: REST API with `artist_name`, `track_name`, `duration` params. Prefers `plainLyrics`; strips timestamps from `syncedLyrics` as fallback.
- **lyrics.com**: Multi-step web scraping — artist search → artist page → song page → extract `<pre id="lyric-body-text">`. Uses `getTitleVariants()` to try base title, dash-split, paren-removed, and combined variants.
- **Trigger**: `MutationObserver` on `document.body` watches for `data-testid="lyrics-button"` with `data-active="true"`. Second observer on `<title>` element resets `hasFetchedLyrics` on song change.
- **Guard**: Skips if `data-testid="fullscreen-lyric"` exists (Spotify already has lyrics).

---

### 9. Disable YouTube Playlist Autoplay

**File**: `disable-youtube-playlist-autoplay.user.js` · **103 LOC** · **No grants**

**What it does**: Prevents playlist auto-advancement and auto-plays in YouTube playlists while preserving manual next-video actions.

#### Architecture

- **Method wrapping**: Wraps `player.nextVideo()` and `player.queueNextVideo()` — blocks unless `userTriggered` flag is set.
- **Autonav override**: Wraps `player.setAutonav()` / `setAutonavState()` to force-disable on playlist pages.
- **Playlist manager freeze**: `Object.defineProperty()` on `yt-playlist-manager.canAutoAdvance_` with getter returning `false`.
- **User intent tracking**: Click listener on playlist panel renderers, next buttons, and `Shift+N` / `MediaTrackNext` key events set `userTriggered = true`.
- **Video end handler**: On `ended` event, forces `pauseVideo()` at 0ms, 50ms, and 150ms delays to catch all auto-advance paths.
- **Reinit**: Listens for `yt-navigate-finish` and `MutationObserver` on `document.body` to re-hook after SPA navigation.

---

### 10. Disable YouTube Channel Autoplay

**File**: `disable-youtube-channel-autoplay.user.js` · **41 LOC** · **No grants**

**What it does**: Pauses the featured/banner video on YouTube channel pages.

#### Architecture

- **Channel detection**: Checks if `location.pathname` starts with `/@`, `/channel/`, `/c/`, or `/user/`.
- **Target**: `#c4-player` element's `.pauseVideo()` method.
- **Dedup**: `pausedForPath` tracks which path was already paused to avoid re-triggering on DOM mutations.
- **Navigation handling**: `yt-navigate-finish` event resets `pausedForPath` and retries at 100ms and 500ms delays.
- **Runs at**: `document-start` with `MutationObserver` on `document.documentElement`.

---

## Security Model

| Concern | Approach |
|---|---|
| XSS prevention | `textContent` for all user/API text. `createElement` for HTML. No `innerHTML` with dynamic data. |
| Input validation | `InputValidator` pattern (`nyaa-linker`) validates hotkeys, sanitizes custom text, validates settings structure. |
| Protocol validation | `share-archive` blocks `javascript:`, `data:`, `file:` protocols via allowlist (`http:`, `https:` only). |
| Hostname validation | `enable-copy-and-right-click` validates hostname format (`/^[a-z0-9.-]+$/`) before storing in GM. |
| `@connect` scoping | Each script declares exact domains. No wildcards except `share-archive` (7 `archive.*` TLDs). |
| API key storage | `GM_setValue` (browser extension-sandboxed storage). Keys only sent to declared `@connect` endpoints. |
| Frame isolation | `enable-copy-and-right-click` and YouTube scripts check `window === window.top`. |
| Dialog suppression | `enable-copy-and-right-click` wraps `alert`/`confirm` to block copy-protection messages only (regex-filtered). |

## Test Coverage

| Script | Test File | Coverage |
|---|---|---|
| `spotify-llm` | `test_spotify_llm_cache.js`, `test_spotify_llm_optimization.js`, `test_spotify_llm_security.js`, `test_spotify_llm_status.js`, `test_spotify_llm_validation.js` | Cache layer, TTL, normalization, security, validation |
| `nyaa-linker` | `test_nyaa_linker_optimization.js`, `test_nyaa_linker_repro.js`, `test_nyaa_linker_settings_a11y.js`, `test_nyaa_input_validator.js`, `test_nyaa_hotkey_ignore_input.js` | Title normalization, query strategies, input validation, accessibility |
| `share-archive` | `share-archive.security.test.js` | Protocol validation, mirror ranking, ClearURLs integration |
| `romheaven-steam` | `romheaven_security_test.js`, `romheaven_ux_test.js`, `test_romheaven_gateway.js`, `test_romheaven_owner_check.js` | Gateway failover, decompression, ownership checks |
| `grok-rate-limit` | `test_grok_rate_limit.js`, `test_grok_optimization.js` | UI rendering, API parsing, caching |
| `enable-copy` | `test_enable_copy_perf.js` | Event blocking, mode switching, performance |
| `steam-links-dropdowns` | `test_steam_links_perf.js`, `test_steam_links_a11y.js`, `test_steam_links_menu_nav.js`, `test_steam_links_security.js` | CSS animation detection, accessibility, navigation, security |
| `youtube-autoplay` | `test_youtube_autoplay_perf.js`, `test_youtube_playlist_optimization.js` | Autoplay prevention, performance |
| `utils` (shared) | `test_utils.js` | Storage, TTL cache, observers, DOM helpers, input validation |

## Development Setup

### Prerequisites

- Node.js >= 18.0.0
- npm or pnpm

### Installation

```bash
npm install
```

### Available Scripts

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Lint all files (ScriptCat-optimized rules)
npm run lint

# Auto-fix lint issues
npm run lint:fix

# Format all files with Prettier
npm run format

# Check formatting without fixing
npm run format:check
```

### Shared Utilities

A shared utility module is available at `src/utils.js` with the following exports:

| Function | Description |
|---|---|
| `createStorage(prefix, options)` | Typed storage wrapper with memory caching and TTL |
| `createTTLCache(options)` | TTL-based cache with LRU eviction and capacity limits |
| `createThrottledObserver(callback, options)` | Throttled MutationObserver with SPA navigation support |
| `createLazyObserver(callback, options)` | IntersectionObserver for lazy-loading elements |
| `injectCSS(css, id)` | Safely inject CSS into the page |
| `createElement(tag, props, children)` | Create elements with attributes and children |
| `waitForElement(selector, options)` | Wait for element with timeout |
| `sanitizeHTML(html)` | Escape HTML to prevent XSS |
| `InputValidator` | Input validation helpers (hotkeys, hostnames, text sanitization) |

#### Example Usage

```javascript
import { createStorage, createTTLCache, createElement } from './src/utils.js';

// Storage with 5-second cache
const storage = createStorage('myscript_', { useCache: true, cacheTTL: 5000 });
storage.set('key', 'value');
const val = storage.get('key', 'default');

// TTL cache with 1-hour expiration
const cache = createTTLCache({ maxSize: 2000, defaultTTL: 3600000 });
cache.set('lyric_hash', { translation: '...' });
const cached = cache.get('lyric_hash');

// Throttled observer
const observer = createThrottledObserver(
    (mutations) => { /* handle mutations */ },
    { throttleMs: 300, onNavigate: (oldPath, newPath) => { /* SPA nav */ } }
);
observer.observe(document.body);

// Safe element creation
const btn = createElement('button', {
    className: 'rh-btn',
    textContent: 'Download',
    style: { color: 'white', backgroundColor: 'blue' },
    onClick: () => { /* handler */ }
}, [createElement('span', { textContent: 'icon' })]);
```

## Performance Guidelines

1. **Loops**: Never call `getBoundingClientRect` inside sort comparisons without caching results (see `rectCache` in lyrics translator).
2. **Regex**: Memoize expensive normalizations. All per-line caches have 2,000-entry caps with eviction.
3. **Storage**: Throttle `GM_setValue` — it is synchronous I/O in some managers. The lyrics translator saves cache at most once per 10 seconds.
4. **DOM**: Minimize reflows. Batch element creation. Use `textContent` (no reparse) over `innerText` (triggers layout).
5. **Observers**: Use the most specific `observe()` config possible. Disconnect when tab is hidden. Prefer `animationstart` CSS trick over global `MutationObserver` for element insertion detection.
6. **Idle scheduling**: Use `requestIdleCallback` with timeout fallback for non-urgent work (see `scheduleObserverCheck`).
