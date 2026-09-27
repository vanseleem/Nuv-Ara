'use strict';

/*
 * AlooyTV Nuvio Provider
 *
 * Search -> Watch page -> direct <source src> extraction
 *
 * Handles:
 *   - Movies
 *   - TV / series episodes
 *   - Arabic/original-title lookup from TMDB localized page
 *   - Multiple Alooy domains
 *   - Relative/escaped video URLs
 *   - Multiple <source> elements
 *
 * Nuvio API:
 *   getStreams(tmdbId, mediaType, season, episode)
 */

const PROVIDER = 'AlooyTV';

const DOMAINS = [
  'https://dm.alooytv16.xyz',
  'https://alooytv.tv',
  'https://alooytv2.top'
];

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/153.0.0.0 Safari/537.36';

const FETCH_HEADERS = {
  'User-Agent': UA,
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'ar,en-US;q=0.9,en;q=0.8'
};

function clean(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\\\//g, '/')
    .trim();
}

function decodeUrl(value) {
  return clean(value)
    .replace(/\\u0026/g, '&')
    .replace(/\\u003d/g, '=')
    .replace(/\\u002f/g, '/')
    .replace(/&amp;/g, '&');
}

function absoluteUrl(url, base) {
  if (!url) return '';

  url = decodeUrl(url);

  if (/^https?:\/\//i.test(url)) return url;

  if (url.startsWith('//')) {
    return 'https:' + url;
  }

  if (url.startsWith('/')) {
    return base.replace(/\/+$/, '') + url;
  }

  return base.replace(/\/+$/, '') + '/' + url.replace(/^\/+/, '');
}

function qualityFromUrl(url) {
  const u = String(url || '').toLowerCase();

  if (/2160|4k|uhd/.test(u)) return '4K';
  if (/1440/.test(u)) return '1440p';
  if (/1080/.test(u)) return '1080p';
  if (/720/.test(u)) return '720p';
  if (/576/.test(u)) return '576p';
  if (/480/.test(u)) return '480p';
  if (/360/.test(u)) return '360p';

  return 'HD';
}

function unique(values) {
  const seen = Object.create(null);
  const out = [];

  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (!v || seen[v]) continue;
    seen[v] = true;
    out.push(v);
  }

  return out;
}

function fetchText(url, options) {
  return fetch(url, Object.assign({
    method: 'GET',
    headers: FETCH_HEADERS
  }, options || {}))
    .then(function (res) {
      if (!res.ok) {
        throw new Error('HTTP ' + res.status + ' for ' + url);
      }

      return res.text();
    });
}

/*
 * Get Arabic/original title from TMDB's localized web page.
 *
 * This avoids the known problem where TMDB gives:
 *   "The time has passed"
 *
 * while AlooyTV searches:
 *   "فات الميعاد"
 */
function getArabicTitle(tmdbId, mediaType) {
  const type = mediaType === 'movie' ? 'movie' : 'tv';

  const urls = [
    'https://www.themoviedb.org/' + type + '/' + encodeURIComponent(tmdbId) + '?language=ar-SA',
    'https://www.themoviedb.org/' + type + '/' + encodeURIComponent(tmdbId) + '?language=ar'
  ];

  function tryUrl(index) {
    if (index >= urls.length) {
      return Promise.resolve([]);
    }

    return fetchText(urls[index])
      .then(function (html) {
        const titles = [];

        let m = html.match(
          /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i
        );

        if (m && m[1]) titles.push(clean(m[1]));

        m = html.match(
          /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i
        );

        if (m && m[1]) titles.push(clean(m[1]));

        m = html.match(
          /<title[^>]*>\s*([^<]+?)\s*<\/title>/i
        );

        if (m && m[1]) {
          titles.push(clean(m[1].replace(/\s*\|\s*TMDB.*$/i, '')));
        }

        return unique(titles);
      })
      .catch(function () {
        return tryUrl(index + 1);
      });
  }

  return tryUrl(0);
}

/*
 * Search AlooyTV.
 */
function searchDomain(domain, title) {
  const url =
    domain.replace(/\/+$/, '') +
    '/search?q=' +
    encodeURIComponent(title);

  return fetchText(url)
    .then(function (html) {
      const results = [];

      /*
       * Collect links that look like Alooy watch pages.
       */
      const re =
        /href\s*=\s*["']([^"']*\/watch\/[^"']+)["'][^>]*>/gi;

      let match;

      while ((match = re.exec(html)) !== null) {
        results.push(absoluteUrl(match[1], domain));
      }

      /*
       * Some versions of the site put the URL in JSON/JS.
       */
      const re2 =
        /["']([^"']*\/watch\/[^"']+)["']/gi;

      while ((match = re2.exec(html)) !== null) {
        results.push(absoluteUrl(match[1], domain));
      }

      return unique(results);
    });
}

