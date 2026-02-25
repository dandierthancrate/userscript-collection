const fs = require('fs');
const path = require('path');
const vm = require('vm');
const test = require('node:test');
const assert = require('node:assert');

// Mock DOM
class MockElement {
    constructor(tagName) {
        this.tagName = tagName.toUpperCase();
        this.id = '';
        this.className = '';
        this.style = {};
        this.children = [];
        this.attributes = new Map();
        this.listeners = {};
        this.parentNode = null;
        this.textContent = '';
        this.href = '';
    }

    getAttribute(name) { return this.attributes.get(name); }
    setAttribute(name, value) { this.attributes.set(name, value); }
    querySelector(selector) {
        if (selector === '.rh-btn-secondary') {
            return this.children.find(c => c.className && c.className.includes('rh-btn-secondary'));
        }
        return this.children.find(c => c.tagName === selector.toUpperCase());
    }
    querySelectorAll(selector) { return []; }
    appendChild(child) {
        if (!child) return;
        this.children.push(child);
        child.parentNode = this;
        return child;
    }
    insertAdjacentElement(position, element) {
        this.appendChild(element);
    }
    contains(child) { return this.children.includes(child); }

    get innerHTML() { return ''; }
    set innerHTML(val) {} // Ignore

    get classList() {
        return {
            add: (...args) => this.className += ' ' + args.join(' '),
            remove: () => {},
            toggle: () => {}
        };
    }

    append(...children) {
        children.forEach(c => {
             if (typeof c === 'string') {
                 // Ignore text append for mock or create text node
             } else {
                 this.appendChild(c);
             }
        });
    }
}

const targetElement = new MockElement('DIV');
targetElement.className = 'game_area_purchase_game_wrapper';

const mockDocument = {
    createElement: (tag) => new MockElement(tag),
    getElementById: (id) => {
        const box = targetElement.children.find(c => c.id === id);
        return box || null;
    },
    querySelector: (selector) => {
        if (selector === '.game_area_purchase_game_wrapper') return targetElement;
        return null;
    },
    createTextNode: (text) => {
        const el = new MockElement('TEXT');
        el.textContent = text;
        return el;
    },
    body: new MockElement('BODY'),
    head: new MockElement('HEAD'),
    documentElement: new MockElement('HTML'),
    addEventListener: () => {},
};

// Global Setup
global.document = mockDocument;
global.window = {
    DecompressionStream: class {},
    open: () => {},
    location: { pathname: '/app/12345', hostname: 'store.steampowered.com' },
    innerHeight: 1000,
    scrollX: 0,
    scrollY: 0,
    setTimeout: (fn, ms) => setTimeout(fn, ms), // Use real timeout for async
    console: console,
};
global.Node = MockElement;
global.location = global.window.location;
global.GM_addStyle = () => {};

// Mock GM_xmlhttpRequest
const mockGMXHR = (details) => {
    const url = details.url;

    setTimeout(() => {
        if (url.includes('api.steamcmd.net')) {
            details.onload({ status: 200, responseText: JSON.stringify({ data: { "12345": { depots: { branches: { public: { buildid: "999" } } } } } }) });
        } else if (url.includes('/graphql')) {
            details.onload({ status: 200, responseText: JSON.stringify({ data: { transactions: { edges: [{ node: { id: "tx123" } }] } } }) });
        } else if (url.includes('tx123')) {
            // First fetch for metadata
            details.onload({ status: 200, responseText: JSON.stringify({ dataTxId: "data123" }) });
        } else if (url.includes('data123')) {
            // Second fetch for actual data (compressed)
            const gameData = [
                { appid: "12345", install_dir: "GameDir", build: "999", pixeldrain: global.mockPixeldrainID, archive_size: 1000 }
            ];
            details.onload({
                status: 200,
                response: JSON.stringify(gameData),
                responseType: 'arraybuffer' // Script expects this
            });
        } else if (url.includes('pixeldrain.com')) {
            details.onload({ status: 200, responseText: JSON.stringify({ success: true }) });
        } else {
            if (details.onerror) details.onerror();
        }
    }, 10);
};
global.GM_xmlhttpRequest = mockGMXHR;

test('Security: Pixeldrain ID validation', async (t) => {
    const scriptPath = path.join(__dirname, '../romheaven-steam-assistant.user.js');
    let scriptContent = fs.readFileSync(scriptPath, 'utf8')
        .replace(
            /decompress: async \(buffer\) => \{([\s\S]*?)\},/,
            'decompress: async (buffer) => { return buffer; },'
        );

    const runCase = (pixeldrainID) => {
        return new Promise(resolve => {
            // Reset DOM - Important: clear children of target
            targetElement.children = [];
            global.mockPixeldrainID = pixeldrainID;

            const context = vm.createContext({
                ...global,
                console: console,
                document: mockDocument,
            });

            try {
                vm.runInContext(scriptContent, context);
            } catch (e) {
                console.error('Script error:', e);
            }

            // Wait for async operations
            setTimeout(() => {
                const box = targetElement.children.find(c => c.id === 'rh-box');
                if (!box) { resolve(false); return; }
                const dl = box.children.find(c => c.id === 'rh-downloads');
                if (!dl) { resolve(false); return; }

                // Check if pixeldrain button exists
                const btn = dl.children.find(c => c.textContent.includes('Pixeldrain'));
                resolve(!!btn);
            }, 1000);
        });
    };

    // Case 1: Valid ID
    const valid = await runCase('P4jX5a7b');
    assert.strictEqual(valid, true, 'Valid Pixeldrain ID should show button');

    // Case 2: Invalid ID (malformed)
    const invalid = await runCase('<script>');
    assert.strictEqual(invalid, false, 'Invalid Pixeldrain ID should NOT show button');

    // Case 3: Invalid ID (path traversal)
    const traversal = await runCase('../../../etc/passwd');
    assert.strictEqual(traversal, false, 'Path traversal ID should NOT show button');
});
