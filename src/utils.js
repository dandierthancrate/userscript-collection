/**
 * @fileoverview Shared utilities for ScriptCat userscripts
 * @description Common patterns: Storage, Caching with TTL, Observers, DOM helpers
 * @version 1.0.0
 * @license GPL-3.0-or-later
 */

// ============================================================================
// STORAGE UTILITIES
// ============================================================================

/**
 * Creates a typed storage wrapper around GM/CAT storage APIs
 * @param {string} prefix - Key prefix for namespacing
 * @param {Object} options - Storage options
 * @param {boolean} options.useCache - Enable in-memory caching (default: true)
 * @param {number} options.cacheTTL - Cache TTL in ms (default: 5000)
 * @returns {Object} Storage API with get/set/remove/clear methods
 */
function createStorage(prefix = '', options = {}) {
    const { useCache = true, cacheTTL = 5000 } = options;
    const memoryCache = new Map();
    const cacheTimestamps = new Map();

    const _GM = typeof unsafeWindow !== 'undefined'
        ? (typeof GM_getValue !== 'undefined' ? unsafeWindow : (typeof CAT_getValue !== 'undefined' ? unsafeWindow : null))
        : null;

    /**
     * Get value from storage
     * @param {string} key - Storage key
     * @param {*} defaultValue - Default value if not found
     * @returns {*} Stored value or default
     */
    function get(key, defaultValue = undefined) {
        const fullKey = prefix + key;

        // Check memory cache first
        if (useCache && memoryCache.has(fullKey)) {
            const timestamp = cacheTimestamps.get(fullKey);
            if (!timestamp || Date.now() - timestamp < cacheTTL) {
                return memoryCache.get(fullKey);
            }
            memoryCache.delete(fullKey);
            cacheTimestamps.delete(fullKey);
        }

        // Get from GM/CAT storage
        let value;
        if (typeof GM_getValue !== 'undefined') {
            value = GM_getValue(fullKey, defaultValue);
        } else if (typeof CAT_getValue !== 'undefined') {
            value = CAT_getValue(fullKey, defaultValue);
        } else {
            console.warn('[Storage] No storage API available');
            return defaultValue;
        }

        // Update cache
        if (useCache) {
            memoryCache.set(fullKey, value);
            cacheTimestamps.set(fullKey, Date.now());
        }

        return value;
    }

    /**
     * Set value in storage
     * @param {string} key - Storage key
     * @param {*} value - Value to store
     * @returns {boolean} Success status
     */
    function set(key, value) {
        const fullKey = prefix + key;

        // Update memory cache
        if (useCache) {
            memoryCache.set(fullKey, value);
            cacheTimestamps.set(fullKey, Date.now());
        }

        // Save to GM/CAT storage
        try {
            if (typeof GM_setValue !== 'undefined') {
                GM_setValue(fullKey, value);
            } else if (typeof CAT_setValue !== 'undefined') {
                CAT_setValue(fullKey, value);
            } else {
                console.warn('[Storage] No storage API available');
                return false;
            }
            return true;
        } catch (error) {
            console.error('[Storage] Failed to save:', error);
            return false;
        }
    }

    /**
     * Remove value from storage
     * @param {string} key - Storage key
     * @returns {boolean} Success status
     */
    function remove(key) {
        const fullKey = prefix + key;

        // Remove from memory cache
        if (useCache) {
            memoryCache.delete(fullKey);
            cacheTimestamps.delete(fullKey);
        }

        // Remove from GM/CAT storage
        try {
            if (typeof GM_deleteValue !== 'undefined') {
                GM_deleteValue(fullKey);
            } else if (typeof CAT_deleteValue !== 'undefined') {
                CAT_deleteValue(fullKey);
            } else {
                console.warn('[Storage] No storage API available');
                return false;
            }
            return true;
        } catch (error) {
            console.error('[Storage] Failed to remove:', error);
            return false;
        }
    }

    /**
     * Clear all storage with this prefix
     * @returns {boolean} Success status
     */
    function clear() {
        // Clear memory cache
        if (useCache) {
            for (const key of memoryCache.keys()) {
                if (key.startsWith(prefix)) {
                    memoryCache.delete(key);
                    cacheTimestamps.delete(key);
                }
            }
        }

        console.log('[Storage] Clear not fully supported for prefixed keys');
        return true;
    }

    return { get, set, remove, clear };
}