/*
 * Search all known domains.
 */
function searchAlooy(titles) {
  const searches = [];

  for (let i = 0; i < DOMAINS.length; i++) {
    for (let j = 0; j < titles.length; j++) {
      if (!titles[j]) continue;

      searches.push(
        searchDomain(DOMAINS[i], titles[j])
          .catch(function (err) {
            console.log(
              '[' + PROVIDER + '] Search failed:',
              DOMAINS[i],
              err.message
            );
            return [];
          })
      );
    }
  }

  return Promise.all(searches)
    .then(function (groups) {
      let urls = [];

      for (let i = 0; i < groups.length; i++) {
        urls = urls.concat(groups[i]);
      }

      return unique(urls);
    });
}

/*
 * Extract direct video sources from a watch page.
 */
function extractSources(html, pageUrl) {
  const sources = [];

  /*
   * Normal HTML:
   * <source src="https://...mp4">
   */
  let re =
    /<source\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi;

  let match;

  while ((match = re.exec(html)) !== null) {
    sources.push(absoluteUrl(match[1], getOrigin(pageUrl)));
  }

  /*
   * src first:
   * <source src=... type=...>
   */
  re =
    /\bsrc\s*=\s*["']([^"']+\.(?:mp4|m3u8)(?:\?[^"']*)?)["']/gi;

  while ((match = re.exec(html)) !== null) {
    sources.push(absoluteUrl(match[1], getOrigin(pageUrl)));
  }

  /*
   * JSON / JS escaped URLs.
   */
  re =
    /["'](https?:\\?\/\\?\/[^"']+\.(?:mp4|m3u8)(?:\?[^"']*)?)["']/gi;

  while ((match = re.exec(html)) !== null) {
    sources.push(
      decodeUrl(match[1])
    );
  }

  /*
   * Plain direct video URLs anywhere in the page.
   */
  re =
    /https?:\/\/[^"'\\\s<>]+?\.(?:mp4|m3u8)(?:\?[^"'\\\s<>]*)?/gi;

  while ((match = re.exec(html)) !== null) {
    sources.push(decodeUrl(match[0]));
  }

  return unique(
    sources.filter(function (url) {
      return /^https?:\/\//i.test(url);
    })
  );
}

function getOrigin(url) {
  const m = String(url || '').match(
    /^(https?:\/\/[^\/]+)/i
  );

  return m ? m[1] : url;
}

/*
 * Fetch a watch page and extract playable sources.
 */
function getWatchSources(url) {
  return fetchText(url, {
    headers: Object.assign({}, FETCH_HEADERS, {
      Referer: url
    })
  })
    .then(function (html) {
      return {
        page: url,
        sources: extractSources(html, url),
        html: html
      };
    })
    .catch(function (err) {
      console.log(
        '[' + PROVIDER + '] Watch failed:',
        url,
        err.message
      );

      return {
        page: url,
        sources: [],
        html: ''
      };
    });
}

/*
 * Try to turn a search/watch page into direct video URLs.
 *
 * For series pages Alooy may expose episode keys/links.
 */
function findEpisodeLinks(html, pageUrl, season, episode) {
  const links = [];

  /*
   * Direct episode/watch links.
   */
  let re =
    /href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]{0,300})<\/a>/gi;

  let match;

  while ((match = re.exec(html)) !== null) {
    const href = match[1];
    const text = clean(match[2]);

    const looksLikeEpisode =
      /episode|الحلقة|حلقة|ep\b/i.test(text + ' ' + href);

    const epNumber =
      String(episode || '').replace(/\D/g, '');

    if (
      looksLikeEpisode &&
      (!epNumber || text.indexOf(epNumber) !== -1 || href.indexOf(epNumber) !== -1)
    ) {
      links.push(absoluteUrl(href, getOrigin(pageUrl)));
    }
  }

  /*
   * ?key= links are important on AlooyTV.
   */
  re =
    /(?:href|data-href)\s*=\s*["']([^"']*\?key=[^"']+)["']/gi;

  while ((match = re.exec(html)) !== null) {
    links.push(
      absoluteUrl(match[1], getOrigin(pageUrl))
    );
  }

  return unique(links);
}

