const assert = require('node:assert');
const { test, describe, beforeEach, afterEach } = require('node:test');
const fs = require('fs');
const path = require('path');

// Mock DOM environment
const createMockWindow = () => {
    const listeners = new Map();
    const observers = new Set();
    let intervals = new Map();
    let nextIntervalId = 1;

    const document = {
        body: {
            appendChild: (node) => {
                document.body.children.push(node);
                // Trigger MutationObserver if any
                observers.forEach(obs => obs.callback([{
                    type: 'childList',
                    addedNodes: [node],
                    target: document.body
                }]));
            },
            contains: (node) => document.body.children.includes(node),
            children: [],
            childElementCount: 0
        },
        querySelectorAll: (sel) => {
            return document.body.children.filter(n => n.matches && n.matches(sel));
        },
        querySelector: (sel) => {
            return document.body.children.find(n => n.matches && n.matches(sel)) || null;
        },
        createElement: (tag) => ({
            tagName: tag.toUpperCase(),
            style: {},
            classList: { add: () => {} },
            dataset: {},
            matches: (sel) => sel === tag || sel === `.${tag}`, // Simple mock matching
            textContent: '',
            children: [],
            childElementCount: 0
        }),
        addEventListener: () => {},
        removeEventListener: () => {}
    };

    // Fix circular reference for contains
    document.documentElement = { contains: () => true };

    const window = {
        location: { href: 'https://anilist.co/' },
        document,
        setInterval: (cb, delay) => {
            const id = nextIntervalId++;
            intervals.set(id, { cb, delay });
            return id;
        },
        clearInterval: (id) => {
            intervals.delete(id);
        },
        MutationObserver: class {
            constructor(cb) {
                this.callback = cb;
                this.observing = false;
            }
            observe(target, options) {
                this.observing = true;
                observers.add(this);
            }
            disconnect() {
                this.observing = false;
                observers.delete(this);
            }
        },
        // Helpers for test
        triggerIntervals: () => {
            intervals.forEach(i => i.cb());
        },
        getIntervalCount: () => intervals.size
    };

    global.window = window;
    global.document = document;
    global.location = window.location;
    global.setInterval = window.setInterval;
    global.clearInterval = window.clearInterval;
    global.MutationObserver = window.MutationObserver;
    global.GM_getValue = (k, d) => d;
    global.GM_setValue = () => {};
    global.GM_registerMenuCommand = () => {};
    global.Element = class {};

    return window;
};

describe('Nyaa Linker awaitLoadOf Performance', () => {
    let mockWindow;

    beforeEach(() => {
        mockWindow = createMockWindow();
    });

    test('measure detection latency', async () => {
        const scriptPath = path.join(__dirname, '../nyaa-linker-userscript.user.js');
        let scriptContent = fs.readFileSync(scriptPath, 'utf8');

        // Extract awaitLoadOf to test it in isolation or wrapper
        // Since it's inside IIFE, we can't easily access it.
        // We will inject a test harness into the script content to expose it.

        scriptContent = scriptContent.replace(
            'const awaitLoadOf = (() => {',
            'global.awaitLoadOf = (() => {'
        );

        // Run the script
        // We need to prevent immediate execution of init() or handle it
        // The script runs at document-end, but here we just eval it.
        try {
            eval(scriptContent);
        } catch (e) {
            // Ignore errors from missing DOM properties during init
        }

        assert.ok(global.awaitLoadOf, 'awaitLoadOf should be exposed');

        // Test Case: Wait for an element
        const selector = '.test-element';
        const loadType = 'text';
        const input = 'Success';

        let resolved = false;
        const start = Date.now();

        const promise = global.awaitLoadOf(selector, loadType, input).then((el) => {
            resolved = true;
            return el;
        });

        // Add element
        const el = document.createElement('div');
        el.className = 'test-element';
        el.matches = (s) => s === selector;
        el.textContent = 'Success';

        // Append to body
        document.body.appendChild(el);

        // If using MutationObserver, it should resolve essentially immediately (microtask)
        // If using setInterval, we need to trigger it.

        await new Promise(r => setTimeout(r, 30)); // Wait for debounce (20ms) + buffer

        // Bolt: With MutationObserver, it should resolve after debounce
        assert.ok(resolved, 'Should be resolved via MutationObserver after debounce');

        if (!resolved) {
            mockWindow.triggerIntervals();
            await new Promise(r => setTimeout(r, 0));
        }

        // Verify cleanup: Only the global URL poller interval should remain
        // awaitLoadOf's interval should be cleared
        assert.strictEqual(mockWindow.getIntervalCount(), 1, 'awaitLoadOf interval should be cleared, leaving only global poller');
    });

    test('should resolve immediately if element already exists', async () => {
        const selector = '.existing-element';
        const loadType = 'text';
        const input = 'Existing';

        // Pre-populate DOM
        const el = document.createElement('div');
        el.className = 'existing-element';
        el.matches = (s) => s === selector;
        el.textContent = 'Existing';
        document.body.appendChild(el);

        let resolved = false;

        // This should resolve synchronously (or microtask) because initialMatch finds it
        const promise = global.awaitLoadOf(selector, loadType, input).then((el) => {
            resolved = true;
            return el;
        });

        await new Promise(r => setTimeout(r, 0)); // Microtasks

        assert.ok(resolved, 'Should resolve immediately if element exists');

        // Verify no interval created for this
        // Note: The global URL poller was created in the first test run (via eval), so it's not tracked in this new mockWindow.
        // Thus we expect 0 intervals.
        assert.strictEqual(mockWindow.getIntervalCount(), 0, 'No new intervals should be created');
    });
});
