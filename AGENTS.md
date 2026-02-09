# Agents & Tools Documentation

This repository contains a collection of "Agents" (userscripts) that act as intelligent overlays on your web browsing experience. This document describes their capabilities, inputs, outputs, and interaction models.

## 🎵 Spotify LLM Lyrics Translator

**Type**: Active Agent
**Source**: `spotify-llm-lyrics-translator.user.js`

A sophisticated agent that injects itself into the Spotify Web Player to provide real-time lyric translations using Large Language Models (LLMs).

### Capabilities
-   **Real-time Translation**: Detects non-English lyrics (Japanese, Korean, Chinese, etc.) and translates them on the fly.
-   **Context-Aware**: Uses prompts designed to capture emotional tone and proper nouns.
-   **Smart Caching**: Caches translations locally to minimize API usage and latency.
-   **Smart Skip**: Learns when lyrics are instrumental or untranslatable to avoid wasting tokens.

### Interaction
-   **Automatic**: The agent runs automatically when it detects lyrics on the screen.
-   **Configuration Menu** (available via userscript manager menu):
    -   `🔌 Use [Provider]`: Switch between Groq and Cerebras.
    -   `🤖 [Provider] Model`: Set specific model IDs (e.g., `llama-3.3-70b-versatile`).
    -   `🔑 [Provider] API Key`: securely input your API keys.
    -   `🌡️ Temperature` / `🎲 Top P`: Adjust creativity vs. accuracy.
    -   `🎨 Text Color`: Customize the translation overlay color.
    -   `🎯 Smart Skip`: Toggle the intelligent skipping heuristic.

### Input/Output
-   **Input**: Raw lyric lines from Spotify's DOM.
-   **Output**: Translated text lines injected directly below the original lyrics in the Spotify UI.

---

## 📦 Share Archive

**Type**: Utility Agent
**Source**: `share-archive.user.js`

A privacy-focused agent that facilitates archiving web pages and sharing clean links. It integrates with `archive.today` mirrors and strips tracking parameters.

### Capabilities
-   **Link Cleaning**: Removes tracking parameters (UTM, fbc, etc.) before archiving using ClearURLs rules.
-   **Mirror Management**: Automatically tests and selects the fastest `archive.*` mirror.
-   **Platform Handlers**: Special handling for YouTube shorts, Google redirects, and more.

### Interaction
-   **Menu Commands**:
    -   `Archive Current Page`: Opens the current page in `archive.today`.
    -   `Search Archive for Page`: Checks if the current page is already archived.
    -   `Show Mirror Ranking`: Displays current latency stats for archive mirrors.
-   **Mouse Shortcuts**:
    -   `Ctrl + Alt + Click` on a link: Archive that specific link.
    -   `Ctrl + Shift + Click` on a link: Search that link in the archive.

---

## 📺 YouTube Automation Agents

**Type**: Passive Guardrails
**Source**: `disable-youtube-channel-autoplay.user.js`, `disable-youtube-playlist-autoplay.user.js`

Set-and-forget agents that enforce user preferences on YouTube.

### Capabilities
-   **Channel Guard**: Prevents the "featured video" on a channel homepage from blasting audio/video automatically.
-   **Playlist Guard**: Stops video playback at the end of a video and prevents the "Autoplay" toggle from advancing to the next video in a playlist.

### Interaction
-   **Passive**: No user interaction required. They run silently in the background.

---

## 🎮 Steam & Gaming Assistants

**Type**: Enhancement Tools
**Source**: `romheaven-steam-assistant.user.js`, `steam-links-dropdowns.user.js`

Agents that augment Steam Store pages with external data and download options.

### Capabilities
-   **Romheaven Steam Assistant**: Injects "Clean Steam Files" download buttons directly onto the Steam store page for a game.
-   **Steam Links Dropdowns**: Adds a dropdown menu with quick searches for the current game on various piracy/resource sites (CS.RIN.RU, SteamDB, etc.).

### Interaction
-   **Visual**: Adds new buttons/menus to the Steam interface. Click to use.

---

## 🛠️ Utility Tools

| Agent Name | Description | Interaction |
| :--- | :--- | :--- |
| **Fix Missing Spotify Lyrics** | Fetches lyrics from external sources (LRCLIB) when Spotify has none. | Automatic fallback. |
| **Grok Rate Limit Display** | Adds a HUD to `grok.com` showing remaining queries and reset times. | Visual overlay. |
| **Enable Copy & Right Click** | Unlocks right-click and selection on sites that block it. | Passive / Always on. |
| **Nyaa Linker Userscript** | Adds "Search Nyaa" buttons to anime database sites (MAL, AniList). | Visual button injection. |
