'use strict';

const fetch = global.fetch;

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36';

const DOMAINS = [
  'https://dm.alooytv16.xyz',
  'https://alooytv.tv',
  'https://alooytv2.top'
];

function clean(text) {
  return String(text || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#8212;/gi, '—')
    .replace(/&#x2014;/gi, '—')
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeHtml(str) {
  return String(str || '')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

async function get(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    },
    redirect: 'follow',
    timeout: 15000
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }

  return await res.text();
}

function extractTitles(html) {
  const titles = [];

  const patterns = [
    /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+name=["']title["'][^>]+content=["']([^"']+)["']/i,
    /<title[^>]*>([\s\S]*?)<\/title>/i
  ];

  for (const re of patterns) {
    const m = html.match(re);
    if (m) {
      const t = clean(decodeHtml(m[1]));
      if (t && !titles.includes(t)) titles.push(t);
    }
  }

  return titles;
}

function extractWatchLinks(html, base) {
  const out = [];

  const re = /href\s*=\s*["']([^"']+)["']/gi;
  let m;

  while ((m = re.exec(html))) {
    let href = decodeHtml(m[1]).trim();

    if (!href) continue;

    try {
      href = new URL(href, base).href;
    } catch (_) {
      continue;
    }

    if (/\/watch\//i.test(href)) {
      if (!out.includes(href)) out.push(href);
    }
  }

  return out;
}

function extractEpisodeLinks(html, base, wantedEpisode) {
  const out = [];

  /*
   * Alooy's actual episode buttons look like:
   *
   * href=".../watch/XXXX.html?key=XXXXXXXXXXXX">Ep#30</a>
   *
   * We deliberately match the visible Ep#N text so we don't
   * accidentally select a different key from the same page.
   */

  const re =
    /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>[\s\S]*?Ep\s*#\s*(\d+)[\s\S]*?<\/a>/gi;

  let m;

  while ((m = re.exec(html))) {
    const href = decodeHtml(m[1]).trim();
    const ep = Number(m[2]);

    if (!Number.isFinite(ep)) continue;

    if (ep === Number(wantedEpisode)) {
      try {
        const absolute = new URL(href, base).href;
        if (!out.includes(absolute)) out.push(absolute);
      } catch (_) {}
    }
  }

  return out;
}

function extractSources(html) {
  const sources = [];

  const patterns = [
    /<source\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi,
    /<source\b[^>]*src\s*=\s*["']([^"']+)["'][^>]*>/gi
  ];

  for (const re of patterns) {
    let m;

    while ((m = re.exec(html))) {
      let url = decodeHtml(m[1]).trim();

      if (!url) continue;

      if (url.startsWith('//')) {
        url = 'https:' + url;
      }

      if (!/^https?:\/\//i.test(url)) continue;

      if (!sources.includes(url)) {
        sources.push(url);
      }
    }
  }

  return sources;
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
      'Referer': 'https://dm.alooytv16.xyz/'
    }
  };
}

async function tmdbTitles(tmdbId) {
  const urls = [
    `https://www.themoviedb.org/tv/${tmdbId}?language=ar-SA`,
    `https://www.themoviedb.org/tv/${tmdbId}?language=ar`,
    `https://www.themoviedb.org/tv/${tmdbId}?language=en-US`
  ];

  const titles = [];

  for (const url of urls) {
    try {
      const html = await get(url);
      const found = extractTitles(html);

      for (const t of found) {
        if (!titles.includes(t)) titles.push(t);
      }
    } catch (e) {
      console.log('[AlooyTV] TMDB failed:', e.message);
    }
  }

  return titles;
}

async function searchAlooy(title) {
  const results = [];

  for (const domain of DOMAINS) {
    const searchUrls = [
      `${domain}/search?q=${encodeURIComponent(title)}`,
      `${domain}/search/${encodeURIComponent(title)}`
    ];

    for (const url of searchUrls) {
      try {
        const html = await get(url);

        const links = extractWatchLinks(html, url);

        for (const link of links) {
          if (!results.includes(link)) results.push(link);
        }

        if (links.length) {
          console.log('[AlooyTV] Search:', title, '=>', links.length, 'watch links');
        }
      } catch (e) {
        console.log('[AlooyTV] Search failed:', domain, e.message);
      }
    }
  }

  return results;
}

async function getStreams(tmdbId, mediaType, season, episode) {
  console.log('[AlooyTV] Request:', tmdbId, mediaType, season, episode);

  if (!tmdbId) return [];
  if (mediaType !== 'tv') return [];
  if (!episode) return [];

  const wantedEpisode = Number(episode);

  if (!Number.isFinite(wantedEpisode) || wantedEpisode < 1) {
    return [];
  }

  const titles = await tmdbTitles(tmdbId);

  console.log('[AlooyTV] Localized titles:', titles);

  if (!titles.length) {
    console.log('[AlooyTV] No TMDB titles found');
    return [];
  }

  const watchPages = [];

  for (const title of titles) {
    const found = await searchAlooy(title);

    for (const link of found) {
      if (!watchPages.includes(link)) {
        watchPages.push(link);
      }
    }
  }

  console.log('[AlooyTV] Watch pages:', watchPages.length);

  const streams = [];
  const seen = new Set();

  /*
   * First pass:
   * Find the exact Ep#N link on the series/watch page.
   */
  for (const watchUrl of watchPages) {
    try {
      const html = await get(watchUrl);

      const episodeLinks =
        extractEpisodeLinks(html, watchUrl, wantedEpisode);

      console.log(
        `[AlooyTV] Episode ${wantedEpisode} links from ${watchUrl}:`,
        episodeLinks.length
      );

      /*
       * Fetch ONLY the requested episode page.
       */
      for (const episodeUrl of episodeLinks) {
        try {
          const episodeHtml = await get(episodeUrl);

          const sources = extractSources(episodeHtml);

          console.log(
            `[AlooyTV] Episode ${wantedEpisode} sources:`,
            sources.length
          );

          for (const source of sources) {
            if (seen.has(source)) continue;

            seen.add(source);
            streams.push(makeStream(source, wantedEpisode));
          }
        } catch (e) {
          console.log(
            '[AlooyTV] Episode page failed:',
            episodeUrl,
            e.message
          );
        }
      }
    } catch (e) {
      console.log('[AlooyTV] Watch page failed:', watchUrl, e.message);
    }
  }

  /*
   * Fallback:
   * If a watch page itself is already an episode-specific page
   * and contains the requested episode source, allow it only
   * when its URL explicitly has ?key=.
   *
   * This prevents the old bug where the complete series page
   * returned every episode.
   */
  if (!streams.length) {
    for (const watchUrl of watchPages) {
      if (!/[?&]key=/i.test(watchUrl)) continue;

      try {
        const html = await get(watchUrl);
        const sources = extractSources(html);

        for (const source of sources) {
          if (seen.has(source)) continue;

          seen.add(source);
          streams.push(makeStream(source, wantedEpisode));
        }
      } catch (_) {}
    }
  }

  console.log('[AlooyTV] Final streams:', streams.length);

  return streams;
}

module.exports = {
  getStreams
};
