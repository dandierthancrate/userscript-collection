const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Mock DOM
class MockElement {
    constructor(tagName) {
        this.tagName = tagName.toUpperCase();
        this.dataset = {};
        this.style = {};
        this.className = '';
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
        if (sel.includes('role="menuitem"')) {
             return this.children.find(c => c.getAttribute('role') === 'menuitem');
        }
        return null;
    }

    querySelectorAll(sel) {
        if (sel.includes('role="menuitem"')) {
            // Find children that match
            return this.children.filter(c => c.getAttribute('role') === 'menuitem');
        }
        return [];
    }

    appendChild(child) { this.children.push(child); child.parentNode = this; return child; }

    getBoundingClientRect() { return { left: 0, top: 0, bottom: 0, right: 0 }; }

    addEventListener(event, cb) {
        this.listeners[event] = cb;
    }

    focus() {
        global.document.activeElement = this;
    }

    // Helper for test
    click() {
        if (this.onclick) this.onclick({ preventDefault: () => {}, stopPropagation: () => {} });
    }

    dispatchKeydown(key) {
        const event = {
            key: key,
            preventDefault: () => {},
            stopPropagation: () => {},
            target: this
        };
        if (this.onkeydown) this.onkeydown(event);
        // Also trigger added listeners
        if (this.listeners['keydown']) this.listeners['keydown'](event);
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

// Verify A11y
const buttons = createdElements.filter(el => el.tagName === 'A' && el.className && el.className.includes('sld-btn'));
const panels = createdElements.filter(el => el.tagName === 'DIV' && el.className && el.className.includes('sld-panel'));

console.log(`Found ${buttons.length} dropdown buttons.`);

let passed = true;

buttons.forEach((btn, i) => {
    console.log(`\nChecking button ${i + 1}...`);
    const panel = panels[i];

    // 1. Basic ARIA
    if (btn.getAttribute('role') !== 'button') { console.log(`FAIL: Missing role="button"`); passed = false; }
    else console.log(`PASS: role="button" present`);

    if (btn.getAttribute('aria-haspopup') !== 'true') { console.log(`FAIL: Missing aria-haspopup="true"`); passed = false; }
    else console.log(`PASS: aria-haspopup="true" present`);

    if (btn.getAttribute('aria-expanded') !== 'false') { console.log(`FAIL: Missing aria-expanded="false"`); passed = false; }
    else console.log(`PASS: aria-expanded="false" present`);

    // 2. Keyboard Interaction (ArrowDown on Button)
    console.log(`Testing ArrowDown on button...`);
    btn.focus();
    btn.dispatchKeydown('ArrowDown');

    if (btn.getAttribute('aria-expanded') !== 'true') {
        console.log(`FAIL: ArrowDown did not open menu (aria-expanded!=true)`);
        passed = false;
    } else {
        console.log(`PASS: ArrowDown opened menu`);
    }

    // Check focus moved to first item
    const firstItem = panel.children.find(c => c.tagName === 'A'); // Find first link
    if (global.document.activeElement !== firstItem) {
        console.log(`FAIL: Focus did not move to first menu item`);
        passed = false;
    } else {
        console.log(`PASS: Focus moved to first menu item`);
    }

    // 3. Navigation inside Menu
    if (firstItem) {
        console.log(`Testing ArrowDown inside menu...`);
        firstItem.dispatchKeydown('ArrowDown');

        // Find expected next item (skipping headers which are DIVs)
        let nextItem = null;
        let foundFirst = false;
        for (const child of panel.children) {
            if (child === firstItem) { foundFirst = true; continue; }
            if (foundFirst && child.tagName === 'A') { nextItem = child; break; }
        }

        if (nextItem && global.document.activeElement === nextItem) {
            console.log(`PASS: ArrowDown moved focus to next item`);
        } else if (nextItem) {
            console.log(`FAIL: Focus did not move to next item`);
            passed = false;
        }

        console.log(`Testing Escape inside menu...`);
        // Dispatch escape on current active element (should be nextItem or firstItem)
        const current = global.document.activeElement || firstItem;
        current.dispatchKeydown('Escape');

        if (btn.getAttribute('aria-expanded') !== 'false') {
            console.log(`FAIL: Escape did not close menu`);
            passed = false;
        } else {
            console.log(`PASS: Escape closed menu`);
        }

        if (global.document.activeElement !== btn) {
            console.log(`FAIL: Focus did not return to button after Escape`);
            passed = false;
        } else {
            console.log(`PASS: Focus returned to button`);
        }
    }

    // 4. Check Roles
    if (panel.getAttribute('role') !== 'menu') {
        console.log(`FAIL: Panel missing role="menu"`);
        passed = false;
    } else {
        console.log(`PASS: Panel has role="menu"`);
    }

    const items = panel.children.filter(c => c.tagName === 'A');
    if (items.some(item => item.getAttribute('role') !== 'menuitem')) {
        console.log(`FAIL: Some items missing role="menuitem"`);
        passed = false;
    } else {
        console.log(`PASS: Items have role="menuitem"`);
    }
});

if (passed) {
    console.log('\nALL A11Y TESTS PASSED');
    process.exit(0);
} else {
    console.log('\nSOME A11Y TESTS FAILED');
    process.exit(1);
}
