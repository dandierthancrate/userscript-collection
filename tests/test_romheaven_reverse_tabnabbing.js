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
        this.target = '';
        this.rel = '';
        this.download = '';
    }

    getAttribute(name) { return this.attributes.get(name); }
    setAttribute(name, value) { this.attributes.set(name, value); }
    querySelector(selector) { return null; } // Simple mock
    appendChild(child) {
        if (!child) return;
        this.children.push(child);
        child.parentNode = this;
        return child;
    }
    append(...children) {
        children.forEach(c => {
            if (typeof c === 'string') {
               // mock text node append
               this.textContent += c;
            } else {
               this.appendChild(c);
            }
        });
    }
    insertAdjacentElement(position, element) {
        if (this.tagName === 'DIV' && this.className === 'game_area_purchase_game_wrapper') {
            global.insertedBox = element;
        }
    }
}

// Global Mocks
global.document = {
    createElement: (tag) => new MockElement(tag),
    getElementById: (id) => null,
    querySelector: (selector) => {
        if (selector === '.game_area_purchase_game_wrapper') {
            const el = new MockElement('DIV');
            el.className = 'game_area_purchase_game_wrapper';
            return el;
        }
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
};

global.window = {
    DecompressionStream: class {},
};
global.Node = MockElement;
global.location = { pathname: '/app/12345' }; // appid 12345
global.GM_addStyle = () => {};

// Mock GM_xmlhttpRequest
global.GM_xmlhttpRequest = (opts) => {
    console.log('GM_xmlhttpRequest:', opts.url);
    setTimeout(() => {
        if (opts.url.includes('steamcmd.net')) {
            opts.onload({ status: 200, responseText: JSON.stringify({ data: { '12345': { depots: { branches: { public: { buildid: '999' } } } } } }) });
        } else if (opts.url.includes('/graphql')) {
            // Arweave Gateway GraphQL
            opts.onload({ status: 200, responseText: JSON.stringify({ data: { transactions: { edges: [{ node: { id: 'tx1' } }] } } }) });
        } else if (opts.url.endsWith('/tx1')) {
            // Metadata Transaction
            opts.onload({ status: 200, responseText: JSON.stringify({ dataTxId: 'tx2' }) });
        } else if (opts.url.endsWith('/tx2')) {
            // Data Transaction (Simulated JSON payload)
            // We include a valid Pixeldrain ID and an invalid one (if we were testing multiple)
            // But here just one entry.
            const payload = [
                { appid: 12345, install_dir: 'Test Game', build: '999', pixeldrain: 'bXCUGPMA', archive_size: 1024 }
            ];
            opts.onload({ status: 200, response: JSON.stringify(payload) });
        } else if (opts.url.includes('pixeldrain.com')) {
            opts.onload({ status: 200, responseText: JSON.stringify({ success: true }) });
        } else {
            console.log('Mock 404:', opts.url);
            opts.onerror();
        }
    }, 10);
};

// Read script
const scriptPath = path.join(__dirname, '../romheaven-steam-assistant.user.js');
let scriptContent = fs.readFileSync(scriptPath, 'utf8');

// Monkey-patch Utils.decompress to bypass compression logic (browser-only API)
scriptContent = scriptContent.replace(
    /decompress: async \(buffer\) => \{[\s\S]*?\},/,
    'decompress: async (buffer) => { return buffer; },'
);
// Add debug logs to App.init catch block
scriptContent = scriptContent.replace(
    /\} catch \(e\) \{/g,
    '} catch (e) { console.error("App.init Error:", e);'
);
// Also match with spaces/newlines if needed
scriptContent = scriptContent.replace(
    /catch\s*\(e\)\s*\{/g,
    'catch (e) { console.error("App.init Error:", e);'
);

test('Romheaven Steam Assistant - Security Checks', async (t) => {

    // Execute script inside mocked context
    vm.createContext(global);
    vm.runInContext(scriptContent, global);

    // Wait for async operations (App.init -> fetch -> render)
    await new Promise(resolve => setTimeout(resolve, 500));

    // Verify UI was injected
    assert.ok(global.insertedBox, 'Box should be inserted into DOM');

    // Debug: Log status
    const statusP = global.insertedBox.children.find(c => c.id === 'rh-status');
    if (statusP) console.log('Status Text:', statusP.textContent);

    // Access the 'downloads' container
    const downloadsDiv = global.insertedBox.children.find(c => c.id === 'rh-downloads');
    assert.ok(downloadsDiv, 'Downloads div should exist');

    // Find buttons
    const buttons = downloadsDiv.children.filter(c => c.tagName === 'A');
    const directBtn = buttons.find(b => b.textContent.includes('Direct Download'));
    const pixeldrainBtn = buttons.find(b => b.textContent.includes('Pixeldrain'));

    assert.ok(directBtn, 'Direct Download button should exist');
    assert.ok(pixeldrainBtn, 'Pixeldrain button should exist');

    // TEST 1: Check for Reverse Tabnabbing vulnerability (Direct Download)
    // Currently expected to FAIL because rel is missing
    console.log(`Direct Download Rel: "${directBtn.rel}"`);
    if (!directBtn.rel || !directBtn.rel.includes('noopener')) {
         console.error('FAIL: Direct Download missing rel="noopener"');
         // Verify vulnerability: Uncomment next line to make test fail
         assert.fail('Direct Download missing rel="noopener"');
    } else {
         console.log('PASS: Direct Download has rel="noopener"');
    }

    // TEST 2: Check Pixeldrain link security (should be secure)
    console.log(`Pixeldrain Rel: "${pixeldrainBtn.rel}"`);
    assert.ok(pixeldrainBtn.rel.includes('noopener'), 'Pixeldrain link must have rel="noopener"');

});

test('Romheaven Steam Assistant - Invalid Pixeldrain ID', async (t) => {
    // Reset global state for new test
    global.insertedBox = null;
    global.GM_xmlhttpRequest = (opts) => {
        setTimeout(() => {
            if (opts.url.includes('steamcmd.net')) {
                opts.onload({ status: 200, responseText: JSON.stringify({ data: { '12345': { depots: { branches: { public: { buildid: '999' } } } } } }) });
            } else if (opts.url.includes('/graphql')) {
                opts.onload({ status: 200, responseText: JSON.stringify({ data: { transactions: { edges: [{ node: { id: 'tx1' } }] } } }) });
            } else if (opts.url.endsWith('/tx1')) {
                opts.onload({ status: 200, responseText: JSON.stringify({ dataTxId: 'tx2' }) });
            } else if (opts.url.endsWith('/tx2')) {
                // INVALID Pixeldrain ID (too long, special chars)
                const payload = [
                    { appid: 12345, install_dir: 'Test Game', build: '999', pixeldrain: 'INVALID_ID_TOO_LONG_AND_BAD_CHARS$$$', archive_size: 1024 }
                ];
                opts.onload({ status: 200, response: JSON.stringify(payload) });
            } else if (opts.url.includes('pixeldrain.com')) {
                // Should NOT be called for invalid ID
                console.error('FAIL: Pixeldrain API called for invalid ID');
                opts.onload({ status: 200, responseText: JSON.stringify({ success: true }) });
            } else {
                opts.onerror();
            }
        }, 10);
    };

    vm.createContext(global);
    vm.runInContext(scriptContent, global);

    await new Promise(resolve => setTimeout(resolve, 500));

    assert.ok(global.insertedBox, 'Box inserted');
    const downloadsDiv = global.insertedBox.children.find(c => c.id === 'rh-downloads');
    const buttons = downloadsDiv.children.filter(c => c.tagName === 'A');

    // Should NOT have Pixeldrain button
    const pixeldrainBtn = buttons.find(b => b.textContent.includes('Pixeldrain'));
    if (pixeldrainBtn) {
        assert.fail('Pixeldrain button created for invalid ID');
    } else {
        console.log('PASS: Pixeldrain button NOT created for invalid ID');
    }
});
