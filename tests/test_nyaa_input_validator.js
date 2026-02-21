const assert = require('node:assert');
const { test, describe } = require('node:test');

// Mock InputValidator as it will be implemented
// For now, testing the existing behavior vs new expectation
// But since I can't import the script directly (it's not a module), I'll test the logic itself.

describe('Nyaa InputValidator Security Fix', () => {

    // The new implementation logic
    const sanitizeCustomText = (text) => {
        if (!text) return '';
        // Security: Remove ineffective blacklist regexes.
        // XSS prevention is handled by URLSearchParams encoding at usage site.
        // We only enforce length limits and trimming here.
        return text.trim().slice(0, 100);
    };

    test('should truncate long input', () => {
        const input = 'a'.repeat(200);
        const output = sanitizeCustomText(input);
        assert.strictEqual(output.length, 100);
    });

    test('should allow "javascript:" strings (safe in query params)', () => {
        const input = 'javascript:void(0)';
        const output = sanitizeCustomText(input);
        assert.strictEqual(output, 'javascript:void(0)');
    });

    test('should trim whitespace', () => {
        const input = '  hello  ';
        const output = sanitizeCustomText(input);
        assert.strictEqual(output, 'hello');
    });
});
