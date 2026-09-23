'use strict';

const BASE = 'https://arabseed.store';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/153.0.0.0 Safari/537.36';

async function request(url, options = {}) {
  const headers = {
    'User-Agent': UA,
    'Accept': 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
    ...(options.headers || {})
  };

  const response = await fetch(url, {
    ...options,
    headers,
    redirect: 'follow'
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${url}`);
  }

  return {
    text,
    url: response.url,
    status: response.status
  };
}

async function getText(url, options = {}) {
  return (await request(url, options)).text;
}

function decodeHtml(value = '') {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#039;/gi, "'")
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, n) =>
      String.fromCharCode(Number(n))
    )
    .replace(/&#x([0-9a-f]+);/gi, (_, n) =>
      String.fromCharCode(parseInt(n, 16))
    );
}

function stripHtml(value = '') {
  return decodeHtml(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeTitle(value = '') {
  return decodeHtml(value)
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[إأآا]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[ـ]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleSimilarity(a, b) {
  const aa = normalizeTitle(a);
  const bb = normalizeTitle(b);

  if (!aa || !bb) return 0;
  if (aa === bb) return 1;

  const A = new Set(aa.split(' ').filter(Boolean));
  const B = new Set(bb.split(' ').filter(Boolean));

  let common = 0;

  for (const word of A) {
    if (B.has(word)) common++;
  }

  const union = new Set([...A, ...B]).size;
  const jaccard = union ? common / union : 0;

  const contains =
    aa.includes(bb) || bb.includes(aa);

  const containScore = contains
    ? Math.min(aa.length, bb.length) /
      Math.max(aa.length, bb.length)
    : 0;

  return Math.max(jaccard, containScore * 0.95);
}

function extractYear(value = '') {
  const match = String(value).match(/\b(19|20)\d{2}\b/);
  return match ? Number(match[0]) : null;
}

function absoluteUrl(url) {
  if (!url) return '';

  url = decodeHtml(url.trim());

  if (url.startsWith('//')) {
    return 'https:' + url;
  }

  if (url.startsWith('/')) {
    return BASE + url;
  }

  return url;
}

function extractAttribute(tag, name) {
  const re = new RegExp(
    name + '\\s*=\\s*["\']([^"\']+)["\']',
    'i'
  );

  const match = tag.match(re);

  return match
    ? decodeHtml(match[1])
    : '';
}

/* ---------------------------------------------------------
 * TMDB
 * --------------------------------------------------------- */

async function getTmdbInfo(tmdbId, mediaType) {
  const type = mediaType === 'tv' ? 'tv' : 'movie';

  const urls = [
    `https://www.themoviedb.org/${type}/${encodeURIComponent(tmdbId)}`,
    `https://www.themoviedb.org/${type}/${encodeURIComponent(tmdbId)}?language=ar`
  ];

  const titles = [];
  const years = [];

  for (const url of urls) {
    try {
      const html = await getText(url);

      const candidates = [
        html.match(
          /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i
        )?.[1],

        html.match(
          /<meta[^>]+name=["']twitter:title["'][^>]+content=["']([^"']+)/i
        )?.[1],

        html.match(
          /"original_title"\s*:\s*"([^"]+)"/i
        )?.[1],

        html.match(
          /"original_name"\s*:\s*"([^"]+)"/i
        )?.[1],

        html.match(
          /"title"\s*:\s*"([^"]+)"/i
        )?.[1],

        html.match(
          /"name"\s*:\s*"([^"]+)"/i
        )?.[1]
      ];

      for (const value of candidates) {
        if (!value) continue;

        const clean = stripHtml(value)
          .replace(/\s*\|\s*TMDB.*$/i, '')
          .trim();

        if (
          clean &&
          !titles.some(
            x => normalizeTitle(x) === normalizeTitle(clean)
          )
        ) {
          titles.push(clean);
        }
      }

      const yearMatches = html.match(/\b(19|20)\d{2}\b/g) || [];

      for (const value of yearMatches) {
        const year = Number(value);

        if (
          year >= 1900 &&
          year <= 2100 &&
          !years.includes(year)
        ) {
          years.push(year);
        }
      }
    } catch (e) {
      console.log(
        `[ArabSeed] TMDB request failed: ${url}`
      );
    }
  }

  return {
    titles,
    years
  };
}

