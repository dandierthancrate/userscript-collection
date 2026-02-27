const { test, describe, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

describe('YouTube Playlist Autoplay Optimization', () => {
    let ObserverMock;
    let observerInstances = [];
    let styleElements = [];
    let eventListeners = {};
    let querySelectorResult = {};
    let intervalCalls = [];

    beforeEach(() => {
        // Reset state
        observerInstances = [];
        styleElements = [];
        eventListeners = {};
        querySelectorResult = {};
        intervalCalls = [];

        // Mock DOM
        global.window = {
            self: {},
            top: {},
            location: { search: '?list=PL123' },
            MutationObserver: class {
                constructor(cb) {
                    this.callback = cb;
                    this.observe = mock.fn();
                    this.disconnect = mock.fn();
                    observerInstances.push(this);
                }
            },
            setInterval: mock.fn((cb, ms) => {
                intervalCalls.push({ cb, ms });
                return 123; // Timer ID
            })
        };
        global.window.self = global.window;
        global.window.top = global.window;

        global.document = {
            head: {
                appendChild: mock.fn((el) => {
                    if (el.tagName === 'STYLE') styleElements.push(el);
                })
            },
            body: {},
            createElement: mock.fn((tag) => {
                return { tagName: tag.toUpperCase(), textContent: '' };
            }),
            querySelector: mock.fn((sel) => {
                return querySelectorResult[sel] || null;
            }),
            addEventListener: mock.fn((event, handler) => {
                if (!eventListeners[event]) eventListeners[event] = [];
                eventListeners[event].push(handler);
            }),
        };

        global.location = global.window.location;
        global.MutationObserver = global.window.MutationObserver;
        global.setInterval = global.window.setInterval;
    });

    afterEach(() => {
        delete global.window;
        delete global.document;
        delete global.location;
        delete global.MutationObserver;
        delete global.setInterval;
    });

    test('Should use setInterval instead of global MutationObserver', () => {
        const scriptPath = path.join(__dirname, '../disable-youtube-playlist-autoplay.user.js');
        const scriptContent = fs.readFileSync(scriptPath, 'utf8');

        // Execute script
        try {
            eval(scriptContent);
        } catch (e) {
            console.error('Script execution error:', e);
            throw e;
        }

        // Verify that NO MutationObserver is observing document.documentElement/body
        assert.strictEqual(observerInstances.length, 0, 'Should NOT instantiate MutationObserver');

        // Verify setInterval is used
        assert.strictEqual(intervalCalls.length, 1, 'Should call setInterval once');
        const { ms } = intervalCalls[0];
        assert.ok(ms >= 500, 'Polling interval should be reasonable (>= 500ms)');

        // Verify event listener for navigation is still present
        assert.ok(eventListeners['yt-navigate-finish'], 'Should listen for yt-navigate-finish');
    });
});
