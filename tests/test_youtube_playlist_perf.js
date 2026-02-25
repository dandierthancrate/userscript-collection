const { test, describe, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

describe('YouTube Playlist Autoplay Optimization', () => {
    let ObserverMock;
    let observerInstances = [];
    let styleElement = null;
    let eventListeners = {};
    let hooksCalled = { player: 0, playlist: 0, video: 0 };

    beforeEach(() => {
        // Reset mocks
        observerInstances = [];
        styleElement = null;
        eventListeners = {};
        hooksCalled = { player: 0, playlist: 0, video: 0 };

        // Mock global scope
        global.window = {
            self: {},
            top: {},
            location: { search: '?list=PL123' },
            setInterval: mock.fn(),
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
            documentElement: {
                appendChild: mock.fn((node) => {
                    if (node.tagName === 'STYLE') styleElement = node;
                })
            },
            head: {
                appendChild: mock.fn((node) => {
                    if (node.tagName === 'STYLE') styleElement = node;
                })
            },
            body: {},
            createElement: mock.fn((tag) => ({ tagName: tag.toUpperCase(), textContent: '' })),
            querySelector: mock.fn(() => null), // Return null by default
            addEventListener: mock.fn((type, cb) => {
                if (!eventListeners[type]) eventListeners[type] = [];
                eventListeners[type].push(cb);
            }),
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

    test('Should use CSS Animation Observer instead of Global MutationObserver', () => {
        const scriptPath = path.join(__dirname, '../disable-youtube-playlist-autoplay.user.js');
        const scriptContent = fs.readFileSync(scriptPath, 'utf8');

        // Execute script
        try {
            eval(scriptContent);
        } catch (e) {
            console.error(e);
        }

        // Verify that MutationObserver IS NOT observing document.body globally
        // Note: The script might not use MO at all anymore
        const observingBody = observerInstances.some(obs =>
            obs.observe.mock.calls.some(call => call.arguments[0] === global.document.body)
        );
        assert.strictEqual(observingBody, false, 'Should not observe document.body');

        // Verify Style Injection
        assert.ok(styleElement, 'Should inject style element');
        assert.ok(styleElement.textContent.includes('@keyframes playlistAutoplayNodeInserted'), 'Style should contain keyframes');
        assert.ok(styleElement.textContent.includes('animation-name: playlistAutoplayNodeInserted'), 'Style should apply animation');

        // Verify animationstart listener
        assert.ok(eventListeners['animationstart'], 'Should add animationstart listener');
        const listener = eventListeners['animationstart'][0];

        // Simulate animationstart
        // We need to mock the hook logic implicitly by checking if properties are set or functions called
        // Since we can't easily spy on internal functions of the IIFE, we rely on the side effects.
        // The side effects are:
        // - player._noAutoAdvance = true
        // - ypm._noAutoAdvance = true
        // - video._noAutoAdvance = true

        // Mock elements
        const mockPlayer = { matches: (sel) => sel === '#movie_player', _noAutoAdvance: false };
        const mockYpm = { matches: (sel) => sel === 'yt-playlist-manager', _noAutoAdvance: false };
        const mockVideo = { matches: (sel) => sel === 'video.html5-main-video', _noAutoAdvance: false, addEventListener: mock.fn() };

        // Trigger for Player
        listener({ animationName: 'playlistAutoplayNodeInserted', target: mockPlayer });
        assert.strictEqual(mockPlayer._noAutoAdvance, true, 'Should hook player');

        // Trigger for Playlist Manager
        listener({ animationName: 'playlistAutoplayNodeInserted', target: mockYpm });
        assert.strictEqual(mockYpm._noAutoAdvance, true, 'Should hook playlist manager');

        // Trigger for Video
        listener({ animationName: 'playlistAutoplayNodeInserted', target: mockVideo });
        assert.strictEqual(mockVideo._noAutoAdvance, true, 'Should hook video');
    });
});
