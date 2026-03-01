const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('node:assert');
const { test } = require('node:test');

// Mock DOM
class MockElement {
    constructor(tagName) {
        this._classList = new Set();
        this.tagName = tagName.toUpperCase();
        this.id = '';
        this.className = '';
        this.style = {
            setProperty: () => {}
        };
        this.children = [];
        this.attributes = new Map();
        this.listeners = {};
        this.parentNode = null;
        this.textContent = '';
    }

    getAttribute(name) { return this.attributes.get(name); }
    setAttribute(name, value) { this.attributes.set(name, value); }

    get classList() {
        return {
            add: (...args) => args.forEach(a => this._classList.add(a)),
            remove: (...args) => args.forEach(a => this._classList.delete(a)),
            toggle: (token, force) => {
                if (force === undefined) {
                    if (this._classList.has(token)) this._classList.delete(token);
                    else this._classList.add(token);
                } else if (force) {
                    this._classList.add(token);
                } else {
                    this._classList.delete(token);
                }
            },
            contains: (token) => this._classList.has(token)
        };
    }

    set className(val) {
        this._classList.clear();
        if (val) val.split(' ').forEach(c => this._classList.add(c));
    }
    get className() { return Array.from(this._classList).join(' '); }

    appendChild(child) {
        if (child instanceof MockElement || child.nodeType === 3) { // Element or TextNode
            this.children.push(child);
            child.parentNode = this;
        }
        return child;
    }

    set innerHTML(html) {
        // Very basic innerHTML setter for test purposes
        this.children = [];
        this.textContent = ''; // Reset text content
        if (!html) return;

        // Mocking spinner creation via innerHTML if needed, but our code uses createElement
        if (html.includes('llm-spinner')) {
             const spinner = new MockElement('SPAN');
             spinner.className = 'llm-spinner';
             this.children.push(spinner);
        }
    }

    get innerHTML() {
        return this.children.map(c => {
            if (c.nodeType === 3) return c.textContent;
            return `<${c.tagName.toLowerCase()} class="${c.className}"></${c.tagName.toLowerCase()}>`;
        }).join('');
    }

    set textContent(text) {
        if (!text) {
            this.children = [];
        }
        this._textContent = text;
    }

    get textContent() {
        return this._textContent || '';
    }
}

const document = {
    createElement: (tag) => new MockElement(tag),
    createTextNode: (text) => {
        const node = { nodeType: 3, textContent: text, parentNode: null };
        return node;
    },
    body: new MockElement('BODY'),
    documentElement: new MockElement('HTML'),
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {},
    hidden: false
};

global.document = document;
global.window = {
    addEventListener: () => {},
    innerHeight: 1000
};
global.location = { reload: () => {} };
global.GM_addStyle = (css) => { global.injectedCSS = css; };
global.GM_getValue = (key, def) => def;
global.GM_setValue = () => {};
global.GM_registerMenuCommand = () => {};
global.GM_info = { script: { version: '1.0' } };
global.MutationObserver = class { observe() {} disconnect() {} };
global.IntersectionObserver = class { observe() {} disconnect() {} };

// Read script content
let scriptContent = fs.readFileSync(path.join(__dirname, '../spotify-llm.user.js'), 'utf8');

// Inject hook to access updateStatus
// We replace the IIFE closing with an assignment to global
scriptContent = scriptContent.replace(/\}\)\(\);[\s\n]*$/, 'global.test_updateStatus = updateStatus; })();');

// Run script
vm.runInThisContext(scriptContent);

test('Spotify LLM Status Accessibility and Spinner', (t) => {
    const statusEl = document.body.children.find(c => c.id === 'llm-status');
    assert.ok(statusEl, 'Status element should be created');

    // Check Accessibility Attributes
    assert.strictEqual(statusEl.getAttribute('role'), 'status', 'role="status" should be present');
    assert.strictEqual(statusEl.getAttribute('aria-live'), 'polite', 'aria-live="polite" should be present');

    // Check Spinner Logic

    // 1. Loading State
    global.test_updateStatus('Translating 5 items...', true, false, false);
    let hasSpinner = statusEl.children.some(c => c.className && c.className.includes('llm-spinner'));
    assert.ok(hasSpinner, 'Spinner should be present when translating');

    // 2. Done State
    global.test_updateStatus('Done', false, false, false);
    hasSpinner = statusEl.children.some(c => c.className && c.className.includes('llm-spinner'));
    assert.ok(!hasSpinner, 'Spinner should NOT be present when done');

    // 3. Error State
    global.test_updateStatus('Error', true, true, false);
    hasSpinner = statusEl.children.some(c => c.className && c.className.includes('llm-spinner'));
    assert.ok(!hasSpinner, 'Spinner should NOT be present on error');

    // 4. Cached State
    global.test_updateStatus('Loaded from Cache (5)', true, false, true);
    hasSpinner = statusEl.children.some(c => c.className && c.className.includes('llm-spinner'));
    assert.ok(!hasSpinner, 'Spinner should NOT be present for cache load');
});
