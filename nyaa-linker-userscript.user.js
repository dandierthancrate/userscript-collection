// ==UserScript==
// @name         Nyaa Linker Userscript
// @namespace    https://github.com/dandierthancrate/userscript-collection
// @version      2.5.4
// @description  Adds a button to Anime and Manga database websites that opens a relevant Nyaa search
// @author       dandierthancrate
// @match        *://*.myanimelist.net/*
// @match        *://*.anilist.co/*
// @match        *://*.kitsu.app/*
// @match        *://*.anime-planet.com/*
// @match        *://*.animenewsnetwork.com/encyclopedia/*
// @match        *://*.anidb.net/*
// @match        *://*.livechart.me/*
// @match        *://*.mangabaka.dev/*
// @match        *://*.mangabaka.org/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @license      GPL-3.0-or-later
// @run-at       document-end
// @updateURL    https://raw.githubusercontent.com/dandierthancrate/userscript-collection/main/nyaa-linker-userscript.user.js
// @downloadURL  https://raw.githubusercontent.com/dandierthancrate/userscript-collection/main/nyaa-linker-userscript.user.js
// ==/UserScript==

let settings;

const SETTINGS_CONFIG = [
  { key: 'filter_setting', label: 'Filter', type: 'select', options: {'0': 'No Filter', '1': 'No Remakes', '2': 'Trusted Only'}, default: '0' },
  { key: 'category_setting', label: 'Category', type: 'select', options: {'0_0': 'All Categories', '1_2': 'English-Translated', '1_3': 'Non-English-Translated', '1_4': 'Raw'}, default: '1_2' },
  { key: 'query_setting', label: 'Query', type: 'select', options: {'default': 'Default', 'fuzzy_default': 'Fuzzy Default', 'fuzzy': 'Fuzzy', 'exact': 'Exact', 'base': 'Base'}, default: 'fuzzy_default' },
  { key: 'sort_setting', label: 'Sort', type: 'select', options: {'comments': 'Comments', 'size': 'Size', 'id': 'Date', 'seeders': 'Seeders', 'leechers': 'Leechers', 'downloads': 'Downloads'}, default: 'id' },
  { key: 'order_setting', label: 'Order', type: 'select', options: {'desc': 'Descending', 'asc': 'Ascending'}, default: 'desc' },
  { key: 'hide_button_setting', label: 'Hide Button', type: 'checkbox', default: false },
  { key: 'focus_setting', label: 'Maintain Focus', type: 'checkbox', default: false },
  { key: 'custom_text_toggle_setting', label: 'Include Text', type: 'checkbox', default: false },
  { key: 'custom_text_setting', label: 'Custom Text', type: 'text', placeholder: '?', maxLength: 100, default: '' },
  { key: 'hotkey_key_setting', label: 'Hotkey', type: 'text', placeholder: '?', maxLength: 1, default: '' },
  { key: 'hotkey_modifier_setting', label: 'Hotkey Modifier', type: 'select', options: {'': 'None', 'shiftKey': 'Shift', 'ctrlKey': 'Control', 'altKey': 'Alt'}, default: '' },
  { key: 'hotkey_query_setting', label: 'Hotkey Query', type: 'select', options: {'inherit': 'Inherit', 'default': 'Default', 'fuzzy_default': 'Fuzzy Default', 'fuzzy': 'Fuzzy', 'exact': 'Exact', 'base': 'Base'}, default: 'inherit' }
];

const removeNyaaBtns = () => document.querySelectorAll('.nyaaBtn').forEach(e => e.remove());

// ─────────────────────────────────────────────────────────────────────────────
// Security: Input Validation Helpers
// ─────────────────────────────────────────────────────────────────────────────

