# Agents & Tools Documentation

This repository contains a collection of "Agents" (userscripts) that act as intelligent overlays on your web browsing experience. This document describes their capabilities, inputs, outputs, and interaction models.

## 🤖 AI & Productivity

### Enable Copy & Right Click

**Type**: Passive Tool
**Source**: `enable-copy-and-right-click.user.js`

Force enables right-click, selection, and copy on restricted sites (whitelist mode by default).

#### Interaction
-   **Passive / Always on**: Works automatically on configured sites.
-   **Menu Commands**: Toggle between specific modes (Basic/Aggressive) or disable for the current site.

---

### Grok Rate Limit Display

**Type**: Visual Overlay
**Source**: `grok-rate-limit-display.user.js`

Adds a HUD to `grok.com` showing remaining queries and reset times.

#### Interaction
-   **Visual Overlay**: Displays a small box with usage stats.

---

### Nyaa Linker Userscript

**Type**: Enhancement Tool
**Source**: `nyaa-linker-userscript.user.js`

Adds "Search Nyaa" buttons to anime database sites (MAL, AniList) to quickly find downloads.

#### Interaction
-   **Visual Button Injection**: Adds clickable buttons next to anime entries on supported sites.

---

### Share Archive

**Type**: Utility Agent
**Source**: `share-archive.user.js`

A privacy-focused agent that facilitates archiving web pages and sharing clean links. It integrates with `archive.today` mirrors and strips tracking parameters.

#### Capabilities
-   **Link Cleaning**: Removes tracking parameters (UTM, fbc, etc.) before archiving using ClearURLs rules.
-   **Mirror Management**: Automatically tests and selects the fastest `archive.*` mirror.
-   **Platform Handlers**: Special handling for YouTube shorts, Google redirects, and more.

#### Interaction
-   **Menu Commands**:
    -   `Archive Current Page`: Opens the current page in `archive.today`.
    -   `Search Archive for Page`: Checks if the current page is already archived.
    -   `Show Mirror Ranking`: Displays current latency stats for archive mirrors.
-   **Mouse Shortcuts**:
    -   `Ctrl + Alt + Click` on a link: Archive that specific link.
    -   `Ctrl + Shift + Click` on a link: Search that link in the archive.

---

## 🎵 Spotify

### Fix Missing Spotify Lyrics

**Type**: Fallback Agent
**Source**: `fix-missing-spotify-lyrics.user.js`

Fetches lyrics from external sources (LRCLIB, lyrics.com) when Spotify has none available.

#### Interaction
-   **Automatic Fallback**: Runs automatically when it detects a song with no lyrics on Spotify.

---

### Spotify LLM Lyrics Translator

**Type**: Active Agent
**Source**: `spotify-llm-lyrics-translator.user.js`

A sophisticated agent that injects itself into the Spotify Web Player to provide real-time lyric translations using Large Language Models (LLMs).

#### Capabilities
-   **Real-time Translation**: Detects non-English lyrics (Japanese, Korean, Chinese, etc.) and translates them on the fly.
-   **Context-Aware**: Uses prompts designed to capture emotional tone and proper nouns.
-   **Smart Caching**: Caches translations locally to minimize API usage and latency.
-   **Smart Skip**: Learns when lyrics are instrumental or untranslatable to avoid wasting tokens.

#### Interaction
-   **Automatic**: The agent runs automatically when it detects lyrics on the screen.
-   **Configuration Menu** (available via userscript manager menu):
    -   `🔌 Use [Provider]`: Switch between Groq and Cerebras.
    -   `🤖 [Provider] Model`: Set specific model IDs (e.g., `llama-3.3-70b-versatile`).
    -   `🔑 [Provider] API Key`: securely input your API keys.
    -   `🌡️ Temperature` / `🎲 Top P`: Adjust creativity vs. accuracy.
    -   `🎨 Text Color`: Customize the translation overlay color.
    -   `🎯 Smart Skip`: Toggle the intelligent skipping heuristic.

#### Input/Output
-   **Input**: Raw lyric lines from Spotify's DOM.
-   **Output**: Translated text lines injected directly below the original lyrics in the Spotify UI.

---

## 🎮 Steam & Gaming

### Romheaven Steam Assistant

**Type**: Enhancement Tool
**Source**: `romheaven-steam-assistant.user.js`

Injects "Clean Steam Files" download buttons directly onto the Steam store page for a game.

#### Interaction
-   **Visual Button Injection**: Adds download buttons to the Steam store sidebar.

---

### Steam Links Dropdowns

**Type**: Enhancement Tool
**Source**: `steam-links-dropdowns.user.js`

Adds a dropdown menu with quick searches for the current game on various piracy/resource sites (CS.RIN.RU, SteamDB, etc.).

#### Interaction
-   **Visual Menu**: Adds a dropdown menu to the Steam store page.

---

## � YouTube

### Disable YouTube Channel Autoplay

**Type**: Passive Guardrail
**Source**: `disable-youtube-channel-autoplay.user.js`

Prevents the "featured video" on a channel homepage from blasting audio/video automatically.

#### Interaction
-   **Passive**: Runs silently in the background when visiting a channel page.

---

### Disable YouTube Playlist Autoplay

**Type**: Passive Guardrail
**Source**: `disable-youtube-playlist-autoplay.user.js`

Stops video playback at the end of a video and prevents the "Autoplay" toggle from advancing to the next video in a playlist.

#### Interaction
-   **Passive**: Runs silently in the background when watching a playlist.
