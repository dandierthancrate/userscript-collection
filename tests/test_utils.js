const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const { JSDOM } = require('jsdom');
const {
    createStorage,
    createTTLCache,
    createThrottledObserver,
    createLazyObserver,
    createElement,
    waitForElement,
    sanitizeHTML,
    InputValidator
} = require('../src/utils.js');

// Setup JSDOM for DOM-dependent tests
let dom = null;
let globalDocument = null;

/**
 * Shared Utils Test Suite
 *
 * Tests the reusable utility functions extracted for ScriptCat userscripts.
 * Run with: node --test tests/test_utils.js
 */

describe('createStorage', () => {
    it('should create storage with prefix', () => {
        const storage = createStorage('test_');
        assert.ok(storage.get, 'Should have get method');
        assert.ok(storage.set, 'Should have set method');
        assert.ok(storage.remove, 'Should have remove method');
        assert.ok(storage.clear, 'Should have clear method');
    });

    it('should use memory cache when enabled', () => {
        const storage = createStorage('cache_test_', { useCache: true, cacheTTL: 100 });
        
        // Note: Without GM/CAT APIs, this will warn but still work with cache
        storage.set('key1', 'value1');
        const value = storage.get('key1', 'default');
        
        // Should return from memory cache
        assert.strictEqual(value, 'value1');
    });

    it('should respect cache TTL', async () => {
        const storage = createStorage('ttl_test_', { useCache: true, cacheTTL: 50 });

        storage.set('expiring', 'temp');
        assert.strictEqual(storage.get('expiring'), 'temp');

        // Wait for TTL to expire
        await new Promise(resolve => setTimeout(resolve, 100));

        // After TTL, should return default (undefined)
        const value = storage.get('expiring', 'expired');
        assert.strictEqual(value, 'expired');
    });
});

describe('createTTLCache', () => {
    it('should create cache with default options', () => {
        const cache = createTTLCache();
        assert.ok(cache.get, 'Should have get method');
        assert.ok(cache.set, 'Should have set method');
        assert.ok(cache.has, 'Should have has method');
        assert.ok(cache.delete, 'Should have delete method');
        assert.ok(cache.clear, 'Should have clear method');
        assert.ok(cache.stats, 'Should have stats method');
    });

    it('should store and retrieve values', () => {
        const cache = createTTLCache({ maxSize: 100, defaultTTL: 60000 });
        
        cache.set('key1', 'value1');
        assert.strictEqual(cache.get('key1'), 'value1');
        assert.strictEqual(cache.has('key1'), true);
    });

    it('should expire values after TTL', async () => {
        const cache = createTTLCache({ maxSize: 100, defaultTTL: 50 });

        cache.set('expiring', 'temp');
        assert.strictEqual(cache.get('expiring'), 'temp');

        await new Promise(resolve => setTimeout(resolve, 100));

        assert.strictEqual(cache.get('expiring'), null);
        assert.strictEqual(cache.has('expiring'), false);
    });

    it('should evict oldest entry when at capacity', () => {
        const cache = createTTLCache({ maxSize: 3, defaultTTL: 60000 });
        const evicted = [];
        
        // Add eviction callback
        const cacheWithCallback = createTTLCache({
            maxSize: 3,
            defaultTTL: 60000,
            onEvict: (key) => evicted.push(key)
        });
        
        cacheWithCallback.set('a', 1);
        cacheWithCallback.set('b', 2);
        cacheWithCallback.set('c', 3);
        cacheWithCallback.set('d', 4); // Should evict 'a'
        
        assert.strictEqual(evicted.length, 1);
        assert.strictEqual(evicted[0], 'a');
        assert.strictEqual(cacheWithCallback.get('a'), null);
        assert.strictEqual(cacheWithCallback.get('d'), 4);
    });

    it('should track statistics', () => {
        const cache = createTTLCache({ maxSize: 100, defaultTTL: 60000 });
        
        cache.set('key1', 'value1');
        cache.set('key2', 'value2');
        
        const stats = cache.stats();
        assert.strictEqual(stats.size, 2);
        assert.strictEqual(stats.maxSize, 100);
        assert.ok(stats.oldestAge >= 0);
        assert.ok(stats.newestAge >= 0);
    });
});