const InputValidator = {
  // Validate hotkey: single alphanumeric character only (prevent XSS via special chars)
  isValidHotkey: (key) => {
    if (!key || typeof key !== 'string') return false;
    return /^[a-zA-Z0-9]$/.test(key);
  },

  // Validate custom text: Enforce length limits and basic trimming
  sanitizeCustomText: (text) => {
    if (!text) return '';
    // Security: Input is safely encoded by URLSearchParams at usage site.
    // Removed misleading blacklist regexes. Enforce length limit for DoS prevention.
    return text.trim().slice(0, 100);
  },

  // Validate settings object structure
  isValidSettings: (s) => {
    if (!s || typeof s !== 'object') return false;
    // Check critical fields have valid types
    if (typeof s.hotkey_key_setting !== 'string') return false;
    if (typeof s.custom_text_setting !== 'string') return false;
    return true;
  }
};

class Storage {
  static get(key, def) { return GM_getValue(key, def); }
  static set(key, val) { GM_setValue(key, val); }
  static load() {
    const s = GM_getValue('settings', {});
    const loaded = SETTINGS_CONFIG.reduce((acc, conf) => {
      acc[conf.key] = s[conf.key] !== undefined ? s[conf.key] : conf.default;
      return acc;
    }, {});
    
    // Security: Validate and sanitize user inputs
    if (!InputValidator.isValidHotkey(loaded.hotkey_key_setting)) {
      loaded.hotkey_key_setting = '';
    }
    loaded.custom_text_setting = InputValidator.sanitizeCustomText(loaded.custom_text_setting);
    
    return loaded;
  }
  static save(newSettings) {
    // Security: Validate before saving
    if (!InputValidator.isValidSettings(newSettings)) {
      console.error('[Nyaa Linker] Invalid settings object');
      return;
    }
    
    // Sanitize user inputs
    if (!InputValidator.isValidHotkey(newSettings.hotkey_key_setting)) {
      newSettings.hotkey_key_setting = '';
    }
    newSettings.custom_text_setting = InputValidator.sanitizeCustomText(newSettings.custom_text_setting);
    
    GM_setValue('settings', newSettings);
    settings = newSettings;
    removeNyaaBtns();
    init();
  }
}

if (typeof GM_registerMenuCommand !== 'undefined') {
  GM_registerMenuCommand('Nyaa Linker Settings', () => {
    if (document.getElementById('nyaa-linker-settings')) return;
    const panel = document.createElement('div');
    panel.id = 'nyaa-linker-settings';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-label', 'Nyaa Linker Settings');
    Object.assign(panel.style, {
      position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
      backgroundColor: '#1a1a1a', color: '#dedede', padding: '20px',
      border: '1px solid #66c0f4', zIndex: '10000', fontFamily: 'sans-serif', fontSize: '12px',
      display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', boxShadow: '0 0 10px rgba(0,0,0,0.5)'
    });

    SETTINGS_CONFIG.forEach(conf => {
      const label = panel.appendChild(document.createElement('label'));
      label.textContent = conf.label + ':';
      label.style.textAlign = 'right';
      label.setAttribute('for', `nl-setting-${conf.key}`);

      let input;
      if (conf.type === 'select') {
        input = panel.appendChild(document.createElement('select'));
        Object.entries(conf.options).forEach(([val, text]) => {
            const opt = input.appendChild(document.createElement('option'));
            opt.value = val; opt.textContent = text;
        });
        input.value = settings[conf.key];
      } else if (conf.type === 'checkbox') {
        const wrapper = panel.appendChild(document.createElement('div'));
        input = wrapper.appendChild(document.createElement('input'));
        input.type = 'checkbox';
        input.checked = settings[conf.key];
      } else {
        input = panel.appendChild(document.createElement('input'));
        input.type = 'text';
        if (conf.placeholder) input.placeholder = conf.placeholder;
        if (conf.maxLength) input.maxLength = conf.maxLength;
        input.value = settings[conf.key];
        input.style.width = '100%';
      }
      input.id = `nl-setting-${conf.key}`;
    });

    const btnRow = panel.appendChild(document.createElement('div'));
    btnRow.style.gridColumn = '1 / -1';
    btnRow.style.marginTop = '10px';
    btnRow.style.textAlign = 'center';
    
    const saveBtn = btnRow.appendChild(document.createElement('button'));
    saveBtn.type = 'button';
    saveBtn.textContent = 'Save & Close';
    saveBtn.style.padding = '5px 10px';
    saveBtn.style.cursor = 'pointer';
    
    saveBtn.onclick = () => {
      const newSettings = {};
      SETTINGS_CONFIG.forEach(conf => {
        const el = document.getElementById(`nl-setting-${conf.key}`);
        let value = conf.type === 'checkbox' ? el.checked : el.value;
        
        // Security: Validate hotkey input (single alphanumeric only)
        if (conf.key === 'hotkey_key_setting' && value && !InputValidator.isValidHotkey(value)) {
          alert('Invalid hotkey. Use a single letter or number only.');
          return;
        }
        
        // Security: Sanitize custom text input
        if (conf.key === 'custom_text_setting') {
          value = InputValidator.sanitizeCustomText(value);
        }
        
        newSettings[conf.key] = value;
      });
      
      // Validate complete settings object before saving
      if (!InputValidator.isValidSettings(newSettings)) {
        alert('Invalid settings. Please check your inputs.');
        return;
      }
      
      Storage.save(newSettings);
      panel.remove();
    };

    const closeBtn = btnRow.appendChild(document.createElement('button'));
    closeBtn.type = 'button';
    closeBtn.textContent = 'Cancel';
    closeBtn.style.marginLeft = '10px';
    closeBtn.onclick = () => panel.remove();

    document.body.appendChild(panel);
  });
}

