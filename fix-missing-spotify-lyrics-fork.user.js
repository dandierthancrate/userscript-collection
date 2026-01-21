// ==UserScript==
// @name         Fix Missing Spotify Lyrics Fork
// @namespace    https://chromewebstore.google.com/detail/kakcldiibcfekhiflfafngmkbgcdapko?utm_source=item-share-cb
// @match        https://open.spotify.com/*
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// @connect      lrclib.net
// @connect      lyrics.com
// @version      1.1.1
// @author       Antigravity
// @description  Fetches missing lyrics from LRCLIB/lyrics.com when Spotify has none
// @license      GPL-3.0-or-later
// ==/UserScript==

(function () {
  'use strict';

  let hasFetchedLyrics = false;

  const gmFetch = (url, json = false) =>
    new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url,
        headers: json ? { 'User-Agent': 'FixMissingSpotifyLyrics/1.1.1' } : undefined,
        onload: res => {
          if (json && res.status !== 200) reject(new Error(`HTTP ${res.status}`));
          else resolve(json ? JSON.parse(res.responseText) : res.responseText);
        },
        onerror: reject
      });
    });

  const escapeRegex = str => str.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');

  const getPrimaryArtist = () =>
    document.querySelector('[data-testid="context-item-info-subtitles"] span a')?.textContent?.trim();

  const getTrackDuration = () => {
    const el = document.querySelector('[data-testid="playback-duration"]');
    if (!el) return null;
    const [m, s] = el.textContent.split(':').map(Number);
    return m * 60 + s;
  };

  const getTitleVariants = title => {
    const base = title.trim();
    const dashSplit = title.split(/\s*-\s*/)[0].trim();
    const parenRemoved = title.replace(/\s*\(.*?\)\s*$/, '').trim();
    const combined = dashSplit.replace(/\s*\(.*?\)\s*$/, '').trim();
    return [...new Set([base, dashSplit, parenRemoved, combined])];
  };

  const fetchFromLrclib = async (artist, title) => {
    const duration = getTrackDuration();
    const params = new URLSearchParams({ artist_name: artist, track_name: title, ...(duration && { duration }) });
    const data = await gmFetch(`https://lrclib.net/api/get?${params}`, true);
    return data?.plainLyrics || data?.syncedLyrics?.replace(/\[\d+:\d+\.\d+\]/g, '').trim() || null;
  };

  const fetchFromLyricsCom = async (artist, title) => {
    const encode = str => encodeURIComponent(str).replace(/!/g, '%21').replace(/\(/g, '%28').replace(/\)/g, '%29').replace(/\./g, '%2E');
    const formatArtist = name => encode(name.trim().replace(/\s+/g, '-'));
    const formatSong = name => encode(name.trim()).replace(/%20/g, '+');

    const searchHtml = await gmFetch(`https://www.lyrics.com/serp.php?st=${encode(artist)}&qtype=2`);
    const artistMatch = searchHtml.match(new RegExp(`<a href="artist\\/${formatArtist(artist)}\\/\\d+"[^>]*>`, 'i'));
    if (!artistMatch) return null;

    const artistPath = artistMatch[0].match(/href="([^"]+)"/)[1];
    const artistHtml = await gmFetch(`https://www.lyrics.com/${artistPath}`);

    let songMatch = null;
    for (const variant of getTitleVariants(title)) {
      const regex = new RegExp(`<a href="(\\/lyric(?:-lf)?\\/\\d+\\/[^"]*\\/${escapeRegex(formatSong(variant))})"[^>]*>`, 'i');
      songMatch = artistHtml.match(regex);
      if (songMatch) break;
    }
    if (!songMatch) return null;

    const songHtml = await gmFetch(`https://www.lyrics.com${songMatch[1]}`);
    const lyricsMatch = songHtml.match(/<pre id="lyric-body-text"[^>]*>([\s\S]*?)<\/pre>/);
    return lyricsMatch?.[1].replace(/<a[^>]*>|<\/a>/g, '').trim() || null;
  };

  const PROVIDERS = [
    { name: 'LRCLIB', fetch: fetchFromLrclib },
    { name: 'lyrics.com', fetch: fetchFromLyricsCom }
  ];

  const fetchLyrics = async () => {
    if (hasFetchedLyrics) return;
    hasFetchedLyrics = true;

    await new Promise(r => setTimeout(r, 1500));

    if (document.querySelector('[data-testid="fullscreen-lyric"]')) return;

    const span = document.querySelector('div[style*="--lyrics-color-background"] span');
    if (!span) return;

    const rawTitle = document.title;
    if (!rawTitle.includes('•')) return;

    const songTitle = rawTitle.split('•')[0].trim();
    const artistName = getPrimaryArtist() || 'Unknown';

    Object.assign(span.style, { color: '#eeeeee', fontWeight: 'normal' });
    span.textContent = 'Fetching lyrics...';

    for (const provider of PROVIDERS) {
      try {
        const lyrics = await provider.fetch(artistName, songTitle);
        if (lyrics) {
          span.innerHTML = `<div style="white-space:pre-wrap;font-size:0.5em"><strong>${lyrics}</strong></div>`;
          return;
        }
      } catch { /* try next provider */ }
    }

    span.textContent = `Lyrics not found for "${songTitle}" by "${artistName}"`;
  };

  // Observe lyrics button activation
  new MutationObserver(() => {
    const btn = document.querySelector('[data-testid="lyrics-button"]');
    if (btn?.getAttribute('data-active') === 'true') fetchLyrics();
  }).observe(document.body, { childList: true, subtree: true });

  // Reset fetch state on title change (song change)
  new MutationObserver(() => { hasFetchedLyrics = false; })
    .observe(document.querySelector('title'), { childList: true });
})();
