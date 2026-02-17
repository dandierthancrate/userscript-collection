const fs = require('fs');
const path = require('path');
const vm = require('vm');

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
        this._innerHTML = '';
        this.textContent = '';
    }

    getAttribute(name) { return this.attributes.get(name); }
    setAttribute(name, value) { this.attributes.set(name, value); }
    querySelector(selector) {
        // Simple mock selector logic
        if (selector === '.flex.absolute.inset-x-0.bottom-0') return this.children.find(c => c.className.includes('bottom-0'));
        if (selector === 'div.z-20') return this.children.find(c => c.tagName === 'DIV' && c.className.includes('z-20'));
        if (selector === '.query-bar') return this; // Simplification
        return null;
    }
    querySelectorAll(selector) { return []; }
    appendChild(child) {
        this.children.push(child);
        child.parentNode = this;
        return child;
    }
    insertAdjacentElement(position, element) {
        if (position === 'beforebegin') {
             // Mock insertion
             this.parentNode.appendChild(element);
        }
    }
    addEventListener(event, callback) {
        if (!this.listeners[event]) this.listeners[event] = [];
        this.listeners[event].push(callback);
    }
    contains(child) { return this.children.includes(child); }
    get isConnected() { return true; }
    get lastChild() { return this.children[this.children.length-1]; }
    get firstChild() { return this.children[0]; }
    remove() {}
    replaceChildren(...nodes) { this.children = nodes; }

    set innerHTML(html) {
        this._innerHTML = html;
        // Mock specific innerHTML used in the script
        if (html.includes('<svg') && html.includes('<div')) {
            const svg = new MockElement('svg');
            const div = new MockElement('div');
            this.children = [svg, div];
            svg.parentNode = this;
            div.parentNode = this;
        } else if (html === '') {
            this.children = [];
        }
    }
    get innerHTML() { return this._innerHTML; }

    set type(val) { this.setAttribute('type', val); }
    get type() { return this.getAttribute('type'); }
}

const document = {
    createElement: (tag) => new MockElement(tag),
    createElementNS: (ns, tag) => new MockElement(tag),
    body: new MockElement('BODY'),
    addEventListener: (event, callback) => {
        if (!document.listeners[event]) document.listeners[event] = [];
        document.listeners[event].push(callback);
    },
    listeners: {},
    querySelector: () => null,
    visibilityState: 'visible'
};

global.document = document;
global.window = { innerHeight: 1000 };
global.location = { origin: 'http://localhost', pathname: '/' };
global.GM_addStyle = () => {};
global.MutationObserver = class { observe() {} disconnect() {} };
global.IntersectionObserver = class { observe() {} disconnect() {} };
global.fetch = async () => ({ ok: true, json: async () => ({}) });

// Helper to trigger animationstart
function triggerAnimationStart(target) {
    const event = { animationName: 'bolt-grok-appear', target };
    if (document.listeners['animationstart']) {
        document.listeners['animationstart'].forEach(cb => cb(event));
    } else {
        console.error('No animationstart listeners found');
    }
}

// Read and run script
const scriptContent = fs.readFileSync(path.join(__dirname, '../grok-rate-limit-display.user.js'), 'utf8');
vm.runInThisContext(scriptContent);

// Setup mock DOM structure
const queryBar = new MockElement('DIV');
queryBar.className = 'query-bar';
const bottomBar = new MockElement('DIV');
bottomBar.className = 'flex absolute inset-x-0 bottom-0';
const insertPoint = new MockElement('DIV');
insertPoint.className = 'z-20'; // matches div.z-20

queryBar.appendChild(bottomBar);
bottomBar.appendChild(insertPoint);

// Run test
triggerAnimationStart(queryBar);

// Poll for result
const pollInterval = setInterval(() => {
    // Check both potential locations
    const createdElement = bottomBar.children.find(c => c.id === 'grok-rate-limit') || queryBar.children.find(c => c.id === 'grok-rate-limit');

    if (createdElement) {
        clearInterval(pollInterval);
        console.log(`Created element tag: ${createdElement.tagName}`);
        console.log(`Created element type: ${createdElement.getAttribute('type')}`);
        console.log(`Created element aria-label: ${createdElement.getAttribute('aria-label')}`);

        if (createdElement.tagName !== 'BUTTON') {
            console.error('FAILED: Element is not a BUTTON');
            process.exit(1);
        }

        if (createdElement.getAttribute('type') !== 'button') {
            console.error('FAILED: Missing type="button"');
            process.exit(1);
        }

        if (!createdElement.getAttribute('aria-label')) {
            console.error('FAILED: Missing aria-label');
            process.exit(1);
        }

        console.log('PASSED');
        process.exit(0);
    }
}, 100);

// Timeout
setTimeout(() => {
    console.error('FAILED: Timeout waiting for element creation');
    process.exit(1);
}, 2000);