let currentPage, hotkeyListener, mbElmLis, mbHandled, mbLastHref;

const SITES = [
    {
        name: 'MyAnimeList',
        match: /myanimelist\.net/,
        run: async (domain) => {
            const media = window.location.href.split('/')[3] === 'manga' ? 'manga' : 'anime';
            const cat = setCategory(settings.category_setting, media);
            
            if (!/myanimelist\.net\/(anime|manga)\/\d+/.test(domain)) {
                // Check if card page
                if (['/genre', '/season', '/magazine', '/adapted'].some(p => domain.includes(p))) {
                    if (domain.includes('/adapted') && document.querySelector('.list.on')) return;
                    document.querySelectorAll('.seasonal-anime').forEach(card => {
                        const titleJap = card.querySelector('.title h2').innerText;
                        const titleEng = card.querySelector('.title h3')?.innerText;
                        const isSpicy = [...card.querySelectorAll('.explicit a')].some(el => el.title.toLowerCase().includes('hentai'));
                        
                        const btn = createBtn(card.querySelector('.broadcast'), {
                            title: isSpicy ? 'Search on Sukebei' : 'Search on Nyaa',
                            ...(!isSpicy && { cat }),
                            ...(isSpicy && { cat: media === 'manga' ? '0_0' : '1_1', spicy: true })
                        });
                        Object.assign(btn.style, {
                            background: 'url(https://i.imgur.com/9Fr2BRG.png) center/20px no-repeat',
                            padding: '0 11px',
                            ...(isSpicy && { border: '2px solid red', borderRadius: '50%' })
                        });
                        createSearch(btn, getQuery(titleJap, titleEng, settings.query_setting), settings);
                    });
                }
                return;
            }

            // Main Page Logic
            let titleJap, titleEng;
            const engCheck = document.querySelector('.title-english');
            if (engCheck) titleEng = engCheck.textContent;

            if (media === 'manga') {
                const titleElm = document.querySelector('[itemprop="name"]');
                titleJap = titleElm.textContent;
                if (engCheck) { // Swap check
                    engCheck.textContent = '';
                    titleJap = titleElm.textContent;
                    engCheck.textContent = titleEng;
                }
            } else {
                titleJap = document.querySelector('.title-name').textContent;
            }

            const isSpicy = [...document.querySelectorAll('span[itemprop="genre"]')].some(el => el.textContent.trim().toLowerCase() === 'hentai');
            const btnSpace = document.getElementById('broadcast-block') || document.querySelector('.leftside').children[0];
            
            const btn = createBtn(btnSpace, { cat, spicy: isSpicy });
            btn.style.marginTop = '4px';
            btn.classList.add('left-info-block-broadcast-button');
            createSearch(btn, getQuery(titleJap, titleEng, settings.query_setting), settings);
        }
    },
    {
        name: 'AnimePlanet',
        match: /anime-planet\.com\/(anime|manga)\//,
        run: async (domain) => {
            const media = window.location.pathname.includes('/manga/') ? 'manga' : 'anime';
            if (domain.endsWith(`/${media}/`)) return;
            
            const skipPages = ['all', 'recommendations', 'tags', 'top-anime', 'seasons', 'watch-online', 'studios', 'top-manga', 'read-online', 'publishers', 'magazines', 'webtoons', 'light-novels'];
            const pathSegment = domain.split(`/${media}/`)[1]?.split('/')[0].split('?')[0];
            if (skipPages.includes(pathSegment)) return;

            let titleMain = document.querySelector('[itemprop=name]').textContent;
            const subPage = location.pathname.split('/')[3];
            if (subPage) titleMain = titleMain.replace(new RegExp(`\\s*-\\s*.*${subPage}.*$`, 'i'), '').trim();
            const titleEng = titleMain;

            const titleAlt = document.getElementsByClassName('aka')[0];
            const titleJap = titleAlt?.innerText.replace(/^Alt titles?:\s*/i, '').split(',')[0].trim() || titleMain;

            const btn = createBtn(document.querySelector('.mainEntry'), { cat: setCategory(settings.category_setting, media) });
            btn.classList.add('button');
            document.querySelectorAll('.mainEntry > .button').forEach(b => { if(typeof b === 'object') b.style.width = '180px'; });
            createSearch(btn, getQuery(titleJap, titleEng, settings.query_setting), settings);
        }
    },
    {
        name: 'AnimeNewsNetwork',
        match: /animenewsnetwork\.com\/encyclopedia\/(anime|manga)\.php\?id=/,
        run: async (domain) => {
            const media = domain.includes('manga.php') ? 'manga' : 'anime';
            const titleEng = document.getElementById('page_header').innerText.split(' (').shift();
            let titleJap;
            
            document.querySelectorAll('#infotype-2 > .tab').forEach(t => {
                if (t.textContent.includes('Japanese') && !titleJap) titleJap = t.textContent.split(' (').shift();
            });
            if (!titleJap && titleEng) titleJap = titleEng;

            const btnSpace = document.querySelector('#big-video') || document.querySelector('.fright');
            const btn = createBtn(btnSpace, { cat: setCategory(settings.category_setting, media) });
            applyFlexBtnStyles(btn);
            Object.assign(btn.style, { background: '#2d50a7', color: '#fff', border: '1px solid black', textDecoration: 'none' });
            if (btnSpace.children[0].tagName === 'TABLE') btn.style.marginTop = '4px';
            createSearch(btn, getQuery(titleJap, titleEng, settings.query_setting), settings);
        }
    },
    {
        name: 'AniDB',
        match: /anidb\.net\/(anime|manga)\/\d+/,
        run: async (domain) => {
             const media = window.location.href.split('/')[3];
             const titleJap = document.querySelector(".value > [itemprop='name']").textContent;
             const titleEng = document.querySelector(".value > [itemprop='alternateName']").textContent;
             const isSpicy = [...document.querySelectorAll('.tagname')].some(el => el.textContent.trim().toLowerCase() === '18 restricted');

             const btnSpace = document.querySelector('.resources > .value .english').appendChild(document.createElement('div'));
             btnSpace.classList.add('icons');
             const btn = createBtn(btnSpace, { 
                 cat: setCategory(settings.category_setting, media), 
                 spicy: isSpicy,
                 title: isSpicy ? 'Search on Sukebei' : 'Search on Nyaa'
             });
             btn.classList.add('i_icon');
             Object.assign(btn.style, { backgroundImage: "url('https://i.imgur.com/YG6H2nF.png')", backgroundSize: 'contain' });
             createSearch(btn, getQuery(titleJap, titleEng, settings.query_setting), settings);
        }
    },
    {
        name: 'AniList',
        match: /anilist\.co\/(anime|manga)\//,
        run: async (domain) => {
            const media = window.location.href.split('/')[3];
            await awaitLoadOf('.sidebar .type', 'text', 'Romaji');
            
            let titleJap, titleEng, isSpicy;
            for (const data of document.getElementsByClassName('type')) {
                const val = data.parentNode.children[1].textContent;
                if (data.textContent.includes('Romaji')) titleJap = val;
                if (data.textContent.includes('English')) titleEng = val;
                if (data.textContent.includes('Genres')) isSpicy = val.toLowerCase().includes('hentai');
            }

            const btn = createBtn(document.querySelector('.cover-wrap-inner'), { cat: setCategory(settings.category_setting, media), spicy: isSpicy });
            applyFlexBtnStyles(btn);
            Object.assign(btn.style, { marginBottom: '20px', background: 'rgb(var(--color-blue))', color: 'rgb(var(--color-white))' });
            createSearch(btn, getQuery(titleJap, titleEng, settings.query_setting), settings);
        }
    },
    {
        name: 'Kitsu',
        match: /kitsu\.app\/(anime|manga)\//,
        run: async (domain) => {
            const media = window.location.href.split('/')[3];
            await awaitLoadOf('.media--information', 'text', 'Status');
            document.querySelector('a.more-link')?.click();
            
            let titleJap, titleEng, titleUsa, isSpicy;
            document.querySelectorAll('.media--information > ul > li').forEach(data => {
                const txt = data.textContent;
                const val = data.getElementsByTagName('span')[0]?.textContent;
                if (txt.includes('Japanese (Romaji)')) titleJap = val;
                if (txt.includes('English') && !txt.includes('American')) titleEng = val;
                if (txt.includes('English (American)')) titleUsa = val;
                if (txt.includes('Rating') && data.querySelector('span')?.textContent.includes('R18')) isSpicy = true;
            });
            document.querySelector('a.more-link')?.click();
            
            if (!titleEng && titleUsa) titleEng = titleUsa;
            if (!titleJap && titleEng) titleJap = titleEng;

            const btn = createBtn(document.querySelector('.library-state'), { cat: setCategory(settings.category_setting, media), spicy: isSpicy });
            btn.classList.add('button', 'button--secondary');
            Object.assign(btn.style, { background: '#f5725f', marginTop: '10px' });
            createSearch(btn, getQuery(titleJap, titleEng, settings.query_setting), settings);
        }
    },
    {
         name: 'LiveChart',
         match: /livechart\.me/,
         run: async (domain) => {
             if (domain.includes('/anime/')) {
                 const d = document.querySelector('[data-controller="anime-details"]');
                 if (!d) return;
                 const titleJap = d.getAttribute('data-anime-details-romaji-title');
                 const titleEng = d.getAttribute('data-anime-details-english-title');
                 const btn = createBtn(document.querySelector('.lc-poster-col'), { cat: setCategory(settings.category_setting, 'anime') });
                 btn.classList.add('lc-btn', 'lc-btn-sm', 'lc-btn-outline');
                 createSearch(btn, getQuery(titleJap, titleEng, settings.query_setting), settings);
             } else {
                 const sel = ['.lc-anime', '.lc-anime-card--related-links'];
                 if (!domain.includes('/franchises/') && !domain.includes('/studios/') && !domain.includes('/tags/')) {
                     sel[0] = '.anime'; sel[1] = '.related-links';
                 }
                 document.querySelectorAll(sel[0]).forEach(card => {
                     const btn = createBtn(card.querySelector(sel[1]), { cat: setCategory(settings.category_setting, 'anime') });
                     Object.assign(btn.style, { background: 'url(https://i.imgur.com/9Fr2BRG.png) center/20px no-repeat', padding: '15px', margin: '0' });
                     btn.classList.add('action-button');
                     createSearch(btn, getQuery(card.getAttribute('data-romaji'), card.getAttribute('data-english'), settings.query_setting), settings);
                 });
             }
         }
    },
    {
        name: 'MangaBaka',
        match: /mangabaka\.(dev|org)/,
        run: async (domain) => {
            if (!mbHandled) { mbHandled = new Set(); mbLastHref = location.href; }
            const cardType = !/^\d+$/.test(location.pathname.slice(1));
            const cat = setCategory(settings.category_setting, 'manga');
            
            if (mbElmLis) document.removeEventListener('mb:element:ready', mbElmLis);
            mbElmLis = elm => {
                if (mbLastHref !== location.href) { mbHandled.clear(); mbLastHref = location.href; }
                handleMB(elm.detail, cardType, cat);
            };
            document.addEventListener('mb:element:ready', mbElmLis);
            
            document.querySelectorAll('[data-browser-extension-injection].ratings-list').forEach(ratings => {
                const card = ratings.closest('.bg-card');
                if (!card || card.querySelector('.nyaaBtn')) return;
                handleMB({
                    element_id: ratings.id, name: 'ratings',
                    series: {
                        romanized_title: cardType ? card.querySelector('div.line-clamp-2[title]')?.title : document.querySelector('h2')?.textContent,
                        title: cardType ? card.querySelector('a.line-clamp-2[title]')?.title : document.querySelector('h1')?.textContent,
                    },
                    list_config: { mode: 'list_dense' }
                }, cardType, cat);
            });
        }
    }
];

