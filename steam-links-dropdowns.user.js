// ==UserScript==
// @name         Steam Links Dropdowns
// @namespace    https://github.com/dandierthancrate/userscript-collection
// @version      1.2.7
// @description  Adds dropdown menus with game download and cheat links on Steam app pages
// @author       dandierthancrate
// @match        https://store.steampowered.com/app/*
// @icon         https://store.steampowered.com/favicon.ico
// @grant        GM_addStyle
// @license      GPL-3.0-or-later
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/dandierthancrate/userscript-collection/main/steam-links-dropdowns.user.js
// @downloadURL  https://raw.githubusercontent.com/dandierthancrate/userscript-collection/main/steam-links-dropdowns.user.js
// ==/UserScript==

(function () {
  'use strict';

  const STYLES = `
    .sld-wrap{display:inline-block;position:relative;margin-right:4px;vertical-align:top}
    .sld-panel{position:absolute;top:0;left:0;visibility:hidden;opacity:0;min-width:140px;background:#171d25;border:1px solid #000;border-radius:3px;box-shadow:0 0 12px rgba(0,0,0,.7);z-index:1501;transition:opacity 0.1s ease-out, visibility 0.1s}
    .sld-panel.show{visibility:visible;opacity:1}
    .sld-panel a{display:block;padding:6px 12px;color:#c7d5e0;text-decoration:none;font-size:13px;white-space:nowrap;outline:none}
    .sld-panel a:hover,.sld-panel a:focus{background:#c7d5e0;color:#1b2838;border-radius:2px}
    .sld-header{padding:6px 12px 4px;color:#5b9ace;font-weight:bold;font-size:11px;text-transform:uppercase;border-top:1px solid #3a3f44}
    .sld-header:first-child{border-top:none}
    @keyframes sld-node-inserted { from { opacity: 0.99; } to { opacity: 1; } }
    .apphub_OtherSiteInfo { animation: sld-node-inserted 0.001s; }
  `;

  const DROPDOWNS = [
    {
      label: 'Find...',
      items: [
        { header: 'DDL' },
        { name: 'IGG-Games', url: 'https://igg-games.com/?s={q}' },
        { name: 'SteamRIP', url: 'https://steamrip.com/?s={q}' },
        { name: 'AnkerGames', url: 'https://ankergames.net/game/{q}' },
        { header: 'Torrent' },
        { name: 'Rutracker', url: 'https://rutracker.org/forum/tracker.php?nm={q}' },
        { name: 'Nyaa.si', url: 'https://nyaa.si/?f=0&c=6_2&q={q}' },
        { header: 'Repack' },
        { name: 'ElAmigos', url: 'https://elamigos.site/' },
        { name: 'FitGirl Repacks', url: 'https://fitgirl-repacks.site/?s={q}' },
        { header: 'NSFW' },
        { name: 'F95Zone', url: 'https://f95zone.to/search/?q={q}&c[title_only]=1&o=relevance' },
        { name: 'Kimochi', url: 'https://kimochi.info/?s={q}' },
        { name: 'FapForFun', url: 'https://fapforfun.net/?s={q}' },
        { name: 'Eroge Download', url: 'https://erogedownload.com/?s={q}' },
      ]
    },
    {
      label: 'Misc',
      items: [
        { name: 'WeMod', url: 'https://www.wemod.com/cheats?q={q}' },
        { name: 'FLiNG Trainer', url: 'https://flingtrainer.com/search/{q}/' },
      ]
    }
  ];

  const getTitle = () => {
    const el = document.getElementById('appHubAppName');
    return el?.textContent?.trim() || document.title.match(/^(.*?)\s+on Steam$/)?.[1]?.trim() || '';
  };

  const sanitize = t => t
    ?.replace(/[™®©]/g, '')
    .replace(/\s*[:\-–—]?\s+(Remastered|Remake|Definitive|Ultimate|Deluxe|GOTY|Game of the Year|Anniversary|Enhanced|Complete|Gold|Premium|Collectors|Extended|Legacy)(\s+(Collection|Edition|Cut))?$/i, '')
    .replace(/\s*\(?(VR)\)?$/i, '')
    .replace(/\s+\d{4}$/, '')
    .trim() || '';

  const title = sanitize(getTitle());
  if (!title) return;

  let activeDropdown = null;

  const createDropdown = (label, items, insertPoint, insertMode) => {
    const wrap = document.createElement('div');
    wrap.className = 'sld-wrap';

    const btn = document.createElement('a');
    btn.href = '#';
    btn.className = 'btnv6_blue_hoverfade btn_medium sld-btn';
    btn.setAttribute('role', 'button');
    btn.setAttribute('aria-haspopup', 'true');
    btn.setAttribute('aria-expanded', 'false');
    const span = document.createElement('span');
    span.textContent = label;
    btn.appendChild(span);

    const panel = document.createElement('div');
    panel.id = `sld-panel-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    panel.className = 'sld-panel';
    panel.setAttribute('role', 'menu');
    btn.setAttribute('aria-controls', panel.id);

    btn.onkeydown = e => {
      if ([' ', 'Enter', 'ArrowDown'].includes(e.key)) {
        e.preventDefault();
        if (!activeDropdown || activeDropdown.btn !== btn) btn.click();
        const first = panel.querySelector('[role="menuitem"]');
        if (first) setTimeout(() => first.focus(), 0);
      } else if (e.key === 'Escape' && activeDropdown && activeDropdown.btn === btn) {
        e.preventDefault();
        btn.click();
      }
    };

    const handleMenuKey = (e, el) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        btn.click();
        btn.focus();
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const all = [...panel.querySelectorAll('[role="menuitem"]')];
        const next = all[all.indexOf(el) + (e.key === 'ArrowDown' ? 1 : -1)];
        if (next) next.focus();
      }
    };

    for (const item of items) {
      const el = document.createElement(item.header ? 'div' : 'a');
      if (item.header) {
        el.className = 'sld-header';
        el.textContent = item.header;
      } else {
        el.href = item.url.replace('{q}', encodeURIComponent(title));
        el.textContent = item.name;
        el.target = '_blank';
        el.rel = 'noopener';
        el.setAttribute('role', 'menuitem');
        el.onkeydown = e => handleMenuKey(e, el);
      }
      panel.appendChild(el);
    }

    document.body.appendChild(panel);
    wrap.appendChild(btn);

    btn.onclick = e => {
      e.preventDefault();
      e.stopPropagation();

      if (activeDropdown && activeDropdown.panel === panel) {
        panel.classList.remove('show');
        btn.setAttribute('aria-expanded', 'false');
        activeDropdown = null;
        return;
      }

      if (activeDropdown) {
        activeDropdown.panel.classList.remove('show');
        activeDropdown.btn.setAttribute('aria-expanded', 'false');
      }

      const r = btn.getBoundingClientRect();
      const below = window.innerHeight - r.bottom;
      Object.assign(panel.style, {
        left: `${r.left + scrollX}px`,
        top: below > 200 ? `${r.bottom + scrollY + 2}px` : `${r.top + scrollY - panel.offsetHeight - 2}px`
      });
      panel.classList.add('show');
      btn.setAttribute('aria-expanded', 'true');
      activeDropdown = { panel, btn };
    };

    insertMode === 'before'
      ? insertPoint.parentNode.insertBefore(wrap, insertPoint)
      : insertPoint.appendChild(wrap);
  };

  document.addEventListener('click', () => {
    if (activeDropdown) {
      activeDropdown.panel.classList.remove('show');
      activeDropdown.btn.setAttribute('aria-expanded', 'false');
      activeDropdown = null;
    }
  });

  // Wait for hub element with MutationObserver
  const initDropdowns = hub => {
    if (hub.dataset.sldInit) return;
    hub.dataset.sldInit = 'true';
    const community = hub.querySelector('a[href*="steamcommunity.com/app/"]');
    const target = community || hub;
    const mode = community ? 'before' : 'append';
    for (const { label, items } of DROPDOWNS) {
      createDropdown(label, items, target, mode);
    }
  };

  // Bolt: Optimized element detection using CSS Animation instead of global MutationObserver
  // This removes the O(N) overhead on every DOM mutation.
  document.addEventListener('animationstart', (e) => {
    if (e.animationName === 'sld-node-inserted') {
      initDropdowns(e.target);
    }
  });

  GM_addStyle(STYLES);
})();
