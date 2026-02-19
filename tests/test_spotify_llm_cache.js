const { test, describe, it } = require('node:test');
const assert = require('assert');

/**
 * Spotify LLM Cache Layer Tests
 * 
 * Tests the cache helper functions with TTL support.
 * These are extracted from spotify-llm.user.js for unit testing.
 */

const CACHE_TTL_MS = 3600000; // 1 hour

// Cache implementation (mirrors the script)
function createCacheWithTTL() {
    const cache = new Map();
    
    function getFromCache(key) {
        const entry = cache.get(key);
        if (!entry) return null;
        if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
            cache.delete(key);
            return null;
        }
        return entry.value;
    }
    
    function setInCache(key, value) {
        if (cache.size >= 2000) {
            const oldestKey = cache.keys().next().value;
            cache.delete(oldestKey);
        }
        cache.set(key, { value, timestamp: Date.now() });
    }
    
    return { cache, getFromCache, setInCache };
}

// normalizeCacheKey implementation
function normalizeCacheKey(str, getFromCache, setInCache) {
    if (!str) return "";
    const cached = getFromCache(str);
    if (cached) return cached;
    const normalized = str.replace(/\s+/g, '').toLowerCase();
    setInCache(str, normalized);
    return normalized;
}

// cleanTextForComparison implementation
const COMPARISON_REGEX = /[^\p{L}\p{N}]/gu;
function cleanTextForComparison(str, getFromCache, setInCache) {
    if (!str) return "";
    const cached = getFromCache(str);
    if (cached) return cached;
    const result = str.toLowerCase().replace(COMPARISON_REGEX, '');
    setInCache(str, result);
    return result;
}

// getStrHash implementation
function getStrHash(str, getFromCache, setInCache) {
    if (!str) return '0';
    const cached = getFromCache(str);
    if (cached) return cached;
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0;
    }
    setInCache(str, hash.toString());
    return hash.toString();
}

describe('Spotify LLM Cache Layer', () => {
    describe('normalizeCacheKey', () => {
        it('should normalize whitespace and lowercase', () => {
            const { getFromCache, setInCache } = createCacheWithTTL();
            const input = 'Hello   World';
            const result = normalizeCacheKey(input, getFromCache, setInCache);
            assert.strictEqual(result, 'helloworld', 'Should remove whitespace and lowercase');
        });

        it('should cache results', () => {
            const { getFromCache, setInCache, cache } = createCacheWithTTL();
            const input = 'Test String';
            const first = normalizeCacheKey(input, getFromCache, setInCache);
            const second = normalizeCacheKey(input, getFromCache, setInCache);
            assert.strictEqual(first, second, 'Should return cached result');
            assert.strictEqual(cache.size, 1, 'Should have one entry in cache');
        });

        it('should handle empty strings', () => {
            const { getFromCache, setInCache } = createCacheWithTTL();
            const result = normalizeCacheKey('', getFromCache, setInCache);
            assert.strictEqual(result, '', 'Should return empty string');
        });

        it('should handle null/undefined', () => {
            const { getFromCache, setInCache } = createCacheWithTTL();
            assert.strictEqual(normalizeCacheKey(null, getFromCache, setInCache), '');
            assert.strictEqual(normalizeCacheKey(undefined, getFromCache, setInCache), '');
        });
    });

    describe('cleanTextForComparison', () => {
        it('should remove non-alphanumeric characters', () => {
            const { getFromCache, setInCache } = createCacheWithTTL();
            const input = 'Hello, World! 123';
            const result = cleanTextForComparison(input, getFromCache, setInCache);
            assert.strictEqual(result, 'helloworld123', 'Should remove special chars');
        });

        it('should cache results', () => {
            const { getFromCache, setInCache, cache } = createCacheWithTTL();
            const input = 'Test Comparison';
            const first = cleanTextForComparison(input, getFromCache, setInCache);
            const second = cleanTextForComparison(input, getFromCache, setInCache);
            assert.strictEqual(first, second, 'Should return cached result');
            assert.strictEqual(cache.size, 1, 'Should have one entry in cache');
        });

        it('should handle empty strings', () => {
            const { getFromCache, setInCache } = createCacheWithTTL();
            const result = cleanTextForComparison('', getFromCache, setInCache);
            assert.strictEqual(result, '', 'Should return empty string');
        });
    });

    describe('getStrHash', () => {
        it('should return consistent hash for same input', () => {
            const { getFromCache, setInCache } = createCacheWithTTL();
            const input = 'Test Hash';
            const hash1 = getStrHash(input, getFromCache, setInCache);
            const hash2 = getStrHash(input, getFromCache, setInCache);
            assert.strictEqual(hash1, hash2, 'Should return consistent hash');
        });

        it('should return different hashes for different inputs', () => {
            const { getFromCache, setInCache } = createCacheWithTTL();
            const hash1 = getStrHash('String 1', getFromCache, setInCache);
            const hash2 = getStrHash('String 2', getFromCache, setInCache);
            assert.notStrictEqual(hash1, hash2, 'Should return different hashes');
        });

        it('should cache hash results', () => {
            const { getFromCache, setInCache, cache } = createCacheWithTTL();
            const input = 'Hash Test';
            const first = getStrHash(input, getFromCache, setInCache);
            const second = getStrHash(input, getFromCache, setInCache);
            assert.strictEqual(first, second, 'Should return cached hash');
            assert.strictEqual(cache.size, 1, 'Should have one entry in cache');
        });

        it('should return "0" for empty/null strings', () => {
            const { getFromCache, setInCache } = createCacheWithTTL();
            assert.strictEqual(getStrHash('', getFromCache, setInCache), '0');
            assert.strictEqual(getStrHash(null, getFromCache, setInCache), '0');
        });
    });

    describe('Cache TTL', () => {
        it('should evict oldest entries when at capacity', () => {
            const { cache, setInCache } = createCacheWithTTL();
            
            // Fill cache beyond capacity
            for (let i = 0; i < 2005; i++) {
                setInCache(`test${i}`, `value${i}`);
            }
            
            // Cache size should not exceed 2000
            assert.ok(cache.size <= 2000, 'Cache should evict oldest entries when at capacity');
        });

        it('should store timestamp with cache entries', () => {
            const { cache, setInCache } = createCacheWithTTL();
            const input = 'Timestamp Test';
            setInCache(input, 'value');
            
            const entry = cache.get(input);
            assert.ok(entry, 'Entry should exist');
            assert.strictEqual(entry.value, 'value', 'Entry should have value');
            assert.ok(entry.timestamp, 'Entry should have timestamp');
            assert.ok(typeof entry.timestamp === 'number', 'Timestamp should be a number');
        });

        it('should handle TTL expiration', () => {
            const { cache, getFromCache, setInCache } = createCacheWithTTL();
            const input = 'Old Entry';
            
            // Add entry
            setInCache(input, 'value');
            
            // Manually set an old timestamp (2 hours ago)
            const entry = cache.get(input);
            entry.timestamp = Date.now() - (CACHE_TTL_MS * 2);
            cache.set(input, entry);
            
            // Next access should return null (expired)
            const result = getFromCache(input);
            assert.strictEqual(result, null, 'Should return null for expired entries');
        });
    });
});
