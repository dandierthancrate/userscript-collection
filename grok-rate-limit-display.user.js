// ==UserScript==
// @name         Grok Rate Limit Display
// @namespace    https://github.com/dandierthancrate/userscript-collection
// @version      1.1.7
// @description  Displays remaining queries and cooldowns on grok.com.
// @author       dandierthancrate
// @match        https://grok.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=grok.com
// @grant        GM_addStyle
// @license      GPL-3.0-or-later
// @updateURL    https://raw.githubusercontent.com/dandierthancrate/userscript-collection/main/grok-rate-limit-display.user.js
// @downloadURL  https://raw.githubusercontent.com/dandierthancrate/userscript-collection/main/grok-rate-limit-display.user.js
// ==/UserScript==

(function () {
  'use strict';

  // ═══════════════════════════════════════════════════════════════════════════
  // CONFIGURATION & CONSTANTS
  // ═══════════════════════════════════════════════════════════════════════════

  const CONFIG = {
    POLL_INTERVAL: 30000,
    CACHE_TTL: 10000,
    COOLDOWN: 2000,
    SELECTORS: {
      queryBar: '.query-bar',
      bottomBar: '.flex.absolute.inset-x-0.bottom-0',
      modelButton: "button[aria-label='Model select']",
      input: 'div[contenteditable="true"], textarea[aria-label*="Ask Grok"]',
      modelText: 'span.font-semibold, span.inline-block',
    },
    FINDERS: {
      think: { selector: 'button', ariaLabel: 'Think', svgPartialD: 'M19 9C19 12.866' },
      deepSearch: { selector: 'button', ariaLabelRegex: /Deep(er)?Search/i },
      attach: { selector: 'button', ariaLabel: 'Attach', classContains: ['group/attach-button'], svgPartialD: 'M10 9V15' },
      submit: { selector: 'button', ariaLabel: 'Submit', svgPartialD: 'M5 11L12 4M12 4L19 11M12 4V21' },
    }
  };

  const MODELS = {
    DEFAULT: 'grok-4-auto',
    MAP: {
      'Grok 4': 'grok-4', 'Grok 3': 'grok-3', 'Grok 4 Heavy': 'grok-4-heavy',
      'Grok 4 With Effort Decider': 'grok-4-auto', 'Auto': 'grok-4-auto',
      'Fast': 'grok-3', 'Expert': 'grok-4', 'Heavy': 'grok-4-heavy',
      'Grok 4 Fast': 'grok-4-mini-thinking-tahoe', 'Grok 4.1': 'grok-4-1-non-thinking-w-tool',
      'Grok 4.1 Thinking': 'grok-4-1-thinking-1129'
    },
    EFFORT: {
      'grok-4-auto': 'both', 'grok-3': 'low', 'grok-4-1-non-thinking-w-tool': 'low',
      'grok-4-1-thinking-1129': 'high'
    },
    SVG_PATTERNS: [
      { pattern: 'M6.5 12.5L11.5 17.5', model: 'grok-4-auto' },
      { pattern: 'M5 14.25L14 4', model: 'grok-3' },
      { pattern: 'M19 9C19 12.866', model: 'grok-4' },
      { pattern: 'M12 3a6 6 0 0 0 9 9', model: 'grok-4-mini-thinking-tahoe' },
      { pattern: 'M11 18H10C7.79086 18 6 16.2091 6 14V13', model: 'grok-4-heavy' }
    ]
  };

  const ICONS = {
    GAUGE: { tag: 'path', attrs: { d: 'm12 14 4-4 M3.34 19a10 10 0 1 1 17.32 0' } },
    CLOCK: { 
      items: [
        { tag: 'circle', attrs: { cx: '12', cy: '12', r: '8' } },
        { tag: 'path', attrs: { d: 'M12 12L12 6' } }
      ] 
    }
  };

  // Inject CSS to prevent text overlap with the rate limit pill
  GM_addStyle(`
    @keyframes bolt-grok-appear { from { opacity: 0.99; } to { opacity: 1; } }
    ${CONFIG.SELECTORS.queryBar} {
      animation: bolt-grok-appear 0.001s;
    }
    ${CONFIG.SELECTORS.queryBar} div[contenteditable="true"],
    ${CONFIG.SELECTORS.queryBar} textarea[aria-label*="Ask Grok"] {
      padding-right: 110px !important;
    }
    #grok-rate-limit {
      border: 1px solid rgba(255, 255, 255, 0.2) !important;
    }
  `);

  // ═══════════════════════════════════════════════════════════════════════════
  // UTILITIES
  // ═══════════════════════════════════════════════════════════════════════════

  const Utils = {
    debounce(func, delay) {
      let timeout;
      return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), delay);
      };
    },
    formatTimer(seconds) {
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      const s = seconds % 60;
      const pad = n => n.toString().padStart(2, '0');
      return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
    },
    findElement(config, root = document) {
      for (const el of root.querySelectorAll(config.selector)) {
        const aria = el.getAttribute('aria-label');
        if (config.ariaLabel && aria === config.ariaLabel) return el;
        if (config.ariaLabelRegex?.test(aria)) return el;
        if (config.svgPartialD && el.querySelector('path')?.getAttribute('d')?.includes(config.svgPartialD)) return el;
        if (config.classContains?.some(cls => el.classList.contains(cls))) return el;
      }
      return null;
    },
    createSVG(tag, attrs) {
      const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
      for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
      return el;
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // CORE MANAGERS
  // ═══════════════════════════════════════════════════════════════════════════

  class ModelManager {
    static detect(queryBar) {
      const btn = queryBar.querySelector(CONFIG.SELECTORS.modelButton);
      if (!btn) return MODELS.DEFAULT;

      const textEl = btn.querySelector(CONFIG.SELECTORS.modelText);
      if (textEl) return MODELS.MAP[textEl.textContent.trim()] || MODELS.DEFAULT;

      const svgData = btn.querySelector('svg')?.querySelectorAll('path');
      if (!svgData) return MODELS.DEFAULT;
      
      const pathsD = [...svgData].map(p => p.getAttribute('d') || '').join(' ');
      if (btn.querySelector('path[class*="fill-yellow-100"]')) return 'grok-4';

      return MODELS.SVG_PATTERNS.find(p => pathsD.includes(p.pattern))?.model || MODELS.DEFAULT;
    }

    static getEffort(model) {
      return MODELS.EFFORT[model] || 'high';
    }

    static getRequestKind(model, queryBar) {
      if (model !== 'grok-3') return 'DEFAULT';
      
      const thinkBtn = Utils.findElement(CONFIG.FINDERS.think, queryBar);
      if (thinkBtn?.getAttribute('aria-pressed') === 'true') return 'REASONING';

      const searchBtn = Utils.findElement(CONFIG.FINDERS.deepSearch, queryBar);
      if (searchBtn?.getAttribute('aria-pressed') === 'true') {
        const aria = searchBtn.getAttribute('aria-label') || '';
        return /deeper/i.test(aria) ? 'DEEPERSEARCH' : 'DEEPSEARCH';
      }
      return 'DEFAULT';
    }
  }

  class RateLimitManager {
    constructor() {
      this.cache = {};
      this.lastRequestTime = 0;
    }

    async fetch(modelName, requestKind, force = false) {
      const now = Date.now();
      const cached = this.cache[modelName]?.[requestKind];

      if (!force && cached?.timestamp && now - cached.timestamp < CONFIG.CACHE_TTL) return cached.data;
      if (now - this.lastRequestTime < CONFIG.COOLDOWN) return cached?.data || { error: true, reason: 'Rate limited' };

      this.lastRequestTime = now;
      if (!this.cache[modelName]) this.cache[modelName] = {};

      try {
        const res = await fetch(`${location.origin}/rest/rate-limits`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ requestKind, modelName }),
          credentials: 'include'
        });
        const data = res.ok ? await res.json() : { error: true, reason: `HTTP ${res.status}` };
        this.cache[modelName][requestKind] = { data, timestamp: now };
        return data;
      } catch (e) {
        const err = { error: true, reason: e.message };
        this.cache[modelName][requestKind] = { data: err, timestamp: now };
        return err;
      }
    }

    process(data, effortLevel) {
      if (data.error) return data;
      const isFree = data.totalTokens <= 80;

      if (effortLevel === 'both') {
        const high = data.highEffortRateLimits?.remainingQueries;
        const low = data.lowEffortRateLimits?.remainingQueries;
        if (high === undefined || low === undefined) return { error: true };
        
        return {
          high: isFree ? Math.floor(high / (data.highEffortRateLimits?.cost || 1)) : high,
          low,
          wait: Math.max(data.highEffortRateLimits?.waitTimeSeconds || 0, data.lowEffortRateLimits?.waitTimeSeconds || 0, data.waitTimeSeconds || 0),
          isFree,
          cost: data.highEffortRateLimits?.cost || 1,
          origHigh: high
        };
      }

      const key = effortLevel === 'high' ? 'highEffortRateLimits' : 'lowEffortRateLimits';
      const raw = data[key]?.remainingQueries ?? data.remainingQueries;
      if (raw === undefined) return { error: true };
      
      const cost = data[key]?.cost || 1;
      return {
        remaining: isFree ? Math.floor(raw / cost) : raw,
        wait: data[key]?.waitTimeSeconds || data.waitTimeSeconds || 0,
        isFree,
        cost,
        origRaw: raw
      };
    }
  }

  class RateLimitUI {
    constructor() {
      this.container = null;
      this.timers = { countdown: null };
    }

    getOrCreate(queryBar) {
      if (this.container && document.body.contains(this.container)) return this.container;

      const bottomBar = queryBar.querySelector(CONFIG.SELECTORS.bottomBar);
      if (!bottomBar) return null;

      const insertPoint = bottomBar.querySelector('div.z-20') ||
        Utils.findElement(CONFIG.FINDERS.submit, bottomBar) ||
        Utils.findElement(CONFIG.FINDERS.attach, bottomBar) || bottomBar;

      this.container = document.createElement('button');
      this.container.type = 'button';
      this.container.setAttribute('aria-label', 'Refresh rate limit status');
      this.container.id = 'grok-rate-limit';
      this.container.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></svg><div class="flex items-center"></div>';
      this.container.className = 'inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-60 disabled:cursor-not-allowed [&_svg]:duration-100 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:-mx-0.5 select-none text-fg-primary hover:bg-button-ghost-hover hover:border-border-l2 disabled:hover:bg-transparent h-10 px-3.5 py-2 text-sm rounded-full group/rate-limit transition-colors duration-100 relative overflow-hidden border border-transparent cursor-pointer';
      Object.assign(this.container.style, { opacity: '0.8', transition: 'opacity 0.1s ease-in-out', zIndex: '20' });
      
      this.container.addEventListener('click', () => App.update(true));
      
      if (insertPoint === bottomBar) bottomBar.appendChild(this.container);
      else insertPoint.insertAdjacentElement('beforebegin', this.container);

      return this.container;
    }

    update(data, effort, queryBar) {
      if (location.pathname.startsWith('/imagine')) return this.remove();

      const container = this.getOrCreate(queryBar);
      if (!container) return;

      const content = container.lastChild;
      const svg = container.firstChild;
      content.innerHTML = '';

      if (data.error) this.renderError(content, svg, data, effort);
      else this.renderData(content, svg, data, effort);
    }

    renderData(content, svg, data, effort) {
      this.stopCountdown();
      const setGauge = () => updateSVG(svg, ICONS.GAUGE);
      const setClock = () => updateSVG(svg, ICONS.CLOCK);

      if (effort === 'both') {
        const { high, low, wait, isFree, cost, origHigh } = data;
        
        if (high > 0) {
          this.appendSpan(content, high);
          this.appendDivider(content);
          this.appendSpan(content, low);
          this.container.title = isFree && cost > 1 ? `High: ${high} (${origHigh} tokens ÷ ${cost}) | Low: ${low}` : `High: ${high} | Low: ${low}`;
          this.container.setAttribute('aria-label', `High effort: ${high} remaining. Low effort: ${low} remaining. Click to refresh.`);
          setGauge();
        } else if (wait > 0) {
          this.startCountdown(wait, this.appendSpan(content, Utils.formatTimer(wait), '#ff6347'));
          if (low > 0) {
            this.appendDivider(content);
            this.appendSpan(content, low);
            this.container.title = `High: Resetting | Low: ${low}`;
            this.container.setAttribute('aria-label', `High effort resetting in ${Utils.formatTimer(wait)}. Low effort: ${low} remaining. Click to refresh.`);
          } else {
            this.container.title = 'Time until reset';
            this.container.setAttribute('aria-label', `Resetting in ${Utils.formatTimer(wait)}. Click to refresh.`);
          }
          setClock();
        } else {
          this.appendSpan(content, '0', '#ff6347');
          if (low > 0) {
            this.appendDivider(content);
            this.appendSpan(content, low);
            this.container.title = `High: Limit reached | Low: ${low}`;
            this.container.setAttribute('aria-label', `High effort limit reached. Low effort: ${low} remaining. Click to refresh.`);
          }
          setGauge();
        }
      } else {
        const { remaining, wait, isFree, cost, origRaw } = data;
        if (remaining > 0) {
          this.appendSpan(content, remaining);
          this.container.title = isFree && cost > 1 ? `${remaining} (${origRaw} tokens ÷ ${cost})` : `${remaining} remaining`;
          this.container.setAttribute('aria-label', `${remaining} queries remaining. Click to refresh.`);
          setGauge();
        } else if (wait > 0) {
          this.startCountdown(wait, this.appendSpan(content, Utils.formatTimer(wait), '#ff6347'));
          this.container.title = 'Time until reset';
          this.container.setAttribute('aria-label', `Resetting in ${Utils.formatTimer(wait)}. Click to refresh.`);
          setClock();
        } else {
          this.appendSpan(content, '0', '#ff6347');
          this.container.title = 'Limit reached';
          this.container.setAttribute('aria-label', 'Limit reached. Click to refresh.');
          setGauge();
        }
      }

      function updateSVG(el, icon) {
         el.replaceChildren(...(icon.items ? icon.items : [icon]).map(i => Utils.createSVG(i.tag || 'path', i.attrs)));
         el.setAttribute('class', 'lucide stroke-[2] text-fg-secondary transition-colors duration-100');
      }
    }

    renderError(content, svg, data, effort) {
      this.appendSpan(content, 'Unavailable');
      this.container.title = data.reason || 'Error';
      this.container.setAttribute('aria-label', `Rate limit status: ${data.reason || 'Error'}. Click to refresh.`);
      const path = Utils.createSVG('path', ICONS.GAUGE.attrs);
      svg.replaceChildren(path);
    }

    appendSpan(parent, text, color) {
      const span = parent.appendChild(document.createElement('span'));
      span.textContent = text;
      if (color) span.style.color = color;
      return span;
    }

    appendDivider(parent) {
      const div = parent.appendChild(document.createElement('div'));
      div.className = 'h-6 w-[2px] bg-border-l2 mx-1';
    }

    remove() { this.container?.remove(); this.container = null; }

    startCountdown(duration, el) {
      let rem = duration;
      App.isCountingDown = true;
      clearInterval(this.timers.countdown);
      
      this.timers.countdown = setInterval(() => {
        rem--;
        if (rem <= 0) {
          this.stopCountdown();
          App.isCountingDown = false;
          App.update(true);
        } else el.textContent = Utils.formatTimer(rem);
      }, 1000);
    }

    stopCountdown() { clearInterval(this.timers.countdown); }

  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ORCHESTRATION
  // ═══════════════════════════════════════════════════════════════════════════

  const App = {
    manager: new RateLimitManager(),
    ui: new RateLimitUI(),
    queryBar: null,
    modelName: null,
    isCountingDown: false,
    pollTimer: null,
    observers: {},

    async update(force = false) {
      if (!this.queryBar || !this.queryBar.isConnected) {
        this.disconnect();
        return;
      }
      
      const model = ModelManager.detect(this.queryBar);
      if (model !== this.modelName) force = true;
      if (this.isCountingDown && !force) return;

      this.modelName = model;
      const kind = ModelManager.getRequestKind(model, this.queryBar);
      const effort = ModelManager.getEffort(model);

      const data = await this.manager.fetch(model, kind, force);
      this.ui.update(this.manager.process(data, effort), effort, this.queryBar);
      
      if (!this.isCountingDown && document.visibilityState === 'visible') {
         clearInterval(this.pollTimer);
         this.pollTimer = setInterval(() => this.update(true), CONFIG.POLL_INTERVAL);
      }
    },

    setup(queryBar) {
      this.queryBar = queryBar;
      this.ui.remove(); // Reset UI
      this.update(true);
      
      // Observers
      this.disconnect();
      const debouncedUpdate = Utils.debounce(() => {
        this.update();
        this.checkGrok3();
      }, 300);
      
      this.observers.model = new MutationObserver((mutations) => {
        const shouldUpdate = mutations.some(m => {
          const target = m.target.nodeType === 3 ? m.target.parentElement : m.target;
          return !target.closest(CONFIG.SELECTORS.input);
        });
        if (shouldUpdate) debouncedUpdate();
      });
      this.observers.model.observe(queryBar, { childList: true, subtree: true, attributes: true, characterData: true });

      // Input listener for submit
      const input = queryBar.querySelector(CONFIG.SELECTORS.input);
      if (input) {
        input.addEventListener('keydown', e => e.key === 'Enter' && !e.shiftKey && setTimeout(() => this.update(true), 3000));
      }
    },

    checkGrok3() {
      if (this.modelName !== 'grok-3') {
        ['think', 'search'].forEach(k => { this.observers[k]?.disconnect(); this.observers[k] = null; });
        return;
      }
      
      const setupObs = (key, config) => {
        const el = Utils.findElement(config, this.queryBar);
        if (el && !this.observers[key]) {
          this.observers[key] = new MutationObserver(() => this.update());
          this.observers[key].observe(el, { attributes: true, attributeFilter: ['aria-pressed', 'class'] });
        }
      };
      
      setupObs('think', CONFIG.FINDERS.think);
      setupObs('search', CONFIG.FINDERS.deepSearch);
    },

    disconnect() {
      Object.values(this.observers).forEach(o => o?.disconnect());
      this.observers = {};
      clearInterval(this.pollTimer);
    },
    
    init() {
      // Bolt: Use CSS animation to detect element insertion instead of global MutationObserver
      // This significantly reduces main thread overhead by avoiding O(N) checks on every DOM mutation.
      document.addEventListener('animationstart', (e) => {
        if (e.animationName === 'bolt-grok-appear') {
          this.setup(e.target);
        }
      });

      document.addEventListener('visibilitychange', () => 
        document.visibilityState === 'visible' ? this.update(true) : clearInterval(this.pollTimer)
      );

      // Handle case where element already exists
      const qb = document.querySelector(CONFIG.SELECTORS.queryBar);
      if (qb) this.setup(qb);
    }
  };

  App.init();
})();