describe('InputValidator', () => {
    describe('isValidHotkey', () => {
        it('should accept single alphanumeric characters', () => {
            assert.strictEqual(InputValidator.isValidHotkey('a'), true);
            assert.strictEqual(InputValidator.isValidHotkey('Z'), true);
            assert.strictEqual(InputValidator.isValidHotkey('5'), true);
        });

        it('should reject non-alphanumeric characters', () => {
            assert.strictEqual(InputValidator.isValidHotkey('ab'), false);
            assert.strictEqual(InputValidator.isValidHotkey('!'), false);
            assert.strictEqual(InputValidator.isValidHotkey(' '), false);
            assert.strictEqual(InputValidator.isValidHotkey(''), false);
        });
    });

    describe('isValidHostname', () => {
        it('should accept valid hostnames', () => {
            assert.strictEqual(InputValidator.isValidHostname('example.com'), true);
            assert.strictEqual(InputValidator.isValidHostname('sub.example.com'), true);
            assert.strictEqual(InputValidator.isValidHostname('example-domain.com'), true);
        });

        it('should reject invalid hostnames', () => {
            assert.strictEqual(InputValidator.isValidHostname('example!com'), false);
            assert.strictEqual(InputValidator.isValidHostname('javascript:alert(1)'), false);
            assert.strictEqual(InputValidator.isValidHostname(''), false);
        });
    });

    describe('sanitizeText', () => {
        it('should remove script tags', () => {
            const input = 'Hello <script>alert("XSS")</script> World';
            const output = InputValidator.sanitizeText(input);
            assert.strictEqual(output.includes('<script>'), false);
            assert.strictEqual(output.includes('alert'), false);
        });

        it('should remove javascript: protocol', () => {
            const input = 'javascript:alert(1)';
            const output = InputValidator.sanitizeText(input);
            assert.strictEqual(output.includes('javascript:'), false);
        });

        it('should remove event handlers', () => {
            const input = 'onclick=alert(1) onload=evil()';
            const output = InputValidator.sanitizeText(input);
            assert.strictEqual(output.includes('onclick='), false);
            assert.strictEqual(output.includes('onload='), false);
        });

        it('should preserve safe text', () => {
            const input = 'Hello World! This is safe.';
            const output = InputValidator.sanitizeText(input);
            assert.strictEqual(output, 'Hello World! This is safe.');
        });
    });

    describe('isSafeProtocol', () => {
        it('should accept http and https', () => {
            assert.strictEqual(InputValidator.isSafeProtocol('http://example.com'), true);
            assert.strictEqual(InputValidator.isSafeProtocol('https://example.com'), true);
        });

        it('should reject unsafe protocols', () => {
            assert.strictEqual(InputValidator.isSafeProtocol('javascript:alert(1)'), false);
            assert.strictEqual(InputValidator.isSafeProtocol('data:text/html,<script>'), false);
            assert.strictEqual(InputValidator.isSafeProtocol('file:///etc/passwd'), false);
        });

        it('should handle invalid URLs', () => {
            assert.strictEqual(InputValidator.isSafeProtocol('not-a-url'), false);
            assert.strictEqual(InputValidator.isSafeProtocol(''), false);
        });
    });

    describe('isValidSettings', () => {
        it('should validate settings against schema', () => {
            const schema = {
                enabled: 'boolean',
                count: 'number',
                name: 'string'
            };
            
            const valid = {
                enabled: true,
                count: 42,
                name: 'test'
            };
            
            assert.strictEqual(InputValidator.isValidSettings(valid, schema), true);
        });

        it('should reject settings with wrong types', () => {
            const schema = { count: 'number' };
            
            assert.strictEqual(InputValidator.isValidSettings({ count: '42' }, schema), false);
            assert.strictEqual(InputValidator.isValidSettings({ count: null }, schema), false);
        });

        it('should reject missing required fields', () => {
            const schema = { required: 'string' };
            assert.strictEqual(InputValidator.isValidSettings({}, schema), false);
        });

        it('should reject non-object settings', () => {
            assert.strictEqual(InputValidator.isValidSettings(null, {}), false);
            assert.strictEqual(InputValidator.isValidSettings('string', {}), false);
        });
    });
});

describe('DOM Utilities', () => {
    before(() => {
        dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
        global.document = dom.window.document;
        global.window = dom.window;
        global.Node = dom.window.Node;
    });

    after(() => {
        dom = null;
        delete global.document;
        delete global.window;
        delete global.Node;
    });

    describe('createElement', () => {
        it('should create element with tag', () => {
            const el = createElement('div');
            assert.strictEqual(el.tagName, 'DIV');
        });

        it('should set className', () => {
            const el = createElement('div', { className: 'test-class' });
            assert.strictEqual(el.className, 'test-class');
        });

        it('should set styles', () => {
            const el = createElement('div', {
                style: { color: 'red', fontSize: '16px' }
            });
            assert.strictEqual(el.style.color, 'red');
            assert.strictEqual(el.style.fontSize, '16px');
        });

        it('should set textContent', () => {
            const el = createElement('div', { textContent: 'Hello World' });
            assert.strictEqual(el.textContent, 'Hello World');
        });

        it('should add children', () => {
            const child = createElement('span', { textContent: 'child' });
            const parent = createElement('div', {}, [child, 'text']);

            assert.strictEqual(parent.children.length, 1);
            assert.strictEqual(parent.childNodes.length, 2);
        });

        it('should sanitize text children', () => {
            const el = createElement('div', {}, ['<script>alert(1)</script>']);
            // textContent should contain the raw text
            assert.ok(el.textContent.includes('<script>'), 'Should contain script tags as text');
            // innerHTML should show escaped version (browser sanitization)
            assert.ok(el.innerHTML.includes('&lt;script&gt;'), 'Should escape HTML in innerHTML');
            // Most importantly: no actual script element should exist
            assert.strictEqual(el.querySelector('script'), null, 'Should not create script element');
        });
    });

    describe('sanitizeHTML', () => {
        it('should escape HTML entities', () => {
            const input = '<script>alert("XSS")</script>';
            const output = sanitizeHTML(input);
            // Browser escapes HTML entities differently - just check it's escaped
            assert.ok(output.includes('&lt;script&gt;'), 'Should escape opening tag');
            assert.ok(output.includes('&lt;/script&gt;'), 'Should escape closing tag');
        });

        it('should preserve safe text', () => {
            const input = 'Hello World!';
            const output = sanitizeHTML(input);
            assert.strictEqual(output, 'Hello World!');
        });
    });
});