// ============================================================================
// CACHE WITH TTL
// ============================================================================

/**
 * Creates a TTL-based cache with automatic expiration and capacity limits
 * @param {Object} options - Cache options
 * @param {number} options.maxSize - Maximum cache entries (default: 2000)
 * @param {number} options.defaultTTL - Default TTL in ms (default: 3600000 = 1 hour)
 * @param {Function} options.onEvict - Callback when entry is evicted
 * @returns {Object} Cache API
 */
function createTTLCache(options = {}) {
    const {
        maxSize = 2000,
        defaultTTL = 3600000,
        onEvict = null
    } = options;

    const cache = new Map();

    /**
     * Get value from cache
     * @param {string} key - Cache key
     * @param {number|null} customTTL - Custom TTL check (null uses default)
     * @returns {*} Cached value or null if expired/missing
     */
    function get(key, customTTL = null) {
        const entry = cache.get(key);
        if (!entry) {
            return null;
        }

        const ttl = customTTL !== null ? customTTL : defaultTTL;
        if (Date.now() - entry.timestamp > ttl) {
            cache.delete(key);
            if (onEvict) {
                onEvict(key, entry.value, 'expired');
            }
            return null;
        }

        // Move to end for LRU tracking
        cache.delete(key);
        cache.set(key, entry);
        return entry.value;
    }

    /**
     * Set value in cache
     * @param {string} key - Cache key
     * @param {*} value - Value to cache
     * @param {number} [timestamp] - Optional custom timestamp
     */
    function set(key, value, timestamp = Date.now()) {
        // Evict oldest if at capacity (LRU-style)
        if (cache.size >= maxSize) {
            const oldestKey = cache.keys().next().value;
            const oldestEntry = cache.get(oldestKey);
            cache.delete(oldestKey);
            if (onEvict) {
                onEvict(oldestKey, oldestEntry.value, 'capacity');
            }
        }

        cache.set(key, { value, timestamp });
    }

    /**
     * Check if key exists and is not expired
     * @param {string} key - Cache key
     * @param {number|null} customTTL - Custom TTL check
     * @returns {boolean}
     */
    function has(key, customTTL = null) {
        return get(key, customTTL) !== null;
    }

    /**
     * Delete a specific key
     * @param {string} key - Cache key
     * @returns {boolean} True if deleted
     */
    function deleteKey(key) {
        const entry = cache.get(key);
        const deleted = cache.delete(key);
        if (deleted && onEvict && entry) {
            onEvict(key, entry.value, 'manual');
        }
        return deleted;
    }

    /**
     * Clear entire cache
     */
    function clear() {
        const entries = Array.from(cache.entries());
        cache.clear();
        if (onEvict) {
            for (const [key, entry] of entries) {
                onEvict(key, entry.value, 'clear');
            }
        }
    }

    /**
     * Get cache statistics
     * @returns {Object} Stats including size, oldest, newest entries
     */
    function stats() {
        const now = Date.now();
        let expiredCount = 0;
        let oldest = Infinity;
        let newest = 0;

        for (const entry of cache.values()) {
            if (now - entry.timestamp > defaultTTL) {
                expiredCount++;
            }
            oldest = Math.min(oldest, entry.timestamp);
            newest = Math.max(newest, entry.timestamp);
        }

        return {
            size: cache.size,
            maxSize,
            expiredCount,
            oldestAge: oldest === Infinity ? 0 : now - oldest,
            newestAge: now - newest
        };
    }

    return { get, set, has, delete: deleteKey, clear, stats };
}

// ============================================================================
// OBSERVER UTILITIES
// ============================================================================

/**
 * Creates a throttled MutationObserver with SPA navigation support
 * @param {Function} callback - Callback function on mutation
 * @param {Object} options - Observer options
 * @param {number} options.throttleMs - Throttle in ms (default: 300)
 * @param {Object} options.observerConfig - MutationObserver config (default: standard)
 * @param {Function} options.onNavigate - SPA navigation callback
 * @returns {Object} Observer API with observe/disconnect/reobserve
 */
