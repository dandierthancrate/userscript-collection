const { test, describe, it } = require('node:test');
const assert = require('assert');

/**
 * Spotify LLM Input Validator Tests
 */

const InputValidator = {
    // Model IDs: Allow alphanumeric, dashes, dots, colons, slashes (e.g. user/repo)
    isValidModelId: (id) => /^[a-zA-Z0-9-.:/]+$/.test(id),

    // API Keys: Alphanumeric, underscores, dashes, dots (common formats like gsk_..., sk-...)
    isValidApiKey: (key) => /^[a-zA-Z0-9-._]+$/.test(key),

    // Color: Basic check for CSS color formats (hex, rgb, rgba, hsl, hsla, names)
    // Prevent semicolons or curly braces to avoid CSS injection
    isValidColor: (color) => /^[a-zA-Z0-9#(),.\s%]+$/.test(color) && !/[;{}]/.test(color),

    sanitize: (str) => str ? str.trim() : ''
};

describe('Spotify LLM Input Validator', () => {
    describe('isValidModelId', () => {
        it('should accept valid model IDs', () => {
            assert.ok(InputValidator.isValidModelId('grok-4-auto'));
            assert.ok(InputValidator.isValidModelId('llama3-8b-8192'));
            assert.ok(InputValidator.isValidModelId('user/model-name'));
            assert.ok(InputValidator.isValidModelId('model.v1'));
            assert.ok(InputValidator.isValidModelId('gpt-4'));
        });

        it('should reject invalid model IDs', () => {
            assert.strictEqual(InputValidator.isValidModelId('model id with spaces'), false);
            assert.strictEqual(InputValidator.isValidModelId('model<script>'), false);
            assert.strictEqual(InputValidator.isValidModelId('model;drop table'), false);
            assert.strictEqual(InputValidator.isValidModelId(''), false); // Empty handled by logic, regex fails on empty? Yes + matches 1 or more
        });
    });

    describe('isValidApiKey', () => {
        it('should accept valid API keys', () => {
            assert.ok(InputValidator.isValidApiKey('gsk_1234567890abcdef'));
            assert.ok(InputValidator.isValidApiKey('sk-ant-api03-...'));
            assert.ok(InputValidator.isValidApiKey('1234567890'));
        });

        it('should reject invalid API keys', () => {
            assert.strictEqual(InputValidator.isValidApiKey('key with spaces'), false);
            assert.strictEqual(InputValidator.isValidApiKey('key<script>'), false);
            assert.strictEqual(InputValidator.isValidApiKey('key;'), false);
        });
    });

    describe('isValidColor', () => {
        it('should accept valid colors', () => {
            assert.ok(InputValidator.isValidColor('#ff0000'));
            assert.ok(InputValidator.isValidColor('#FFF'));
            assert.ok(InputValidator.isValidColor('red'));
            assert.ok(InputValidator.isValidColor('rgb(255, 0, 0)'));
            assert.ok(InputValidator.isValidColor('rgba(255, 0, 0, 0.5)'));
            assert.ok(InputValidator.isValidColor('hsl(0, 100%, 50%)'));
        });

        it('should reject potential CSS injection', () => {
            assert.strictEqual(InputValidator.isValidColor('red; background: blue'), false);
            assert.strictEqual(InputValidator.isValidColor('red} body { display: none'), false);
        });
    });

    describe('sanitize', () => {
        it('should trim whitespace', () => {
            assert.strictEqual(InputValidator.sanitize('  hello  '), 'hello');
        });

        it('should handle null/undefined', () => {
            assert.strictEqual(InputValidator.sanitize(null), '');
            assert.strictEqual(InputValidator.sanitize(undefined), '');
        });
    });
});