function handleMB(detail, cardType, cat) {
    if (!detail?.element_id || detail?.name !== 'ratings') return;
    const container = document.getElementById(detail.element_id);
    if (!container || container.querySelector('.nyaaBtn')) return; // Check specifically inside container
    
    const titleJap = (detail.series?.romanized_title || detail.series?.title || '').trim();
    const titleEng = (detail.series?.title || '').trim();

    if (!mbHandled) mbHandled = new Set();
    if (mbHandled.has(`${detail.element_id}|${titleJap}`)) return;
    mbHandled.add(`${detail.element_id}|${titleJap}`);

    container.querySelectorAll('.nyaaBtn').forEach(e => e.remove());
    const btn = createBtn(container, { cat });
    const px = ['list_dense', 'grid_dense'].includes(detail.list_config?.mode) ? { h: 'h-8', w: '58px' } : { h: 'h-10', w: '66px' };
    btn.classList.add('bg-secondary', 'hover:bg-secondary/80', 'inline-flex', 'items-center', 'justify-center', 'rounded-md', px.h);
    const img = btn.appendChild(document.createElement('img'));
    img.className = 'size-5';
    img.src = 'https://i.imgur.com/9Fr2BRG.png';
    createSearch(btn, getQuery(titleJap, titleEng, settings.query_setting), settings);
}

