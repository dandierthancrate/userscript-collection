// ==UserScript==
// @name         Disable YouTube Channel Autoplay
// @namespace    https://docs.scriptcat.org/
// @match        https://www.youtube.com/*
// @exclude      https://www.youtube.com/embed/*
// @run-at       document-start
// @version      1.0.11
// @author       Antigravity
// @description  Prevents featured videos from autoplaying on channel pages
// @license      MIT
// @updateURL    https://raw.githubusercontent.com/dandierthancrate/userscript-collection/main/disable-youtube-channel-autoplay.user.js
// @downloadURL  https://raw.githubusercontent.com/dandierthancrate/userscript-collection/main/disable-youtube-channel-autoplay.user.js
// ==/UserScript==

(function () {
  'use strict';
  if (window.self !== window.top) return; // Don't run in embeds

  const CHANNEL_PATTERNS = ['/@', '/channel/', '/c/', '/user/'];
  const isChannelPage = () => CHANNEL_PATTERNS.some(p => location.pathname.startsWith(p));

  let pausedForPath = null;

  const blockAutoplay = () => {
    if (!isChannelPage() || pausedForPath === location.pathname) return;

    const player = document.querySelector('#c4-player');
    if (!player || typeof player.pauseVideo !== 'function') return;

    player.pauseVideo();
    pausedForPath = location.pathname;
  };

  new MutationObserver(blockAutoplay).observe(document.documentElement, { childList: true, subtree: true });

  document.addEventListener('yt-navigate-finish', () => {
    pausedForPath = null;
    [100, 500].forEach(ms => setTimeout(blockAutoplay, ms));
  });
})();
