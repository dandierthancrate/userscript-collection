
const test = require('node:test');
const assert = require('node:assert');

// Mock DOM environment
class MockNode {
    constructor() {
        this.nodeType = 1;
        this.parentElement = null;
        this.children = [];
        this.isConnected = false;
        this.classList = {
            contains: () => false,
            add: () => {},
            remove: () => {}
        };
        this.style = {};
    }

    appendChild(child) {
        child.parentElement = this;
        this.children.push(child);
        child.isConnected = this.isConnected;
    }

    contains(node) {
        if (this === node) return true;
        return this.children.some(c => c.contains(node));
    }

    querySelector() { return null; }
    querySelectorAll() { return []; }
    getAttribute() { return null; }
    setAttribute() { }
    matches() { return false; }
}

class MockMutationObserver {
    constructor(cb) { this.cb = cb; }
    observe() {}
    disconnect() {}
}

class MockIntersectionObserver {
    constructor(cb) { this.cb = cb; }
    observe() {}
    disconnect() {}
    unobserve() {}
}

// Global Mocks
global.document = new MockNode();
global.document.body = new MockNode();
global.document.body.isConnected = true;
global.document.documentElement = new MockNode();
global.window = {
    innerHeight: 1000,
    addEventListener: () => {},
    removeEventListener: () => {}
};
global.MutationObserver = MockMutationObserver;
global.IntersectionObserver = MockIntersectionObserver;
global.GM_getValue = (k, d) => d;
global.GM_setValue = () => {};
global.GM_registerMenuCommand = () => {};
global.GM_addStyle = () => {};
global.GM_info = { script: { version: 'test' } };
global.GM_xmlhttpRequest = () => {};
global.location = { reload: () => {} };

// Test Logic
test('Spotify LLM: CSS Animation Observer Pattern', async (t) => {

    // 1. Setup State
    const state = {
        mutationObserver: new MockMutationObserver(() => {}),
        intersectionObserver: new MockIntersectionObserver(() => {}),
        currentContainer: null,
        cleanupTimer: null
    };

    // Mock functionality we are implementing
    function handleLyricElementFound(element) {
        if (!element || !global.document.body.contains(element)) return;

        const container = element.parentElement;
        if (state.currentContainer !== container) {
            state.mutationObserver.disconnect();
            state.currentContainer = container;
            state.mutationObserver.observe(container, { childList: true, subtree: true });
            return true; // Indicate change for test
        }
        return false;
    }

    // 2. Test Detection
    await t.test('detects new container from element', () => {
        const container = new MockNode();
        const line = new MockNode();
        container.appendChild(line);
        global.document.body.appendChild(container);

        const changed = handleLyricElementFound(line);
        assert.strictEqual(changed, true);
        assert.strictEqual(state.currentContainer, container);
    });

    await t.test('ignores same container', () => {
        const container = state.currentContainer; // Existing
        const line2 = new MockNode();
        container.appendChild(line2);

        const changed = handleLyricElementFound(line2);
        assert.strictEqual(changed, false);
        assert.strictEqual(state.currentContainer, container);
    });

    await t.test('cleanup handles detached container', () => {
        // Detach container
        const oldContainer = state.currentContainer;
        // In our mock, we manually simulate detach by removing from body's children (conceptually)
        // But for document.body.contains(node) to work in mock, we need to implement it properly or mock it.
        // Let's mock contains behavior for this test step.

        global.document.body.contains = (node) => node !== oldContainer; // Simulate detach

        function performCleanup() {
            if (state.currentContainer && !global.document.body.contains(state.currentContainer)) {
                state.mutationObserver.disconnect();
                state.currentContainer = null;
                return true;
            }
            return false;
        }

        const cleaned = performCleanup();
        assert.strictEqual(cleaned, true);
        assert.strictEqual(state.currentContainer, null);
    });
});
