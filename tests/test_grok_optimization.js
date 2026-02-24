
const assert = require('node:assert');
const { test } = require('node:test');

test('Grok Rate Limit Optimization Logic', async (t) => {
  // Mock DOM Nodes
  class MockNode {
    constructor(type, name) {
      this.nodeType = type; // 1 = element, 3 = text
      this.nodeName = name;
      this.children = [];
      this.attributes = {};
      this.parentNode = null;
    }
    appendChild(child) {
      child.parentNode = this;
      this.children.push(child);
      return child;
    }
    querySelector(selector) {
      // Simple selector logic for the test
      if (selector === '.query-bar' && this.attributes.class === 'query-bar') return this;
      if (selector === '.flex.absolute.inset-x-0.bottom-0' && this.attributes.class === 'flex absolute inset-x-0 bottom-0') return this;
      if (selector.startsWith('button') && this.nodeName === 'BUTTON') {
         if (selector.includes("aria-label='Model select'") && this.attributes['aria-label'] === 'Model select') return this;
      }
      if (selector.includes('textarea') && this.nodeName === 'TEXTAREA') return this;

      // Recursive search
      for (const child of this.children) {
        if (child.querySelector) {
            const found = child.querySelector(selector);
            if (found) return found;
        }
      }
      return null;
    }
    getAttribute(name) { return this.attributes[name]; }
    setAttribute(name, val) { this.attributes[name] = val; }
    contains(node) {
      let curr = node;
      while(curr) {
        if (curr === this) return true;
        curr = curr.parentNode;
      }
      return false;
    }
    closest(selector) {
        let curr = this;
        while(curr) {
            if (curr.matches && curr.matches(selector)) return curr;
            curr = curr.parentNode;
        }
        return null;
    }
    matches(selector) {
        // Simplified
        if (selector.includes('textarea') && this.nodeName === 'TEXTAREA') return true;
        if (selector.includes('div') && this.nodeName === 'DIV') return true;
        return false;
    }
  }

  const document = {
    createElement: (tag) => new MockNode(1, tag.toUpperCase()),
    querySelector: (sel) => root.querySelector(sel)
  };

  // Build DOM Tree
  const root = new MockNode(1, 'BODY');
  const queryBar = new MockNode(1, 'DIV');
  queryBar.setAttribute('class', 'query-bar');
  root.appendChild(queryBar);

  const inputArea = new MockNode(1, 'DIV');
  inputArea.setAttribute('class', 'input-area');
  queryBar.appendChild(inputArea);

  const input = new MockNode(1, 'TEXTAREA');
  input.setAttribute('aria-label', 'Ask Grok');
  inputArea.appendChild(input);

  const bottomBar = new MockNode(1, 'DIV');
  bottomBar.setAttribute('class', 'flex absolute inset-x-0 bottom-0');
  queryBar.appendChild(bottomBar);

  const modelButton = new MockNode(1, 'BUTTON');
  modelButton.setAttribute('aria-label', 'Model select');
  bottomBar.appendChild(modelButton);

  const CONFIG = {
    SELECTORS: {
      queryBar: '.query-bar',
      bottomBar: '.flex.absolute.inset-x-0.bottom-0',
      modelButton: "button[aria-label='Model select']",
      input: 'div[contenteditable="true"], textarea[aria-label*="Ask Grok"]',
    }
  };

  // Logic to test
  let targetToObserve = queryBar;

  // Simulate the check we want to implement
  const bb = queryBar.querySelector(CONFIG.SELECTORS.bottomBar);
  const mb = queryBar.querySelector(CONFIG.SELECTORS.modelButton);
  const inp = queryBar.querySelector(CONFIG.SELECTORS.input.split(', ')[1]); // Simplified for test

  // Verify setup
  assert.ok(bb, 'BottomBar found');
  assert.ok(mb, 'ModelButton found');
  assert.ok(inp, 'Input found');
  assert.ok(bb.contains(mb), 'BottomBar contains ModelButton');
  assert.strictEqual(bb.contains(inp), false, 'BottomBar does NOT contain Input');

  if (bb && mb && bb.contains(mb) && !bb.contains(inp)) {
      targetToObserve = bb;
  }

  assert.strictEqual(targetToObserve, bb, 'Optimization logic selected BottomBar');

  // Scenario 2: Input IS in BottomBar (should fallback to QueryBar or still use BottomBar? No, if input is in BottomBar, observing BottomBar is same as QueryBar)
  // But wait, if input IS in BottomBar, we CAN'T avoid input mutations by observing BottomBar.
  // So we should probably fallback to queryBar (default behavior) or just accept it.
  // The optimization relies on input being OUTSIDE the observed target.

  // Let's modify DOM to put input in bottomBar
  input.parentNode = bottomBar; // Move input

  // Re-run logic
  let target2 = queryBar;
  if (bb && mb && bb.contains(mb) && !bb.contains(inp)) {
      target2 = bb;
  }

  // Since bb contains inp now, condition `!bb.contains(inp)` is false.
  assert.strictEqual(target2, queryBar, 'Fallback to QueryBar if Input is inside BottomBar');

});
