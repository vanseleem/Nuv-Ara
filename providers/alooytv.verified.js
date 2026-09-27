'use strict';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36';

const DOMAIN = 'https://dm.alooytv16.xyz';

function decodeHtml(str) {
  return String(str)
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function clean(str) {
  return decodeHtml(String(str || ''))
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function get(url, referer = DOMAIN + '/') {
  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept':
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Referer': referer
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(15000)
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }

  return await res.text();
}

function extractWatchLinks(html, base) {
  const out = [];

  const re = /href\s*=\s*["']([^"']+)["']/gi;
  let m;

  while ((m = re.exec(html)) !== null) {
    let href = decodeHtml(m[1]).trim();

    if (!href) continue;

    try {
      href = new URL(href, base).href;
    } catch (_) {
      continue;
    }

    if (!/\/watch\//i.test(href)) continue;

    if (!out.includes(href)) {
      out.push(href);
    }
  }

  return out;
}

function extractEpisodeLink(html, base, wantedEpisode) {
  const wanted = Number(wantedEpisode);

  /*
   * Match individual <a> elements first.
   * Do NOT use a loose regex across multiple anchors.
   */
  const anchorRe = /<a\b[^>]*>[\s\S]*?<\/a>/gi;

  let anchor;

  while ((anchor = anchorRe.exec(html)) !== null) {
    const tag = anchor[0];

    /*
     * The actual Alooy episode buttons contain:
     *
     *   href=".../watch/XXXX.html?key=XXXXXXXX"
     *   ...
     *   Ep#1
     *
     * Extract href and visible episode number independently.
     */
    const hrefMatch =
      tag.match(/\bhref\s*=\s*["']([^"']+)["']/i);

    if (!hrefMatch) continue;

    const episodeMatch =
      tag.match(/Ep\s*#\s*(\d+)/i);

    if (!episodeMatch) continue;

    const ep = Number(episodeMatch[1]);

    if (ep !== wanted) continue;

    const rawHref = decodeHtml(hrefMatch[1]).trim();

    if (!rawHref) continue;

    let absolute;

    try {
      absolute = new URL(rawHref, base).href;
    } catch (_) {
      continue;
    }

    /*
     * Never accept the domain root or a generic link.
     * A valid Alooy episode URL MUST have /watch/ and ?key=.
     */
    if (!/\/watch\//i.test(absolute)) continue;
    if (!/[?&]key=/i.test(absolute)) continue;

    return absolute;
  }

  return null;
}

function extractSources(html) {
  const sources = [];

  function add(url) {
    if (!url) return;

    url = decodeHtml(url).trim();

    if (url.startsWith('//')) {
      url = 'https:' + url;
    }

    if (!/^https?:\/\//i.test(url)) {
      return;
    }

    if (!sources.includes(url)) {
      sources.push(url);
    }
  }

  // Primary: HTML5 video source.
  const sourceRe =
    /<source\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi;

  let m;

  while ((m = sourceRe.exec(html)) !== null) {
    add(m[1]);
  }

  /*
   * Secondary: Alooy download link.
   * Example:
   * download_video.php?video_url=BASE64
   */
  const downloadRe =
    /download_video\.php\?[^"'<>]*?\bvideo_url=([^&"'<>]+)/gi;

  while ((m = downloadRe.exec(html)) !== null) {
    try {
      let encoded = decodeURIComponent(m[1]);

      encoded = encoded
        .replace(/-/g, '+')
        .replace(/_/g, '/');

      while (encoded.length % 4) {
        encoded += '=';
      }

      const decoded = Buffer
        .from(encoded, 'base64')
        .toString('utf8');

      add(decoded);
    } catch (_) {}
  }

  /*
   * Alooy sometimes gives the same episode through different
   * vid servers. Keep one URL per actual episode file path.
   */
  const unique = [];
  const seenPaths = new Set();

  for (const url of sources) {
    try {
      const u = new URL(url);

      const key = u.pathname;

      if (seenPaths.has(key)) {
        continue;
      }

      seenPaths.add(key);
      unique.push(url);
    } catch (_) {
      if (!unique.includes(url)) {
        unique.push(url);
      }
    }
  }

  return unique;
}

function qualityFromUrl(url) {
  const s = String(url).toLowerCase();

  if (/2160|4k/.test(s)) return '4K';
  if (/1440/.test(s)) return '1440p';
  if (/1080/.test(s)) return '1080p';
  if (/720/.test(s)) return '720p';
  if (/480/.test(s)) return '480p';
  if (/360/.test(s)) return '360p';

  return 'Unknown';
}

function makeStream(url, episode) {
  return {
    name: 'AlooyTV',
    title: `AlooyTV • Episode ${episode}`,
    url,
    quality: qualityFromUrl(url),
    headers: {
      'User-Agent': USER_AGENT,
      'Referer': DOMAIN + '/'
    }
  };
}

async function tmdbTitles(tmdbId) {
  const urls = [
    `https://www.themoviedb.org/tv/${encodeURIComponent(tmdbId)}?language=ar`,
    `https://www.themoviedb.org/tv/${encodeURIComponent(tmdbId)}?language=en`
  ];

  const titles = [];

  for (const url of urls) {
    try {
      const html = await get(url);

      const patterns = [
        /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
        /<title[^>]*>([\s\S]*?)<\/title>/i
      ];

      for (const re of patterns) {
        const m = html.match(re);

        if (!m) continue;

        let title = clean(m[1]);

        title = title
          .replace(/\s*\(TV Series[^)]*\).*$/i, '')
          .replace(/\s*—\s*The Movie Database.*$/i, '')
          .trim();

        if (title && !titles.includes(title)) {
          titles.push(title);
        }
      }
    } catch (_) {}
  }

  return titles;
}

async function searchAlooy(title) {
  if (!title) return [];

  const url =
    `${DOMAIN}/search?q=${encodeURIComponent(title)}`;

  const html = await get(url, DOMAIN + '/');

  return extractWatchLinks(html, url);
}

async function getStreams(tmdbId, mediaType, season, episode) {
  console.log(
    '[AlooyTV] Request:',
    tmdbId,
    mediaType,
    season,
    episode
  );

  if (!tmdbId) return [];
  if (mediaType !== 'tv') return [];
  if (!episode) return [];

  const wantedEpisode = Number(episode);

  if (!Number.isFinite(wantedEpisode) || wantedEpisode < 1) {
    return [];
  }

  const titles = await tmdbTitles(tmdbId);

  console.log('[AlooyTV] Titles:', titles);

  if (!titles.length) {
    return [];
  }

  const watchPages = [];

  // Search clean titles only.
  for (const title of titles) {
    try {
      const found = await searchAlooy(title);

      console.log(
        '[AlooyTV] Search:',
        title,
        '=>',
        found.length,
        'watch links'
      );

      for (const link of found) {
        if (!watchPages.includes(link)) {
          watchPages.push(link);
        }
      }

      // Once we find the actual series, stop searching.
      if (found.length) {
        break;
      }
    } catch (e) {
      console.log(
        '[AlooyTV] Search failed:',
        title,
        e.message
      );
    }
  }

  console.log('[AlooyTV] Watch pages:', watchPages.length);

  const streams = [];
  const seen = new Set();

  for (const watchUrl of watchPages) {
    try {
      const seriesHtml = await get(
        watchUrl,
        DOMAIN + '/'
      );

      const episodeUrl = extractEpisodeLink(
        seriesHtml,
        watchUrl,
        wantedEpisode
      );

      console.log(
        `[AlooyTV] Episode ${wantedEpisode} link:`,
        episodeUrl || 'NOT FOUND'
      );

      if (!episodeUrl) {
        continue;
      }

      /*
       * Critical:
       * Fetch the episode-specific URL with the series page
       * as Referer.
       */
      const episodeHtml = await get(
        episodeUrl,
        watchUrl
      );

      const sources = extractSources(episodeHtml);

      console.log(
        `[AlooyTV] Episode ${wantedEpisode} sources:`,
        sources.length
      );

      for (const source of sources) {
        if (seen.has(source)) {
          continue;
        }

        seen.add(source);
        streams.push(
          makeStream(source, wantedEpisode)
        );
      }

      if (streams.length) {
        break;
      }
    } catch (e) {
      console.log(
        '[AlooyTV] Watch/episode failed:',
        watchUrl,
        e.message
      );
    }
  }

  console.log(
    '[AlooyTV] Final streams:',
    streams.length
  );

  return streams;
}

module.exports = {
  getStreams
};