function init() {
    const domain = window.location.href;
    for (const site of SITES) {
        if (site.match.test(domain)) {
            site.run(domain);
            return;
        }
    }
}

const setCategory = (cat, media) => media === 'manga'? { '0_0': '3_0', '1_2': '3_1', '1_3': '3_2', '1_4': '3_3' }[cat] : cat;

const applyFlexBtnStyles = btn => Object.assign(btn.style, {
  display: btn.style.display !== 'none' ? 'flex' : btn.style.display,
  alignItems: 'center', justifyContent: 'center', height: '35px', borderRadius: '3px'
});

function createBtn(parent, { cat = '1_2', spicy = false, title = '' } = {}) {
    if(!parent) return;
    if(parent.querySelector('.nyaaBtn')) return parent.querySelector('.nyaaBtn');
    
    const btn = parent.appendChild(document.createElement('a'));
    btn.className = 'nyaaBtn';
    if (title) btn.title = title;
    
    if (settings.hide_button_setting) btn.style.display = 'none';
    if (settings.hotkey_key_setting) setupHotkey({ cat, spicy });
    
    btn.dataset.cat = cat;
    btn.dataset.spicy = spicy;
    return btn;
}

function createSearch(btn, query, settings) {
    if(!btn) return;
    const isSpicy = btn.dataset.spicy === 'true';
    const sub = isSpicy ? 'sukebei.' : '';
    const cat = isSpicy && btn.dataset.cat === '1_2' ? '1_1' : (btn.dataset.cat || settings.category_setting); 
    
    if (!btn.title) btn.textContent = `Search on ${isSpicy ? 'Sukebei' : 'Nyaa'}`;

    const url = new URL(`https://${sub}nyaa.si/`);
    
    // Validate required params to avoid 400 Bad Request
    const finalCat = cat || '1_2';
    const finalSort = settings.sort_setting || 'id';
    
    url.searchParams.set('f', settings.filter_setting);
    url.searchParams.set('c', finalCat);

    const qVal = query || '';
    const custom = settings.custom_text_toggle_setting ? settings.custom_text_setting : '';
    const speed = custom && !qVal.endsWith('"') ? ' ' : '';

    url.searchParams.set('q', qVal + speed + custom);
    url.searchParams.set('s', finalSort);
    url.searchParams.set('o', settings.order_setting);

    btn.href = url.toString();
    btn.target = '_blank';
    btn.rel = 'noopener noreferrer';
}

