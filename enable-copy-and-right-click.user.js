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
    // Storage
    // ─────────────────────────────────────────────────────────────────────────────

    const Store = {
        get: (key, def = []) => GM_getValue(key, def),
        set: (key, val) => GM_setValue(key, val),
        hasHost: (key) => GM_getValue(key, []).includes(HOST),
        addHost: (key) => {
            const list = Store.get(key).filter(h => h !== HOST);
            list.push(HOST);
            Store.set(key, list);
        },
        removeHost: (key) => {
            const list = Store.get(key).filter(h => h !== HOST);
            Store.set(key, list);
        },
        clear: () => {
            Store.set('basicList', []);
            Store.set('aggressiveList', []);
        }
    };

    const MODES = {
        OFF: 'off',
        BASIC: 'basic',
        AGGRESSIVE: 'aggressive'
    };

    const getCurrentMode = () => {
        if (Store.hasHost('aggressiveList')) return MODES.AGGRESSIVE;
        if (Store.hasHost('basicList')) return MODES.BASIC;
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
            const pattern = /copy|right.?click|select|protect|disable/i;
            const wrap = (orig) => function (msg) {
                if (pattern.test(String(msg))) return true;
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

        clearInline: () => {
            const targets = [document, document.body, ...document.querySelectorAll('*')];
            const handlers = BASIC_EVENTS.map(e => 'on' + e);
            targets.forEach(el => {
                if (!el) return;
                handlers.forEach(h => el[h] = null);
                if (el.dataset?.draggable) el.draggable = false; // Soft check
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
                const observer = new MutationObserver(() => {
                    document.querySelectorAll('[draggable=true]').forEach(el => el.draggable = false);
                    if (mode === MODES.AGGRESSIVE) EventManager.clearInline();
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
                if (m === MODES.OFF) { Store.removeHost('basicList'); Store.removeHost('aggressiveList'); }
                if (m === MODES.BASIC) { Store.addHost('basicList'); Store.removeHost('aggressiveList'); }
                if (m === MODES.AGGRESSIVE) { Store.addHost('basicList'); Store.addHost('aggressiveList'); }
                alert(`${m.toUpperCase()} Mode set for ${HOST}\nRefresh to apply.`);
            };

            add((mode === MODES.OFF ? '✅ ' : '') + '🚫 OFF', () => set(MODES.OFF));
            add((mode === MODES.BASIC ? '✅ ' : '') + '🛡️ Basic', () => set(MODES.BASIC));
            add((mode === MODES.AGGRESSIVE ? '✅ ' : '') + '⚡ Aggressive', () => set(MODES.AGGRESSIVE));
            
            add('⚙️ View/Clear Lists', () => {
                const basic = Store.get('basicList');
                const aggressive = Store.get('aggressiveList');
                const msg = `Basic:\n${basic.join('\n') || '[none]'}\n\nAggressive:\n${aggressive.join('\n') || '[none]'}\n\nClear all?`;
                if (confirm(msg)) {
                    Store.clear();
                    alert('Cleared. Refresh to apply.');
                }
            });
        }
    };

    App.init();
})();