/* ---------------------------------------------------------
 * SEARCH
 * --------------------------------------------------------- */

function parseSearchResults(html) {
  const results = [];

  const blockRegex =
    /<a\b[^>]*class=["'][^"']*\bmovie__block\b[^"']*["'][^>]*>[\s\S]*?<\/a>/gi;

  let match;

  while ((match = blockRegex.exec(html))) {
    const block = match[0];

    const href =
      block.match(
        /\bhref=["']([^"']+)["']/i
      )?.[1];

    if (!href) continue;

    const url = absoluteUrl(href);

    const title =
      block.match(
        /\btitle=["']([^"']+)["']/i
      )?.[1] ||
      block.match(
        /<h3[^>]*>([\s\S]*?)<\/h3>/i
      )?.[1];

    const cleanTitle =
      stripHtml(title || '');

    if (!cleanTitle) continue;

    const poster =
      block.match(
        /<img[^>]+(?:data-src|src)=["']([^"']+)["']/i
      )?.[1] || '';

    if (
      !results.some(
        x => x.url === url
      )
    ) {
      results.push({
        title: cleanTitle,
        url,
        poster: absoluteUrl(poster)
      });
    }
  }

  /*
   * Fallback if ArabSeed changes the movie__block markup.
   */
  if (!results.length) {
    const linkRegex =
      /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

    while ((match = linkRegex.exec(html))) {
      const url = absoluteUrl(match[1]);
      const title = stripHtml(match[2]);

      if (
        !url ||
        !title ||
        !url.startsWith(BASE)
      ) {
        continue;
      }

      if (
        !results.some(
          x => x.url === url
        )
      ) {
        results.push({
          title,
          url,
          poster: ''
        });
      }
    }
  }

  return results;
}

async function searchArabSeed(title, searchType = 'movies') {
  const token = '8fcd30a10a';

  function cleanQuery(value) {
    return String(value || '')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function queryVariants(value) {
    const q = cleanQuery(value);
    if (!q) return [];

    const words = q.split(' ').filter(Boolean);
    const variants = [];

    // Exact title first.
    variants.push(q);

    // Remove common leading English articles.
    const withoutArticle = q.replace(
      /^(the|a|an)\s+/i,
      ''
    ).trim();

    if (
      withoutArticle &&
      withoutArticle.toLowerCase() !== q.toLowerCase()
    ) {
      variants.push(withoutArticle);
    }

    // For longer English titles, search distinctive chunks.
    if (words.length >= 3) {
      const lastWords = words.slice(-2).join(' ');
      if (lastWords.length >= 4) {
        variants.push(lastWords);
      }
    }

    // One distinctive word, but avoid tiny/generic words.
    const distinctive = words
      .filter(w => w.length >= 5)
      .sort((a, b) => b.length - a.length)[0];

    if (distinctive) {
      variants.push(distinctive);
    }

    // Known useful broad fallback for titles beginning with "The".
    if (/^the\s+/i.test(q)) {
      variants.push('The');
    }

    return [...new Set(variants)];
  }

  async function doSearch(query) {
    const body = new URLSearchParams({
      search: query,
      search_type: searchType,
      csrf_token: token
    });

    const response = await fetch(
      `${BASE}/find__posts/`,
      {
        method: 'POST',
        headers: {
          'User-Agent': UA,
          'Accept': 'application/json,text/plain,*/*',
          'Content-Type':
            'application/x-www-form-urlencoded; charset=UTF-8',
          'X-Requested-With': 'XMLHttpRequest',
          'Referer': `${BASE}/`
        },
        body: body.toString()
      }
    );

    if (!response.ok) {
      throw new Error(
        `ArabSeed search HTTP ${response.status}`
      );
    }

    const json = JSON.parse(await response.text());
    const html = json.html || '';

    const results = [];

    /*
     * Current ArabSeed search result:
     *
     * <a href="..." class="search__item d__flex">
     *   ...
     *   <h3>...</h3>
     *   <img ...>
     * </a>
     */
    const re =
      /<a\s+href=["']([^"']+)["']\s+class=["'][^"']*\bsearch__item\b[^"']*["']>([\s\S]*?)<\/a>/gi;

    let match;

    while ((match = re.exec(html))) {
      const block = match[2];

      const titleMatch = block.match(
        /<h3[^>]*>([\s\S]*?)<\/h3>/i
      );

      if (!titleMatch) continue;

      const resultTitle =
        stripHtml(titleMatch[1]);

      const url =
        absoluteUrl(match[1]);

      if (
        !resultTitle ||
        !url.startsWith(BASE)
      ) {
        continue;
      }

      const imgMatch = block.match(
        /<img[^>]+(?:data-src|src)=["']([^"']+)["']/i
      );

      const result = {
        title: resultTitle,
        url,
        poster: imgMatch
          ? absoluteUrl(imgMatch[1])
          : ''
      };

      if (
        !results.some(
          x => x.url === result.url
        )
      ) {
        results.push(result);
      }
    }

    return results;
  }

  const variants = queryVariants(title);

  const allResults = [];

  for (const query of variants) {
    try {
      const results = await doSearch(query);

      console.log(
        `[ArabSeed] AJAX search "${query}" [${searchType}]: ${results.length} results`
      );

      for (const result of results) {
        if (
          !allResults.some(
            x => x.url === result.url
          )
        ) {
          allResults.push(result);
        }
      }

      /*
       * Exact search produced something.
       * Keep collecting only if necessary; the candidate matcher
       * below will determine the safe result.
       */
      if (
        query.toLowerCase() ===
          cleanQuery(title).toLowerCase() &&
        results.length > 0
      ) {
        break;
      }
    } catch (error) {
      console.log(
        `[ArabSeed] Search failed "${query}":`,
        error.message
      );
    }
  }

  console.log(
    `[ArabSeed] Combined unique results: ${allResults.length}`
  );

  return allResults;
}

/* ---------------------------------------------------------
 * CANDIDATE MATCHING
 * --------------------------------------------------------- */

async function inspectCandidate(candidate) {
  try {
    const html =
      await getText(candidate.url);

    const pageTitle =
      stripHtml(
        html.match(
          /<[^>]+class=["'][^"']*\bpost__name\b[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i
        )?.[1]
        ||
        html.match(
          /<h1[^>]*>([\s\S]*?)<\/h1>/i
        )?.[1]
        ||
        candidate.title
      );

    const yearText =
      html.match(
        /release-year\/[^"']+["'][^>]*>([\s\S]*?)<\/a>/i
      )?.[1] || '';

    const year =
      extractYear(stripHtml(yearText)) ||
      extractYear(html);

    return {
      ...candidate,
      pageTitle,
      year
    };
  } catch (error) {
    console.log(
      '[ArabSeed] Candidate inspect failed:',
      candidate.url,
      error.message
    );

    return {
      ...candidate,
      pageTitle: candidate.title,
      year: null
    };
  }
}

function chooseCandidate(
  candidates,
  wantedTitles,
  wantedYears
) {
  let best = null;

  for (const candidate of candidates) {
    let titleScore = 0;

    for (const title of wantedTitles) {
      titleScore = Math.max(
        titleScore,
        titleSimilarity(
          title,
          candidate.pageTitle
        ),
        titleSimilarity(
          title,
          candidate.title
        )
      );
    }

    let yearBonus = 0;

    if (
      candidate.year &&
      wantedYears.includes(candidate.year)
    ) {
      yearBonus = 0.12;
    }

    const total =
      Math.min(
        1,
        titleScore + yearBonus
      );

    console.log(
      '[ArabSeed] Candidate:',
      candidate.pageTitle,
      'year:',
      candidate.year || 'unknown',
      'title:',
      titleScore.toFixed(3),
      'total:',
      total.toFixed(3)
    );

    if (
      !best ||
      total > best.score
    ) {
      best = {
        candidate,
        score: total
      };
    }
  }

  if (!best) {
    return null;
  }

  if (best.score < 0.75) {
    console.log(
      '[ArabSeed] NO SAFE MATCH:',
      best.score.toFixed(3)
    );

    return null;
  }

  console.log(
    '[ArabSeed] SAFE SELECT:',
    best.candidate.pageTitle,
    best.candidate.url,
    'score:',
    best.score.toFixed(3)
  );

  return best.candidate;
}

/* ---------------------------------------------------------
 * PAGE DATA
 * --------------------------------------------------------- */

function extractToken(html) {
  return (
    html.match(
      /csrf__token['"]?\s*:\s*['"]([^'"]+)['"]/i
    )?.[1] ||
    null
  );
}

function extractPostId(html) {
  return (
    html.match(
      /post_id['"]?\s*:\s*['"]?(\d+)/i
    )?.[1] ||
    null
  );
}

function extractWatchUrl(html) {
  return (
    html.match(
      /<a[^>]+class=["'][^"']*\bwatch__btn\b[^"']*["'][^>]+href=["']([^"']+)["']/i
    )?.[1]
    ||
    html.match(
      /<a[^>]+href=["']([^"']+)["'][^>]+class=["'][^"']*\bwatch__btn\b[^"']*["']/i
    )?.[1]
    ||
    ''
  );
}

/* ---------------------------------------------------------
 * QUALITY SERVERS
 * --------------------------------------------------------- */

async function getQualityServers(
  postId,
  quality,
  csrfToken,
  referer
) {
  const endpoint =
    `${BASE}/get__quality__servers/`;

  const body =
    `post_id=${encodeURIComponent(postId)}` +
    `&quality=${encodeURIComponent(quality)}` +
    `&csrf_token=${encodeURIComponent(csrfToken)}`;

  try {
    const response =
      await request(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type':
            'application/x-www-form-urlencoded; charset=UTF-8',
          'Referer': referer,
          'X-Requested-With': 'XMLHttpRequest'
        },
        body
      });

    try {
      const json =
        JSON.parse(response.text);

      return json.html || '';
    } catch {
      return response.text;
    }
  } catch (error) {
    console.log(
      '[ArabSeed] Quality request failed:',
      quality,
      error.message
    );

    return '';
  }
}

function extractServerLinks(html) {
  const links = [];

  const regex =
    /<li\b[^>]*data-src=["']([^"']+)["'][^>]*>/gi;

  let match;

  while ((match = regex.exec(html))) {
    const src =
      absoluteUrl(match[1]);

    if (
      src &&
      !links.includes(src)
    ) {
      links.push(src);
    }
  }

  return links;
}

/* ---------------------------------------------------------
 * DIRECT VIDEO / EXTRACTOR
 * --------------------------------------------------------- */

function extractDirectVideos(html) {
  const streams = [];

  const sourceRegex =
    /<source\b([^>]*)>/gi;

  let match;

  while ((match = sourceRegex.exec(html))) {
    const attrs = match[1];

    const src =
      extractAttribute(
        attrs,
        'src'
      );

    if (!src) continue;

    const type =
      extractAttribute(
        attrs,
        'type'
      );

    const label =
      extractAttribute(
        attrs,
        'label'
      ) ||
      extractAttribute(
        attrs,
        'size'
      );

    streams.push({
      url: absoluteUrl(src),
      type: type || 'video/mp4',
      label: label || ''
    });
  }

  /*
   * Fallback for raw MP4 URLs.
   */
  if (!streams.length) {
    const urls =
      html.match(
        /https?:\/\/[^"'\\\s<>]+\.mp4(?:\?[^"'\\\s<>]*)?/gi
      ) || [];

    for (const url of urls) {
      streams.push({
        url: decodeHtml(url),
        type: 'video/mp4',
        label: ''
      });
    }
  }

  return streams;
}

function qualityNumber(value) {
  const match =
    String(value || '').match(
      /(2160|1440|1080|720|480|360)/
    );

  return match
    ? Number(match[1])
    : 0;
}

async function resolveServer(
  serverUrl,
  quality,
  referer
) {
  try {
    let finalUrl = decodeHtml(serverUrl);

    if (finalUrl.includes('/watch/?url=')) {
      finalUrl = decodeURIComponent(
        finalUrl.substring(finalUrl.indexOf('url=') + 4)
      );
    }

    if (finalUrl.startsWith('//')) {
      finalUrl = 'https:' + finalUrl;
    } else if (finalUrl.startsWith('/')) {
      finalUrl = BASE + finalUrl;
    }

    console.log('[ArabSeed] Server:', finalUrl);

    /*
     * VIDARA
     *
     * Vidara embeds do not expose the HLS URL in their HTML.
     * Their player calls:
     *
     * POST https://vidara.to/api/stream
     * { filecode, device: "web" }
     *
     * and returns streaming_url.
     */
    if (/^https?:\/\/vidara\.to\/e\//i.test(finalUrl)) {
      const match = finalUrl.match(/\/e\/([^/?#]+)/i);

      if (match) {
        const filecode = match[1];

        console.log(
          '[ArabSeed] Vidara filecode:',
          filecode
        );

        const apiResponse = await request(
          'https://vidara.to/api/stream',
          {
            method: 'POST',
            headers: {
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36',
              'Content-Type':
                'application/json',
              'Referer':
                finalUrl,
              'Origin':
                'https://vidara.to'
            },
            body: JSON.stringify({
              filecode,
              device: 'web'
            })
          }
        );

        let data;

        try {
          data = JSON.parse(apiResponse.text);
        } catch {
          console.log(
            '[ArabSeed] Vidara invalid JSON'
          );
          return [];
        }

        if (
          data &&
          data.streaming_url
        ) {
          console.log(
            '[ArabSeed] Vidara STREAM:',
            data.streaming_url
          );

          return [{
            title:
              `ArabSeed ${quality}p`,
            quality:
              Number(quality) || 0,
            url:
              data.streaming_url,
            type:
              'application/x-mpegURL',
            referer:
              finalUrl
          }];
        }

        console.log(
          '[ArabSeed] Vidara returned no stream'
        );

        return [];
      }
    }

    /*
     * Existing direct-host fallback
     */
    const response = await request(
      finalUrl,
      {
        headers: {
          Referer: referer
        }
      }
    );

    const sources =
      extractDirectVideos(
        response.text
      );

    if (
      !sources.length &&
      /\.(mp4|m3u8)(\?|$)/i.test(finalUrl)
    ) {
      return [{
        title:
          `ArabSeed ${quality}p`,
        quality:
          Number(quality) || 0,
        url:
          finalUrl,
        type:
          /\.m3u8/i.test(finalUrl)
            ? 'application/x-mpegURL'
            : 'video/mp4',
        referer
      }];
    }

    return sources.map(source => ({
      title:
        `ArabSeed ${source.label || quality + 'p'}`,
      quality:
        qualityNumber(source.label) ||
        Number(quality) ||
        0,
      url:
        source.url,
      type:
        source.type,
      referer:
        finalUrl
    }));

  } catch (error) {
    console.log(
      '[ArabSeed] Server failed:',
      serverUrl,
      error.message
    );

    return [];
  }
}

/* ---------------------------------------------------------
 * MOVIE / EPISODE STREAMS
 * --------------------------------------------------------- */

async function getStreamsFromPage(
  pageUrl
) {
  const pageResponse =
    await request(pageUrl);

  const watchUrl =
    extractWatchUrl(
      pageResponse.text
    );

  if (!watchUrl) {
    throw new Error(
      'ArabSeed watch button not found'
    );
  }

  const absoluteWatchUrl =
    absoluteUrl(watchUrl);

  console.log(
    '[ArabSeed] Watch URL:',
    absoluteWatchUrl
  );

  const watchResponse =
    await request(
      absoluteWatchUrl,
      {
        headers: {
          Referer: pageUrl
        }
      }
    );

  const watchHtml =
    watchResponse.text;

  const postId =
    extractPostId(
      watchHtml
    );

  const csrfToken =
    extractToken(
      watchHtml
    );

  console.log(
    '[ArabSeed] post_id:',
    postId || 'none'
  );

  console.log(
    '[ArabSeed] csrf:',
    csrfToken
      ? 'found'
      : 'missing'
  );

  const qualities = [
    '480',
    '720',
    '1080'
  ];

  const streams = [];

  for (const quality of qualities) {
    let serverHtml = '';

    /*
     * 480 can already exist directly
     * on the watch page.
     */
    if (quality === '480') {
      serverHtml =
        watchHtml.match(
          /<ul[^>]+class=["'][^"']*\bservers__list\b[^"']*["'][^>]*>([\s\S]*?)<\/ul>/i
        )?.[1] || '';
    }

    /*
     * 720 / 1080 and fallback 480.
     */
    if (
      !serverHtml &&
      postId &&
      csrfToken
    ) {
      serverHtml =
        await getQualityServers(
          postId,
          quality,
          csrfToken,
          absoluteWatchUrl
        );
    }

    const servers =
      extractServerLinks(
        serverHtml
      );

    console.log(
      `[ArabSeed] ${quality}p servers:`,
      servers.length
    );

    for (const server of servers) {
      const resolved =
        await resolveServer(
          server,
          Number(quality),
          pageUrl
        );

      streams.push(
        ...resolved
      );
    }
  }

  /*
   * Deduplicate.
   */
  const unique = [];
  const seen = new Set();

  for (const stream of streams) {
    if (!stream.url) continue;

    if (seen.has(stream.url)) {
      continue;
    }

    seen.add(stream.url);
    unique.push(stream);
  }

  console.log(
    '[ArabSeed] FINAL STREAMS:',
    unique.length
  );

  return unique;
}

/* ---------------------------------------------------------
 * MOVIES
 * --------------------------------------------------------- */

async function getMovieStreams(
  tmdbId
) {
  const info =
    await getTmdbInfo(
      tmdbId,
      'movie'
    );

  const candidates = [];

  for (const title of info.titles) {
    const results =
      await searchArabSeed(
        title
      );

    candidates.push(
      ...results
    );
  }

  const unique = [];

  for (const candidate of candidates) {
    if (
      !unique.some(
        x => x.url === candidate.url
      )
    ) {
      unique.push(candidate);
    }
  }

  console.log(
    '[ArabSeed] Unique movie candidates:',
    unique.length
  );

  const inspected = [];

  for (
    const candidate
    of unique.slice(0, 15)
  ) {
    inspected.push(
      await inspectCandidate(
        candidate
      )
    );
  }

  const selected =
    chooseCandidate(
      inspected,
      info.titles,
      info.years
    );

  if (!selected) {
    throw new Error(
      'No safe ArabSeed movie match'
    );
  }

  return await getStreamsFromPage(
    selected.url
  );
}

/* ---------------------------------------------------------
 * SERIES
 * --------------------------------------------------------- */

async function getSeriesEpisodes(
  pageUrl
) {
  const response =
    await request(pageUrl);

  const html =
    response.text;

  const seasonMatches = [];

  const seasonRegex =
    /<li\b[^>]*data-season=["']([^"']+)["'][^>]*data-series=["']([^"']+)["'][^>]*>/gi;

  let match;

  while (
    (match = seasonRegex.exec(html))
  ) {
    seasonMatches.push({
      seasonId: match[1],
      seriesId: match[2]
    });
  }

  /*
   * Some pages have data-series before
   * data-season.
   */
  if (!seasonMatches.length) {
    const reverseRegex =
      /<li\b[^>]*data-series=["']([^"']+)["'][^>]*data-season=["']([^"']+)["'][^>]*>/gi;

    while (
      (match = reverseRegex.exec(html))
    ) {
      seasonMatches.push({
        seasonId: match[2],
        seriesId: match[1]
      });
    }
  }

  const token =
    extractToken(html);

  const episodes = [];

  /*
   * Parse the default selected season.
   */
  const defaultEpisodes =
    html.match(
      /<[^>]+class=["'][^"']*\bepisodes__list\b[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i
    )?.[1] || '';

  function parseEpisodes(
    episodeHtml,
    seasonNumber
  ) {
    const regex =
      /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

    let e;

    while (
      (e = regex.exec(episodeHtml))
    ) {
      const href =
        absoluteUrl(e[1]);

      const text =
        stripHtml(e[2]);

      if (
        !href ||
        !text
      ) {
        continue;
      }

      const isEpisode =
        text.includes('الحلقة') ||
        decodeURIComponent(
          href
        ).includes('الحلقة');

      if (!isEpisode) {
        continue;
      }

      const numberMatch =
        text.match(
          /\b(\d+)\b/
        );

      const episodeNumber =
        Number(
          numberMatch?.[1]
        ) || 0;

      if (!episodeNumber) {
        continue;
      }

      episodes.push({
        url: href,
        season: seasonNumber,
        episode: episodeNumber,
        name: text
      });
    }
  }

  /*
   * If there are no season tabs, try the
   * page's episode list directly.
   */
  if (!seasonMatches.length) {
    parseEpisodes(
      defaultEpisodes || html,
      1
    );
  } else {
    for (
      let index = 0;
      index < seasonMatches.length;
      index++
    ) {
      const season =
        seasonMatches[index];

      const seasonNumber =
        index + 1;

      let episodeHtml = '';

      /*
       * First season may already be
       * rendered in the page.
       */
      if (
        index === 0 &&
        defaultEpisodes
      ) {
        episodeHtml =
          defaultEpisodes;
      } else if (
        season.seriesId &&
        token
      ) {
        try {
          const endpoint =
            `${BASE}/season__episodes/`;

          const body =
            `series_id=${encodeURIComponent(season.seriesId)}` +
            `&season_id=${encodeURIComponent(season.seasonId)}` +
            `&csrf_token=${encodeURIComponent(token)}`;

          const result =
            await request(
              endpoint,
              {
                method: 'POST',
                headers: {
                  'Content-Type':
                    'application/x-www-form-urlencoded; charset=UTF-8',
                  'Referer': pageUrl,
                  'X-Requested-With':
                    'XMLHttpRequest'
                },
                body
              }
            );

          try {
            const json =
              JSON.parse(result.text);

            episodeHtml =
              json.html || '';
          } catch {
            episodeHtml =
              result.text;
          }
        } catch (error) {
          console.log(
            '[ArabSeed] Season request failed:',
            seasonNumber,
            error.message
          );
        }
      }

      if (episodeHtml) {
        parseEpisodes(
          episodeHtml,
          seasonNumber
        );
      }
    }
  }

  const unique = [];
  const seen = new Set();

  for (const episode of episodes) {
    const key =
      `${episode.season}:${episode.episode}:${episode.url}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(episode);
  }

  unique.sort(
    (a, b) =>
      a.season - b.season ||
      a.episode - b.episode
  );

  console.log(
    '[ArabSeed] Episodes found:',
    unique.length
  );

  return unique;
}

async function getTvStreams(
  tmdbId,
  season,
  episode
) {
  const info =
    await getTmdbInfo(
      tmdbId,
      'tv'
    );

  const candidates = [];

  for (const title of info.titles) {
    const results =
      await searchArabSeed(
        title
      );

    candidates.push(
      ...results
    );
  }

  const unique = [];

  for (const candidate of candidates) {
    if (
      !unique.some(
        x => x.url === candidate.url
      )
    ) {
      unique.push(candidate);
    }
  }

  console.log(
    '[ArabSeed] Unique series candidates:',
    unique.length
  );

  const inspected = [];

  for (
    const candidate
    of unique.slice(0, 15)
  ) {
    inspected.push(
      await inspectCandidate(
        candidate
      )
    );
  }

  const selected =
    chooseCandidate(
      inspected,
      info.titles,
      info.years
    );

  if (!selected) {
    throw new Error(
      'No safe ArabSeed series match'
    );
  }

  console.log(
    '[ArabSeed] SAFE SERIES:',
    selected.pageTitle,
    selected.url
  );

  const episodes =
    await getSeriesEpisodes(
      selected.url
    );

  const wantedSeason =
    Number(season) || 1;

  const wantedEpisode =
    Number(episode) || 1;

  let selectedEpisode =
    episodes.find(
      e =>
        e.season === wantedSeason &&
        e.episode === wantedEpisode
    );

  /*
   * Fallback for sites where season numbering
   * isn't represented correctly.
   */
  if (!selectedEpisode) {
    selectedEpisode =
      episodes.find(
        e =>
          e.episode === wantedEpisode
      );
  }

  if (!selectedEpisode) {
    throw new Error(
      `ArabSeed episode not found S${wantedSeason}E${wantedEpisode}`
    );
  }

  console.log(
    `[ArabSeed] Selected S${selectedEpisode.season}E${selectedEpisode.episode}:`,
    selectedEpisode.url
  );

  return await getStreamsFromPage(
    selectedEpisode.url
  );
}

/* ---------------------------------------------------------
 * NUVIO ENTRY
 * --------------------------------------------------------- */

async function getStreams(
  tmdbId,
  mediaType,
  season,
  episode
) {
  console.log(
    '[ArabSeed] getStreams:',
    tmdbId,
    mediaType,
    season,
    episode
  );

  if (
    mediaType === 'movie'
  ) {
    return await getMovieStreams(
      tmdbId
    );
  }

  if (
    mediaType === 'tv' ||
    mediaType === 'series'
  ) {
    return await getTvStreams(
      tmdbId,
      season,
      episode
    );
  }

  throw new Error(
    `Unsupported media type: ${mediaType}`
  );
}

module.exports = {
  getStreams
};
