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
        this._textContent = '';
    }

    get textContent() {
        if (this.children.length > 0) {
            return this.children.map(c => c.textContent).join('');
        }
        return this._textContent;
    }
    set textContent(v) { this._textContent = v; this.children = []; }

    getAttribute(name) { return this.attributes.get(name); }
    setAttribute(name, value) { this.attributes.set(name, value); }
    appendChild(child) {
        if (!child) return;
        this.children.push(child);
        child.parentNode = this;
        return child;
    }
    append(...children) {
        children.forEach(c => {
             if (typeof c === 'string') {
                 this.appendChild(document.createTextNode(c));
             } else {
                 this.appendChild(c);
             }
        });
    }
    insertAdjacentElement(position, element) {
        global.insertedBox = element;
    }
    contains(child) { return this.children.includes(child); }
}

const targetElement = new MockElement('DIV');
targetElement.className = 'game_area_purchase_game_wrapper';

const document = {
    createElement: (tag) => new MockElement(tag),
    getElementById: (id) => null,
    querySelector: (selector) => {
        if (selector === '.game_area_purchase_game_wrapper') return targetElement;
        return null;
    },
    createTextNode: (text) => {
        const el = new MockElement('TEXT');
        el._textContent = text;
        return el;
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
global.Node = MockElement;
global.location = { pathname: '/app/12345' };
global.GM_addStyle = (css) => { global.injectedCSS = css; };
global.GM_xmlhttpRequest = () => {};

// Read and run script
const scriptPath = path.join(__dirname, '../romheaven-steam-assistant.user.js');
const scriptContent = fs.readFileSync(scriptPath, 'utf8');

try {
    vm.runInThisContext(scriptContent);
} catch (e) {
    console.error('Script execution failed:', e);
}

function dumpTree(node, indent = '') {
    let out = '';
    if (node.tagName === 'TEXT') {
        out += indent + `TEXT: "${node.textContent}"\n`;
    } else {
        let attrs = '';
        if (node.attributes.size > 0) {
            attrs = ' ' + Array.from(node.attributes.entries()).map(([k,v]) => `${k}="${v}"`).join(' ');
        }
        out += indent + `<${node.tagName} id="${node.id}" class="${node.className}"${attrs}>\n`;
        node.children.forEach(c => out += dumpTree(c, indent + '  '));
        out += indent + `</${node.tagName}>\n`;
    }
    return out;
}

// Check results
setTimeout(() => {
    if (global.insertedBox) {
        // Find status element
        const status = global.insertedBox.children.find(c => c.id === 'rh-status');
        if (status) {
            console.log('Status Tree:\n' + dumpTree(status));
            const role = status.getAttribute('role');
            const ariaLive = status.getAttribute('aria-live');
            if (role === 'status' && ariaLive === 'polite') {
                console.log('PASS: Accessibility attributes present');
            } else {
                console.log(`FAIL: Accessibility attributes missing or incorrect (role=${role}, aria-live=${ariaLive})`);
            }
        } else {
            console.log('Status element not found');
        }

        console.log('CSS Injected:', global.injectedCSS ? 'Yes' : 'No');
        if (global.injectedCSS) {
            console.log('Focus styles present:', global.injectedCSS.includes(':focus-visible'));
            console.log('Spinner styles present:', global.injectedCSS.includes('.rh-spinner'));
        }
    } else {
        console.log('FAIL: No box inserted');
    }
}, 100);
