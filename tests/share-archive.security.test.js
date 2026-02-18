const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { test, describe, it, before } = require('node:test');
const assert = require('assert');

const scriptPath = path.join(__dirname, '../share-archive.user.js');
const scriptContent = fs.readFileSync(scriptPath, 'utf8');

// We need to inject code to expose 'cleanUrl' and run it in a sandbox.
// The script is wrapped in an IIFE: (function () { ... })();
// We replace the last '})();' with 'window.cleanUrl = cleanUrl; })();'
const exposedScript = scriptContent.replace(/\}\)\(\);\s*$/, 'window.cleanUrl = cleanUrl; })();');

describe('Share Archive Security', () => {
    let context;

    before(() => {
        context = vm.createContext({
            window: {
                location: { href: 'https://example.com' },
                alert: () => {},
                confirm: () => true,
            },
            document: {
                addEventListener: () => {},
                createElement: () => ({}),
                body: { appendChild: () => {} },
            },
            GM_registerMenuCommand: () => {},
            GM_openInTab: () => {},
            GM_xmlhttpRequest: () => {},
            GM_setValue: () => {},
            GM_getValue: () => null,
            URL: URL, // Use native URL
            console: console,
            location: { href: 'https://example.com' },
            performance: { now: () => Date.now() },
        });

        // Execute the script
        vm.runInContext(exposedScript, context);
    });

    it('should block vulnerability: cleanUrl returns null for javascript: URL', () => {
        const unsafeUrl = 'javascript:alert(1)';
        const result = context.window.cleanUrl(unsafeUrl);
        assert.strictEqual(result, null, 'cleanUrl should return null for unsafe protocols');
    });

    it('should clean valid http URL', () => {
        const safeUrl = 'https://example.com/?utm_source=test';
        const result = context.window.cleanUrl(safeUrl);
        assert.strictEqual(result, 'https://example.com/', 'cleanUrl should clean tracking params');
    });
});
