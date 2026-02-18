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
    .sld-panel{position:absolute;display:none;min-width:140px;background:#171d25;border:1px solid #000;border-radius:3px;box-shadow:0 0 12px rgba(0,0,0,.7);z-index:1501}
    .sld-panel.show{display:block}
    .sld-panel a{display:block;padding:6px 12px;color:#c7d5e0;text-decoration:none;font-size:13px;white-space:nowrap}
    .sld-panel a:hover{background:#c7d5e0;color:#1b2838;border-radius:2px}
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

  let activePanel = null;

  const createDropdown = (label, items, insertPoint, insertMode) => {
    const wrap = document.createElement('div');
    wrap.className = 'sld-wrap';

    const btn = document.createElement('a');
    btn.href = '#';
    btn.className = 'btnv6_blue_hoverfade btn_medium sld-btn';
    btn.innerHTML = `<span>${label}</span>`;

    const panel = document.createElement('div');
    panel.className = 'sld-panel';

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
      }
      panel.appendChild(el);
    }

    document.body.appendChild(panel);
    wrap.appendChild(btn);

    btn.onclick = e => {
      e.preventDefault();
      e.stopPropagation();

      if (activePanel === panel) {
        panel.classList.remove('show');
        activePanel = null;
        return;
      }

      activePanel?.classList.remove('show');

      const r = btn.getBoundingClientRect();
      const below = window.innerHeight - r.bottom;
      Object.assign(panel.style, {
        left: `${r.left + scrollX}px`,
        top: below > 200 ? `${r.bottom + scrollY + 2}px` : `${r.top + scrollY - panel.offsetHeight - 2}px`
      });
      panel.classList.add('show');
      activePanel = panel;
    };

    insertMode === 'before'
      ? insertPoint.parentNode.insertBefore(wrap, insertPoint)
      : insertPoint.appendChild(wrap);
  };

  document.addEventListener('click', () => {
    activePanel?.classList.remove('show');
    activePanel = null;
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
