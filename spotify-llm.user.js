// ==UserScript==
// @name         Spotify LLM
// @namespace    https://github.com/dandierthancrate/userscript-collection
// @version      2.21.0
// @description  Translates Spotify lyrics using LLM API.
// @author       dandierthancrate
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
// @updateURL    https://raw.githubusercontent.com/dandierthancrate/userscript-collection/main/spotify-llm.user.js
// @downloadURL  https://raw.githubusercontent.com/dandierthancrate/userscript-collection/main/spotify-llm.user.js
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
        DEFAULT_TEMPERATURE: 1,
        DEFAULT_TOP_P: 0.95,
        DEFAULT_MAX_COMPLETION_TOKENS: 2048
    };

    const LYRIC_SELECTOR = '[data-testid="lyrics-line"], [data-testid="fullscreen-lyric"], .lyrics-lyricsContent-lyric, .lyrics-lyricsContainer-LyricsLine';

    // Language Detection Patterns - Combined for performance
    const ASIAN_REGEX = /[\u3040-\u30FF\u4E00-\u9FFF\uAC00-\uD7AF]/;
    const HIRAGANA = /[\u3040-\u309F]/;
    const KATAKANA = /[\u30A0-\u30FF]/;
    const CJK_UNIFIED = /[\u4E00-\u9FFF]/;
    const HANGUL = /[\uAC00-\uD7AF]/;
    const COMPARISON_REGEX = /[^\p{L}\p{N}]/gu;

    function needsTranslation(line) {
        if (!line || line.trim().length === 0) return false;
        if (line.includes('♪') || line.includes('🎵')) return false;
        return ASIAN_REGEX.test(line);
    }

    function detectBatchLanguage(lines) {
        let ko = 0, zh = 0;
        for (const line of lines) {
            // Precise detection for prompt selection
            if (HIRAGANA.test(line) || KATAKANA.test(line)) return 'ja';
            if (HANGUL.test(line)) ko++;
            else if (CJK_UNIFIED.test(line)) zh++;
        }
        if (ko > 0) return 'ko';
        if (zh > 0) return 'zh';
        return 'unknown';
    }

    function repairBrokenJson(str) {
        return str.replace(/"\s*("id_)/g, '", $1');
    }

    function getPrompt(sourceLang) {
        // Static prefix for provider-side prompt caching (identical across ALL requests)
        // This portion is cached by the LLM provider, reducing latency and cost by 60-70%
        const SHARED_PREAMBLE = `You are a Senior Lyrics Translator with 10+ years experience translating CJK lyrics for Spotify, Apple Music, and Musixmatch verified contributors.

YOUR EXPERTISE:
- Japanese: J-POP, anime OST, vocaloid lyrics (1000+ translated tracks)
- Korean: K-POP, K-indie, K-hiphop (1000+ translated tracks)
- Chinese: Mandopop, C-rock, Cantopop (1000+ translated tracks)

MUSIXMATCH TRANSLATION GUIDELINES (MANDATORY):
✅ Line-by-line: Match exact line structure of source lyrics
✅ Never merge: 2+ source lines → 2+ translation lines
✅ Never split: 1 source line → 1 translation line
✅ Preserve line breaks from transcribed/formatted lyrics
✅ Formatting: Capitalize first letter + proper nouns only. Re-capitalize after ? !
✅ Maintain original tone (funny→funny, melancholic→melancholic, romantic→romantic)
✅ Creative translation > word-for-word literal
✅ Keep brands/products/cities untranslated (Diet Pepsi → Diet Pepsi, Tokyo → Tokyo)
✅ For untranslatables: keep as-is or transliterate (not translate)

OUTPUT FORMAT (STRICT):
- Raw JSON only: {"id": "translation"} or {"id": "SKIP"}
- SKIP when: line is instrumental marker (♪🎵), already English, or pure whitespace
- Max 1000 chars per translation. Preserve line IDs exactly.
- NO markdown, NO code blocks, NO explanations

QUALITY VERIFICATION (BEFORE RESPONDING):
□ Each translation line matches source line count (no merge/split)
□ Brand names, city names, product names are untranslated
□ Tone matches original (check verb endings, particles, honorifics)
□ No translationese (read aloud for natural English flow)
□ Line IDs preserved exactly from input

If ambiguous lyrics have multiple valid interpretations: provide the most likely translation based on context.`;

        // Dynamic suffix: language-specific linguistic rules (changes per request, enables partial caching)
        // Only ~200-300 tokens regenerated per request; rest served from cache
        const RULES = {
            ja: `
JAPANESE LINGUISTICS (APPLY THESE RULES):
- Particles: は(topic), が(subject), を(object), に(direction/time), で(means/location), へ(direction)
- Verb endings: -たい(want), -てしまう(regret/completion), -ている(ongoing/state), -な prohibition
- Honorifics: -さん/-くん/-ちゃん/-様/-先生 → reflect relationship in tone
- Onomatopoeia: translate meaning (ドキドキ→heart racing, シーン→silence, ワイワイ→lively)
- Omitted subjects: infer I/you/we/they from context and verb conjugation
- Final particles: よ(emphasis), ね(agreement), か(question), な(reflection), わ(feminine)
- Compound words: translate holistic meaning (問答=dialogue, 愛憎=love-hate, 喜怒哀楽=emotions)
- Archaic forms: だ→である, ～ぬ(negative), ～けむ(conjecture) → modern equivalent meaning`,
            ko: `
KOREAN LINGUISTICS (APPLY THESE RULES):
- Speech levels: 해요체/합니다(polite), 반말(casual/intimate) → reflect in English tone
- Particles: 은/는(topic), 이/가(subject), 을/를(object), 에/에서(location/time), 로/으로(direction)
- Verb endings: -고 싶다(want), -아/어 버리다(completion/regret), -고 있다(ongoing), -게 하다(causative)
- Address terms: -님(honorific), -씨(neutral), 오빠/언니/누나/형(sibling terms) → convey relationship
- Konglish: translate meaning (스킬→skill/ability, 파이팅→fighting spirit/cheer up, 화이팅→you got this)
- Final particles: 요(polite), 네(acknowledgment), 지(confirmation/shared knowledge), 군요(realization)
- Contractions/spoken: 뭐=무엇, 걔=그 아이, 저기=저것, 안=않아, 못=못해. Parse colloquial forms
- Sino-Korean: 한자 compounds → translate meaning (사랑=love, 희망=hope, 운명=fate/destiny)`,
            zh: `
CHINESE LINGUISTICS (APPLY THESE RULES):
- Measure words: generally omit unless semantically meaningful (一片=一片 vs. 一个=omit)
- Aspect markers: 了(completed/change), 着(ongoing/state), 过(experienced), 在(progressive)
- Classical Chinese (文言文): translate by meaning, not character-by-character
- Chengyu idioms: translate holistic meaning (一见钟情=love at first sight, 海枯石烂=eternal love)
- Particles: 的(possessive/adjective), 了(state change), 吗(yes/no question), 呢(continuation), 啊(emphasis)
- Reduplication: 慢慢=slowly/gently, 高高=high up, 悄悄=quietly/secretly → convey emotional nuance
- Context inference: tense, plurality, gender from surrounding lines and time words
- Dialect/literary: 啥=什么，甭=不用，汝=你(classical) → modern Mandarin equivalent → English`
        };
        return SHARED_PREAMBLE + (RULES[sourceLang] || "");
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
            while (cache.size > CONFIG.MAX_CACHE_SIZE) {
                cache.delete(cache.keys().next().value);
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
        lastCacheSave: 0,
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
        :root { --llm-lyrics-color: ${CONFIG.DEFAULT_COLOR}; }
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
        @keyframes llm-spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        .llm-spinner {
            display: inline-block; width: 12px; height: 12px;
            border: 2px solid rgba(255,255,255,0.3); border-radius: 50%;
            border-top-color: #fff; animation: llm-spin 1s linear infinite;
            margin-right: 8px; vertical-align: -2px;
        }
    `);

    const statusEl = document.createElement('div');
    statusEl.id = 'llm-status';
    statusEl.setAttribute('role', 'status');
    statusEl.setAttribute('aria-live', 'polite');
    document.body.appendChild(statusEl);
    updateCssVariables();

    function updateStatus(msg, isVisible = true, isError = false, isCached = false) {
        statusEl.innerHTML = '';
        if (isVisible && !isError && !isCached && msg.startsWith('Translating')) {
            const spinner = document.createElement('span');
            spinner.className = 'llm-spinner';
            statusEl.appendChild(spinner);
        }
        statusEl.appendChild(document.createTextNode(msg));
        statusEl.classList.toggle('visible', isVisible);
        statusEl.classList.toggle('error', isError);
        statusEl.classList.toggle('cached', isCached);
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Cache Layer with TTL - Prevents memory leaks and stale data
    // ─────────────────────────────────────────────────────────────────────────────

    const CACHE_TTL_MS = 3600000; // 1 hour TTL for normalization/comparison/hash caches

    // Cache entry: { value: any, timestamp: number }
    const normalizationCache = new Map();
    const comparisonCache = new Map();
    const hashCache = new Map();

    function getFromCache(cache, key) {
        const entry = cache.get(key);
        if (!entry) return null;
        // TTL check: Evict expired entries
        if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
            cache.delete(key);
            return null;
        }
        return entry.value;
    }

    function setInCache(cache, key, value) {
        // Evict oldest if at capacity (LRU-style: delete first entry)
        if (cache.size >= 2000) {
            const oldestKey = cache.keys().next().value;
            cache.delete(oldestKey);
        }
        cache.set(key, { value, timestamp: Date.now() });
    }

    function normalizeCacheKey(str) {
        if (!str) return "";
        const cached = getFromCache(normalizationCache, str);
        if (cached) return cached;
        
        const normalized = str.replace(/\s+/g, '').toLowerCase();
        setInCache(normalizationCache, str, normalized);
        return normalized;
    }

    function cleanTextForComparison(str) {
        if (!str) return "";
        const cached = getFromCache(comparisonCache, str);
        if (cached) return cached;

        const result = str.toLowerCase().replace(COMPARISON_REGEX, '');
        setInCache(comparisonCache, str, result);
        return result;
    }

    function getStrHash(str) {
        const cached = getFromCache(hashCache, str);
        if (cached) return cached;

        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash |= 0;
        }
        const result = hash.toString();
        setInCache(hashCache, str, result);
        return result;
    }

    function getOriginalText(element) {
        if (!element) return "";
        // Port from Spicetify: prefer .lyrics-lyricsContent-text if available
        const textEl = element.querySelector('.lyrics-lyricsContent-text');
        if (textEl) {
            return textEl.textContent?.trim() || '';
        }
        // Bolt: Optimized text extraction avoiding expensive cloneNode(true)
        let text = "";
        for (const child of element.childNodes) {
            if (child.nodeType === 3) { // TEXT_NODE
                text += child.textContent;
            } else if (child.nodeType === 1 && !child.classList.contains(CONFIG.TRANSLATION_CLASS)) {
                text += child.textContent;
            }
        }
        return text.trim();
    }

    function isLyricLine(node) {
        return node.matches && node.matches(LYRIC_SELECTOR);
    }

    function applyTranslationToDOM(element, text, translation, cacheKey) {
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

        element.setAttribute(CONFIG.PROCESSED_ATTR, getStrHash(cacheKey));
    }

    function findLiveElementByText(text) {
        const key = normalizeCacheKey(text);
        const candidates = document.querySelectorAll(LYRIC_SELECTOR);
        for (const node of candidates) {
            if (normalizeCacheKey(getOriginalText(node)) === key) return node;
        }
        return null;
    }

    function setupObservers() {
        state.mutationObserver = new MutationObserver((mutations) => {
            // Collect all affected lyric lines to ensure translations
            const affectedLines = new Set();

            for (const mutation of mutations) {
                // Bolt: Ignore changes to our own data attribute to avoid feedback loops
                if (mutation.type === 'attributes' && mutation.attributeName === CONFIG.PROCESSED_ATTR) continue;

                if (mutation.type === 'childList') {
                    for (const node of mutation.addedNodes) {
                        if (node.nodeType === 1) {
                            if (isLyricLine(node)) affectedLines.add(node);
                            else {
                                // Only querySelectorAll on added branches, not the whole container
                                const lines = node.querySelectorAll(LYRIC_SELECTOR);
                                for (const line of lines) affectedLines.add(line);
                            }
                        }
                    }
                } else {
                    // Bolt: For attribute/text changes, only check target and its parent/closest line
                    let target = mutation.target;
                    if (target.nodeType === 3) target = target.parentElement;
                    if (target && target.nodeType === 1) {
                        const line = target.closest(LYRIC_SELECTOR);
                        if (line) affectedLines.add(line);
                    }
                }
            }

            // Ensure translations on all affected lines using single entry point
            affectedLines.forEach(line => processLyricElement(line));

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

    function queueElementForTranslation(element, text, cacheKey) {
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

        // Bolt: Optimized sorting by visibility to prioritize active lyrics
        // Use a Map to cache rects during sort to avoid redundant getBoundingClientRect calls
        const viewTop = 0;
        const viewBottom = window.innerHeight;
        const rectCache = new Map();
        const getRect = (el) => {
            let r = rectCache.get(el);
            if (!r) {
                r = el.getBoundingClientRect();
                rectCache.set(el, r);
            }
            return r;
        };

        state.queue.sort((a, b) => {
            const rectA = getRect(a.element);
            const rectB = getRect(b.element);
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
            const cachedTranslation = state.runtimeCache.get(cacheKey);
            if (cachedTranslation) {
                if (cachedTranslation !== '__SKIP__') {
                    applyTranslationToDOM(item.element, item.text, cachedTranslation, cacheKey);
                }
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
            setTimeout(processQueueLoop, 0);
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
                            applyTranslationToDOM(item.element, item.text, trans, cacheKey);
                            if (!document.body.contains(item.element)) {
                                const liveNode = findLiveElementByText(item.text);
                                if (liveNode) applyTranslationToDOM(liveNode, item.text, trans, cacheKey);
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

                    const now = Date.now();
                    // Bolt: Throttle cache saving to prevent main thread blocking (GM_setValue is sync)
                    if (now - state.lastCacheSave > 10000 || state.queue.length === 0) {
                        saveCache();
                        state.lastCacheSave = now;
                    }

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
            // Security: Sanitize context to prevent prompt injection (e.g. escaping quotes/newlines)
            const title = JSON.stringify(trackInfo.title || '');
            const artists = JSON.stringify(trackInfo.artists || '');
            userContent += `SONG CONTEXT: ${title} by ${artists}\n\n`;
        }
        userContent += `<LYRICS_TO_TRANSLATE>\n${JSON.stringify(payloadObj)}\n</LYRICS_TO_TRANSLATE>`;

        const requestPayload = {
            model: state.model,
            messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userContent }],
            temperature: state.temperature,
            top_p: state.topP,
            stream: false
        };

        // Provider-specific reasoning handling (Always Hidden)
        const providerName = getCurrentProvider();
        if (providerName === 'groq') {
            // Groq uses include_reasoning for gpt-oss models, reasoning_format for others
            if (state.model.toLowerCase().includes('gpt-oss')) {
                requestPayload.include_reasoning = false;
            } else {
                requestPayload.reasoning_format = "hidden";
            }
        } else if (providerName === 'cerebras') {
            requestPayload.reasoning_format = "hidden";
        }

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
        if (!element || !document.body.contains(element)) return;
        const text = getOriginalText(element);
        if (!text) return;
        const cacheKey = normalizeCacheKey(text);
        const currentHash = getStrHash(cacheKey);

        // Bolt: Consistently check if we need to render or queue
        if (element.getAttribute(CONFIG.PROCESSED_ATTR) === currentHash) {
            // Already matched this text, but ensure translation is visible (might have been removed by Spotify)
            if (!element.querySelector(`.${CONFIG.TRANSLATION_CLASS}`)) {
                const translation = state.runtimeCache.get(cacheKey);
                if (translation && translation !== '__SKIP__') {
                    applyTranslationToDOM(element, text, translation, cacheKey);
                }
            }
            return;
        }

        const translation = state.runtimeCache.get(cacheKey);
        if (translation) {
            if (translation !== '__SKIP__') {
                applyTranslationToDOM(element, text, translation, cacheKey);
            } else {
                element.setAttribute(CONFIG.PROCESSED_ATTR, currentHash);
            }
        } else {
            element.setAttribute(CONFIG.PROCESSED_ATTR, currentHash);
            queueElementForTranslation(element, text, cacheKey);
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