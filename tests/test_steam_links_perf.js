const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

// Mock DOM
class MockElement {
    constructor(tagName) {
        this.tagName = tagName.toUpperCase();
        this.dataset = {};
        this.style = {};
        this.classList = {
            add: () => {},
            remove: () => {}
        };
        this.parentNode = {
            insertBefore: () => {},
            appendChild: () => {}
        };
    }
    querySelector() { return null; }
    appendChild() {}
    getBoundingClientRect() { return { left: 0, top: 0, bottom: 0, right: 0 }; }
}

let mutationObserverCount = 0;
let animationListenerAdded = false;
let animationListener = null;
let styleAdded = '';

const document = {
    querySelector: (sel) => {
        if (sel === '#appHubAppName') return { textContent: 'Test Game' };
        if (sel === '.apphub_OtherSiteInfo') return null; // Simulate missing element
        return null;
    },
    getElementById: (id) => {
         if (id === 'appHubAppName') return { textContent: 'Test Game' };
         return null;
    },
    addEventListener: (event, cb) => {
        if (event === 'animationstart') {
            animationListenerAdded = true;
            animationListener = cb;
        }
        if (event === 'click') {}
    },
    body: {
        appendChild: () => {}
    },
    createElement: (tag) => new MockElement(tag)
};

global.document = document;
global.window = { innerHeight: 1000, scrollX: 0, scrollY: 0 };
global.location = { pathname: '/app/12345' };
global.GM_addStyle = (style) => { styleAdded = style; };
global.MutationObserver = class {
    constructor() { mutationObserverCount++; }
    observe() {}
    disconnect() {}
};

// Read script
const scriptContent = fs.readFileSync(path.join(__dirname, '../steam-links-dropdowns.user.js'), 'utf8');

console.log('Running test_steam_links_perf.js...');

// Run script
try {
    vm.runInThisContext(scriptContent);
} catch (e) {
    console.error('Error running script:', e);
    process.exit(1);
}

// Verification Logic
let passed = true;

// 1. Check MutationObserver usage (should be 0 after refactor)
if (mutationObserverCount > 0) {
    console.log('FAIL: MutationObserver was used (count: ' + mutationObserverCount + ')');
    passed = false;
} else {
    console.log('PASS: MutationObserver was NOT used');
}

// 2. Check Animation Listener
if (!animationListenerAdded) {
    console.log('FAIL: animationstart listener was NOT added');
    passed = false;
} else {
    console.log('PASS: animationstart listener added');
}

// 3. Check Style Injection
if (!styleAdded.includes('@keyframes sld-node-inserted')) {
    console.log('FAIL: Keyframes not found in injected style');
    passed = false;
} else {
    console.log('PASS: Keyframes found');
}

// 4. Test Animation Trigger
if (animationListener) {
    const mockTarget = new MockElement('DIV');
    mockTarget.className = 'apphub_OtherSiteInfo';

    // Simulate event
    try {
        animationListener({
            animationName: 'sld-node-inserted',
            target: mockTarget
        });

        if (mockTarget.dataset.sldInit === 'true') {
            console.log('PASS: initDropdowns executed on animation trigger');
        } else {
            console.log('FAIL: initDropdowns logic did not run (dataset.sldInit not set)');
            passed = false;
        }
    } catch (e) {
        console.error('Error in animation listener:', e);
        passed = false;
    }
}

if (passed) {
    console.log('ALL TESTS PASSED');
    process.exit(0);
} else {
    console.log('SOME TESTS FAILED');
    process.exit(1);
}
