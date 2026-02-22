const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Mock DOM
class MockElement {
    constructor(tagName) {
        this.tagName = tagName.toUpperCase();
        this.dataset = {};
        this.style = {};
        this.classList = {
            add: (...cls) => cls.forEach(c => this.className = (this.className || '') + ' ' + c),
            remove: (cls) => this.className = (this.className || '').replace(cls, '').trim(),
            contains: (cls) => (this.className || '').includes(cls)
        };
        this.attributes = {};
        this.parentNode = {
            insertBefore: () => {},
            appendChild: () => {}
        };
        this.children = [];
        this.listeners = {};
        this.childNodes = []; // For childNodes iteration if needed
        this._textContent = '';
    }

    get textContent() { return this._textContent; }
    set textContent(val) { this._textContent = val; }

    get value() { return this._value; }
    set value(val) { this._value = val; }

    get checked() { return this._checked; }
    set checked(val) { this._checked = val; }

    get id() { return this.getAttribute('id'); }
    set id(val) { this.setAttribute('id', val); }

    get type() { return this.getAttribute('type'); }
    set type(val) { this.setAttribute('type', val); }

    setAttribute(k, v) { this.attributes[k] = v; }
    getAttribute(k) { return this.attributes[k]; }

    querySelector(sel) {
        // Simple selector logic for test purposes
        if (sel.startsWith('#')) {
            const id = sel.slice(1);
            if (this.id === id) return this;
            for (const child of this.children) {
                const res = child.querySelector(sel);
                if (res) return res;
            }
        }
        if (sel.startsWith('.')) {
             const cls = sel.slice(1);
             if (this.classList.contains(cls)) return this;
             for (const child of this.children) {
                 const res = child.querySelector(sel);
                 if (res) return res;
             }
        }
        return null;
    }

    querySelectorAll(sel) {
        // Dummy implementation for removeNyaaBtns
        return [];
    }

    appendChild(child) {
        this.children.push(child);
        child.parentNode = this;
        return child;
    }

    remove() {
        // self-removal logic if needed
    }

    addEventListener(event, cb) {
        this.listeners[event] = cb;
    }
}

// Global mocks
const createdElements = [];
global.document = {
    querySelector: (sel) => null,
    querySelectorAll: (sel) => [],
    getElementById: (id) => {
         // Search in createdElements for ID
         return createdElements.find(el => el.id === id) || null;
    },
    addEventListener: (event, cb) => {},
    removeEventListener: () => {},
    body: {
        appendChild: (child) => {
             // We can capture the panel here
             global.injectedPanel = child;
        }
    },
    createElement: (tag) => {
        const el = new MockElement(tag);
        createdElements.push(el);
        return el;
    }
};

global.window = {
    location: { href: 'https://myanimelist.net/anime/12345' },
    innerHeight: 1000
};
global.location = global.window.location;
global.URL = URL;

// GM Mocks
global.GM_getValue = (key, def) => def;
global.GM_setValue = () => {};
global.GM_registerMenuCommand = (name, cb) => {
    if (name === 'Nyaa Linker Settings') {
        global.openSettings = cb;
    }
};

// Mock setInterval
global.setInterval = () => {};

// Read script
const scriptPath = path.join(__dirname, '../nyaa-linker-userscript.user.js');
const scriptContent = fs.readFileSync(scriptPath, 'utf8');

// Run script
try {
    vm.runInThisContext(scriptContent);
} catch (e) {
    console.error('Error running script:', e);
    process.exit(1);
}

// Trigger Settings Panel
if (!global.openSettings) {
    console.error('GM_registerMenuCommand callback not found!');
    process.exit(1);
}

console.log('Opening settings panel...');
global.openSettings();

if (!global.injectedPanel) {
    console.error('Settings panel not injected into body!');
    process.exit(1);
}

const panel = global.injectedPanel;
console.log('Settings panel found.');

let passed = true;

// CHECK 1: Accessibility Roles
const role = panel.getAttribute('role');
const ariaModal = panel.getAttribute('aria-modal');
const ariaLabel = panel.getAttribute('aria-label');

if (role !== 'dialog') {
    console.log('FAIL: Panel missing role="dialog"');
    passed = false;
} else {
    console.log('PASS: Panel has role="dialog"');
}

if (ariaModal !== 'true') {
    console.log('FAIL: Panel missing aria-modal="true"');
    passed = false;
} else {
    console.log('PASS: Panel has aria-modal="true"');
}

// CHECK 2: Labels have for attribute
const labels = panel.children.filter(el => el.tagName === 'LABEL');
const inputs = panel.children.filter(el => ['INPUT', 'SELECT'].includes(el.tagName) || (el.tagName === 'DIV' && el.children[0]?.tagName === 'INPUT'));

console.log(`Found ${labels.length} labels.`);

labels.forEach(label => {
    const text = label.textContent;
    const htmlFor = label.getAttribute('for');

    if (!htmlFor) {
        console.log(`FAIL: Label "${text}" missing 'for' attribute`);
        passed = false;
    } else {
        // Verify target exists
        const target = createdElements.find(el => el.id === htmlFor);
        if (!target) {
             console.log(`FAIL: Label "${text}" points to non-existent ID "${htmlFor}"`);
             passed = false;
        } else {
             console.log(`PASS: Label "${text}" correctly points to "${htmlFor}"`);
        }
    }
});

// CHECK 3: Buttons have type="button"
const buttons = panel.children.filter(el => el.tagName === 'DIV' && el.children.some(c => c.tagName === 'BUTTON'))
    .flatMap(div => div.children.filter(c => c.tagName === 'BUTTON'));

buttons.forEach(btn => {
    const text = btn.textContent;
    const type = btn.getAttribute('type');

    if (type !== 'button') {
        console.log(`FAIL: Button "${text}" missing type="button"`);
        passed = false;
    } else {
        console.log(`PASS: Button "${text}" has type="button"`);
    }
});

if (passed) {
    console.log('ALL A11Y TESTS PASSED');
    process.exit(0);
} else {
    console.log('SOME A11Y TESTS FAILED');
    process.exit(1);
}
