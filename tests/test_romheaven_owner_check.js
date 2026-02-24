const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

// Mock DOM
class MockElement {
    constructor(tagName) {
        this.tagName = tagName.toUpperCase();
        this.children = [];
        this.attributes = new Map();
        this.style = {};
    }
    getAttribute(name) { return this.attributes.get(name); }
    setAttribute(name, value) { this.attributes.set(name, value); }
    appendChild(child) { this.children.push(child); return child; }
    insertAdjacentElement() {}
    querySelector() { return null; }
    set textContent(text) { this._textContent = text; }
    get textContent() { return this._textContent || ''; }
}

const targetElement = new MockElement('DIV');
targetElement.className = 'game_area_purchase_game_wrapper';

global.document = {
    createElement: (tag) => new MockElement(tag),
    getElementById: () => null,
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
};

global.window = { DecompressionStream: class {} };
global.location = { pathname: '/app/12345' };
global.GM_addStyle = () => {};
global.Node = MockElement; // Define Node

let requestPayloads = [];

global.GM_xmlhttpRequest = (details) => {
    if (details.url && details.url.includes('/graphql') && details.data) {
        try {
            const data = JSON.parse(details.data);
            requestPayloads.push(data);
        } catch (e) {
            console.error('Failed to parse request data:', e);
        }
    }
    // Simulate successful empty response to avoid script errors
    if (details.onload) {
        setTimeout(() => details.onload({ status: 200, responseText: '{"data":null}' }), 0);
    }
};

// Read and run script
const scriptPath = path.join(__dirname, '../romheaven-steam-assistant.user.js');
const scriptContent = fs.readFileSync(scriptPath, 'utf8');

try {
    vm.runInThisContext(scriptContent);
} catch (e) {
    console.error('Script execution error:', e);
}

// Wait for async operations
setTimeout(() => {
    // We expect at least one payload. If none, maybe script failed before fetching.
    const query = requestPayloads[0]?.query;

    if (!query) {
        console.error('FAIL: No GraphQL query captured');
        process.exit(1);
    }

    const expectedOwner = 'jSf-_OY4nlHhfPfr3k0wuxgB0DqzQU-vBlmTXp3gr98';
    const hasOwnerCheck = query.includes(`owners:["${expectedOwner}"]`);

    if (hasOwnerCheck) {
        console.log('PASS: GraphQL query includes correct owner check');
        process.exit(0);
    } else {
        console.error('FAIL: GraphQL query missing owner check');
        console.error('Expected owner:', expectedOwner);
        console.error('Actual query:', query.replace(/\s+/g, ' '));
        process.exit(1);
    }
}, 500);