function createThrottledObserver(callback, options = {}) {
    const {
        throttleMs = 300,
        observerConfig = { childList: true, subtree: true, attributes: true },
        onNavigate = null
    } = options;

    let observer = null;
    let throttleTimer = null;
    let lastPath = window.location.pathname;
    let isObserving = false;

    /**
     * Handle mutations with throttling
     * @param {MutationRecord[]} mutations - Mutation records
     */
    function handleMutations(mutations) {
        if (throttleTimer) {
            return;
        }

        throttleTimer = setTimeout(() => {
            throttleTimer = null;

            // Check for SPA navigation
            if (onNavigate && window.location.pathname !== lastPath) {
                const oldPath = lastPath;
                lastPath = window.location.pathname;
                onNavigate(oldPath, lastPath, mutations);
            }

            callback(mutations);
        }, throttleMs);
    }

    /**
     * Start observing
     * @param {Element} target - Target element (default: document.body)
     */
    function observe(target = document.body) {
        if (isObserving) {
            return;
        }

        observer = new MutationObserver(handleMutations);
        observer.observe(target, observerConfig);
        isObserving = true;
    }

    /**
     * Disconnect observer
     */
    function disconnect() {
        if (!observer || !isObserving) {
            return;
        }

        observer.disconnect();
        if (throttleTimer) {
            clearTimeout(throttleTimer);
            throttleTimer = null;
        }
        isObserving = false;
    }

    /**
     * Reconnect observer (useful after visibility change)
     */
    function reconnect(target = document.body) {
        disconnect();
        observe(target);
    }

    /**
     * Check if currently observing
     * @returns {boolean}
     */
    function isAttached() {
        return isObserving;
    }

    // Handle visibility changes
    if (onNavigate) {
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                disconnect();
            } else if (!isObserving) {
                reconnect();
            }
        });
    }

    return { observe, disconnect, reconnect, isAttached };
}

/**
 * Creates an IntersectionObserver for lazy-loading elements
 * @param {Function} callback - Callback when element intersects
 * @param {Object} options - IntersectionObserver options
 * @returns {Object} Observer API
 */
function createLazyObserver(callback, options = {}) {
    const {
        root = null,
        rootMargin = '300px 0px 300px 0px',
        threshold = 0
    } = options;

    const observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
            if (entry.isIntersecting) {
                callback(entry.target, entry);
                observer.unobserve(entry.target);
            }
        }
    }, { root, rootMargin, threshold });

    /**
     * Observe an element
     * @param {Element} element - Target element
     */
    function observe(element) {
        observer.observe(element);
    }

    /**
     * Unobserve an element
     * @param {Element} element - Target element
     */
    function unobserve(element) {
        observer.unobserve(element);
    }

    /**
     * Disconnect observer
     */
    function disconnect() {
        observer.disconnect();
    }

    return { observe, unobserve, disconnect };
}

// ============================================================================
// DOM UTILITIES
// ============================================================================

/**
 * Safely inject CSS into the page
 * @param {string} css - CSS content
 * @param {string} id - Style element ID
 * @returns {HTMLStyleElement|null}
 */
function injectCSS(css, id) {
    // Check if already exists
    let style = document.getElementById(id);
    if (style) {
        if (style.textContent !== css) {
            style.textContent = css;
        }
        return style;
    }

    // Create new style element
    style = document.createElement('style');
    style.id = id;
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
    return style;
}

/**
 * Create element with attributes safely
 * @param {string} tag - HTML tag name
 * @param {Object} props - Properties/attributes
 * @param {Array|Node} [children] - Child nodes
 * @returns {HTMLElement}
 */
function createElement(tag, props = {}, children = null) {
    const element = document.createElement(tag);

    for (const [key, value] of Object.entries(props)) {
        if (key === 'className') {
            element.className = value;
        } else if (key === 'style' && typeof value === 'object') {
            Object.assign(element.style, value);
        } else if (key.startsWith('on') && typeof value === 'function') {
            element.addEventListener(key.slice(2).toLowerCase(), value);
        } else if (key === 'dataset' && typeof value === 'object') {
            Object.assign(element.dataset, value);
        } else if (key === 'textContent' || key === 'innerHTML') {
            element[key] = value;
        } else if (typeof value === 'boolean') {
            if (value) {
                element.setAttribute(key, '');
            }
        } else if (value !== null && value !== undefined) {
            element.setAttribute(key, value);
        }
    }

    if (children) {
        const childArray = Array.isArray(children) ? children : [children];
        for (const child of childArray) {
            if (typeof child === 'string') {
                element.appendChild(document.createTextNode(child));
            } else if (child instanceof Node) {
                element.appendChild(child);
            }
        }
    }

    return element;
}

