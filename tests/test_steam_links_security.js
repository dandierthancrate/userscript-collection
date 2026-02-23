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
            add: (cls) => this.className = (this.className || '') + ' ' + cls,
            remove: (cls) => this.className = (this.className || '').replace(cls, '').trim(),
            contains: (cls) => (this.className || '').includes(cls)
        };
        this.attributes = {};
        this.children = [];
        this._innerHTML = '';
        this.parentNode = {
            insertBefore: () => {},
            appendChild: () => {}
        };
    }

    setAttribute(k, v) { this.attributes[k] = v; }
    getAttribute(k) { return this.attributes[k]; }

    set innerHTML(val) { this._innerHTML = val; }
    get innerHTML() { return this._innerHTML; }

    appendChild(child) {
        this.children.push(child);
        child.parentNode = this;
        return child;
    }

    querySelector(sel) { return null; } // Add this

    getBoundingClientRect() { return { left: 0, top: 0, bottom: 0, right: 0 }; }
}

const createdElements = [];

global.document = {
    createElement: (tag) => {
        const el = new MockElement(tag);
        createdElements.push(el);
        return el;
    },
    body: { appendChild: () => {} },
    getElementById: (id) => {
        if (id === 'appHubAppName') return { textContent: 'Test Game' };
        return null;
    },
    addEventListener: (evt, cb) => {
        if (evt === 'animationstart') global.animationListener = cb;
        if (evt === 'click') global.clickListener = cb;
    }
};

global.window = { innerHeight: 1000, scrollX: 0, scrollY: 0 };
global.GM_addStyle = () => {};

// Read script
const scriptPath = path.join(__dirname, '../steam-links-dropdowns.user.js');
const scriptContent = fs.readFileSync(scriptPath, 'utf8');

// Run script
vm.runInNewContext(scriptContent, global);

// Trigger init
if (global.animationListener) {
    const mockHub = new MockElement('div');
    global.animationListener({ animationName: 'sld-node-inserted', target: mockHub });
} else {
    console.error('Animation listener not found');
}

// Check buttons
const buttons = createdElements.filter(el => el.tagName === 'A' && el.className && el.className.includes('sld-btn'));

console.log(`Found ${buttons.length} buttons.`);
let fail = false;
buttons.forEach((btn, i) => {
    // console.log(`Button ${i}: innerHTML="${btn.innerHTML}", children=${btn.children.length}`);
    if (btn.children.length > 0 && btn.children[0].tagName === 'SPAN') {
        console.log(`PASS: Button ${i} has SPAN child element.`);
    } else if (btn.innerHTML && btn.innerHTML.includes('<span>')) {
        console.log(`FAIL: Button ${i} uses innerHTML instead of DOM methods.`);
        fail = true;
    } else {
        console.log(`FAIL: Button ${i} unexpected structure.`);
        fail = true;
    }
});

if (fail) process.exit(1);
