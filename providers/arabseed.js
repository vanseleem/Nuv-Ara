"use strict";
var __defProp = Object.defineProperty;
var __defProps = Object.defineProperties;
var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __propIsEnum = Object.prototype.propertyIsEnumerable;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __spreadValues = (a, b) => {
  for (var prop in b || (b = {}))
    if (__hasOwnProp.call(b, prop))
      __defNormalProp(a, prop, b[prop]);
  if (__getOwnPropSymbols)
    for (var prop of __getOwnPropSymbols(b)) {
      if (__propIsEnum.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    }
  return a;
};
var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));
var __async = (__this, __arguments, generator) => {
  return new Promise((resolve, reject) => {
    var fulfilled = (value) => {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    };
    var rejected = (value) => {
      try {
        step(generator.throw(value));
      } catch (e) {
        reject(e);
      }
    };
    var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
    step((generator = generator.apply(__this, __arguments)).next());
  });
};
const BASE = "https://arabseed.store";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36";
const TMDB_API_KEY = "83d364331c40bfbe29858aeed82f45cc";
function request(_0) {
  return __async(this, arguments, function* (url, options = {}) {
    const headers = __spreadValues({
      "User-Agent": UA,
      "Accept": "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8"
    }, options.headers || {});
    const response = yield fetch(url, __spreadProps(__spreadValues({}, options), {
      headers,
      redirect: "follow"
    }));
    const text = yield response.text();
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${url}`);
    }
    return {
      text,
      url: response.url,
      status: response.status
    };
  });
}
function getText(_0) {
  return __async(this, arguments, function* (url, options = {}) {
    return (yield request(url, options)).text;
  });
}
function decodeHtml(value = "") {
  return value.replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#039;/gi, "'").replace(/&#39;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(
    /&#(\d+);/g,
    (_, n) => String.fromCharCode(Number(n))
  ).replace(
    /&#x([0-9a-f]+);/gi,
    (_, n) => String.fromCharCode(parseInt(n, 16))
  );
}
function stripHtml(value = "") {
  return decodeHtml(
    value.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ")
  ).replace(/\s+/g, " ").trim();
}
function normalizeTitle(value = "") {
  return decodeHtml(value).toLowerCase().replace(/[\u064B-\u065F\u0670]/g, "").replace(/[إأآا]/g, "\u0627").replace(/ى/g, "\u064A").replace(/ة/g, "\u0647").replace(/[ـ]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim();
}
function stripYearToken(value = "") {
  return String(value).replace(/\b(19|20)\d{2}\b/g, "").replace(/\s+/g, " ").trim();
}
function titleSimilarity(a, b) {
  const aa = normalizeTitle(stripYearToken(a));
  const bb = normalizeTitle(stripYearToken(b));
  if (!aa || !bb)
    return 0;
  if (aa === bb)
    return 1;
  const A = new Set(aa.split(" ").filter(Boolean));
  const B = new Set(bb.split(" ").filter(Boolean));
  let common = 0;
  for (const word of A) {
    if (B.has(word))
      common++;
  }
  const union = (/* @__PURE__ */ new Set([...A, ...B])).size;
  const jaccard = union ? common / union : 0;
  const contains = aa.includes(bb) || bb.includes(aa);
  const containScore = contains ? Math.min(aa.length, bb.length) / Math.max(aa.length, bb.length) : 0;
  return Math.max(jaccard, containScore * 0.95);
}
function extractYear(value = "") {
  const match = String(value).match(/\b(19|20)\d{2}\b/);
  return match ? Number(match[0]) : null;
}
function absoluteUrl(url) {
  if (!url)
    return "";
  url = decodeHtml(url.trim());
  if (url.startsWith("//")) {
    return "https:" + url;
  }
  if (url.startsWith("/")) {
    return BASE + url;
  }
  return url;
}
function extractAttribute(tag, name) {
  const re = new RegExp(
    name + `\\s*=\\s*["']([^"']+)["']`,
    "i"
  );
  const match = tag.match(re);
  return match ? decodeHtml(match[1]) : "";
}
function getTmdbInfo(tmdbId, mediaType) {
  return __async(this, null, function* () {
    const type = mediaType === "tv" ? "tv" : "movie";
    const titles = [];
    const years = [];
    const langs = ["ar", "en"];
    for (const lang of langs) {
      try {
        const apiUrl = "https://api.themoviedb.org/3/" + type + "/" + encodeURIComponent(tmdbId) + "?api_key=" + TMDB_API_KEY + "&language=" + lang;
        const text = yield getText(apiUrl);
        const data = JSON.parse(text);
        const title = type === "movie" ? data.title || data.original_title : data.name || data.original_name;
        if (title && !titles.some((x) => normalizeTitle(x) === normalizeTitle(title))) {
          titles.push(title);
        }
        const dateStr = type === "movie" ? data.release_date : data.first_air_date;
        if (dateStr) {
          const year = Number(dateStr.slice(0, 4));
          if (year && !years.includes(year))
            years.push(year);
        }
      } catch (e) {
        console.log("[ArabSeed] TMDB API failed for lang " + lang + ": " + e.message);
      }
    }
    return { titles, years };
  });
}
function parseSearchResults(html) {
  const results = [];
  const cardRegex = /<a\b[^>]*class=["'][^"']*\bmovie__block\b[^"']*["'][^>]*>/gi;
  let match;
  while (match = cardRegex.exec(html)) {
    const tag = match[0];
    const hrefMatch = tag.match(/\bhref=["']([^"']+)["']/i);
    if (!hrefMatch)
      continue;
    const titleMatch = tag.match(/\btitle=["']([^"']+)["']/i);
    const url = absoluteUrl(hrefMatch[1]);
    if (!url)
      continue;
    let title = titleMatch ? stripHtml(titleMatch[1]) : "";
    if (!title) {
      const tail = html.substring(
        match.index,
        Math.min(
          html.length,
          match.index + 4e3
        )
      );
      const h3 = tail.match(
        /<h3[^>]*>([\s\S]*?)<\/h3>/i
      );
      if (h3)
        title = stripHtml(h3[1]);
    }
    if (!title)
      continue;
    let poster = "";
    const afterTag = html.substring(
      match.index,
      Math.min(
        html.length,
        match.index + 1500
      )
    );
    const posterMatch = afterTag.match(
      /<img[^>]+(?:data-src|src)=["']([^"']+)["']/i
    );
    if (posterMatch)
      poster = absoluteUrl(posterMatch[1]);
    if (!results.some(
      (x) => x.url === url
    )) {
      results.push({
        title,
        url,
        poster
      });
    }
  }
  return results;
}
function searchArabSeed(title, searchType = "movies") {
  return __async(this, null, function* () {
    function cleanQuery(value) {
      return String(value || "").replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim();
    }
    function queryVariants(value) {
      const q = cleanQuery(value);
      if (!q)
        return [];
      const words = q.split(" ").filter(Boolean);
      const variants2 = [q];
      const withoutArticle = q.replace(
        /^(the|a|an)\s+/i,
        ""
      ).trim();
      if (withoutArticle && withoutArticle.toLowerCase() !== q.toLowerCase()) {
        variants2.push(withoutArticle);
      }
      if (words.length >= 3) {
        const lastWords = words.slice(-2).join(" ");
        if (lastWords.length >= 4)
          variants2.push(lastWords);
      }
      const distinctive = words.filter((w) => w.length >= 5).sort((a, b) => b.length - a.length)[0];
      if (distinctive)
        variants2.push(distinctive);
      if (/^the\s+/i.test(q))
        variants2.push("The");
      return [...new Set(variants2)];
    }
    function doSearch(query) {
      return __async(this, null, function* () {
        const url = `${BASE}/?s=${encodeURIComponent(query)}${searchType === "series" ? "&type=series" : "&type=movies"}`;
        console.log(
          `[ArabSeed] Search: ${url}`
        );
        const response = yield request(url, {
          headers: {
            "Referer": `${BASE}/`
          }
        });
        let results = parseSearchResults(
          response.text
        );
        results = results.filter((item) => {
          const url2 = item.url.toLowerCase();
          if (searchType === "series")
            return url2.includes("/series/");
          return !url2.includes("/series/");
        });
        return results;
      });
    }
    const variants = queryVariants(title);
    const allResults = [];
    for (const query of variants) {
      try {
        const results = yield doSearch(query);
        console.log(
          `[ArabSeed] GET search "${query}" [${searchType}]: ${results.length} results`
        );
        for (const result of results) {
          if (!allResults.some(
            (x) => x.url === result.url
          )) {
            allResults.push(result);
          }
        }
        if (query.toLowerCase() === cleanQuery(title).toLowerCase() && results.length > 0) {
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
  });
}
function inspectCandidate(candidate) {
  return __async(this, null, function* () {
    var _a, _b, _c;
    try {
      const html = yield getText(candidate.url);
      const pageTitle = stripHtml(
        ((_a = html.match(
          /<[^>]+class=["'][^"']*\bpost__name\b[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i
        )) == null ? void 0 : _a[1]) || ((_b = html.match(
          /<h1[^>]*>([\s\S]*?)<\/h1>/i
        )) == null ? void 0 : _b[1]) || candidate.title
      );
      const yearText = ((_c = html.match(
        /release-year\/[^"']+["'][^>]*>([\s\S]*?)<\/a>/i
      )) == null ? void 0 : _c[1]) || "";
      const year = extractYear(stripHtml(yearText)) || extractYear(html);
      return __spreadProps(__spreadValues({}, candidate), {
        pageTitle,
        year
      });
    } catch (error) {
      console.log(
        "[ArabSeed] Candidate inspect failed:",
        candidate.url,
        error.message
      );
      return __spreadProps(__spreadValues({}, candidate), {
        pageTitle: candidate.title,
        year: null
      });
    }
  });
}
function chooseCandidate(candidates, wantedTitles, wantedYears) {
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
    let yearPenalty = 0;
    if (candidate.year && wantedYears.length) {
      if (wantedYears.includes(candidate.year)) {
        yearBonus = 0.12;
      } else {
        const closest = wantedYears.reduce((best2, y) => {
          const diff = Math.abs(y - candidate.year);
          return diff < best2 ? diff : best2;
        }, Infinity);
        if (closest >= 3) {
          yearPenalty = 0.5;
        } else if (closest >= 1) {
          yearPenalty = 0.15 * closest;
        }
      }
    }
    const total = Math.max(
      0,
      Math.min(1, titleScore + yearBonus - yearPenalty)
    );
    console.log(
      "[ArabSeed] Candidate:",
      candidate.pageTitle,
      "year:",
      candidate.year || "unknown",
      "title:",
      titleScore.toFixed(3),
      "total:",
      total.toFixed(3)
    );
    if (!best || total > best.score) {
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
      "[ArabSeed] NO SAFE MATCH:",
      best.score.toFixed(3)
    );
    return null;
  }
  console.log(
    "[ArabSeed] SAFE SELECT:",
    best.candidate.pageTitle,
    best.candidate.url,
    "score:",
    best.score.toFixed(3)
  );
  return best.candidate;
}
function extractToken(html) {
  var _a;
  return ((_a = html.match(
    /csrf__token['"]?\s*:\s*['"]([^'"]+)['"]/i
  )) == null ? void 0 : _a[1]) || null;
}
function extractPostId(html) {
  var _a;
  return ((_a = html.match(
    /post_id['"]?\s*:\s*['"]?(\d+)/i
  )) == null ? void 0 : _a[1]) || null;
}
function extractWatchUrl(html) {
  var _a, _b;
  return ((_a = html.match(
    /<a[^>]+class=["'][^"']*\bwatch__btn\b[^"']*["'][^>]+href=["']([^"']+)["']/i
  )) == null ? void 0 : _a[1]) || ((_b = html.match(
    /<a[^>]+href=["']([^"']+)["'][^>]+class=["'][^"']*\bwatch__btn\b[^"']*["']/i
  )) == null ? void 0 : _b[1]) || "";
}
function getQualityServers(postId, quality, csrfToken, referer) {
  return __async(this, null, function* () {
    const endpoint = `${BASE}/get__quality__servers/`;
    const body = `post_id=${encodeURIComponent(postId)}&quality=${encodeURIComponent(quality)}&csrf_token=${encodeURIComponent(csrfToken)}`;
    try {
      const response = yield request(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "Referer": referer,
          "X-Requested-With": "XMLHttpRequest"
        },
        body
      });
      try {
        const json = JSON.parse(response.text);
        return json.html || "";
      } catch (e) {
        return response.text;
      }
    } catch (error) {
      console.log(
        "[ArabSeed] Quality request failed:",
        quality,
        error.message
      );
      return "";
    }
  });
}
function extractServerLinks(html) {
  const links = [];
  const regex = /<li\b[^>]*data-src=["']([^"']+)["'][^>]*>/gi;
  let match;
  while (match = regex.exec(html)) {
    const src = absoluteUrl(match[1]);
    if (src && !links.includes(src)) {
      links.push(src);
    }
  }
  return links;
}
function extractDirectVideos(html) {
  const streams = [];
  const sourceRegex = /<source\b([^>]*)>/gi;
  let match;
  while (match = sourceRegex.exec(html)) {
    const attrs = match[1];
    const src = extractAttribute(
      attrs,
      "src"
    );
    if (!src)
      continue;
    const type = extractAttribute(
      attrs,
      "type"
    );
    const label = extractAttribute(
      attrs,
      "label"
    ) || extractAttribute(
      attrs,
      "size"
    );
    streams.push({
      url: absoluteUrl(src),
      type: type || "video/mp4",
      label: label || ""
    });
  }
  if (!streams.length) {
    const urls = html.match(
      /https?:\/\/[^"'\\\s<>]+\.mp4(?:\?[^"'\\\s<>]*)?/gi
    ) || [];
    for (const url of urls) {
      streams.push({
        url: decodeHtml(url),
        type: "video/mp4",
        label: ""
      });
    }
  }
  return streams;
}
function qualityNumber(value) {
  const match = String(value || "").match(
    /(2160|1440|1080|720|480|360)/
  );
  return match ? Number(match[1]) : 0;
}
function resolveServer(serverUrl, quality, referer) {
  return __async(this, null, function* () {
    try {
      let finalUrl = decodeHtml(serverUrl);
      if (finalUrl.includes("/watch/?url=")) {
        finalUrl = decodeURIComponent(
          finalUrl.substring(finalUrl.indexOf("url=") + 4)
        );
      }
      if (finalUrl.startsWith("//")) {
        finalUrl = "https:" + finalUrl;
      } else if (finalUrl.startsWith("/")) {
        finalUrl = BASE + finalUrl;
      }
      console.log("[ArabSeed] Server:", finalUrl);
      if (/^https?:\/\/vidaraa?\.(to|cc|so)\/e\//i.test(finalUrl)) {
        const match = finalUrl.match(/\/e\/([^/?#]+)/i);
        if (match) {
          const filecode = match[1];
          const embedOrigin = finalUrl.match(/^(https?:\/\/[^/]+)/i)[1];
          console.log(
            "[ArabSeed] Vidara filecode:",
            filecode,
            "origin:",
            embedOrigin
          );
          const apiResponse = yield request(
            `${embedOrigin}/api/stream`,
            {
              method: "POST",
              headers: {
                "User-Agent": UA,
                "Content-Type": "application/json",
                "Referer": finalUrl,
                "Origin": embedOrigin
              },
              body: JSON.stringify({
                filecode,
                device: "web"
              })
            }
          );
          let data;
          try {
            data = JSON.parse(apiResponse.text);
          } catch (e) {
            console.log(
              "[ArabSeed] Vidara invalid JSON"
            );
            return [];
          }
          if (data && data.streaming_url) {
            console.log(
              "[ArabSeed] Vidara STREAM:",
              data.streaming_url
            );
            return [{
              name: "ArabSeed",
              title: `ArabSeed ${quality}p`,
              quality: `${Number(quality) || 0}p`,
              url: data.streaming_url,
              type: "application/x-mpegURL",
              referer: finalUrl
            }];
          }
          console.log(
            "[ArabSeed] Vidara returned no stream"
          );
          return [];
        }
      }
      if (/^https?:\/\/bysezejataos\.com\//i.test(finalUrl)) {
        console.log("[ArabSeed] Skipping JS-rendered host:", finalUrl);
        return [];
      }
      const response = yield request(
        finalUrl,
        {
          headers: {
            Referer: referer
          }
        }
      );
      const sources = extractDirectVideos(
        response.text
      );
      if (!sources.length && /\.(mp4|m3u8)(\?|$)/i.test(finalUrl)) {
        return [{
          name: "ArabSeed",
          title: `ArabSeed ${quality}p`,
          quality: `${Number(quality) || 0}p`,
          url: finalUrl,
          type: /\.m3u8/i.test(finalUrl) ? "application/x-mpegURL" : "video/mp4",
          referer
        }];
      }
      return sources.map((source) => ({
        name: "ArabSeed",
        title: `ArabSeed ${source.label || quality + "p"}`,
        quality: `${qualityNumber(source.label) || Number(quality) || 0}p`,
        url: source.url,
        type: source.type,
        referer: finalUrl
      }));
    } catch (error) {
      console.log(
        "[ArabSeed] Server failed:",
        serverUrl,
        error.message
      );
      return [];
    }
  });
}
function getStreamsFromPage(pageUrl) {
  return __async(this, null, function* () {
    var _a;
    const pageResponse = yield request(pageUrl);
    let absoluteWatchUrl;
    if (/\/watch\/?$/i.test(pageUrl)) {
      absoluteWatchUrl = pageUrl;
    } else {
      const watchUrl = extractWatchUrl(pageResponse.text);
      if (!watchUrl) {
        throw new Error("ArabSeed watch button not found");
      }
      absoluteWatchUrl = absoluteUrl(watchUrl);
    }
    console.log(
      "[ArabSeed] Watch URL:",
      absoluteWatchUrl
    );
    const watchResponse = yield request(
      absoluteWatchUrl,
      {
        headers: {
          Referer: pageUrl
        }
      }
    );
    const watchHtml = watchResponse.text;
    const postId = extractPostId(
      watchHtml
    );
    const csrfToken = extractToken(
      watchHtml
    );
    console.log(
      "[ArabSeed] post_id:",
      postId || "none"
    );
    console.log(
      "[ArabSeed] csrf:",
      csrfToken ? "found" : "missing"
    );
    const qualities = [
      "480",
      "720",
      "1080"
    ];
    const streams = [];
    for (const quality of qualities) {
      let serverHtml = "";
      if (quality === "480") {
        serverHtml = ((_a = watchHtml.match(
          /<ul[^>]+class=["'][^"']*\bservers__list\b[^"']*["'][^>]*>([\s\S]*?)<\/ul>/i
        )) == null ? void 0 : _a[1]) || "";
      }
      if (!serverHtml && postId && csrfToken) {
        serverHtml = yield getQualityServers(
          postId,
          quality,
          csrfToken,
          absoluteWatchUrl
        );
      }
      const servers = extractServerLinks(
        serverHtml
      );
      console.log(
        `[ArabSeed] ${quality}p servers:`,
        servers.length
      );
      for (const server of servers) {
        const resolved = yield resolveServer(
          server,
          Number(quality),
          pageUrl
        );
        streams.push(
          ...resolved
        );
      }
    }
    const unique = [];
    const seen = /* @__PURE__ */ new Set();
    for (const stream of streams) {
      if (!stream.url)
        continue;
      if (seen.has(stream.url)) {
        continue;
      }
      seen.add(stream.url);
      unique.push(stream);
    }
    console.log(
      "[ArabSeed] FINAL STREAMS:",
      unique.length
    );
    return unique;
  });
}
function getMovieStreams(tmdbId) {
  return __async(this, null, function* () {
    const info = yield getTmdbInfo(
      tmdbId,
      "movie"
    );
    const candidates = [];
    for (const title of info.titles) {
      const results = yield searchArabSeed(
        title
      );
      candidates.push(
        ...results
      );
    }
    const unique = [];
    for (const candidate of candidates) {
      if (!unique.some(
        (x) => x.url === candidate.url
      )) {
        unique.push(candidate);
      }
    }
    console.log(
      "[ArabSeed] Unique movie candidates:",
      unique.length
    );
    const inspected = [];
    for (const candidate of unique.slice(0, 15)) {
      inspected.push(
        yield inspectCandidate(
          candidate
        )
      );
    }
    const selected = chooseCandidate(
      inspected,
      info.titles,
      info.years
    );
    if (!selected) {
      throw new Error(
        "No safe ArabSeed movie match"
      );
    }
    return yield getStreamsFromPage(
      selected.url
    );
  });
}
function getSeriesEpisodes(pageUrl) {
  return __async(this, null, function* () {
    var _a;
    const response = yield request(pageUrl);
    const html = response.text;
    const seasonMatches = [];
    const seasonRegex = /<li\b[^>]*data-season=["']([^"']+)["'][^>]*data-series=["']([^"']+)["'][^>]*>/gi;
    let match;
    while (match = seasonRegex.exec(html)) {
      seasonMatches.push({
        seasonId: match[1],
        seriesId: match[2]
      });
    }
    if (!seasonMatches.length) {
      const reverseRegex = /<li\b[^>]*data-series=["']([^"']+)["'][^>]*data-season=["']([^"']+)["'][^>]*>/gi;
      while (match = reverseRegex.exec(html)) {
        seasonMatches.push({
          seasonId: match[2],
          seriesId: match[1]
        });
      }
    }
    const token = extractToken(html);
    const episodes = [];
    const defaultEpisodes = ((_a = html.match(
      /<[^>]+class=["'][^"']*\bepisodes__list\b[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i
    )) == null ? void 0 : _a[1]) || "";
    function parseEpisodes(episodeHtml, seasonNumber) {
      const hrefRe = /href=["']([^"']+)["']/gi;
      let m;
      while (m = hrefRe.exec(episodeHtml)) {
        const href = absoluteUrl(m[1]);
        if (!href)
          continue;
        let decoded;
        try {
          decoded = decodeURIComponent(href);
        } catch (_) {
          decoded = href;
        }
        if (!decoded.includes("\u0627\u0644\u062D\u0644\u0642\u0629"))
          continue;
        const numMatch = decoded.match(/\u0627\u0644\u062D\u0644\u0642\u0629[^\d]*(\d+)/);
        const episodeNumber = numMatch ? Number(numMatch[1]) : 0;
        if (!episodeNumber)
          continue;
        if (episodes.some(function(e) {
          return e.url === href;
        }))
          continue;
        episodes.push({
          url: href,
          season: seasonNumber,
          episode: episodeNumber,
          name: "Episode " + episodeNumber
        });
      }
    }
    const epSection = html.indexOf("episodes__list");
    const epHtml = epSection !== -1 ? html.substring(epSection, html.indexOf("</section>", epSection)) : html;
    parseEpisodes(epHtml, 1);
    const unique = [];
    const seen = /* @__PURE__ */ new Set();
    for (const episode of episodes) {
      const key = `${episode.season}:${episode.episode}:${episode.url}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      unique.push(episode);
    }
    unique.sort(
      (a, b) => a.season - b.season || a.episode - b.episode
    );
    console.log(
      "[ArabSeed] Episodes found:",
      unique.length
    );
    return unique;
  });
}
function getTvStreams(tmdbId, season, episode) {
  return __async(this, null, function* () {
    const info = yield getTmdbInfo(
      tmdbId,
      "tv"
    );
    const candidates = [];
    for (const title of info.titles) {
      const results = yield searchArabSeed(
        title,
        "series"
      );
      candidates.push(
        ...results
      );
    }
    const unique = [];
    for (const candidate of candidates) {
      if (!unique.some(
        (x) => x.url === candidate.url
      )) {
        unique.push(candidate);
      }
    }
    console.log(
      "[ArabSeed] Unique series candidates:",
      unique.length
    );
    const inspected = [];
    for (const candidate of unique.slice(0, 15)) {
      inspected.push(
        yield inspectCandidate(
          candidate
        )
      );
    }
    const selected = chooseCandidate(
      inspected,
      info.titles,
      info.years
    );
    if (!selected) {
      throw new Error(
        "No safe ArabSeed series match"
      );
    }
    console.log(
      "[ArabSeed] SAFE SERIES:",
      selected.pageTitle,
      selected.url
    );
    const episodes = yield getSeriesEpisodes(
      selected.url
    );
    const wantedSeason = Number(season) || 1;
    const wantedEpisode = Number(episode) || 1;
    let selectedEpisode = episodes.find(
      (e) => e.season === wantedSeason && e.episode === wantedEpisode
    );
    if (!selectedEpisode) {
      selectedEpisode = episodes.find(
        (e) => e.episode === wantedEpisode
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
    return yield getStreamsFromPage(
      selectedEpisode.url
    );
  });
}
function getStreams(tmdbId, mediaType, season, episode) {
  return __async(this, null, function* () {
    console.log(
      "[ArabSeed] getStreams:",
      tmdbId,
      mediaType,
      season,
      episode
    );
    if (mediaType === "movie") {
      return yield getMovieStreams(
        tmdbId
      );
    }
    if (mediaType === "tv" || mediaType === "series") {
      return yield getTvStreams(
        tmdbId,
        season,
        episode
      );
    }
    throw new Error(
      `Unsupported media type: ${mediaType}`
    );
  });
}
module.exports = {
  getStreams
};
