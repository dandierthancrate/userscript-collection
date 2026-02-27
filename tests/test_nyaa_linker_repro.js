const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Mock DOM
class MockElement {
    constructor(tagName) {
        this.tagName = tagName.toUpperCase();
        this.className = '';
        this.style = {};
        this.dataset = {};
        this.attributes = new Map();
        this.children = [];
        this.parentNode = null;
        this._textContent = '';
    }

    setAttribute(k, v) { this.attributes.set(k, v); }
    getAttribute(k) { return this.attributes.get(k); }
    hasChildNodes() { return this.children.length > 0; }

    appendChild(child) {
        this.children.push(child);
        child.parentNode = this;
        return child;
    }

    get title() { return this.getAttribute('title') || ''; }
    set title(v) { this.setAttribute('title', v); }

    get textContent() { return this._textContent; }
    set textContent(v) {
        this._textContent = v;
        this.children = [];
    }

    get classList() {
        return {
            add: (...args) => {
                let classes = (this.className || '').split(' ');
                args.forEach(c => { if (!classes.includes(c)) classes.push(c); });
                this.className = classes.join(' ').trim();
            },
            contains: (c) => (this.className || '').includes(c)
        };
    }

    querySelectorAll(sel) { return []; }
}

// Setup Mock DOM
const container = new MockElement('DIV');
container.id = 'ratings-list-1';
container.className = 'ratings-list';
container.setAttribute('data-browser-extension-injection', 'true');

const card = new MockElement('DIV');
card.className = 'bg-card';
card.appendChild(container);

// Correct window and global setup
const globalMocks = {
    document: {
        createElement: (tag) => new MockElement(tag),
        querySelector: (sel) => null,
        querySelectorAll: (sel) => {
            if (sel.includes('ratings-list')) return [container];
            return [];
        },
        getElementById: (id) => {
            if (id === 'ratings-list-1') return container;
            return null;
        },
        addEventListener: () => {},
        removeEventListener: () => {}
    },
    window: {
        location: { href: 'https://mangabaka.org/', pathname: '/', origin: 'https://mangabaka.org' }
    },
    location: { href: 'https://mangabaka.org/', pathname: '/' },
    GM_getValue: (k, d) => d,
    GM_setValue: () => {},
    GM_registerMenuCommand: () => {},
    setInterval: () => {},
    clearInterval: () => {},
    console: console,
    URL: URL
};

container.closest = (sel) => {
    if (sel === '.bg-card') return card;
    return null;
};
container.querySelector = (sel) => {
    return null;
}
card.querySelector = (sel) => {
    if (sel === '.nyaaBtn') return null;
    if (sel === 'div.line-clamp-2[title]') return { title: 'Test Manga', textContent: 'Test Manga' };
    return null;
};

// Read script
const scriptContent = fs.readFileSync(path.join(__dirname, '../nyaa-linker-userscript.user.js'), 'utf8');

// Execute script
vm.runInNewContext(scriptContent, globalMocks);

// Now trigger the logic
// Check container children
const btn = container.children.find(c => c.tagName === 'A' && c.className.includes('nyaaBtn'));

if (btn) {
    console.log('Button found!');
    console.log('Title:', btn.title);
    console.log('TextContent:', btn.textContent);
    console.log('Children count:', btn.children.length);
    if (btn.children.length > 0) {
        console.log('Child tag:', btn.children[0].tagName);
        console.log('Child src:', btn.children[0].attributes.get('src'));
    } else {
        console.log('No children (IMG likely wiped out)');
    }
    console.log('ARIA label:', btn.getAttribute('aria-label'));
} else {
    console.log('Button NOT found.');
}
