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
        this.onclick = null;
        this.onkeydown = null;
    }

    setAttribute(k, v) { this.attributes[k] = v; }
    getAttribute(k) { return this.attributes[k]; }

    querySelector(sel) {
        if (sel === 'a[href*="steamcommunity.com/app/"]') return null;
        if (sel === '[role="menuitem"]') return this.children.find(c => c.getAttribute('role') === 'menuitem');
        return null;
    }

    querySelectorAll(sel) {
        if (sel === '[role="menuitem"]') return this.children.filter(c => c.getAttribute('role') === 'menuitem');
        return [];
    }

    appendChild(child) { this.children.push(child); child.parentNode = this; return child; }

    getBoundingClientRect() { return { left: 0, top: 0, bottom: 0, right: 0 }; }

    addEventListener(event, cb) {
        this.listeners[event] = cb;
    }

    click() {
        if (this.onclick) this.onclick({ preventDefault: () => {}, stopPropagation: () => {} });
    }

    focus() {
        global.document.activeElement = this;
    }

    dispatchEvent(event) {
        if (event.type === 'keydown' && this.onkeydown) {
            this.onkeydown(event);
        }
    }
}

// Global mocks
const createdElements = [];
global.document = {
    activeElement: null,
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

// Verify Menu Navigation
const buttons = createdElements.filter(el => el.tagName === 'A' && el.className && el.className.includes('sld-btn'));
const panels = createdElements.filter(el => el.tagName === 'DIV' && el.className && el.className.includes('sld-panel'));

if (buttons.length === 0 || panels.length === 0) {
    console.log('FAIL: No buttons or panels created');
    process.exit(1);
}

const btn = buttons[0];
const panel = panels[0];

console.log('Verifying Menu Structure...');

// 1. Check Role Menu
if (panel.getAttribute('role') !== 'menu') {
    console.log('FAIL: Panel missing role="menu"');
    process.exit(1);
} else {
    console.log('PASS: Panel has role="menu"');
}

// 2. Check Menu Items
const items = panel.children.filter(c => c.tagName === 'A');
if (items.some(item => item.getAttribute('role') !== 'menuitem')) {
    console.log('FAIL: Items missing role="menuitem"');
    process.exit(1);
} else {
    console.log('PASS: Items have role="menuitem"');
}

// 3. Check Aria Controls
if (!btn.getAttribute('aria-controls') || btn.getAttribute('aria-controls') !== panel.id) {
    console.log('FAIL: Button missing or incorrect aria-controls');
    process.exit(1);
} else {
    console.log('PASS: Button has correct aria-controls');
}

// 4. Check Keyboard Nav: ArrowDown on Button opens and focuses first item
console.log('Verifying Keyboard Interaction...');
btn.focus();
btn.dispatchEvent({ type: 'keydown', key: 'ArrowDown', preventDefault: () => {} });

if (btn.getAttribute('aria-expanded') !== 'true') {
    console.log('FAIL: ArrowDown on button did not open menu');
    process.exit(1);
} else {
    console.log('PASS: ArrowDown on button opened menu');
}

// Wait for setTimeout in script
setTimeout(() => {
    if (global.document.activeElement !== items[0]) {
        console.log('FAIL: Focus did not move to first item on ArrowDown');
        console.log('Active Element is:', global.document.activeElement?.tagName);
        process.exit(1);
    } else {
        console.log('PASS: Focus moved to first item');
    }

    runRemainingTests();
}, 10);

function runRemainingTests() {
    // 5. Check Keyboard Nav: ArrowDown on Item moves to next
    items[0].dispatchEvent({ type: 'keydown', key: 'ArrowDown', preventDefault: () => {} });
    if (global.document.activeElement !== items[1]) {
        console.log('FAIL: ArrowDown on item 1 did not move focus to item 2');
        process.exit(1);
    } else {
        console.log('PASS: Focus moved to next item');
    }

    // 6. Check Keyboard Nav: ArrowUp on Item moves to prev
    items[1].dispatchEvent({ type: 'keydown', key: 'ArrowUp', preventDefault: () => {} });
    if (global.document.activeElement !== items[0]) {
        console.log('FAIL: ArrowUp on item 2 did not move focus to item 1');
        process.exit(1);
    } else {
        console.log('PASS: Focus moved to prev item');
    }

    // 7. Check Escape closes menu and focuses button
    items[0].dispatchEvent({ type: 'keydown', key: 'Escape', preventDefault: () => {} });
    if (btn.getAttribute('aria-expanded') !== 'false') {
        console.log('FAIL: Escape did not close menu');
        process.exit(1);
    } else {
        console.log('PASS: Escape closed menu');
    }

    if (global.document.activeElement !== btn) {
        console.log('FAIL: Focus did not return to button after Escape');
        process.exit(1);
    } else {
        console.log('PASS: Focus returned to button');
    }

    console.log('ALL MENU NAV TESTS PASSED');
    process.exit(0);
}