/*
 * Try to find an appropriate watch page for a movie/series.
 */
function resolveWatchPages(titles, mediaType, season, episode) {
  return searchAlooy(titles)
    .then(function (watchPages) {
      if (!watchPages.length) {
        console.log(
          '[' + PROVIDER + '] No watch pages found for:',
          titles.join(' | ')
        );

        return [];
      }

      console.log(
        '[' + PROVIDER + '] Watch pages:',
        watchPages.length
      );

      return Promise.all(
        watchPages.slice(0, 8).map(getWatchSources)
      )
        .then(function (pages) {
          const direct = [];

          for (let i = 0; i < pages.length; i++) {
            const p = pages[i];

            /*
             * If the page itself contains direct sources,
             * keep them.
             */
            for (let j = 0; j < p.sources.length; j++) {
              direct.push({
                page: p.page,
                url: p.sources[j]
              });
            }

            /*
             * Series: inspect page for ?key= episode links.
             */
            if (
              mediaType !== 'movie' &&
              season != null &&
              episode != null &&
              p.html
            ) {
              const episodeLinks =
                findEpisodeLinks(
                  p.html,
                  p.page,
                  season,
                  episode
                );

              for (let j = 0; j < episodeLinks.length; j++) {
                direct.push({
                  page: episodeLinks[j],
                  url: null
                });
              }
            }
          }

          return unique(
            direct.map(function (x) {
              return x.page + '|' + (x.url || '');
            })
          ).map(function (key) {
            const parts = key.split('|');

            return {
              page: parts[0],
              url: parts.slice(1).join('|') || null
            };
          });
        });
    });
}

/*
 * Resolve ?key= episode pages separately.
 */
function resolveEpisodePages(items) {
  const episodePages = items.filter(function (x) {
    return x.page && !x.url && /\?key=/i.test(x.page);
  });

  if (!episodePages.length) {
    return Promise.resolve(items);
  }

  return Promise.all(
    episodePages.map(function (item) {
      return getWatchSources(item.page);
    })
  )
    .then(function (results) {
      const out = [];

      for (let i = 0; i < items.length; i++) {
        if (items[i].url) {
          out.push(items[i]);
        }
      }

      for (let i = 0; i < results.length; i++) {
        const r = results[i];

        for (let j = 0; j < r.sources.length; j++) {
          out.push({
            page: r.page,
            url: r.sources[j]
          });
        }
      }

      return out;
    });
}

/*
 * Build Nuvio stream objects.
 */
function makeStreams(items) {
  const urls = unique(
    items
      .map(function (x) {
        return x.url;
      })
      .filter(Boolean)
  );

  return urls.map(function (url, index) {
    const quality = qualityFromUrl(url);

    return {
      name: PROVIDER,
      title: PROVIDER + ' • ' + quality + ' • Server ' + (index + 1),
      url: url,
      quality: quality,
      headers: {
        'User-Agent': UA,
        'Referer': 'https://dm.alooytv16.xyz/'
      }
    };
  });
}

/*
 * Main Nuvio entry point.
 */
function getStreams(tmdbId, mediaType, season, episode) {
  console.log(
    '[' + PROVIDER + '] Request:',
    tmdbId,
    mediaType,
    season,
    episode
  );

  const isMovie = mediaType === 'movie';

  return getArabicTitle(tmdbId, mediaType)
    .then(function (localizedTitles) {
      /*
       * Arabic title first.
       *
       * Add the ID as a last-resort diagnostic only;
       * never search Alooy by TMDB ID as the primary method.
       */
      const titles = unique(
        localizedTitles
          .map(clean)
          .filter(function (title) {
            return title &&
              title.length > 1 &&
              !/^the time has passed$/i.test(title);
          })
      );

      console.log(
        '[' + PROVIDER + '] Localized titles:',
        titles
      );

      if (!titles.length) {
        return [];
      }

      return resolveWatchPages(
        titles,
        mediaType,
        season,
        episode
      );
    })
    .then(function (items) {
      if (!items.length) return [];

      return resolveEpisodePages(items);
    })
    .then(function (items) {
      const streams = makeStreams(items);

      console.log(
        '[' + PROVIDER + '] Streams:',
        streams.length
      );

      return streams;
    })
    .catch(function (err) {
      console.error(
        '[' + PROVIDER + '] Fatal:',
        err && err.message ? err.message : err
      );

      return [];
    });
}

module.exports = {
  getStreams
};
