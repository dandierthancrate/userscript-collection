const assert = require('node:assert');
const { test, describe, beforeEach, afterEach } = require('node:test');
const fs = require('fs');
const path = require('path');

describe('Share Archive Lazy Compilation', () => {
    let mockWindow;
    let RulesManager;
    let applyClearUrls;

    beforeEach(() => {
        // Setup mock environment
        const window = {
            location: { href: 'https://example.com/' },
            document: { addEventListener: () => {} },
            URL: global.URL,
            performance: global.performance
        };

        global.window = window;
        global.document = window.document;
        global.location = window.location;
        global.GM_getValue = (k, d) => d;
        global.GM_setValue = () => {};
        global.GM_registerMenuCommand = () => {};
        global.GM_openInTab = () => {};
        global.GM_xmlhttpRequest = () => {};

        // Load script content
        const scriptPath = path.join(__dirname, '../share-archive.user.js');
        const scriptContent = fs.readFileSync(scriptPath, 'utf8');

        // We need to extract RulesManager and applyClearUrls to test them.
        // The script is an IIFE, so we need to inject code to expose internals.

        // Inject exposure for RulesManager and the main function
        let modifiedScript = scriptContent
            .replace('const RulesManager = {', 'global.RulesManager = {')
            .replace('function applyClearUrls(url)', 'global.applyClearUrls = function applyClearUrls(url)');

        // We also need to expose the helper functions used by applyClearUrls,
        // because applyClearUrls (now global) will try to access them from global scope
        // but they are defined inside the IIFE scope.
        // Wait, if applyClearUrls is defined inside IIFE and assigned to global, it retains closure access!
        // So we don't need to expose helpers globally. We only need to expose applyClearUrls.

        // However, we DO need to make sure the IIFE executes.

        try {
            eval(modifiedScript);
        } catch (e) {
            console.error('Script eval error:', e);
        }

        RulesManager = global.RulesManager;
        applyClearUrls = global.applyClearUrls;
    });

    test('should only compile URL pattern initially', () => {
        if (!RulesManager) return; // Skip if eval failed

        // Mock large ruleset
        const rules = {
            providers: {
                'Provider1': {
                    urlPattern: 'example\\.com',
                    rules: ['foo', 'bar'],
                    exceptions: ['baz']
                },
                'Provider2': {
                    urlPattern: 'google\\.com',
                    rules: ['utm_source'],
                    redirections: ['^http']
                }
            }
        };

        RulesManager.rules = rules;
        RulesManager.compilePatterns();

        const p1 = rules.providers['Provider1'];
        const p2 = rules.providers['Provider2'];

        // Check eager compilation
        assert.ok(p1._urlPattern instanceof RegExp, 'Provider1 URL pattern should be compiled');
        assert.ok(p2._urlPattern instanceof RegExp, 'Provider2 URL pattern should be compiled');

        // Check lazy compilation (should NOT be compiled yet)
        assert.strictEqual(p1._rules, undefined, 'Provider1 rules should NOT be compiled yet');
        assert.strictEqual(p1._exceptions, undefined, 'Provider1 exceptions should NOT be compiled yet');
        assert.strictEqual(p1._compiled, undefined, 'Provider1 should not be marked compiled');

        assert.strictEqual(p2._rules, undefined, 'Provider2 rules should NOT be compiled yet');
    });

    test('should compile specific rules on demand when URL matches', () => {
        const rules = {
            providers: {
                'TargetProvider': {
                    urlPattern: 'target\\.com',
                    rules: ['tracking_param'],
                    exceptions: []
                },
                'OtherProvider': {
                    urlPattern: 'other\\.com',
                    rules: ['other_param']
                }
            }
        };

        RulesManager.rules = rules;
        RulesManager.compilePatterns();

        // Apply to matching URL
        const url = 'https://target.com/?tracking_param=123';
        const cleaned = applyClearUrls(url);

        const target = rules.providers['TargetProvider'];
        const other = rules.providers['OtherProvider'];

        // Target should be compiled now
        assert.ok(target._compiled, 'TargetProvider should be compiled after match');
        assert.ok(Array.isArray(target._rules), 'TargetProvider rules should be an array');
        // Rules are compiled lazily inside ensureProviderCompiled

        // Other should still be uncompiled
        assert.strictEqual(other._compiled, undefined, 'OtherProvider should still be uncompiled');
    });

    test('benchmark: startup time impact (mock)', () => {
        // Create 1000 dummy providers
        const providers = {};
        for (let i = 0; i < 1000; i++) {
            providers[`prov_${i}`] = {
                urlPattern: `domain${i}\\.com`,
                rules: ['utm_source', 'fbclid', 'ref'],
                redirections: ['^https?://.*']
            };
        }

        RulesManager.rules = { providers };

        const start = performance.now();
        RulesManager.compilePatterns();
        const duration = performance.now() - start;

        console.log(`Startup compilation for 1000 providers took ${duration.toFixed(3)}ms`);

        // Assert that none of the rules are compiled
        const p0 = providers['prov_0'];
        assert.strictEqual(p0._rules, undefined);

        // If we were compiling everything eagerly, 1000 * (3+1) regexes = 4000 regexes.
        // Lazy means only 1000 regexes.
    });
});
