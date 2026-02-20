
const { test } = require('node:test');
const assert = require('node:assert');
const { performance } = require('perf_hooks');

// Configuration
const CONFIG = {
  GATEWAYS: ['https://slow.net', 'https://fast1.net', 'https://fast2.net']
};

// Mock Delays
const DELAYS = {
  'https://slow.net': 500,
  'https://fast1.net': 50,
  'https://fast2.net': 60
};

// Utils Mock
const Utils = {
  gmFetch: (url) => new Promise((resolve, reject) => {
    const gw = CONFIG.GATEWAYS.find(g => url.startsWith(g));
    if (!gw) return reject(new Error('Unknown Gateway'));

    // Simulate failure for a specific gateway if needed
    if (gw === 'https://fail.net') return reject(new Error('Failed'));

    const delay = DELAYS[gw] || 100;
    setTimeout(() => {
      resolve(`Response from ${gw}`);
    }, delay);
  })
};

// Proposed Implementation (Race + Sticky)
class GatewayManager {
  static activeGateway = null;

  static async fetch(pathFn) {
    if (this.activeGateway) {
      try {
        return await Utils.gmFetch(pathFn(this.activeGateway));
      } catch (e) {
        this.activeGateway = null;
      }
    }

    const promises = CONFIG.GATEWAYS.map(gw =>
      Utils.gmFetch(pathFn(gw)).then(res => ({ gw, res }))
    );

    try {
      const { gw, res } = await Promise.any(promises);
      this.activeGateway = gw;
      return res;
    } catch (aggregateError) {
      throw new Error('GATEWAY_EXHAUSTED');
    }
  }

  static reset() {
    this.activeGateway = null;
  }
}

test('GatewayManager Race Optimization', async (t) => {
  GatewayManager.reset();

  await t.test('should select the fastest gateway', async () => {
    const start = performance.now();
    const res = await GatewayManager.fetch(gw => `${gw}/file`);
    const end = performance.now();

    assert.ok(res.includes('fast1.net'), 'Should respond with fast1.net');
    assert.strictEqual(GatewayManager.activeGateway, 'https://fast1.net', 'Should set activeGateway to fastest');
    assert.ok((end - start) < 100, 'Should be fast (< 100ms)');
    assert.ok((end - start) < 450, 'Should be significantly faster than slow gateway (500ms)');
  });

  await t.test('should use sticky gateway for subsequent calls', async () => {
    // Ensure activeGateway is set from previous test
    assert.strictEqual(GatewayManager.activeGateway, 'https://fast1.net');

    const start = performance.now();
    const res = await GatewayManager.fetch(gw => `${gw}/file2`);
    const end = performance.now();

    assert.ok(res.includes('fast1.net'));
    // Sticky calls use direct fetch, so time is just the delay of that gateway
    assert.ok((end - start) >= 50, 'Should take at least 50ms');
    assert.ok((end - start) < 100, 'Should not re-race');
  });

  await t.test('should handle all gateways failing', async () => {
    // Override CONFIG temporarily to point to non-existent or failing gateways
    const originalGateways = CONFIG.GATEWAYS;
    CONFIG.GATEWAYS = ['https://fail.net', 'https://fail.net'];
    GatewayManager.reset();

    // Override Utils.gmFetch to fail immediately
    const originalFetch = Utils.gmFetch;
    Utils.gmFetch = () => Promise.reject(new Error('Failed'));

    try {
      await GatewayManager.fetch(gw => `${gw}/file`);
      assert.fail('Should have thrown error');
    } catch (e) {
      assert.strictEqual(e.message, 'GATEWAY_EXHAUSTED');
    } finally {
      CONFIG.GATEWAYS = originalGateways;
      Utils.gmFetch = originalFetch;
    }
  });

  await t.test('fallback when active gateway fails (if implemented)', async () => {
    // Currently, if sticky gateway fails, it throws.
    // The implementation plan was: if activeGateway fails, fall back to race?
    // Let's check the code I planned:
    /*
      if (this.activeGateway) {
        try {
          return await Utils.gmFetch(pathFn(this.activeGateway), opts);
        } catch (e) {
          this.activeGateway = null; // Reset
        }
      }
      // Race...
    */
    // I need to make sure I implement this logic.

    GatewayManager.activeGateway = 'https://fail.net'; // Simulate a previously good gateway going bad

    // Mock fetch to fail for this specific gateway
    const originalFetch = Utils.gmFetch;
    Utils.gmFetch = (url) => {
        if (url.includes('fail.net')) return Promise.reject(new Error('Network Error'));
        return originalFetch(url);
    };

    try {
        const res = await GatewayManager.fetch(gw => `${gw}/recovery`);
        assert.ok(res.includes('fast1.net') || res.includes('fast2.net'), 'Should recover and find a working gateway');
        assert.notStrictEqual(GatewayManager.activeGateway, 'https://fail.net', 'Should update active gateway');
    } finally {
        Utils.gmFetch = originalFetch;
    }
  });
});
