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
            add: (cls) => this.className += ' ' + cls,
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
    }

    setAttribute(k, v) { this.attributes[k] = v; }
    getAttribute(k) { return this.attributes[k]; }

    querySelector(sel) {
        if (sel === 'a[href*="steamcommunity.com/app/"]') return null;
        return null;
    }

    appendChild(child) { this.children.push(child); child.parentNode = this; return child; }

    getBoundingClientRect() { return { left: 0, top: 0, bottom: 0, right: 0 }; }

    addEventListener(event, cb) {
        this.listeners[event] = cb;
    }

    // Helper for test
    click() {
        if (this.onclick) this.onclick({ preventDefault: () => {}, stopPropagation: () => {} });
    }
}

// Global mocks
const createdElements = [];
global.document = {
    querySelector: (sel) => {
        if (sel === '#appHubAppName') return { textContent: 'Test Game' };
        return null;
    },
    getElementById: (id) => {
         if (id === 'appHubAppName') return { textContent: 'Test Game' };
         return null;
    },
    addEventListener: (event, cb) => {
        if (event === 'animationstart') global.animationListener = cb;
        if (event === 'click') global.clickListener = cb;
    },
    body: {
        appendChild: () => {}
    },
    createElement: (tag) => {
        const el = new MockElement(tag);
        createdElements.push(el);
        return el;
    }
};

global.window = { innerHeight: 1000, scrollX: 0, scrollY: 0 };
global.scrollX = 0;
global.scrollY = 0;
global.location = { pathname: '/app/12345' };
global.GM_addStyle = () => {};

// Read script
const scriptPath = path.join(__dirname, '../steam-links-dropdowns.user.js');
const scriptContent = fs.readFileSync(scriptPath, 'utf8');

// Run script
try {
    vm.runInThisContext(scriptContent);
} catch (e) {
    console.error('Error running script:', e);
    process.exit(1);
}

// Trigger initialization
const mockHub = new MockElement('DIV');
mockHub.dataset = {};
if (global.animationListener) {
    global.animationListener({ animationName: 'sld-node-inserted', target: mockHub });
} else {
    console.error('Animation listener not found');
    process.exit(1);
}

// Verify A11y
const buttons = createdElements.filter(el => el.tagName === 'A' && el.className && el.className.includes('sld-btn'));

console.log(`Found ${buttons.length} dropdown buttons.`);

let passed = true;

buttons.forEach((btn, i) => {
    console.log(`Checking button ${i + 1}...`);

    if (btn.getAttribute('role') !== 'button') {
        console.log(`FAIL: Missing role="button"`);
        passed = false;
    } else {
        console.log(`PASS: role="button" present`);
    }

    if (btn.getAttribute('aria-haspopup') !== 'true') {
        console.log(`FAIL: Missing aria-haspopup="true"`);
        passed = false;
    } else {
        console.log(`PASS: aria-haspopup="true" present`);
    }

    if (btn.getAttribute('aria-expanded') !== 'false') {
        console.log(`FAIL: Missing aria-expanded="false" (initial state)`);
        passed = false;
    } else {
        console.log(`PASS: aria-expanded="false" present`);
    }

    // Simulate click to toggle expanded
    btn.click();
    if (btn.getAttribute('aria-expanded') !== 'true') {
        console.log(`FAIL: aria-expanded not toggled to "true" on click`);
        passed = false;
    } else {
        console.log(`PASS: aria-expanded toggled to "true"`);
    }

    // Simulate click again to close
    btn.click();
    if (btn.getAttribute('aria-expanded') !== 'false') {
        console.log(`FAIL: aria-expanded not toggled back to "false" on second click`);
        passed = false;
    } else {
        console.log(`PASS: aria-expanded toggled back to "false"`);
    }
});

if (passed) {
    console.log('ALL A11Y TESTS PASSED');
    process.exit(0);
} else {
    console.log('SOME A11Y TESTS FAILED');
    process.exit(1);
}
