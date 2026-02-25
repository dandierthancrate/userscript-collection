// ==UserScript==
// @name         Romheaven Steam Assistant
// @namespace    https://github.com/dandierthancrate/userscript-collection
// @version      1.3.4
// @description  Download Clean Steam Files directly from a game's store page
// @author       dandierthancrate
// @match        https://store.steampowered.com/app/*
// @icon         https://store.steampowered.com/favicon.ico
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @connect      arweave.net
// @connect      ar-io.net
// @connect      g8way.io
// @connect      api.steamcmd.net
// @connect      pixeldrain.com
// @connect      dl.romheaven.com
// @license      GPL-3.0-or-later
// @updateURL    https://raw.githubusercontent.com/dandierthancrate/userscript-collection/main/romheaven-steam-assistant.user.js
// @downloadURL  https://raw.githubusercontent.com/dandierthancrate/userscript-collection/main/romheaven-steam-assistant.user.js
// ==/UserScript==

(function () {
  'use strict';

  // ═══════════════════════════════════════════════════════════════════════════
  // CONFIGURATION & STYLES
  // ═══════════════════════════════════════════════════════════════════════════

  const CONFIG = {
    FILE_ID: '97debf09-1ae1-46e0-9a6e-e7650b19e6c1',
    OWNER_ADDRESS: 'jSf-_OY4nlHhfPfr3k0wuxgB0DqzQU-vBlmTXp3gr98',
    GATEWAYS: ['https://arweave.net', 'https://ar-io.net', 'https://g8way.io'],
    ENDPOINTS: {
      STEAMCMD: 'https://api.steamcmd.net/v1/info',
      PIXELDRAIN: 'https://pixeldrain.com/api/file',
      DIRECT: 'https://dl.romheaven.com'
    }
  };

  const STYLES = `
    #rh-box{margin:20px 0;padding:20px;background:linear-gradient(135deg,#1b2838,#2a475e);border:2px solid #66c0f4;border-radius:8px;box-shadow:0 2px 4px rgba(0,0,0,.2),inset 0 1px 0 rgba(255,255,255,.05);color:#c7d5e0;font-family:'Motiva Sans',Arial,sans-serif;position:relative;overflow:hidden}
    #rh-box .rh-header{position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(to right,#66c0f4,#00b894)}
    #rh-box h3{margin:0 0 12px;color:#66c0f4;font-size:20px;font-weight:bold;text-shadow:0 1px 1px rgba(0,0,0,.3)}
    #rh-box p{margin:8px 0;font-size:15px;font-weight:500;line-height:1.4}
    #rh-status{color:#d1d8e0}
    #rh-size{color:#a4b0be;margin-bottom:12px}
    #rh-downloads{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
    .rh-btn{display:inline-flex;align-items:center;justify-content:center;padding:8px 12px;text-decoration:none;border-radius:6px;font-size:14px;font-weight:bold;min-width:120px;transition:all .2s ease;cursor:pointer;border:none}
    .rh-btn:focus-visible{outline:2px solid #fff;outline-offset:2px;box-shadow:0 0 0 4px rgba(102,192,244,0.5)}
    .rh-btn-primary{background:linear-gradient(135deg,#66c0f4,#4a9fd6);color:#1b2838;box-shadow:0 1px 3px rgba(102,192,244,.3)}
    .rh-btn-primary:hover{box-shadow:0 2px 6px rgba(102,192,244,.5);transform:translateY(-1px)}
    .rh-btn-secondary{background:linear-gradient(135deg,#2d2d2d,#1a1a1a);color:#c7d5e0;border:1px solid #66c0f4;box-shadow:0 1px 3px rgba(0,0,0,.4)}
    .rh-btn-secondary:hover{box-shadow:0 2px 6px rgba(102,192,244,.2);border-color:#88d4ff;transform:translateY(-1px)}
    .rh-btn-retry{background:linear-gradient(135deg,#e74c3c,#c0392b);color:#fff;box-shadow:0 1px 3px rgba(231,76,60,.3)}
    .rh-btn-retry:hover{box-shadow:0 2px 6px rgba(231,76,60,.5);transform:translateY(-1px)}
    .rh-spinner{width:16px;height:16px;border:2px solid rgba(255,255,255,0.3);border-radius:50%;border-top-color:#66c0f4;animation:rh-spin 1s ease-in-out infinite;margin-right:8px;display:inline-block;vertical-align:middle}
    @keyframes rh-spin{to{transform:rotate(360deg)}}
  `;

  // ═══════════════════════════════════════════════════════════════════════════
  // UTILITIES & SERVICES
  // ═══════════════════════════════════════════════════════════════════════════

  const Utils = {
    gmFetch: (url, opts = {}) => new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: opts.method || 'GET',
        url,
        headers: opts.headers || {},
        data: opts.body,
        responseType: opts.responseType || 'text',
        onload: res => (res.status >= 200 && res.status < 300) 
          ? resolve(opts.json ? JSON.parse(res.responseText) : res)
          : reject(new Error(`HTTP ${res.status}`)),
        onerror: () => reject(new Error('Network error')),
        ontimeout: () => reject(new Error('Timeout'))
      });
    }),
    
    decompress: async (buffer) => {
      if (!window.DecompressionStream) throw new Error('UNSUPPORTED');
      const ds = new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'));
      return new Response(ds).text();
    },

    formatSize: (bytes) => {
      if (!bytes || isNaN(bytes)) return 'N/A';
      const mb = bytes / 1048576;
      return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(1)} MB`;
    }
  };

  class GatewayManager {
    static activeGateway = null;

    static async fetch(pathFn, opts = {}) {
      // 1. Try sticky gateway first for speed
      if (this.activeGateway) {
        try {
          return await Utils.gmFetch(pathFn(this.activeGateway), opts);
        } catch (e) {
          console.warn(`[Romheaven] Gateway ${this.activeGateway} failed, falling back to race.`);
          this.activeGateway = null; // Reset and race
        }
      }

      // 2. Race all gateways to find the fastest
      const promises = CONFIG.GATEWAYS.map(gw =>
        Utils.gmFetch(pathFn(gw), opts).then(res => ({ gw, res }))
      );

      try {
        const { gw, res } = await Promise.any(promises);
        this.activeGateway = gw; // Remember winner
        return res;
      } catch (aggregateError) {
        throw new Error('GATEWAY_EXHAUSTED');
      }
    }
  }

  class SteamService {
    static async getBuildId(appid) {
      try {
        const json = await Utils.gmFetch(`${CONFIG.ENDPOINTS.STEAMCMD}/${appid}`, { json: true });
        return json?.data?.[appid]?.depots?.branches?.public?.buildid;
      } catch { return null; }
    }
  }

  class RomheavenService {
    static async getMetadata() {
      const query = `{transactions(tags:[{name:"File-Id",values:["${CONFIG.FILE_ID}"]}],owners:["${CONFIG.OWNER_ADDRESS}"],sort:HEIGHT_DESC,first:1){edges{node{id}}}}`;
      const res = await GatewayManager.fetch(gw => `${gw}/graphql`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
        json: true
      });
      return res?.data?.transactions?.edges?.[0]?.node?.id;
    }

    static async getGameData(txId, appid) {
      const meta = await GatewayManager.fetch(gw => `${gw}/${txId}`, { json: true });
      if (!meta?.dataTxId) throw new Error('NO_REF');

      const dataRes = await GatewayManager.fetch(gw => `${gw}/${meta.dataTxId}`, { responseType: 'arraybuffer' });
      const jsonStr = await Utils.decompress(dataRes.response);
      return JSON.parse(jsonStr).find(g => g.appid == appid);
    }

    static async getPixeldrainInfo(id) {
      try {
        const json = await Utils.gmFetch(`${CONFIG.ENDPOINTS.PIXELDRAIN}/${id}/info`, { json: true });
        return json.success;
      } catch { return false; }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // UI MANAGER
  // ═══════════════════════════════════════════════════════════════════════════

  class RomheavenUI {
    constructor() {
      this.els = {};
      GM_addStyle(STYLES);
    }

    inject(target) {
      const box = document.createElement('div');
      box.id = 'rh-box';

      const header = document.createElement('div');
      header.className = 'rh-header';
      box.appendChild(header);

      const h3 = document.createElement('h3');
      h3.textContent = 'Download from Romheaven';
      box.appendChild(h3);

      const status = document.createElement('p');
      status.id = 'rh-status';
      status.setAttribute('role', 'status');
      status.setAttribute('aria-live', 'polite');
      status.textContent = 'Checking build versions...';
      box.appendChild(status);

      const size = document.createElement('p');
      size.id = 'rh-size';
      box.appendChild(size);

      const downloads = document.createElement('div');
      downloads.id = 'rh-downloads';
      box.appendChild(downloads);

      target.insertAdjacentElement('afterend', box);
      
      this.els = {
        status: status,
        size: size,
        dl: downloads
      };
    }

    setLoading(text) {
      const container = document.createElement('span');
      const spinner = document.createElement('span');
      spinner.className = 'rh-spinner';
      container.appendChild(spinner);
      container.appendChild(document.createTextNode(text));
      this.setStatus(container, '#d1d8e0');
    }

    setStatus(content, color = '#d1d8e0') {
      this.els.status.textContent = '';
      if (content instanceof Node) {
        this.els.status.appendChild(content);
      } else {
        this.els.status.textContent = content;
      }
      this.els.status.style.color = color;
    }

    setError(msg, retryCb) {
      this.setStatus(msg, '#ff6b6b');
      this.els.size.textContent = '';
      this.els.dl.textContent = '';
      if (retryCb) this.createBtn('🔄 Retry', 'rh-btn-retry', null, retryCb);
    }

    createBtn(text, cls, href, onClick) {
      const el = document.createElement(href ? 'a' : 'button');
      el.textContent = text;
      el.className = `rh-btn ${cls}`;
      if (href) {
        el.href = href;
        if (cls.includes('secondary')) {
          el.target = '_blank';
          el.rel = 'noopener noreferrer';
        }
      }
      if (onClick) el.onclick = onClick;
      this.els.dl.appendChild(el);
      return el;
    }

    renderSuccess(entry, buildId) {
      const { install_dir, build, pixeldrain, archive_size } = entry;

      if (!/^[a-zA-Z0-9_\-\. ]+$/.test(install_dir)) {
        return this.setError('⚠️ Security: Invalid file name.', null);
      }

      this.els.size.textContent = '';
      this.els.size.append('📦 File Size: ');
      const sizeStrong = document.createElement('strong');
      sizeStrong.textContent = Utils.formatSize(parseInt(archive_size));
      this.els.size.appendChild(sizeStrong);

      // Main Download
      const dlUrl = `${CONFIG.ENDPOINTS.DIRECT}/${entry.appid}.rar?filename=${encodeURIComponent(install_dir)}.rar`;
      const btn = this.createBtn('📥 Direct Download', 'rh-btn-primary', dlUrl);
      btn.download = '';

      // Pixeldrain
      if (pixeldrain && typeof pixeldrain === 'string' && /^[a-zA-Z0-9]{8,16}$/.test(pixeldrain)) {
        RomheavenService.getPixeldrainInfo(pixeldrain).then(alive => {
          if (alive) this.createBtn('🔗 Pixeldrain', 'rh-btn-secondary', `https://pixeldrain.com/u/${pixeldrain}`);
        });
      }

      // Version Check
      if (buildId && build) {
        if (buildId === build) {
          const msg = document.createElement('span');
          msg.textContent = '✅ ';
          const strong = document.createElement('strong');
          strong.textContent = 'Latest game version available.';
          msg.appendChild(strong);
          this.setStatus(msg, '#00ff88');
        } else {
          const msg = document.createElement('span');
          msg.textContent = 'ℹ️ Older version available. ';
          const link = document.createElement('a');
          link.href = `https://steamdb.info/patchnotes/${build}`;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          link.style.color = '#66c0f4';
          link.textContent = `(${build})`;
          msg.appendChild(link);
          this.setStatus(msg, '#BEB2A4');
        }
      } else {
        this.setStatus('ℹ️ Build info unavailable.', '#a4b0be');
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ORCHESTRATION
  // ═══════════════════════════════════════════════════════════════════════════

  const App = {
    init: async () => {
      if (document.getElementById('rh-box')) return;
      const target = document.querySelector('.game_area_purchase_game_wrapper');
      const appid = location.pathname.match(/\/app\/(\d+)/)?.[1];
      if (!target || !appid) return;

      const ui = new RomheavenUI();
      ui.inject(target);

      const load = async () => {
        ui.els.dl.textContent = '';
        ui.setLoading('Checking build versions...');
        
        try {
          const [buildId, txId] = await Promise.all([
            SteamService.getBuildId(appid),
            RomheavenService.getMetadata()
          ]);

          if (!txId) return ui.setError('⚠️ Romheaven metadata not found.', false);

          const entry = await RomheavenService.getGameData(txId, appid);
          if (entry) ui.renderSuccess(entry, buildId);
          else ui.setStatus('❌ Clean Steam Files not found for this game.', '#ff6b6b');

        } catch (e) {
          if (e.message === 'UNSUPPORTED') ui.setError('⚠️ Browser too old for decompression.', false);
          else ui.setError('⚠️ All gateways unreachable.', load);
        }
      };

      load();
    }
  };

  App.init();
})();