/**
 * Wait for element to appear with timeout
 * @param {string} selector - CSS selector
 * @param {Object} options - Wait options
 * @param {number} options.timeout - Timeout in ms (default: 5000)
 * @param {boolean} options.all - Wait for all elements (default: false)
 * @param {Element} options.root - Root element to search from
 * @returns {Promise<Element|Element[]|null>}
 */
async function waitForElement(selector, options = {}) {
    const {
        timeout = 5000,
        all = false,
        root = document
    } = options;

    // Check if already exists
    if (all) {
        const elements = root.querySelectorAll(selector);
        if (elements.length > 0) {
            return Array.from(elements);
        }
    } else {
        const element = root.querySelector(selector);
        if (element) {
            return element;
        }
    }

    // Wait using MutationObserver
    return new Promise((resolve, _reject) => {
        const observer = new MutationObserver((mutations, obs) => {
            if (all) {
                const elements = root.querySelectorAll(selector);
                if (elements.length > 0) {
                    obs.disconnect();
                    resolve(Array.from(elements));
                }
            } else {
                const element = root.querySelector(selector);
                if (element) {
                    obs.disconnect();
                    resolve(element);
                }
            }
        });

        observer.observe(root, {
            childList: true,
            subtree: true
        });

        // Timeout
        setTimeout(() => {
            observer.disconnect();
            resolve(null);
        }, timeout);
    });
}

/**
 * Sanitize HTML to prevent XSS
 * @param {string} html - HTML string
 * @returns {string} Sanitized HTML
 */
function sanitizeHTML(html) {
    const div = document.createElement('div');
    div.textContent = html;
    return div.innerHTML;
}

// ============================================================================
// INPUT VALIDATION UTILITIES
// ============================================================================

/**
 * Input validation helpers for userscript security
 */
const InputValidator = {
    /**
     * Validate hotkey: single alphanumeric character only
     * @param {string} key - Key to validate
     * @returns {boolean}
     */
    isValidHotkey: (key) => /^[a-zA-Z0-9]$/.test(key),

    /**
     * Validate hostname format
     * @param {string} hostname - Hostname to validate
     * @returns {boolean}
     */
    isValidHostname: (hostname) => /^[a-z0-9.-]+$/.test(hostname),

    /**
     * Sanitize text input: strip script injection patterns
     * @param {string} text - Text to sanitize
     * @returns {string} Sanitized text
     */
    sanitizeText: (text) => text
        .replace(/<script[^>]*>.*?<\/script>/gi, '')
        .replace(/javascript:/gi, '')
        .replace(/vbscript:/gi, '')
        .replace(/on\w+\s*=/gi, '')
        .trim(),

    /**
     * Validate URL protocol (allow http/https only)
     * @param {string} url - URL to validate
     * @returns {boolean}
     */
    isSafeProtocol: (url) => {
        try {
            const urlObj = new URL(url);
            return ['http:', 'https:'].includes(urlObj.protocol);
        } catch {
            return false;
        }
    },

    /**
     * Validate settings object structure
     * @param {Object} settings - Settings object
     * @param {Object} schema - Schema with type definitions
     * @returns {boolean}
     */
    isValidSettings: (settings, schema) => {
        if (!settings || typeof settings !== 'object') {
            return false;
        }

        for (const [key, expectedType] of Object.entries(schema)) {
            if (!(key in settings)) {
                return false;
            }
            if (typeof settings[key] !== expectedType) {
                return false;
            }
        }

        return true;
    }
};

// ============================================================================
// EXPORT (for testing and reuse)
// ============================================================================

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        createStorage,
        createTTLCache,
        createThrottledObserver,
        createLazyObserver,
        injectCSS,
        createElement,
        waitForElement,
        sanitizeHTML,
        InputValidator
    };
}
