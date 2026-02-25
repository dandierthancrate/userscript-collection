// ==UserScript==
// @name         Disable YouTube Playlist Autoplay
// @namespace    https://github.com/dandierthancrate/userscript-collection
// @version      1.0.12
// @description  Stops video at end, prevents playlist auto-advance
// @author       dandierthancrate
// @match        https://www.youtube.com/*
// @exclude      https://www.youtube.com/embed/*
// @run-at       document-idle
// @license      GPL-3.0-or-later
// @updateURL    https://raw.githubusercontent.com/dandierthancrate/userscript-collection/main/disable-youtube-playlist-autoplay.user.js
// @downloadURL  https://raw.githubusercontent.com/dandierthancrate/userscript-collection/main/disable-youtube-playlist-autoplay.user.js
// ==/UserScript==

(function () {
  'use strict';
  if (window.self !== window.top) return; // Don't run in embeds

  let userTriggered = false;

  const isPlaylist = () => location.search.includes('list=');
  const getPlayer = () => document.querySelector('#movie_player');

  const hookPlayer = (player = getPlayer()) => {
    if (!player || player._noAutoAdvance) return;
    player._noAutoAdvance = true;

    // Wrap methods that trigger auto-advance
    ['nextVideo', 'queueNextVideo'].forEach(name => {
      const orig = player[name];
      if (typeof orig !== 'function') return;
      player[name] = function (...args) {
        if (!isPlaylist()) return orig.apply(this, args);
        if (userTriggered) {
          userTriggered = false;
          return orig.apply(this, args);
        }
        if (name === 'nextVideo') player.pauseVideo?.();
      };
    });

    // Force autonav off on playlists
    ['setAutonav', 'setAutonavState'].forEach(name => {
      const orig = player[name];
      if (typeof orig !== 'function') return;
      player[name] = function (state) {
        return orig.call(this, isPlaylist() ? (name === 'setAutonav' ? false : 0) : state);
      };
    });
  };

  const hookPlaylistManager = (ypm = document.querySelector('yt-playlist-manager')) => {
    if (!ypm || ypm._noAutoAdvance) return;
    ypm._noAutoAdvance = true;

    const freeze = (obj, prop) => {
      if (!(prop in obj)) return;
      Object.defineProperty(obj, prop, {
        get: () => false,
        set: () => {},
        configurable: true
      });
    };
    freeze(ypm, 'canAutoAdvance_');
    if (ypm.polymerController) freeze(ypm.polymerController, 'canAutoAdvance_');
  };

  const bindVideoEnd = (video = document.querySelector('video.html5-main-video')) => {
    if (!video || video._noAutoAdvance) return;
    video._noAutoAdvance = true;

    video.addEventListener('ended', () => {
      if (!isPlaylist()) return;
      const player = getPlayer();
      [0, 50, 150].forEach(ms => setTimeout(() => player?.pauseVideo?.(), ms));
    });
  };

  const trackUserAction = () => {
    document.addEventListener('click', e => {
      if (e.target.closest('ytd-playlist-panel-video-renderer, .ytp-next-button, [class*="next"]')) {
        userTriggered = true;
      }
    }, true);
    document.addEventListener('keydown', e => {
      if ((e.shiftKey && e.key === 'N') || e.key === 'MediaTrackNext') userTriggered = true;
    }, true);
  };

  const init = () => {
    hookPlayer();
    hookPlaylistManager();
    bindVideoEnd();
  };

  const addAnimationObserver = () => {
    const style = document.createElement('style');
    style.textContent = `
      @keyframes playlistAutoplayNodeInserted { from { opacity: 0.99; } to { opacity: 1; } }
      #movie_player, yt-playlist-manager, video.html5-main-video {
        animation-duration: 0.001s;
        animation-name: playlistAutoplayNodeInserted;
      }
    `;
    (document.head || document.documentElement).appendChild(style);

    document.addEventListener('animationstart', (e) => {
      if (e.animationName !== 'playlistAutoplayNodeInserted') return;
      const target = e.target;
      if (!target) return;

      if (target.matches('#movie_player')) hookPlayer(target);
      if (target.matches('yt-playlist-manager')) hookPlaylistManager(target);
      if (target.matches('video.html5-main-video')) bindVideoEnd(target);
    });
  };

  trackUserAction();
  document.addEventListener('yt-navigate-finish', init);

  // Optimization: Use CSS Animation Observer instead of global MutationObserver (O(1) vs O(N))
  addAnimationObserver();
  init();
})();