function setupHotkey(ctx) {
    // Security: Hotkey listener validates key before execution
    // The hotkey_key_setting is already validated in Storage.load()/save()
    if (hotkeyListener) document.removeEventListener('keydown', hotkeyListener);
    hotkeyListener = e => {
        const mod = settings.hotkey_modifier_setting;
        const match = mod ? e[mod] : !e.ctrlKey && !e.shiftKey && !e.altKey;
        // Security: Re-validate hotkey at runtime (defense in depth)
        if (match && InputValidator.isValidHotkey(settings.hotkey_key_setting) && e.key.toLowerCase() === settings.hotkey_key_setting) {
            const btn = document.querySelector('.nyaaBtn');
            if(!btn) return;

            // Temporary query override if needed, logic simplified for now
             if (settings.hotkey_query_setting !== 'inherit') {
                 // Would need to regenerate query here, but for now we follow click behavior
            }
            btn.dispatchEvent(new MouseEvent('click', { ctrlKey: settings.focus_setting }));
            e.preventDefault();
        }
    };
    document.addEventListener('keydown', hotkeyListener);
}

// ─────────────────────────────────────────────────────────────────────────────
// Query Strategies - Extracted for maintainability and testing
// ─────────────────────────────────────────────────────────────────────────────

const QueryStrategies = {
  // Default: Exact match with OR fallback (quoted)
  default: (titleJap, titleEng, baseJap, baseEng, sameBase) => {
    return sameBase 
      ? `"${titleJap}"|"${titleEng}"` 
      : `"${titleJap}"|"${titleEng}"|"${baseJap}"|"${baseEng}"`;
  },
  
  // Fuzzy Default: Unquoted OR search with all variants
  fuzzy_default: (titleJap, titleEng, baseJap, baseEng, sameBase) => {
    return sameBase 
      ? `${titleJap}|${titleEng}` 
      : `${titleJap}|${titleEng}|${baseJap}|${baseEng}`;
  },
  
  // Base: Only use normalized titles (stripped of editions/subtitles)
  base: (titleJap, titleEng, baseJap, baseEng, sameBase) => {
    return baseJap === baseEng 
      ? `"${titleJap}"|"${titleEng}"` 
      : `"${baseJap}"|"${baseEng}"`;
  },
  
  // Fuzzy: Japanese title only (unquoted)
  fuzzy: (titleJap) => titleJap,
  
  // Exact: Default fallback with quoted titles
  exact: (titleJap, titleEng) => `"${titleJap}"|"${titleEng}"`
};

