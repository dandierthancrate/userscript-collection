const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

describe('Enable Copy Perf Optimization', () => {
    let globalScanCount = 0;
    let observerCallback;

    beforeEach(() => {
        globalScanCount = 0;
        observerCallback = null;

        global.window = {
            top: global.window, // simulate top window
            location: { hostname: 'example.com' },
            alert: () => {},
            confirm: () => {},
            addEventListener: () => {},
            removeEventListener: () => {},
        };
        // Circular reference for top
        global.window.top = global.window;

        global.document = {
            head: { appendChild: () => {} },
            documentElement: { appendChild: () => {} },
            body: {
                appendChild: () => {},
                // Mock querySelectorAll for document.body calls
                querySelectorAll: (sel) => {
                    globalScanCount++;
                    return [];
                }
            },
            createElement: () => ({ style: {}, appendChild: () => {} }),
            addEventListener: () => {},
            // Mock querySelectorAll for document calls
            querySelectorAll: (sel) => {
                // If querySelectorAll is called on document, it implies a global scan.
                globalScanCount++;
                return [];
            },
            readyState: 'complete',
        };

        global.GM_getValue = (k, d) => {
            if (k === 'basicList') return ['example.com']; // BASIC mode
            if (k === 'aggressiveList') return ['example.com']; // AGGRESSIVE mode
            return d;
        };
        global.GM_setValue = () => {};
        global.GM_registerMenuCommand = () => {};

        global.MutationObserver = class {
            constructor(cb) {
                observerCallback = cb;
            }
            observe() {}
            disconnect() {}
        };

        global.location = global.window.location;
        global.EventTarget = class {};
        global.EventTarget.prototype.addEventListener = () => {};
    });

    test('MutationObserver callback should not scan entire DOM on small updates', () => {
        const scriptPath = path.join(__dirname, '../enable-copy-and-right-click.user.js');
        const scriptContent = fs.readFileSync(scriptPath, 'utf8');

        // Execute script
        try {
            // We need to run it in current context to use our globals
            // eval is simple but risky with strict mode if variables are redeclared.
            // Since it's inside 'test' scope, it should be fine.
            eval(scriptContent);
        } catch (e) {
            console.error('Script execution error:', e);
        }

        // Verify observer is attached
        assert.ok(observerCallback, 'MutationObserver should be attached');

        // Simulate a small mutation (adding 1 node)
        // We create a mock node that has its own querySelectorAll which does NOT increment globalScanCount
        const mockNode = {
            nodeType: 1, // Element
            querySelectorAll: () => {
                // Local scan, doesn't increment globalScanCount
                return [];
            },
            matches: () => false,
            dataset: {},
            draggable: false
        };

        const mockMutation = {
            addedNodes: [mockNode],
            removedNodes: []
        };

        // Reset count before triggering mutation (initial run calls clearInline which scans global)
        globalScanCount = 0;

        // Trigger mutation
        observerCallback([mockMutation]);

        console.log(`Global scans performed: ${globalScanCount}`);

        // Assert current behavior (inefficient)
        // It does document.querySelectorAll('[draggable=true]') -> +1
        // It does EventManager.clearInline() -> document.querySelectorAll('*') -> +1
        // So expected is 2.

        // We want to verify it's 0 after optimization.
        assert.strictEqual(globalScanCount, 0, 'Should not perform global DOM scans on mutation');
    });
});
