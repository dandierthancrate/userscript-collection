const { test, describe, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

describe('YouTube Autoplay Optimization', () => {
    let ObserverMock;
    let observerInstances = [];
    let intervalCalls = [];
    let intervalCallback;
    let querySelectorResult = null;

    beforeEach(() => {
        // Reset mocks
        observerInstances = [];
        intervalCalls = [];
        intervalCallback = null;
        querySelectorResult = null;

        // Mock global scope
        global.window = {
            self: {},
            top: {},
            location: { pathname: '/channel/UC123' },
            setInterval: mock.fn((cb, ms) => {
                intervalCallback = cb;
                intervalCalls.push({ cb, ms });
                return 123;
            }),
            setTimeout: mock.fn(),
            MutationObserver: class {
                constructor(cb) {
                    this.callback = cb;
                    this.observe = mock.fn();
                    this.disconnect = mock.fn();
                    observerInstances.push(this);
                }
            }
        };
        global.window.self = global.window; // Not in iframe
        global.window.top = global.window;

        global.document = {
            documentElement: {},
            body: {},
            // Use a dynamic implementation
            querySelector: mock.fn((sel) => {
                if (sel === '#c4-player') return querySelectorResult;
                return null;
            }),
            addEventListener: mock.fn(),
        };
        global.location = global.window.location;
        global.MutationObserver = global.window.MutationObserver;
        global.setInterval = global.window.setInterval;
        global.setTimeout = global.window.setTimeout;
    });

    afterEach(() => {
        delete global.window;
        delete global.document;
        delete global.location;
        delete global.MutationObserver;
        delete global.setInterval;
        delete global.setTimeout;
    });

    test('Should use setInterval instead of global MutationObserver', () => {
        const scriptPath = path.join(__dirname, '../disable-youtube-channel-autoplay.user.js');
        const scriptContent = fs.readFileSync(scriptPath, 'utf8');

        // Execute script
        try {
            eval(scriptContent);
        } catch (e) {
            console.error('Script execution error:', e);
            throw e;
        }

        // Verify that NO MutationObserver is observing document.documentElement
        assert.strictEqual(observerInstances.length, 0, 'Should not instantiate MutationObserver');

        // Verify setInterval is used
        assert.strictEqual(global.setInterval.mock.calls.length, 1, 'Should call setInterval once');
        const intervalMs = global.setInterval.mock.calls[0].arguments[1];
        assert.ok(intervalMs >= 100, 'Interval should be reasonable (>= 100ms)');

        // Verify logic inside interval callback
        // Simulate player appearing
        const pauseVideoMock = mock.fn();
        querySelectorResult = { pauseVideo: pauseVideoMock };

        // Trigger interval
        if (intervalCallback) intervalCallback();

        assert.strictEqual(pauseVideoMock.mock.calls.length, 1, 'Should pause video when player is found');

        // Trigger again - should not pause (because pausedForPath matches)
        pauseVideoMock.mock.resetCalls(); // reset

        intervalCallback();
        assert.strictEqual(pauseVideoMock.mock.calls.length, 0, 'Should not pause again for same path');

        // Navigate
        global.location.pathname = '/channel/UC456';
        intervalCallback();
        assert.strictEqual(pauseVideoMock.mock.calls.length, 1, 'Should pause again after navigation');
    });
});
