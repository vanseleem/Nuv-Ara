
const BASE_URL = "https://wecima.ac";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

// --- Cloudflare Cookie Handling ---
let cfClearanceCookie = null;

function updateCfCookie(response) {
  const setCookieHeader = response.headers.get('set-cookie');
  if (setCookieHeader) {
    const match = setCookieHeader.match(/cf_clearance=([^;]+)/);
    if (match) {
      cfClearanceCookie = `cf_clearance=${match[1]}`;
      console.log(`[WeCima] Updated cf_clearance cookie.`);
    }
  }
}

async function fetchWithCf(url, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set('User-Agent', USER_AGENT);
  headers.set('Accept', 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8');
  headers.set('Accept-Language', 'ar-EG,ar;q=0.9,en-US;q=0.8,en;q=0.7');
  headers.set('Referer', `${BASE_URL}/`);

  if (cfClearanceCookie) {
    headers.set('Cookie', cfClearanceCookie);
  }

  console.log(`[WeCima] Fetching: ${url}`);
  const response = await fetch(url, { ...options, headers, redirect: 'follow' });
  updateCfCookie(response); // Try to update the cookie on every request
  return response;
}
// ------------------------------------

async function getTmdbTitles(tmdbId, mediaType) {
  const type = mediaType === 'tv' ? 'tv' : 'movie';
  const apiKey = "83d364331c40bfbe29858aeed82f45cc"; // Provided in your Akwam provider
  const url = `https://api.themoviedb.org/3/${type}/${tmdbId}?api_key=${apiKey}&language=ar`;
  const response = await fetch(url);
  const data = await response.json();
  const title = type === 'movie' ? data.title : data.name;
  return [title, data.original_title || data.original_name].filter(Boolean);
}

function parseSearchJson(jsonText) {
  try {
    const data = JSON.parse(jsonText);
    if (!data.results) return [];

    return data.results.map(item => {
      const isTv = item.istv !== 0;
      const urlPath = isTv ? 'series' : 'watch';
      return {
        title: item.title,
        url: `${BASE_URL}/${urlPath}/${encodeURIComponent(item.slug)}`,
        type: isTv ? 'tv' : 'movie',
        year: item.year
      };
    });
  } catch (e) {
    console.error('[WeCima] Failed to parse search JSON:', e);
    return [];
  }
}

async function searchWeCima(query) {
  const searchUrl = `${BASE_URL}/search`;
  const body = new URLSearchParams({ q: query }).toString();

  const response = await fetchWithCf(searchUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body
  });

  if (!response.ok) {
    console.error(`[WeCima] Search failed with status: ${response.status}`);
    return [];
  }

  const text = await response.text();
  return parseSearchJson(text);
}

async function getStreamsFromEpisodePage(url) {
  const response = await fetchWithCf(url);
  const html = await response.text();

  // This logic is adapted from the loadLinks function in your Kotlin plugin.
  // It looks for a data-url attribute containing a base64 encoded link.
  const $ = require('cheerio').load(html);
  const streams = [];

  $('ul.WatchServersList li btn').each((i, el) => {
    const encodedUrl = $(el).attr('data-url');
    if (encodedUrl) {
      // Basic Base64 decoding
      try {
        const decodedUrl = Buffer.from(encodedUrl, 'base64').toString('utf-8');
        if (decodedUrl.startsWith('http')) {
          streams.push({
            name: 'WeCima',
            title: `Server ${i + 1}`,
            url: decodedUrl,
            quality: 'Unknown',
            headers: { 'Referer': BASE_URL } // Important for playback
          });
        }
      } catch (e) {
        console.error(`[WeCima] Failed to decode Base64 URL: ${encodedUrl}`);
      }
    }
  });

  return streams;
}

function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
  return new Promise((resolve, reject) => {
    console.log(`[WeCima] getStreams called for: ${tmdbId}, ${mediaType}, S${seasonNum}E${episodeNum}`);

    getTmdbTitles(tmdbId, mediaType)
      .then(titles => {
        if (titles.length === 0) {
          console.error('[WeCima] No titles found on TMDB.');
          return resolve([]);
        }
        // Search using the first available title
        return searchWeCima(titles[0]);
      })
      .then(searchResults => {
        if (searchResults.length === 0) {
          console.error('[WeCima] No search results on WeCima.');
          return resolve([]);
        }

        // Find the best matching result
        const bestMatch = searchResults[0]; // A simple match, can be improved
        console.log(`[WeCima] Best match found: ${bestMatch.title} (${bestMatch.url})`);

        if (mediaType === 'movie') {
          // For movies, we need to find a "watch" page. The search result might be the movie page.
          // We'll need to fetch the page and look for the watch link.
          return fetchWithCf(bestMatch.url).then(res => res.text()).then(html => {
            const $ = require('cheerio').load(html);
            const watchLink = $('a[href*="/watch/"]').attr('href');
            if (watchLink) {
              return getStreamsFromEpisodePage(`${BASE_URL}${watchLink}`);
            }
            console.error('[WeCima] No watch link found on movie page.');
            return [];
          });
        } else {
          // For TV series, we need to find the specific episode.
          // This involves more complex logic to parse the season/episode structure.
          // For a first version, we'll just return the series page URL as a stream placeholder.
          console.log('[WeCima] TV series logic not fully implemented. Returning series page URL.');
          return [{
            name: 'WeCima',
            title: 'Series Page (No episode selection)',
            url: bestMatch.url,
            quality: 'N/A',
            headers: { 'Referer': BASE_URL }
          }];
        }
      })
      .then(streams => {
        resolve(streams);
      })
      .catch(error => {
        console.error(`[WeCima] Error in getStreams: ${error.message}`);
        resolve([]); // Resolve with empty array on error
      });
  });
}

module.exports = { getStreams };
