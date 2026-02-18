// ==UserScript==
// @name         Share Archive
// @namespace    https://github.com/dandierthancrate/userscript-collection
// @version      1.3.4
// @description  Share current page or links to archive.today (removes tracking params)
// @author       dandierthancrate
// @match        *://*/*
// @grant        GM_registerMenuCommand
// @grant        GM_openInTab
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      gitlab.com
// @connect      archive.today
// @connect      archive.is
// @connect      archive.ph
// @connect      archive.vn
// @connect      archive.fo
// @connect      archive.li
// @connect      archive.md
// @run-at       document-start
// @license      GPL-3.0-or-later
// @updateURL    https://raw.githubusercontent.com/dandierthancrate/userscript-collection/main/share-archive.user.js
// @downloadURL  https://raw.githubusercontent.com/dandierthancrate/userscript-collection/main/share-archive.user.js
// ==/UserScript==

(function () {
    'use strict';

    // ─────────────────────────────────────────────────────────────────────────
    // Configuration
    // ─────────────────────────────────────────────────────────────────────────

    const MIRRORS = ['today', 'is', 'ph', 'vn', 'fo', 'li', 'md'];

    const CONFIG = {
        clearUrlsDataUrl: 'https://gitlab.com/ClearURLs/rules/-/raw/master/data.min.json',
        cacheKey: 'share_archive_clearurls_rules',
        lastUpdateKey: 'share_archive_last_update',
        mirrorRankingKey: 'share_archive_mirror_ranking',
        mirrorRankingTimeKey: 'share_archive_mirror_ranking_time',
        cacheDuration: 7 * 24 * 60 * 60 * 1000, // 7 days
        mirrorCacheDuration: 24 * 60 * 60 * 1000, // 24 hours
        fallbackTrackingParams: new Set([
            "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term",
            "fbclid", "gclid", "dclid", "gbraid", "wbraid", "msclkid", "tclid",
            "aff_id", "affiliate_id", "ref", "referer", "campaign_id", "ad_id",
            "adgroup_id", "adset_id", "creativetype", "placement", "network",
            "mc_eid", "mc_cid", "si", "icid", "_ga", "_gid", "scid", "click_id",
            "trk", "track", "trk_sid", "sid", "mibextid", "fb_action_ids",
            "fb_action_types", "fb_medium", "fb_campaign", "fb_source",
            "m_entstream_source", "twclid", "igshid", "s_kwcid", "sxsrf", "sca_esv",
            "source", "tbo", "sa", "ved", "usg", "pi", "fbs", "fbc", "fb_ref", "client", "ei",
            "gs_lp", "sclient", "oq", "uact", "bih", "biw",
            "ref_source", "ref_medium", "ref_campaign", "ref_content", "ref_term", "ref_keyword",
            "ref_type", "ref_campaign_id", "ref_ad_id", "ref_adgroup_id", "entstream_source",
            "ref_creativetype", "ref_placement", "ref_network", "ref_sid", "ref_mc_eid",
            "ref_mc_cid", "ref_scid", "ref_click_id", "ref_trk", "ref_track", "ref_trk_sid",
            "ref_sid", "ref_url", "ref_adset_id",
            "wprov", "rcm", "maca", "xmt", "gc_id", "h_ga_id", "h_ad_id", "h_keyword_id",
            "gad_source", "impressionid", "ga_source", "ga_medium", "ga_campaign",
            "ga_content", "ga_term", "int_source", "chainedPosts"
        ]),
        nonArchivablePatterns: [
            /^https?:\/\/news\.google\.com\/read\/.*/i
        ]
    };

    // ─────────────────────────────────────────────────────────────────────────
    // Mirror Manager (Latency-Based Selection)
    // ─────────────────────────────────────────────────────────────────────────

    const MirrorManager = {
        ranking: null,

        init() {
            const cached = GM_getValue(CONFIG.mirrorRankingKey);
            const lastUpdate = GM_getValue(CONFIG.mirrorRankingTimeKey, 0);

            if (cached && (Date.now() - lastUpdate < CONFIG.mirrorCacheDuration)) {
                try { this.ranking = JSON.parse(cached); }
                catch { this.ranking = [...MIRRORS]; }
            } else {
                this.ranking = [...MIRRORS]; // Default order until test completes
                this.testMirrors();
            }
        },

        testMirrors() {
            const results = [];
            let completed = 0;

            MIRRORS.forEach(tld => {
                const start = performance.now();
                GM_xmlhttpRequest({
                    method: 'HEAD',
                    url: `https://archive.${tld}/`,
                    timeout: 5000,
                    onload: () => {
                        results.push({ tld, latency: performance.now() - start });
                        if (++completed === MIRRORS.length) this.finalize(results);
                    },
                    onerror: () => {
                        results.push({ tld, latency: Infinity });
                        if (++completed === MIRRORS.length) this.finalize(results);
                    },
                    ontimeout: () => {
                        results.push({ tld, latency: Infinity });
                        if (++completed === MIRRORS.length) this.finalize(results);
                    }
                });
            });
        },

        finalize(results) {
            this.ranking = results
                .sort((a, b) => a.latency - b.latency)
                .map(r => r.tld);

            GM_setValue(CONFIG.mirrorRankingKey, JSON.stringify(this.ranking));
            GM_setValue(CONFIG.mirrorRankingTimeKey, Date.now());
            console.log('Share-Archive: Mirror ranking updated:', this.ranking);
        },

        getArchiveUrl(cleanedUrl) {
            const tld = this.ranking?.[0] || 'today';
            return `https://archive.${tld}/?run=1&url=${encodeURIComponent(cleanedUrl)}`;
        },

        getSearchUrl(cleanedUrl) {
            const tld = this.ranking?.[0] || 'today';
            return `https://archive.${tld}/search/?q=${encodeURIComponent(cleanedUrl)}`;
        },

        getRanking() {
            return this.ranking || [...MIRRORS];
        }
    };

    // ─────────────────────────────────────────────────────────────────────────
    // Host Matching Utilities
    // ─────────────────────────────────────────────────────────────────────────

    const isYouTube = (h) => h.includes('youtube.com') || h.includes('youtu.be');
    const isFacebook = (h) => h.includes('facebook.com');
    const isSubstack = (h) => h.endsWith('.substack.com');
    const isAmazon = (h) => h.includes('amazon.com') || h.includes('amazon.');
    const isTelegram = (h) => h === 't.me';
    const isMailchimp = (h) => h.includes('list-manage.com');
    const isGoogleRedirect = (h, p) => h === 'www.google.com' && p === '/url';

    const PLATFORM_PARAMS = {
        youtube: new Set(["feature", "ab_channel", "t", "si"]),
        facebook: new Set(["sh", "mibextid", "s", "fs"]),
        substack: new Set(["r", "showWelcomeOnShare"]),
        mailchimp: new Set(["e"])
    };

    // ─────────────────────────────────────────────────────────────────────────
    // Platform Handlers
    // ─────────────────────────────────────────────────────────────────────────

    const PLATFORM_HANDLERS = [
        {
            match: (h, urlObj) => isGoogleRedirect(h, urlObj.pathname),
            handle: (urlObj, cleanUrlFn) => {
                const target = urlObj.searchParams.get('url');
                if (target) {
                    try { return cleanUrlFn(decodeURIComponent(target)); }
                    catch { /* continue */ }
                }
                return null;
            }
        },
        {
            match: isYouTube,
            handle: (urlObj, cleanUrlFn) => {
                if (urlObj.pathname.startsWith('/shorts/')) {
                    const videoId = urlObj.pathname.replace('/shorts/', '').split('/')[0];
                    urlObj.pathname = '/watch';
                    urlObj.searchParams.set('v', videoId);
                }
                if (urlObj.hostname.startsWith('music.')) {
                    urlObj.hostname = urlObj.hostname.replace('music.', '');
                }
                const nestedQ = urlObj.searchParams.get('q');
                if (nestedQ?.includes('?')) {
                    try { urlObj.searchParams.set('q', cleanUrlFn(nestedQ)); }
                    catch { /* ignore */ }
                }
                return null;
            }
        },
        {
            match: isSubstack,
            handle: (urlObj) => { urlObj.searchParams.set('no_cover', 'true'); return null; }
        },
        {
            match: isAmazon,
            handle: (urlObj) => { urlObj.pathname = urlObj.pathname.replace(/\/ref=[^/]+/, ''); return null; }
        },
        {
            match: isTelegram,
            handle: (urlObj) => {
                const path = urlObj.pathname.replace(/^\/+/, '');
                if (path && !path.startsWith('s/')) urlObj.pathname = `/s/${path}`;
                return null;
            }
        },
        {
            match: isMailchimp,
            handle: (urlObj) => { urlObj.searchParams.delete('e'); return null; }
        }
    ];

    // ─────────────────────────────────────────────────────────────────────────
    // ClearURLs Rules Manager
    // ─────────────────────────────────────────────────────────────────────────

    const RulesManager = {
        rules: null,

        init() {
            const cached = GM_getValue(CONFIG.cacheKey);
            const lastUpdate = GM_getValue(CONFIG.lastUpdateKey, 0);

            if (cached) {
                try { this.rules = JSON.parse(cached); this.compilePatterns(); }
                catch { /* ignore */ }
            }

            if (!cached || (Date.now() - lastUpdate > CONFIG.cacheDuration)) {
                this.updateRules();
            }
        },

        compilePatterns() {
            if (!this.rules?.providers) return;
            for (const p of Object.values(this.rules.providers)) {
                try { p._urlPattern = new RegExp(p.urlPattern); } catch { /* skip */ }
                if (p.rules) p._rules = p.rules.map(r => { try { return new RegExp(r, 'g'); } catch { return null; } }).filter(Boolean);
                if (p.redirections) p._redirections = p.redirections.map(r => { try { return new RegExp(r); } catch { return null; } }).filter(Boolean);
                if (p.exceptions) p._exceptions = p.exceptions.map(e => { try { return new RegExp(e); } catch { return null; } }).filter(Boolean);
            }
        },

        updateRules() {
            GM_xmlhttpRequest({
                method: "GET",
                url: CONFIG.clearUrlsDataUrl,
                onload: (res) => {
                    if (res.status === 200) {
                        try {
                            const parsed = JSON.parse(res.responseText);
                            GM_setValue(CONFIG.cacheKey, res.responseText);
                            GM_setValue(CONFIG.lastUpdateKey, Date.now());
                            this.rules = parsed;
                            this.compilePatterns();
                        } catch { /* ignore */ }
                    }
                }
            });
        }
    };

    // ─────────────────────────────────────────────────────────────────────────
    // ClearURLs Helpers
    // ─────────────────────────────────────────────────────────────────────────

    function applyRedirections(provider, url) {
        if (!provider._redirections) return url;
        for (const regex of provider._redirections) {
            const match = regex.exec(url);
            if (match?.[1]) return decodeURIComponent(match[1]);
        }
        return url;
    }

    function applyRawRules(provider, url) {
        if (!provider._rules) return url;
        let result = url;
        for (const regex of provider._rules) result = result.replace(regex, '');
        return result;
    }

    function applyReferralMarketing(provider, url) {
        if (!provider.referralMarketing) return url;
        try {
            const urlObj = new URL(url);
            provider.referralMarketing.forEach(p => urlObj.searchParams.delete(p));
            return urlObj.toString();
        } catch { return url; }
    }

    function hasException(provider, originalUrl) {
        if (!provider._exceptions) return false;
        return provider._exceptions.some(regex => regex.test(originalUrl));
    }

    function applyClearUrls(url) {
        if (!RulesManager.rules) RulesManager.init();
        if (!RulesManager.rules?.providers) return url;

        let cleanedUrl = url;
        try {
            for (const provider of Object.values(RulesManager.rules.providers)) {
                if (!provider._urlPattern?.test(cleanedUrl)) continue;
                if (hasException(provider, url)) continue;
                cleanedUrl = applyRedirections(provider, cleanedUrl);
                cleanedUrl = applyRawRules(provider, cleanedUrl);
                cleanedUrl = applyReferralMarketing(provider, cleanedUrl);
            }
        } catch { /* ignore */ }
        return cleanedUrl;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // URL Cleaning
    // ─────────────────────────────────────────────────────────────────────────

    function processArchiveUrl(url) {
        const archivePattern = /^https?:\/\/(?:archive\.(?:today|ph|is|fo|li|md|vn)\/o\/[a-zA-Z0-9]+\/)(.+)$/;
        const match = url.match(archivePattern);

        if (match) {
            const embeddedUrl = match[1];
            try {
                const urlObj = new URL(embeddedUrl);
                let hasNestedUrls = false;

                // Check for nested URLs in query parameters
                for (const [key, value] of urlObj.searchParams) {
                    if (value && (value.startsWith('http://') || value.startsWith('https://'))) {
                        hasNestedUrls = true;
                        break;
                    }
                }

                if (hasNestedUrls) {
                     // Extract just scheme + authority + path (no query params)
                    return `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`;
                } else {
                     // Extract URL with query parameters but without fragments
                     // The regex in Kotlin was: ^(https?://[^#]+)
                     // Here we can just use the full embeddedUrl but strip hash if present,
                     // effectively verified by the URL constructor above.
                     // However, to match Kotlin logic "remove fragments":
                     urlObj.hash = '';
                     return urlObj.toString();
                }

            } catch (e) {
                return embeddedUrl;
            }
        }
        return url;
    }

    function cleanUrl(url) {
        // First, check if it's an archive.today redirect and extract the original URL
        let cleanedUrl = processArchiveUrl(url);

        cleanedUrl = applyClearUrls(cleanedUrl);

        try {
            const urlObj = new URL(cleanedUrl);

            // Sentinel Security: Block unsafe protocols (e.g., javascript:, data:, file:)
            if (!['http:', 'https:'].includes(urlObj.protocol)) {
                return null;
            }

            const host = urlObj.hostname.toLowerCase();

            for (const { match, handle } of PLATFORM_HANDLERS) {
                if (match(host, urlObj)) {
                    const result = handle(urlObj, cleanUrl);
                    if (result) return result;
                    break;
                }
            }

            const toDelete = [];
            for (const [key] of urlObj.searchParams) {
                if (CONFIG.fallbackTrackingParams.has(key) || key.startsWith('utm_')) {
                    toDelete.push(key);
                    continue;
                }
                if (isYouTube(host) && PLATFORM_PARAMS.youtube.has(key)) toDelete.push(key);
                else if (isFacebook(host) && PLATFORM_PARAMS.facebook.has(key)) toDelete.push(key);
                else if (isSubstack(host) && PLATFORM_PARAMS.substack.has(key)) toDelete.push(key);
            }
            toDelete.forEach(k => urlObj.searchParams.delete(k));

            urlObj.hash = '';
            return urlObj.toString();
        } catch {
            // Return null for invalid URLs instead of potentially unsafe string
            return null;
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Archive Actions
    // ─────────────────────────────────────────────────────────────────────────

    function isArchivable(url) {
        return !CONFIG.nonArchivablePatterns.some(p => p.test(url));
    }

    function archiveUrl(url) {
        const cleaned = cleanUrl(url);
        if (!cleaned) {
            alert('Share Archive: Invalid URL protocol.');
            return;
        }
        if (!isArchivable(cleaned)) {
            alert('Share Archive: This URL is not archivable.');
            return;
        }
        GM_openInTab(MirrorManager.getArchiveUrl(cleaned), { active: true });
    }

    function searchUrl(url) {
        const cleaned = cleanUrl(url);
        if (!cleaned) return;
        GM_openInTab(MirrorManager.getSearchUrl(cleaned), { active: true });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Initialization & Event Handlers
    // ─────────────────────────────────────────────────────────────────────────

    MirrorManager.init();

    GM_registerMenuCommand('Archive Current Page', () => archiveUrl(location.href));
    GM_registerMenuCommand('Search Archive for Page', () => searchUrl(location.href));
    GM_registerMenuCommand('Show Mirror Ranking', () => {
        const ranking = MirrorManager.getRanking();
        alert(`Share Archive - Mirror Ranking (fastest first):\n\n${ranking.map((t, i) => `${i + 1}. archive.${t}`).join('\n')}`);
    });

    document.addEventListener('click', (e) => {
        const link = e.target.closest('a');
        if (!link?.href) return;

        if (e.ctrlKey && e.altKey && !e.shiftKey) {
            e.preventDefault();
            e.stopPropagation();
            archiveUrl(link.href);
        } else if (e.ctrlKey && e.shiftKey && !e.altKey) {
            e.preventDefault();
            e.stopPropagation();
            searchUrl(link.href);
        }
    }, true);

})();
