// ==UserScript==
// @name         Spotify LLM Lyrics Translator
// @namespace    https://docs.scriptcat.org/
// @version      2.20.1
// @description  Translates Spotify lyrics using LLM API.
// @author       Antigravity
// @match        https://open.spotify.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @grant        GM_addStyle
// @grant        GM_info
// @connect      api.cerebras.ai
// @connect      api.groq.com
// @license      GPL-3.0-or-later
// ==/UserScript==

(function () {
    'use strict';

    const CONFIG = {
        MIN_REQUEST_INTERVAL_MS: 5000,
        BATCH_COLLECTION_DELAY_MS: 200,
        MAX_BATCH_SIZE: 20,
        DEFAULT_COLOR: '#b3b3b3',
        TRANSLATION_CLASS: 'llm-translation-text',
        PROCESSED_ATTR: 'data-llm-processed',
        MAX_CACHE_SIZE: 10000, // Port from Spicetify: increased cache size
        OBSERVER_THROTTLE_MS: 500,
        SMART_SKIP_THRESHOLD: 0.65,
        // Default LLM Parameters
        DEFAULT_TEMPERATURE: 0.6,
        DEFAULT_TOP_P: 0.95,
        DEFAULT_MAX_COMPLETION_TOKENS: 2048
    };

    const LYRIC_SELECTOR = '[data-testid="lyrics-line"], [data-testid="fullscreen-lyric"], .lyrics-lyricsContent-lyric, .lyrics-lyricsContainer-LyricsLine';

    // Language Detection Patterns
    const HIRAGANA = /[\u3040-\u309F]/;
    const KATAKANA = /[\u30A0-\u30FF]/;
    const CJK_UNIFIED = /[\u4E00-\u9FFF]/;
    const HANGUL = /[\uAC00-\uD7AF]/;

    function needsTranslation(line) {
        if (!line || line.trim().length === 0) return false;
        if (line.includes('♪') || line.includes('🎵')) return false;
        return HIRAGANA.test(line) || KATAKANA.test(line) || CJK_UNIFIED.test(line) || HANGUL.test(line);
    }

    function detectBatchLanguage(lines) {
        let ja = 0, ko = 0, zh = 0;
        for (const line of lines) {
            if (HIRAGANA.test(line) || KATAKANA.test(line)) ja++;
            else if (HANGUL.test(line)) ko++;
            else if (CJK_UNIFIED.test(line)) zh++;
        }
        if (ja > 0) return 'ja';
        if (ko > 0) return 'ko';
        if (zh > 0) return 'zh';
        return 'unknown';
    }

    function repairBrokenJson(str) {
        return str.replace(/"\s*("id_)/g, '", $1');
    }

    function getPrompt(sourceLang) {
        const SHARED_PREAMBLE = `You are a professional song lyrics translator. Translate Asian languages to English.

<OUTPUT_FORMAT>
Return ONLY raw JSON. Example: {"id_1": "translated line", "id_2": "SKIP"}
</OUTPUT_FORMAT>

<RULES priority="critical">
1. OUTPUT: Return raw JSON only. No markdown. No commentary.
2. MAPPING: Output exactly one translation per input ID. Use "SKIP" for untranslatable lines.
3. SKIP_WHEN: Line contains ♪ or is already English.
</RULES>

<RULES priority="formatting">
4. SYMBOLS: Copy all source punctuation exactly (「」。、・♪★). Keep original symbols.
5. CAPITALIZATION: Capitalize line starts only when grammatically correct.
6. ABBREVIATIONS: Use full words. Write "question and answer" not "Q&A".
</RULES>

<RULES priority="translation">
7. TONE: Match the original emotional tone and register.
8. FLOW: Preserve sentence fragments. If source line is incomplete, output incomplete translation.
9. PHRASING: Use natural spoken English. Rephrase stiff structures. Keep meaning intact.
10. PROPER_NOUNS: Keep romanized names (Yuki, Jihoon). Preserve intentional wordplay.
</RULES>

<EXAMPLES>
INPUT: {"id_1": "僕は君を探している"}
OUTPUT: {"id_1": "I'm searching for you"}

INPUT: {"id_2": "ぱっぱらぱー"}
OUTPUT: {"id_2": "pa-pa-ra-pa"}
NOTE: Sound effects stay as-is.

INPUT: {"id_3": "夢の迷路の果て"}
OUTPUT: {"id_3": "At the end of the dream's maze"}
NOTE: Preserve poetic ambiguity.

INPUT: {"id_4": "ドキドキしちゃって"}
OUTPUT: {"id_4": "My heart is pounding"}
NOTE: Translate onomatopoeia meaning, not sound.

INPUT: {"id_5": "You are KING"}
OUTPUT: {"id_5": "SKIP"}
NOTE: Already English.
</EXAMPLES>`;

        const RULES = {
            ja: `<SOURCE_LANGUAGE>Japanese</SOURCE_LANGUAGE>

<LANGUAGE_RULES>
1. PARTICLES: は=topic, が=subject, を=object, に=direction, で=means/location.
2. VERB_ENDINGS: -たい=want, -てしまう=regrettably, -ている=ongoing.
3. HONORIFICS: Reflect -さん/-くん/-ちゃん/-様 relationships in tone.
4. ONOMATOPOEIA: Translate the meaning (ドキドキ→heart pounding).
5. HIDDEN_SUBJECTS: Infer omitted I/You/We from context. Stay consistent.
6. FINAL_PARTICLES: よ=assertion, ね=agreement, か=question, な=reflection.
7. COMPOUNDS: Translate meaning (問答→dialogue, not "question-answer").
</LANGUAGE_RULES>`,
            ko: `<SOURCE_LANGUAGE>Korean</SOURCE_LANGUAGE>

<LANGUAGE_RULES>
1. SPEECH_LEVELS: 해요체=polite, 반말=casual. Reflect in tone.
2. PARTICLES: 은/는=topic, 이/가=subject, 을/를=object, 에/에서=location.
3. VERB_ENDINGS: -고 싶다=want, -아/어 버리다=completely, -고 있다=ongoing.
4. ADDRESS_TERMS: Reflect -님/-씨/오빠/언니 relationships in tone.
5. KONGLISH: Translate to natural English (스킬→skill, 파이팅→fighting spirit).
6. FINAL_PARTICLES: 요=polite, 네=gentle, 지=confirmation.
7. CONTRACTIONS: 뭐=무엇, 걔=그 아이. Understand spoken forms.
</LANGUAGE_RULES>`,
            zh: `<SOURCE_LANGUAGE>Chinese</SOURCE_LANGUAGE>

<LANGUAGE_RULES>
1. MEASURE_WORDS: Omit unless meaningful.
2. ASPECT_MARKERS: 了=completed, 着=ongoing, 过=experienced.
3. CLASSICAL: Translate 文言文 by meaning, not word-by-word.
4. CHENGYU: Translate idiom meaning (一见钟情→love at first sight).
5. PARTICLES: 的=possessive, 了=state change, 吗=question, 呢=continuation.
6. REDUPLICATION: 慢慢=slowly/gently. Convey emotional emphasis.
7. CONTEXT: Infer tense/plurality from surrounding lines.
</LANGUAGE_RULES>`
        };
        return SHARED_PREAMBLE + "\n\n" + (RULES[sourceLang] || "");
    }

    function getCurrentTrackInfo() {
        // Try now-playing widget first
        const nowPlaying = document.querySelector('[data-testid="now-playing-widget"]');
        if (nowPlaying) {
            const trackLink = nowPlaying.querySelector('[data-testid="context-item-link"]');
            const artistLinks = nowPlaying.querySelectorAll('[data-testid="context-item-info-subtitles"] a');
            const title = trackLink?.textContent?.trim() || '';
            const artists = Array.from(artistLinks).map(a => a.textContent?.trim()).filter(Boolean).join(', ');
            if (title || artists) return { title, artists };
        }
        // Fallback: parse document title (format: "Song - Artist | Spotify")
        const pageTitle = document.title;
        const match = pageTitle.match(/^(.+?)\s*[-–—]\s*(.+?)\s*[|·]/);
        if (match) return { title: match[1].trim(), artists: match[2].trim() };
        return null;
    }

    const PROVIDERS = {
        groq: {
            name: 'Groq',
            url: 'https://api.groq.com/openai/v1/chat/completions',
            keyStorage: 'llm_groq_api_key',
            modelStorage: 'llm_groq_model'
        },
        cerebras: {
            name: 'Cerebras',
            url: 'https://api.cerebras.ai/v1/chat/completions',
            keyStorage: 'llm_cerebras_api_key',
            modelStorage: 'llm_cerebras_model'
        }
    };

    class Storage {
        static get(key, defaultValue) {
            return GM_getValue(key, defaultValue);
        }

        static set(key, value) {
            GM_setValue(key, value);
        }

        static loadRuntimeCache() {
            try {
                return new Map(Object.entries(GM_getValue('llm_cache_v1', {})));
            } catch {
                return new Map();
            }
        }

        static saveRuntimeCache(cache) {
            if (cache.size > CONFIG.MAX_CACHE_SIZE) {
                const keys = Array.from(cache.keys());
                const toRemove = keys.slice(0, keys.length - CONFIG.MAX_CACHE_SIZE);
                toRemove.forEach(k => cache.delete(k));
            }
            GM_setValue('llm_cache_v1', Object.fromEntries(cache));
        }

        static clearRuntimeCache() {
            GM_setValue('llm_cache_v1', {});
        }
    }

    let state = {
        apiKey: '', // Dynamically loaded based on provider
        apiUrl: '', // Dynamically loaded based on provider
        model: '', // Dynamically loaded based on provider
        textColor: Storage.get('llm_text_color') || CONFIG.DEFAULT_COLOR,
        queue: [],
        isLoopRunning: false,
        lastRequestTimestamp: 0,
        runtimeCache: Storage.loadRuntimeCache(),
        mutationObserver: null,
        intersectionObserver: null,
        currentContainer: null,
        observerTimeout: null,
        observerScheduleId: null,
        smartSkipEnabled: Storage.get('llm_smart_skip', true),
        smartSkipTriggered: false,
        temperature: Storage.get('llm_temperature', CONFIG.DEFAULT_TEMPERATURE),
        topP: Storage.get('llm_top_p', CONFIG.DEFAULT_TOP_P),
        maxCompletionTokens: Storage.get('llm_max_completion_tokens', CONFIG.DEFAULT_MAX_COMPLETION_TOKENS)
    };

    function getCurrentProvider() {
        return Storage.get('llm_current_provider') || 'groq';
    }

    // Initialize provider state
    const currentProvider = getCurrentProvider();
    const providerConfig = PROVIDERS[currentProvider];
    if (providerConfig) {
        state.apiKey = Storage.get(providerConfig.keyStorage) || '';
        state.apiUrl = providerConfig.url;
        state.model = Storage.get(providerConfig.modelStorage) || '';
    }

    function switchProvider(providerId) {
        const provider = PROVIDERS[providerId];
        if (!provider) return;
        const storedKey = Storage.get(provider.keyStorage) || '';
        const storedModel = Storage.get(provider.modelStorage) || '';

        state.apiUrl = provider.url;
        state.apiKey = storedKey;
        state.model = storedModel;

        Storage.set('llm_current_provider', providerId);
        // Note: We don't need to duplicate save api_url/key/model to generic keys anymore, 
        // as state is initialized from provider-specific storage on load.

        const warnings = [];
        if (!storedKey) warnings.push('API Key not set');
        if (!storedModel) warnings.push('Model not set');
        const warningMsg = warnings.length > 0 ? `\n⚠️ ${warnings.join(', ')}. Set via menu.` : '';
        alert(`Switched to ${provider.name}!${warningMsg}`);

        // Clear cache when switching providers
        state.runtimeCache.clear();
        Storage.clearRuntimeCache();

        location.reload(); // Reload to ensure clean state initialization
    }

    // --- MENU COMMANDS ---

    // Provider Configuration (Switch, Model, API Key)
    Object.keys(PROVIDERS).forEach(pid => {
        const p = PROVIDERS[pid];
        const isCurrent = getCurrentProvider() === pid;

        GM_registerMenuCommand(`🔌 Use ${p.name}${isCurrent ? " ✓" : ""}`, () => switchProvider(pid));

        GM_registerMenuCommand(`🤖 ${p.name} Model`, () => {
            const current = Storage.get(p.modelStorage) || '';
            const m = prompt(`Enter ${p.name} Model ID:`, current);
            if (m) {
                Storage.set(p.modelStorage, m.trim());
                if (getCurrentProvider() === pid) state.model = m.trim();
                alert(`${p.name} Model Saved!`);
            }
        });

        GM_registerMenuCommand(`🔑 ${p.name} API Key`, () => {
            const current = Storage.get(p.keyStorage) || '';
            const key = prompt(`Enter ${p.name} API Key:`, current);
            if (key) {
                Storage.set(p.keyStorage, key.trim());
                if (getCurrentProvider() === pid) state.apiKey = key.trim();
                alert(`${p.name} API Key Saved!`);
            }
        });
    });

    // 4. LLM Parameters
    const params = [
        { label: "🌡️ Temperature", key: "llm_temperature", stateKey: "temperature", default: CONFIG.DEFAULT_TEMPERATURE, min: 0, max: 2, desc: "Lower = deterministic, Higher = creative" },
        { label: "🎲 Top P", key: "llm_top_p", stateKey: "topP", default: CONFIG.DEFAULT_TOP_P, min: 0, max: 1, desc: "Lower = focused, Higher = diverse" },
        { label: "📊 Max Completion Tokens", key: "llm_max_completion_tokens", stateKey: "maxCompletionTokens", default: CONFIG.DEFAULT_MAX_COMPLETION_TOKENS, min: 128, max: 4096, desc: "Max response length", isInt: true }
    ];

    params.forEach(p => {
        GM_registerMenuCommand(`${p.label}: ${state[p.stateKey]}`, () => {
            const val = prompt(`Enter ${p.label} (${p.min} - ${p.max}):\n\n${p.desc}`, state[p.stateKey]);
            if (val !== null) {
                const num = p.isInt ? parseInt(val, 10) : parseFloat(val);
                if (!isNaN(num) && num >= p.min && num <= p.max) {
                    state[p.stateKey] = num;
                    Storage.set(p.key, num);
                    alert(`${p.label} set to ${num}`);
                } else {
                    alert(`Invalid value. Must be between ${p.min} and ${p.max}`);
                }
            }
        });
    });

    // 5. Display & Utils
    GM_registerMenuCommand("🎨 Text Color", () => {
        const col = prompt("Translation text color (CSS):", state.textColor);
        if (col) { Storage.set('llm_text_color', col.trim()); state.textColor = col.trim(); updateCssVariables(); }
    });

    GM_registerMenuCommand("🎯 Smart Skip" + (state.smartSkipEnabled ? " ✓" : ""), () => {
        state.smartSkipEnabled = !state.smartSkipEnabled;
        Storage.set('llm_smart_skip', state.smartSkipEnabled);
        alert(`Smart Skip: ${state.smartSkipEnabled ? 'Enabled' : 'Disabled'}. Reloading...`);
        location.reload();
    });

    GM_registerMenuCommand("🗑️ Clear Cache Now", () => {
        if (confirm(`Clear ${state.runtimeCache.size} cached translations?`)) {
            state.runtimeCache.clear();
            Storage.clearRuntimeCache();
            location.reload();
        }
    });

    function saveCache() {
        Storage.saveRuntimeCache(state.runtimeCache);
    }

    function updateCssVariables() {
        document.documentElement.style.setProperty('--llm-lyrics-color', state.textColor);
    }

    GM_addStyle(`
        :root { --llm-lyrics-color: ${state.textColor}; }
        [data-testid="lyrics-container"], .os-viewport, .lyrics-component { overflow-anchor: auto !important; }
        .${CONFIG.TRANSLATION_CLASS} {
            display: block; font-size: 0.85em; color: var(--llm-lyrics-color);
            margin: 4px 0 8px 0; font-weight: normal; font-style: italic;
            line-height: 1.3; opacity: 0.9; pointer-events: none;
            text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.8);
        }
        #llm-status {
            position: fixed; top: 80px; left: 50%; transform: translateX(-50%); background: rgba(0,0,0,0.8);
            color: #fff; padding: 6px 10px; border-radius: 6px; font-size: 11px;
            z-index: 99999; opacity: 0; transition: opacity 0.3s; pointer-events: none;
            border: 1px solid #333; font-family: monospace;
        }
        #llm-status.visible { opacity: 1; }
        #llm-status.error { border-color: #ff4444; color: #ffcccc; }
        #llm-status.cached { border-color: #44ff44; color: #ccffcc; }
    `);

    const statusEl = document.createElement('div');
    statusEl.id = 'llm-status';
    document.body.appendChild(statusEl);
    updateCssVariables();

    function updateStatus(msg, isVisible = true, isError = false, isCached = false) {
        statusEl.textContent = msg;
        statusEl.classList.toggle('visible', isVisible);
        statusEl.classList.toggle('error', isError);
        statusEl.classList.toggle('cached', isCached);
    }

    function normalizeCacheKey(str) {
        if (!str) return "";
        return str.replace(/\s+/g, '').toLowerCase();
    }

    function cleanTextForComparison(str) {
        if (!str) return "";
        return str.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
    }

    function getStrHash(str) {
        let hash = 0;
        if (str.length === 0) return '0';
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash |= 0;
        }
        return hash.toString();
    }

    function getOriginalText(element) {
        if (!element) return "";
        // Port from Spicetify: prefer .lyrics-lyricsContent-text if available
        const textEl = element.querySelector('.lyrics-lyricsContent-text');
        if (textEl) {
            return textEl.textContent?.trim() || '';
        }
        // Fallback: clone and remove translation
        const clone = element.cloneNode(true);
        const trans = clone.querySelector(`.${CONFIG.TRANSLATION_CLASS}`);
        if (trans) trans.remove();
        return clone.textContent?.trim() || '';
    }

    function isLyricLine(node) {
        return node.matches && node.matches(LYRIC_SELECTOR);
    }

    function applyTranslationToDOM(element, text, translation) {
        if (cleanTextForComparison(text) === cleanTextForComparison(translation)) return;

        let existingTrans = element.querySelector(`.${CONFIG.TRANSLATION_CLASS}`);

        if (existingTrans) {
            // Update existing translation if changed
            if (existingTrans.textContent === translation) return;
            existingTrans.textContent = translation;
        } else {
            // Port from Spicetify: inject AFTER .lyrics-lyricsContent-text as sibling
            const div = document.createElement('div');
            div.className = CONFIG.TRANSLATION_CLASS;
            div.textContent = translation;

            const textEl = element.querySelector('.lyrics-lyricsContent-text');
            if (textEl) {
                // Insert as sibling AFTER the text element - Spotify won't touch siblings!
                textEl.after(div);
            } else {
                element.appendChild(div);
            }
        }

        element.setAttribute(CONFIG.PROCESSED_ATTR, getStrHash(normalizeCacheKey(text)));
    }

    function attemptRender(element) {
        if (!element || !document.body.contains(element)) return;
        const text = getOriginalText(element);
        if (!text) return;
        const cacheKey = normalizeCacheKey(text);
        const translation = state.runtimeCache.get(cacheKey);
        if (!translation || translation === '__SKIP__') return;
        const rect = element.getBoundingClientRect();
        if (rect.bottom < -100) return;
        applyTranslationToDOM(element, text, translation);
    }

    function findLiveElementByText(text) {
        const key = normalizeCacheKey(text);
        const candidates = document.querySelectorAll(LYRIC_SELECTOR);
        for (const node of candidates) {
            if (normalizeCacheKey(getOriginalText(node)) === key) return node;
        }
        return null;
    }

    // Helper: Ensure translation is present on element, re-add if missing
    function ensureTranslation(element) {
        if (!element || !document.body.contains(element)) return;
        const existingTranslation = element.querySelector(`.${CONFIG.TRANSLATION_CLASS}`);
        if (existingTranslation) return; // Already has translation

        const text = getOriginalText(element);
        if (!text) return;
        const cacheKey = normalizeCacheKey(text);
        const translation = state.runtimeCache.get(cacheKey);
        if (!translation || translation === '__SKIP__') return;

        // Translation is cached but missing from DOM - re-add it
        applyTranslationToDOM(element, text, translation);
    }

    function setupObservers() {
        state.mutationObserver = new MutationObserver((mutations) => {
            // Collect all affected lyric lines to ensure translations
            const affectedLines = new Set();

            for (const mutation of mutations) {
                let target = mutation.target;
                if (target.nodeType === 3) target = target.parentElement;

                if (target && target.nodeType === 1) {
                    // Check if target itself is a lyric line
                    if (isLyricLine(target)) {
                        affectedLines.add(target);
                    } else if (target.closest) {
                        const line = target.closest(LYRIC_SELECTOR);
                        if (line) affectedLines.add(line);
                    }

                    // Also check if target contains lyric lines
                    if (target.querySelectorAll) {
                        target.querySelectorAll(LYRIC_SELECTOR).forEach(line => affectedLines.add(line));
                    }
                }

                // Handle added nodes
                if (mutation.addedNodes.length > 0) {
                    for (const node of mutation.addedNodes) {
                        if (node.nodeType === 1) {
                            if (isLyricLine(node)) {
                                affectedLines.add(node);
                            } else if (node.querySelectorAll) {
                                node.querySelectorAll(LYRIC_SELECTOR).forEach(line => affectedLines.add(line));
                            }
                        }
                    }
                }
            }

            // Ensure translations on all affected lines
            affectedLines.forEach(line => {
                attemptRender(line);
                ensureTranslation(line);
            });

            // Throttled full container scan
            if (!state.observerTimeout && state.currentContainer) {
                state.observerTimeout = setTimeout(() => {
                    scanContainer(state.currentContainer);
                    state.observerTimeout = null;
                }, CONFIG.OBSERVER_THROTTLE_MS);
            }
        });

        state.intersectionObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    attemptRender(entry.target);
                    ensureTranslation(entry.target);
                    processLyricElement(entry.target);
                    state.intersectionObserver.unobserve(entry.target);
                }
            });
        }, { rootMargin: "300px 0px 300px 0px" });
    }

    function scanContainer(container) {
        if (!container) return;
        const lines = container.querySelectorAll(LYRIC_SELECTOR);
        lines.forEach(line => {
            state.intersectionObserver.observe(line);
            processLyricElement(line);
        });
    }

    function manageObserver(forceRescan = false) {
        if (document.hidden) {
            if (state.mutationObserver) state.mutationObserver.disconnect();
            if (state.intersectionObserver) state.intersectionObserver.disconnect();
            return;
        }
        const sampleLine = document.querySelector(LYRIC_SELECTOR);
        if (!sampleLine) {
            if (state.currentContainer) {
                if (state.mutationObserver) state.mutationObserver.disconnect();
                if (state.intersectionObserver) state.intersectionObserver.disconnect();
                state.currentContainer = null;
            }
            return;
        }
        const container = sampleLine.parentElement;
        const containerChanged = state.currentContainer !== container;
        if (containerChanged) {
            if (state.mutationObserver) state.mutationObserver.disconnect();
            state.currentContainer = container;
            state.mutationObserver.observe(container, { childList: true, subtree: true, characterData: true, attributes: true });
        }
        // Always rescan on visibility change or container change to reapply translations
        if (forceRescan || containerChanged) {
            scanContainer(container);
        }
    }

    document.addEventListener('visibilitychange', () => manageObserver(!document.hidden));

    function queueElementForTranslation(element, text) {
        // Check cache first
        const cacheKey = normalizeCacheKey(text);
        if (state.runtimeCache.has(cacheKey)) {
            attemptRender(element);
            return;
        }

        // Skip if Smart Skip already triggered for this session
        if (state.smartSkipTriggered && state.smartSkipEnabled) {
            state.runtimeCache.set(cacheKey, '__SKIP__');
            element.setAttribute(CONFIG.PROCESSED_ATTR, getStrHash(cacheKey));
            return;
        }

        // Language Detection: Skip lines already in target language
        if (!needsTranslation(text)) {
            state.runtimeCache.set(cacheKey, '__SKIP__');
            element.setAttribute(CONFIG.PROCESSED_ATTR, getStrHash(cacheKey));
            return;
        }

        // Avoid duplicates in queue
        if (state.queue.some(item => item.element === element && item.text === text)) return;

        state.queue.push({ id: Date.now(), element, text });
        if (!state.isLoopRunning) {
            state.isLoopRunning = true;
            setTimeout(processQueueLoop, CONFIG.BATCH_COLLECTION_DELAY_MS);
        }
    }

    async function processQueueLoop() {
        if (!state.isLoopRunning) return;
        if (state.queue.length === 0) {
            state.isLoopRunning = false;
            updateStatus("Idle", false);
            return;
        }
        const now = Date.now();
        const timeToWait = Math.max(0, CONFIG.MIN_REQUEST_INTERVAL_MS - (now - state.lastRequestTimestamp));
        if (timeToWait > 0) {
            setTimeout(processQueueLoop, timeToWait);
            return;
        }
        state.queue = state.queue.filter(item => document.body.contains(item.element));

        const viewTop = 0;
        const viewBottom = window.innerHeight;
        state.queue.sort((a, b) => {
            const rectA = a.element.getBoundingClientRect();
            const rectB = b.element.getBoundingClientRect();
            const getTier = (rect) => {
                if (rect.height === 0) return 4;
                if (rect.bottom > viewTop && rect.top < viewBottom) return 1;
                if (rect.top >= viewBottom) return 2;
                return 3;
            };
            const tierA = getTier(rectA);
            const tierB = getTier(rectB);
            if (tierA !== tierB) return tierA - tierB;
            return rectA.top - rectB.top;
        });

        const batch = [];
        let cachedCount = 0;
        while (state.queue.length > 0 && batch.length < CONFIG.MAX_BATCH_SIZE) {
            const item = state.queue.shift();
            const cacheKey = normalizeCacheKey(item.text);
            if (state.runtimeCache.has(cacheKey)) {
                attemptRender(item.element);
                cachedCount++;
            } else {
                batch.push(item);
            }
        }
        if (cachedCount > 0 && batch.length === 0) {
            updateStatus(`Loaded from Cache (${cachedCount})`, true, false, true);
            setTimeout(() => updateStatus("", false), 1500);
        }
        if (batch.length === 0) {
            processQueueLoop();
            return;
        }

        const payloadObj = {};
        const idMap = [];
        const textToId = new Map();
        batch.forEach((item) => {
            if (textToId.has(item.text)) {
                const existingId = textToId.get(item.text);
                idMap.push({ rndId: existingId, element: item.element, text: item.text });
            } else {
                const rndId = 'id_' + Math.random().toString(36).substr(2, 5);
                payloadObj[rndId] = item.text;
                textToId.set(item.text, rndId);
                idMap.push({ rndId: rndId, element: item.element, text: item.text });
            }
        });

        updateStatus(`Translating ${batch.length}...`);

        try {
            const resultMap = await fetchBatchTranslation(payloadObj);
            if (resultMap) {
                if (resultMap.error === "FATAL_CONFIG_ERROR") {
                    updateStatus("Config Error: Check URL/API Key", true, true);
                    state.isLoopRunning = false;
                    return;
                }
                if (Object.keys(resultMap).length > 0) {
                    // Pass 1: Count Skips
                    let skipCount = 0;
                    let totalCount = 0;
                    idMap.forEach((item) => {
                        let trans = resultMap[item.rndId];
                        if (trans) trans = trans.trim();
                        const isIdentical = trans && item.text && trans.toLowerCase() === item.text.toLowerCase();
                        if (!trans || trans === "SKIP" || trans.includes('val="SKIP"') || isIdentical) {
                            skipCount++;
                        }
                        totalCount++;
                    });

                    // Smart Skip Check
                    let shouldTriggerSmartSkip = false;
                    if (state.smartSkipEnabled && !state.smartSkipTriggered && totalCount > 0) {
                        const skipRatio = skipCount / totalCount;
                        if (skipRatio >= CONFIG.SMART_SKIP_THRESHOLD) {
                            shouldTriggerSmartSkip = true;
                            state.smartSkipTriggered = true;
                            updateStatus("Smart Skip Activated", true, false, true);
                            setTimeout(() => updateStatus("", false), 2000);
                            // Remove existing translations
                            const existingTranslations = document.querySelectorAll(`.${CONFIG.TRANSLATION_CLASS}`);
                            existingTranslations.forEach(el => el.remove());
                        }
                    }

                    // Pass 2: Render or Suppress
                    idMap.forEach((item) => {
                        let trans = resultMap[item.rndId];
                        const cacheKey = normalizeCacheKey(item.text);
                        if (trans) trans = trans.trim();
                        const isEffectiveSkip = !trans || trans === "SKIP" || trans.includes('val="SKIP"');

                        if (shouldTriggerSmartSkip) {
                            state.runtimeCache.set(cacheKey, '__SKIP__');
                            item.element.setAttribute(CONFIG.PROCESSED_ATTR, getStrHash(cacheKey));
                        } else if (!isEffectiveSkip) {
                            if (state.runtimeCache.size > CONFIG.MAX_CACHE_SIZE) {
                                const firstKey = state.runtimeCache.keys().next().value;
                                state.runtimeCache.delete(firstKey);
                            }
                            state.runtimeCache.set(cacheKey, trans);
                            attemptRender(item.element);
                            if (!document.body.contains(item.element)) {
                                const liveNode = findLiveElementByText(item.text);
                                if (liveNode) attemptRender(liveNode);
                            }
                        } else {
                            state.runtimeCache.set(cacheKey, '__SKIP__');
                            item.element.setAttribute(CONFIG.PROCESSED_ATTR, getStrHash(cacheKey));
                        }
                    });

                    // Clean up remaining queue if Smart Skip triggered
                    if (shouldTriggerSmartSkip) {
                        state.queue.forEach(item => {
                            const cacheKey = normalizeCacheKey(item.text);
                            state.runtimeCache.set(cacheKey, '__SKIP__');
                            item.element.setAttribute(CONFIG.PROCESSED_ATTR, getStrHash(cacheKey));
                        });
                        state.queue = [];
                    }

                    saveCache();
                    if (state.currentContainer) scanContainer(state.currentContainer);
                    updateStatus("Done", false);
                } else {
                    // Empty result (rate limited, JSON error, etc.) - re-queue batch for retry
                    batch.forEach(item => state.queue.unshift(item));
                }
            } else {
                batch.forEach(item => state.queue.unshift(item));
                updateStatus("Network Error, Retrying...", true, true);
                state.lastRequestTimestamp = Date.now() + 2000;
            }
        } catch (e) {
            console.error(e);
            batch.forEach(item => state.queue.unshift(item));
        }
        // Only update timestamp if not already set to future (e.g. by rate limiter)
        if (state.lastRequestTimestamp <= Date.now()) {
            state.lastRequestTimestamp = Date.now();
        }
        setTimeout(processQueueLoop, 200);
    }

    async function fetchBatchTranslation(payloadObj) {
        if (!state.apiKey) { updateStatus("API Key Missing!", true, true); return { error: "FATAL_CONFIG_ERROR" }; }
        if (!state.model) { updateStatus("Model ID Missing!", true, true); return { error: "FATAL_CONFIG_ERROR" }; }

        const sourceLang = detectBatchLanguage(Object.values(payloadObj));
        const systemPrompt = getPrompt(sourceLang);

        // Build user message with optional track context
        const trackInfo = getCurrentTrackInfo();
        let userContent = 'TARGET_LANGUAGE: English\n\n';
        if (trackInfo && (trackInfo.title || trackInfo.artists)) {
            userContent += `SONG CONTEXT: "${trackInfo.title}" by ${trackInfo.artists}\n\n`;
        }
        userContent += `<LYRICS_TO_TRANSLATE>\n${JSON.stringify(payloadObj)}\n</LYRICS_TO_TRANSLATE>`;

        const requestPayload = {
            model: state.model,
            messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userContent }],
            temperature: state.temperature,
            top_p: state.topP,
            stream: false
        };
        if (state.maxCompletionTokens !== -1) requestPayload.max_completion_tokens = state.maxCompletionTokens;

        return new Promise(resolve => {
            GM_xmlhttpRequest({
                method: "POST",
                url: state.apiUrl,
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${state.apiKey}` },
                data: JSON.stringify(requestPayload),
                onload: (res) => {
                    if (res.status === 200) {
                        try {
                            let raw = JSON.parse(res.responseText).choices[0].message.content.trim();
                            const jsonMatch = raw.match(/\{[\s\S]*\}/);
                            if (jsonMatch) raw = jsonMatch[0];
                            try { resolve(JSON.parse(raw)); }
                            catch { resolve(JSON.parse(repairBrokenJson(raw))); }
                        } catch {
                            updateStatus("JSON Error: Retrying...", true, true);
                            resolve({});
                        }
                    } else {
                        handleApiError(res, resolve);
                    }
                },
                onerror: () => resolve(null)
            });
        });
    }

    // Error code configurations: { fallbackMsg, backoffMs, isFatal, shouldLog }
    const ERROR_CONFIG = {
        400: { fallbackMsg: 'Bad Request', shouldLog: true },
        401: { fallbackMsg: 'Invalid API Key', isFatal: true },
        403: { fallbackMsg: 'Permission Denied', isFatal: true },
        404: { fallbackMsg: 'Model Not Found', isFatal: true },
        408: { fallbackMsg: 'Request Timeout', backoffMs: 3000 },
        413: { fallbackMsg: 'Request Too Large', shouldLog: true },
        422: { fallbackMsg: 'Unprocessable', shouldLog: true },
        429: { fallbackMsg: 'Rate Limited', backoffMs: 60000 },
        498: { fallbackMsg: 'Capacity Exceeded', backoffMs: 30000 },
        500: { fallbackMsg: 'Server Error', backoffMs: 10000 },
        502: { fallbackMsg: 'Bad Gateway', backoffMs: 5000 },
        503: { fallbackMsg: 'Service Unavailable', backoffMs: 15000 }
    };

    function parseErrorMessage(res) {
        try {
            const body = JSON.parse(res.responseText);
            return body?.error?.message || body?.message || body?.error || body?.detail
                || (typeof body === 'string' ? body : null);
        } catch {
            return res.responseText?.length < 100 ? res.responseText : null;
        }
    }

    function handleApiError(res, resolve) {
        const code = res.status;
        const msg = parseErrorMessage(res) || 'Unknown Error';
        const config = ERROR_CONFIG[code] || (code >= 500 ? { fallbackMsg: 'Server Error', backoffMs: 5000 } : {});

        // Use short fallback when API message is too long
        const displayMsg = msg.length > 30 ? config.fallbackMsg : (msg || config.fallbackMsg || 'Error');

        if (config.shouldLog) console.error(`[LLM] ${code}:`, msg);
        updateStatus(`${code}: ${displayMsg}`, true, true);
        setTimeout(() => updateStatus('', false), 3000); // Auto-hide after 3s

        if (config.backoffMs) state.lastRequestTimestamp = Date.now() + config.backoffMs;

        resolve(config.isFatal ? { error: "FATAL_CONFIG_ERROR" } : {});
    }

    function processLyricElement(element) {
        const text = getOriginalText(element);
        if (!text) return;
        const cacheKey = normalizeCacheKey(text);
        if (state.runtimeCache.has(cacheKey)) {
            attemptRender(element);
            element.setAttribute(CONFIG.PROCESSED_ATTR, getStrHash(cacheKey));
            return;
        }
        const currentHash = getStrHash(cacheKey);
        if (element.getAttribute(CONFIG.PROCESSED_ATTR) !== currentHash) {
            element.setAttribute(CONFIG.PROCESSED_ATTR, currentHash);
            queueElementForTranslation(element, text);
        }
    }

    function scheduleObserverCheck() {
        if (state.observerScheduleId) {
            if (typeof cancelIdleCallback !== 'undefined') cancelIdleCallback(state.observerScheduleId);
            else clearTimeout(state.observerScheduleId);
        }
        const scheduleNext = () => {
            manageObserver();
            setTimeout(scheduleObserverCheck, 2000);
        };
        if (typeof requestIdleCallback !== 'undefined') {
            state.observerScheduleId = requestIdleCallback(scheduleNext, { timeout: 3000 });
        } else {
            state.observerScheduleId = setTimeout(scheduleNext, 100);
        }
    }


    window.addEventListener('load', () => {
        console.log(`[LLM Translator] v${GM_info.script.version}`);
        setupObservers();
        scheduleObserverCheck();
    });

})();