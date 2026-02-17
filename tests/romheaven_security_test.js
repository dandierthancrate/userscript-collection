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
        this._innerHTMLUsed = false;
        this.textContent = '';
    }

    getAttribute(name) { return this.attributes.get(name); }
    setAttribute(name, value) { this.attributes.set(name, value); }
    querySelector(selector) {
        // Simple mock selector logic
        if (selector.startsWith('#')) return this.children.find(c => c.id === selector.slice(1));
        return null;
    }
    querySelectorAll(selector) { return []; }
    appendChild(child) {
        if (!child) return;
        this.children.push(child);
        child.parentNode = this;
        return child;
    }
    append(...children) {
        children.forEach(c => this.appendChild(c));
    }
    insertAdjacentElement(position, element) {
        console.log(`inserted element: ${element.tagName} id=${element.id}`);
        if (element._innerHTMLUsed) {
            console.log('innerHTML was used on inserted element');
        }
        global.insertedBox = element;
    }
    contains(child) { return this.children.includes(child); }

    set innerHTML(html) {
        this._innerHTML = html;
        this._innerHTMLUsed = true;
        // Basic parsing for children needed for init flow
        if (html.includes('id="rh-status"')) {
             const status = new MockElement('p');
             status.id = 'rh-status';
             this.appendChild(status);
        }
        if (html.includes('id="rh-size"')) {
             const size = new MockElement('p');
             size.id = 'rh-size';
             this.appendChild(size);
        }
        if (html.includes('id="rh-downloads"')) {
             const dl = new MockElement('div');
             dl.id = 'rh-downloads';
             this.appendChild(dl);
        }
    }
    get innerHTML() { return this._innerHTML; }
}

const targetElement = new MockElement('DIV');
targetElement.className = 'game_area_purchase_game_wrapper';

const document = {
    createElement: (tag) => new MockElement(tag),
    getElementById: (id) => null, // Return null to trigger init
    querySelector: (selector) => {
        if (selector === '.game_area_purchase_game_wrapper') return targetElement;
        return null;
    },
    body: new MockElement('BODY'),
    head: new MockElement('HEAD'),
    documentElement: new MockElement('HTML'),
};

global.document = document;
global.window = {
    DecompressionStream: class {},
    open: () => {},
};
global.Node = MockElement; // Mock Node
global.location = { pathname: '/app/12345' };
global.GM_addStyle = () => {};
global.GM_xmlhttpRequest = () => {};

// Read and run script
const scriptPath = path.join(__dirname, '../romheaven-steam-assistant.user.js');
const scriptContent = fs.readFileSync(scriptPath, 'utf8');

try {
    vm.runInThisContext(scriptContent);
} catch (e) {
    console.error('Script execution failed:', e);
}

// Check results
setTimeout(() => {
    if (global.insertedBox) {
        if (global.insertedBox._innerHTMLUsed) {
            console.log('FAIL: innerHTML was used');
        } else {
            console.log('PASS: innerHTML was NOT used');
        }
    } else {
        console.log('FAIL: No box inserted');
    }
}, 100);