function getQuery(titleJap, titleEng, queryType) {
  if (!titleJap && !titleEng) return ''; // Empty return safe
  
  // Sanitize: Remove quotes from input titles to avoid query injection
  if (titleJap) titleJap = titleJap.replace(/["]/g, '');
  if (titleEng) titleEng = titleEng.replace(/["]/g, '');
  
  // Single title: No need for OR query
  if (!titleEng || titleJap.toLowerCase() === titleEng.toLowerCase()) {
    return titleJap;
  }

  const baseJap = getBaseTitle(titleJap);
  const baseEng = getBaseTitle(titleEng);
  const sameBase = baseJap === titleJap && baseEng === titleEng;

  // Execute strategy or fallback to exact
  const strategy = QueryStrategies[queryType] || QueryStrategies.exact;
  return strategy(titleJap, titleEng, baseJap, baseEng, sameBase);
}

function getBaseTitle(baseTitle) {
  const hasSeason = /(?<![\w])(season)(?![\w])/i;
  const hasNum = /(?<![\w])[0-9]+(?:st|[nr]d|th)(?![\w])/i;
  const hasWord = /(?<![\w])(first|second|third|fourth|fifth|(the final|final))(?![\w])/i;
  const hasPart = /(?<![\w])(part )/i;
  const hasEndPunc = /[?!.]$/;

  baseTitle = baseTitle
    .replace(/[()[\]{}][^()[\]{}]*[)\]{}]/g, '')
    .replace(/([♡♥☆★♪∞])(?=\w)/g, ' ')
    .replace(/[♡♥☆★♪∞](?!\w)/g, '')
    .trim();

  if (baseTitle.includes(': ')) baseTitle = baseTitle.split(': ').shift();
  if (baseTitle.includes(' - ')) baseTitle = baseTitle.split(' - ').pop();
  if (hasPart.test(baseTitle)) baseTitle = baseTitle.split(/( part)/i).shift();

  if (hasSeason.test(baseTitle)) {
    if (hasNum.test(baseTitle) || hasWord.test(baseTitle)) {
      const titleNum = hasNum.test(baseTitle) ? baseTitle.match(hasNum)[0] : null;
      const titleWord = hasWord.test(baseTitle) ? baseTitle.match(hasWord)[0] : null;
      if (titleNum) baseTitle = baseTitle.split(` ${titleNum}`).shift();
      if (titleWord) baseTitle = baseTitle.split(` ${titleWord}`).shift();
    } else {
      baseTitle = baseTitle.split(/( season)/i).shift();
    }
  }

  while (hasEndPunc.test(baseTitle)) {
    baseTitle = baseTitle.split(baseTitle.match(hasEndPunc)[0]).shift();
  }

  return baseTitle;
}

const awaitLoadOf = (() => {
  let observer = null;
  let timer = null;
  const listeners = new Set();

  function check() {
    for (const listener of listeners) {
      const result = listener.match();
      if (result) {
        listener.resolve(result);
        listeners.delete(listener);
      }
    }
    if (listeners.size === 0) {
      if (observer) {
        observer.disconnect();
        observer = null;
      }
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    }
  }

  // Bolt: Debounce mutations to prevent UI jank during rapid DOM updates
  function onMutation() {
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      check();
    }, 20); // 20ms debounce (approx 1 frame)
  }

  return (selector, loadType, input) =>
    new Promise(resolve => {
      const matchSelector = () => {
        const root = input instanceof Element ? input : document;

        if (loadType === 'text') {
          const elms = document.querySelectorAll(selector);
          for (const elm of elms) if (elm.textContent.includes(input)) return elm;
        } else if (loadType === 'count') {
          if (!root) return null;
          const elms = root.querySelectorAll(selector);
          if (elms.length >= (root.childElementCount || 1)) return Array.from(elms);
        } else if (loadType === 'container') {
          const elm = document.querySelector(selector);
          if (elm && elm.childElementCount >= 1) return elm;
        }
        return null;
      };

      const initialMatch = matchSelector();
      if (initialMatch) return resolve(initialMatch);

      const listener = { match: matchSelector, resolve };
      listeners.add(listener);

      if (!observer) {
        // Bolt: Optimized element detection using MutationObserver for immediate reaction
        observer = new MutationObserver(onMutation);
        // Robustness: Handle rare case where body is missing (e.g. run-at document-start)
        const target = document.body || document.documentElement || document;
        observer.observe(target, { childList: true, subtree: true });
      }
    });
})();

settings = Storage.load();
currentPage = window.location.href.split('/')[4];
init();

// Bolt: Optimized URL change detection using Polling (500ms) instead of global MutationObserver
// This is robust against sandbox isolation issues and SPA lifecycles while being much lighter than MutationObserver.
setInterval(() => {
  if (window.location.href.split('/')[4] !== currentPage) {
    currentPage = window.location.href.split('/')[4];
    removeNyaaBtns();
    init();
  }
}, 500);
