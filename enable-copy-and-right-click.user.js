// ==UserScript==
// @name         Enable Copy & Right Click
// @namespace    https://github.com/dandierthancrate/userscript-collection
// @version      1.9.5
// @description  Force enable right click, copy, paste, and text selection (whitelist mode)
// @author       dandierthancrate
// @match        *://*/*
// @grant        GM_registerMenuCommand
// @grant        GM_setValue
// @grant        GM_getValue
// @run-at       document-start
// @license      GPL-3.0-or-later
// @updateURL    https://raw.githubusercontent.com/dandierthancrate/userscript-collection/main/enable-copy-and-right-click.user.js
// @downloadURL  https://raw.githubusercontent.com/dandierthancrate/userscript-collection/main/enable-copy-and-right-click.user.js
// ==/UserScript==
/* global GM_registerMenuCommand, GM_setValue, GM_getValue */

(() => {
    'use strict';

    // Only run main functionality in top-level windows
    const shouldRunMainFunctionality = (window === window.top);

    const HOST = location.hostname;
    const BASIC_EVENTS = ['contextmenu', 'selectstart', 'dragstart', 'copy', 'cut', 'paste'];
    const ALL_EVENTS = [...BASIC_EVENTS, 'mousedown', 'mouseup', 'keydown', 'keyup', 'drag'];

    const CSS_STYLES = `
        *, *::before, *::after {
            -webkit-user-select: text !important;
            user-select: text !important;
            -webkit-touch-callout: default !important;
        }
    `;

    // ─────────────────────────────────────────────────────────────────────────────
    // Storage - Standardized naming convention (see AGENTS.md §2)
    // ─────────────────────────────────────────────────────────────────────────────

    const Storage = {
        get: (key, def = []) => GM_getValue(key, def),
        set: (key, val) => GM_setValue(key, val),
        hasHost: (key) => GM_getValue(key, []).includes(HOST),
        addHost: (key) => {
            // Security: Validate hostname format to prevent storage pollution
            // Only allow valid domain names (letters, numbers, dots, hyphens)
            if (!/^[a-z0-9.-]+$/.test(HOST)) return;
            const list = Storage.get(key).filter(h => h !== HOST);
            list.push(HOST);
            Storage.set(key, list);
        },
        removeHost: (key) => {
            const list = Storage.get(key).filter(h => h !== HOST);
            Storage.set(key, list);
        },
        clear: () => {
            Storage.set('basicList', []);
            Storage.set('aggressiveList', []);
        }
    };

    const MODES = {
        OFF: 'off',
        BASIC: 'basic',
        AGGRESSIVE: 'aggressive'
    };

    const getCurrentMode = () => {
        if (Storage.hasHost('aggressiveList')) return MODES.AGGRESSIVE;
        if (Storage.hasHost('basicList')) return MODES.BASIC;
        return MODES.OFF;
    };

    // ─────────────────────────────────────────────────────────────────────────────
    // Event Management
    // ─────────────────────────────────────────────────────────────────────────────

    const EventManager = {
        stop: (e) => {
            e.stopPropagation();
            if (getCurrentMode() === MODES.AGGRESSIVE) e.stopImmediatePropagation();
        },

        suppressDialogs: () => {
            // Security: Only suppress copy-protection dialogs, not all alerts
            // This prevents sites from blocking right-click via annoying alerts
            // Pattern matches: "copy", "right click", "select", "protect", "disable"
            const pattern = /copy|right.?click|select|protect|disable/i;
            const wrap = (orig) => function (msg) {
                if (pattern.test(String(msg))) return true; // Swallow copy-protection messages
                return orig.apply(this, arguments);
            };
            window.alert = wrap(window.alert);
            window.confirm = wrap(window.confirm);
        },

        blockEvents: (events) => {
            const opts = { capture: true, passive: false };
            events.forEach(type => {
                document.addEventListener(type, EventManager.stop, opts);
                window.addEventListener(type, EventManager.stop, opts);
            });
        },

        patchAddEventListener: () => {
            if (getCurrentMode() !== MODES.AGGRESSIVE) return;
            const blocked = new Set(ALL_EVENTS);
            const orig = EventTarget.prototype.addEventListener;
            EventTarget.prototype.addEventListener = function (type, listener, options) {
                if (blocked.has(type)) return;
                return orig.call(this, type, listener, options);
            };
        },

        clearInline: (root = document) => {
            // Security: Remove inline event handlers that could block copy/right-click
            // Handles: oncontextmenu, onselectstart, ondragstart, oncopy, oncut, onpaste
            const elements = root.querySelectorAll ? [...root.querySelectorAll('*')] : [];
            const targets = [root, ...elements];
            const handlers = BASIC_EVENTS.map(e => 'on' + e);
            targets.forEach(el => {
                if (!el) return;
                handlers.forEach(h => el[h] = null);
                // Disable draggable to prevent drag-start interference
                if (el.dataset?.draggable) el.draggable = false;
            });
        }
    };

    // ─────────────────────────────────────────────────────────────────────────────
    // App
    // ─────────────────────────────────────────────────────────────────────────────

    const App = {
        init: () => {
            App.registerMenu();
            
            // Only run main functionality in top-level windows
            if (!shouldRunMainFunctionality) return;
            
            const mode = getCurrentMode();
            if (mode === MODES.OFF) return;

            // Phase 1: Immediate protection
            const style = document.createElement('style');
            style.textContent = CSS_STYLES;
            (document.head || document.documentElement).appendChild(style);

            EventManager.suppressDialogs();
            EventManager.patchAddEventListener();
            EventManager.blockEvents(mode === MODES.AGGRESSIVE ? ALL_EVENTS : BASIC_EVENTS);

            // Phase 2: DOM Ready Cleanup
            const onReady = () => {
                EventManager.clearInline();
                const observer = new MutationObserver((mutations) => {
                    mutations.forEach(mutation => {
                        mutation.addedNodes.forEach(node => {
                            if (node.nodeType === 1) { // Element
                                if (node.matches('[draggable=true]')) node.draggable = false;
                                node.querySelectorAll('[draggable=true]').forEach(el => el.draggable = false);
                                if (mode === MODES.AGGRESSIVE) EventManager.clearInline(node);
                            }
                        });
                    });
                });
                observer.observe(document.body, { childList: true, subtree: true });
            };

            if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', onReady);
            else onReady();
        },

        registerMenu: () => {
            if (typeof GM_registerMenuCommand !== 'function') return;
            const mode = getCurrentMode();

            const add = (label, cb) => GM_registerMenuCommand(label, cb);
            const set = (m) => {
                if (m === MODES.OFF) { Storage.removeHost('basicList'); Storage.removeHost('aggressiveList'); }
                if (m === MODES.BASIC) { Storage.addHost('basicList'); Storage.removeHost('aggressiveList'); }
                if (m === MODES.AGGRESSIVE) { Storage.addHost('basicList'); Storage.addHost('aggressiveList'); }
                alert(`${m.toUpperCase()} Mode set for ${HOST}\nRefresh to apply.`);
            };

            add((mode === MODES.OFF ? '✅ ' : '') + '🚫 OFF', () => set(MODES.OFF));
            add((mode === MODES.BASIC ? '✅ ' : '') + '🛡️ Basic', () => set(MODES.BASIC));
            add((mode === MODES.AGGRESSIVE ? '✅ ' : '') + '⚡ Aggressive', () => set(MODES.AGGRESSIVE));

            add('⚙️ View/Clear Lists', () => {
                const basic = Storage.get('basicList');
                const aggressive = Storage.get('aggressiveList');
                const msg = `Basic:\n${basic.join('\n') || '[none]'}\n\nAggressive:\n${aggressive.join('\n') || '[none]'}\n\nClear all?`;
                if (confirm(msg)) {
                    Storage.clear();
                    alert('Cleared. Refresh to apply.');
                }
            });
        }
    };

    App.init();
})();
