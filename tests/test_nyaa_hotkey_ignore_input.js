// Regression test for Nyaa Linker hotkey safety
const assert = require('node:assert');
const { test, describe, beforeEach } = require('node:test');
const fs = require('fs');
const path = require('path');

describe('Nyaa Linker Hotkey Ignore Input', () => {
    let window;
    let document;
    let registeredListeners = {};
    let dispatchEventSpy;

    beforeEach(() => {
        registeredListeners = {};
        dispatchEventSpy = null;

        window = {
            location: { href: 'https://myanimelist.net/anime/12345/Title' },
            addEventListener: () => {},
            dispatchEvent: () => {},
            history: { state: {} },
            document: null
        };

        const btn = {
            dispatchEvent: (e) => {
                dispatchEventSpy = e;
            },
            dataset: {},
            style: {},
            classList: { add: () => {} },
            appendChild: () => ({ className: '', src: '' }) // mock img append
        };

        document = {
            body: {
                appendChild: () => {},
                contains: () => true,
                childElementCount: 0
            },
            getElementById: (id) => {
                if (id === 'broadcast-block') return { appendChild: () => btn, querySelector: () => null };
                return null;
            },
            querySelector: (sel) => {
                if (sel === '.title-name') return { textContent: 'Title' };
                if (sel === '.title-english') return { textContent: 'English Title' };
                if (sel === '.nyaaBtn') return btn;
                if (sel === '.leftside') return { children: [{ appendChild: () => btn, querySelector: () => null }] };
                return null;
            },
            querySelectorAll: () => [],
            createElement: () => ({ style: {}, appendChild: () => {}, classList: { add: () => {} }, dataset: {} }),
            addEventListener: (type, listener) => {
                registeredListeners[type] = listener;
            },
            removeEventListener: () => {}
        };
        window.document = document;

        global.window = window;
        global.document = document;
        global.history = window.history;
        global.location = window.location;
        global.GM_getValue = (k, d) => {
            if (k === 'settings') return { hotkey_key_setting: 'f', hotkey_modifier_setting: '' };
            return d;
        };
        global.GM_setValue = () => {};
        global.GM_registerMenuCommand = () => {};
        global.Element = class {};
        global.MouseEvent = class {
            constructor(type, opts) {
                this.type = type;
                Object.assign(this, opts);
            }
        };
        global.MutationObserver = class {
            constructor() {}
            observe() {}
            disconnect() {}
        };
        global.setInterval = () => {};
        global.clearInterval = () => {};
        global.URL = URL;
        global.URLSearchParams = URLSearchParams;
    });

    test('should NOT trigger hotkey when typing in an input', () => {
        const scriptPath = path.join(__dirname, '../nyaa-linker-userscript.user.js');
        const scriptContent = fs.readFileSync(scriptPath, 'utf8');

        // Execute script
        try {
            eval(scriptContent);
        } catch (e) {
            console.error(e);
            throw e;
        }

        // Verify listener was registered
        const listener = registeredListeners['keydown'];
        assert.ok(listener, 'Keydown listener should be registered');

        // Simulate typing 'f' in an input
        const inputEvent = {
            key: 'f',
            target: { tagName: 'INPUT' },
            preventDefault: () => {}
        };
        listener(inputEvent);
        assert.strictEqual(dispatchEventSpy, null, 'Should NOT dispatch click event when target is INPUT');

        // Simulate typing 'f' in a textarea
        const textareaEvent = {
            key: 'f',
            target: { tagName: 'TEXTAREA' },
            preventDefault: () => {}
        };
        listener(textareaEvent);
        assert.strictEqual(dispatchEventSpy, null, 'Should NOT dispatch click event when target is TEXTAREA');

        // Simulate typing 'f' in contenteditable
        const contentEditableEvent = {
            key: 'f',
            target: { isContentEditable: true, tagName: 'DIV' },
            preventDefault: () => {}
        };
        listener(contentEditableEvent);
        assert.strictEqual(dispatchEventSpy, null, 'Should NOT dispatch click event when target is contentEditable');

        // Simulate typing 'f' normally (e.g. body)
        const bodyEvent = {
            key: 'f',
            target: { tagName: 'BODY', isContentEditable: false },
            preventDefault: () => {}
        };
        listener(bodyEvent);
        assert.ok(dispatchEventSpy, 'Should dispatch click event when target is BODY');
        assert.strictEqual(dispatchEventSpy.type, 'click');
    });
});
