const assert = require('node:assert');
const { test, describe, beforeEach, afterEach } = require('node:test');
const fs = require('fs');
const path = require('path');

describe('Nyaa Linker URL Change Detection (Polling)', () => {
    let window;
    let document;
    let history;
    let querySelectorAllCalled = 0;
    let intervalCallback = null;
    let intervalId = null;

    beforeEach(() => {
        querySelectorAllCalled = 0;
        intervalCallback = null;
        intervalId = null;

        history = {
            state: {},
            pushState: function(data, title, url) {
                window.location.href = url;
            },
            replaceState: function(data, title, url) {
                window.location.href = url;
            }
        };

        window = {
            location: { href: 'https://anilist.co/' },
            addEventListener: () => {},
            dispatchEvent: () => {},
            history: history,
            document: null
        };

        document = {
            body: {
                appendChild: () => {},
                contains: () => true,
                childElementCount: 0
            },
            getElementById: () => null,
            querySelector: () => null,
            querySelectorAll: (sel) => {
                if (sel === '.nyaaBtn') querySelectorAllCalled++;
                return [];
            },
            createElement: () => ({ style: {}, appendChild: () => {}, classList: { add: () => {} }, dataset: {} }),
            addEventListener: () => {},
            removeEventListener: () => {}
        };
        window.document = document;

        global.window = window;
        global.document = document;
        global.history = history;
        global.location = window.location;
        global.GM_getValue = (k, d) => d;
        global.GM_setValue = () => {};
        global.GM_registerMenuCommand = () => {};
        global.GM_addStyle = () => {};
        global.Element = class {};
        global.MutationObserver = class {
            constructor(cb) {}
            observe() {}
            disconnect() {}
        };

        // Mock setInterval
        global.setInterval = (cb, delay) => {
            intervalCallback = cb;
            intervalId = 123;
            return intervalId;
        };
        global.clearInterval = () => {};
    });

    test('should detect URL change via polling', () => {
        const scriptPath = path.join(__dirname, '../nyaa-linker-userscript.user.js');
        const scriptContent = fs.readFileSync(scriptPath, 'utf8');

        // Execute script
        eval(scriptContent);

        // Initial state
        assert.ok(intervalCallback, 'setInterval should be called');
        const initialCalls = querySelectorAllCalled;

        // Change URL via pushState (which updates mock window.location.href)
        history.pushState({}, '', 'https://anilist.co/anime/12345/Title');

        // Tick the timer (manually trigger callback)
        intervalCallback();

        // Should have called removeNyaaBtns (detected via querySelectorAll)
        assert.ok(querySelectorAllCalled > initialCalls, 'removeNyaaBtns should be called after poll');

        // Subpage navigation
        const callsAfterFirst = querySelectorAllCalled;
        history.pushState({}, '', 'https://anilist.co/anime/12345/Chars');
        intervalCallback();

        assert.strictEqual(querySelectorAllCalled, callsAfterFirst, 'Should not trigger on subpage nav');

        // Different page
        history.pushState({}, '', 'https://anilist.co/anime/999/New');
        intervalCallback();

        assert.ok(querySelectorAllCalled > callsAfterFirst, 'Should trigger on new page');
    });
});
