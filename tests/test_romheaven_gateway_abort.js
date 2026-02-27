const assert = require('node:assert');
const { test, describe, beforeEach, afterEach } = require('node:test');
const fs = require('fs');
const path = require('path');

describe('Romheaven Gateway Request Abortion', () => {
    let mockWindow;
    let GatewayManager;
    let requests = [];

    beforeEach(() => {
        requests = [];

        // Mock environment
        const window = {
            GM_xmlhttpRequest: (opts) => {
                const req = {
                    aborted: false,
                    url: opts.url,
                    abort: () => {
                        req.aborted = true;
                    },
                    complete: (status, responseText) => {
                        if (!req.aborted && opts.onload) {
                            opts.onload({ status, responseText });
                        }
                    }
                };
                requests.push(req);
                return req;
            },
            GM_addStyle: () => {},
            AbortController: global.AbortController,
            document: {
                getElementById: () => null,
                querySelector: () => null,
                createElement: () => ({ style: {}, appendChild: () => {}, setAttribute: () => {} }),
                body: { appendChild: () => {} }
            }
        };

        global.window = window;
        global.GM_xmlhttpRequest = window.GM_xmlhttpRequest;
        global.GM_addStyle = window.GM_addStyle;
        global.AbortController = window.AbortController;
        global.document = window.document;
        global.location = { pathname: '/app/12345' };

        // Load script content
        const scriptPath = path.join(__dirname, '../romheaven-steam-assistant.user.js');
        const scriptContent = fs.readFileSync(scriptPath, 'utf8');

        // Inject exposure
        const modifiedScript = scriptContent
            .replace('class GatewayManager {', 'global.GatewayManager = class GatewayManager {')
            .replace('const Utils = {', 'global.Utils = {');

        try {
            eval(modifiedScript);
        } catch (e) {
            // Ignore errors unrelated to GatewayManager (e.g. DOM access)
        }

        GatewayManager = global.GatewayManager;
    });

    test('should abort losing requests when one wins', async () => {
        // Setup race with 3 gateways (default config)
        const fetchPromise = GatewayManager.fetch(gw => `${gw}/test`);

        // We expect 3 requests initiated
        assert.strictEqual(requests.length, 3, 'Should initiate 3 requests');

        // Complete the second request (make it the winner)
        requests[1].complete(200, 'Winner');

        // Await the result
        const result = await fetchPromise;

        // Utils.gmFetch returns { responseText, status } if json is not true
        assert.strictEqual(result.responseText, 'Winner');

        // Verify that the winner is NOT aborted
        assert.strictEqual(requests[1].aborted, false, 'Winner should not be aborted');

        // Verify that losers ARE aborted
        // Note: AbortController.abort() triggers the signal, which calls req.abort()
        // This happens synchronously or microtask-delayed depending on implementation.
        // We might need a small delay for the event listener to fire.

        // Wait for microtasks
        await new Promise(resolve => setTimeout(resolve, 0));

        assert.strictEqual(requests[0].aborted, true, 'Loser 1 should be aborted');
        assert.strictEqual(requests[2].aborted, true, 'Loser 2 should be aborted');
    });

    test('should not abort if all fail (exhausted)', async () => {
        const fetchPromise = GatewayManager.fetch(gw => `${gw}/test`);

        requests.forEach(req => req.complete(500, 'Error'));

        try {
            await fetchPromise;
            assert.fail('Should have thrown');
        } catch (e) {
            assert.strictEqual(e.message, 'GATEWAY_EXHAUSTED');
        }

        // None should be explicitly aborted by our controller logic (though they are "done")
        // The abort() call only happens on success.
        // On failure, Promise.any rejects, so we don't call abort().
        // Wait, if Promise.any rejects, it means ALL failed.
        // So abort() is skipped. Correct.
        requests.forEach((req, i) => {
            assert.strictEqual(req.aborted, false, `Request ${i} should not be aborted by controller`);
        });
    });
});
