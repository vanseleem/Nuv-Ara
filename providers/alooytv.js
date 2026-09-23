"use strict";
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
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36";
const DOMAIN = "https://dm.alooytv16.xyz";
function decodeHtml(str) {
  return String(str).replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").replace(/&#x27;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">");
}
function clean(str) {
  return decodeHtml(String(str || "")).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
function get(_0) {
  return __async(this, arguments, function* (url, referer = DOMAIN + "/") {
    const res = yield fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Referer": referer
      },
      redirect: "follow"
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} for ${url}`);
    }
    return yield res.text();
  });
}
function absoluteUrl(value, base) {
  const raw = String(value || "").trim();
  if (!raw)
    return "";
  if (/^https?:\/\//i.test(raw)) {
    return raw;
  }
  if (raw.startsWith("//")) {
    const schemeMatch = String(base).match(/^https?:/i);
    return (schemeMatch ? schemeMatch[0] : "https:") + raw;
  }
  if (raw.startsWith("/")) {
    const originMatch = String(base).match(/^(https?:\/\/[^/]+)/i);
    return originMatch ? originMatch[1] + raw : raw;
  }
  const cleanBase = String(base).split("?")[0].split("#")[0];
  const slash = cleanBase.lastIndexOf("/");
  if (slash >= 0) {
    return cleanBase.slice(0, slash + 1) + raw;
  }
  return raw;
}
function extractWatchLinks(html, base) {
  const out = [];
  const re = /href\s*=\s*["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    let href = decodeHtml(m[1]).trim();
    if (!href)
      continue;
    try {
      href = absoluteUrl(href, base);
    } catch (_) {
      continue;
    }
    if (!/\/watch\//i.test(href))
      continue;
    if (!out.includes(href)) {
      out.push(href);
    }
  }
  return out;
}
function extractEpisodeLink(html, base, wantedEpisode) {
  const wanted = Number(wantedEpisode);
  const anchorRe = /<a\b[^>]*>[\s\S]*?<\/a>/gi;
  let anchor;
  while ((anchor = anchorRe.exec(html)) !== null) {
    const tag = anchor[0];
    const hrefMatch = tag.match(/\bhref\s*=\s*["']([^"']+)["']/i);
    if (!hrefMatch)
      continue;
    const episodeMatch = tag.match(/Ep\s*#\s*(\d+)/i);
    if (!episodeMatch)
      continue;
    const ep = Number(episodeMatch[1]);
    if (ep !== wanted)
      continue;
    const rawHref = decodeHtml(hrefMatch[1]).trim();
    if (!rawHref)
      continue;
    let absolute;
    try {
      absolute = absoluteUrl(rawHref, base);
    } catch (_) {
      continue;
    }
    if (!/\/watch\//i.test(absolute))
      continue;
    if (!/[?&]key=/i.test(absolute))
      continue;
    return absolute;
  }
  return null;
}
function extractSources(html) {
  const sources = [];
  function add(url) {
    if (!url)
      return;
    url = decodeHtml(url).trim();
    if (url.startsWith("//")) {
      url = "https:" + url;
    }
    if (!/^https?:\/\//i.test(url)) {
      return;
    }
    if (!sources.includes(url)) {
      sources.push(url);
    }
  }
  const sourceRe = /<source\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let m;
  while ((m = sourceRe.exec(html)) !== null) {
    add(m[1]);
  }
  const downloadRe = /download_video\.php\?[^"'<>]*?\bvideo_url=([^&"'<>]+)/gi;
  while ((m = downloadRe.exec(html)) !== null) {
    try {
      let encoded = decodeURIComponent(m[1]);
      encoded = encoded.replace(/-/g, "+").replace(/_/g, "/");
      while (encoded.length % 4) {
        encoded += "=";
      }
      const decoded = Buffer.from(encoded, "base64").toString("utf8");
      add(decoded);
    } catch (_) {
    }
  }
  const unique = [];
  const seenPaths = /* @__PURE__ */ new Set();
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
  if (/2160|4k/.test(s))
    return "4K";
  if (/1440/.test(s))
    return "1440p";
  if (/1080/.test(s))
    return "1080p";
  if (/720/.test(s))
    return "720p";
  if (/480/.test(s))
    return "480p";
  if (/360/.test(s))
    return "360p";
  return "Unknown";
}
function makeStream(url, episode) {
  return {
    name: "AlooyTV",
    title: `AlooyTV \u2022 Episode ${episode}`,
    url,
    quality: qualityFromUrl(url),
    headers: {
      "User-Agent": USER_AGENT,
      "Referer": DOMAIN + "/"
    }
  };
}
function tmdbTitles(tmdbId) {
  return __async(this, null, function* () {
    const urls = [
      `https://www.themoviedb.org/tv/${encodeURIComponent(tmdbId)}?language=ar`,
      `https://www.themoviedb.org/tv/${encodeURIComponent(tmdbId)}?language=en`
    ];
    const titles = [];
    for (const url of urls) {
      try {
        const html = yield get(url);
        const patterns = [
          /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
          /<title[^>]*>([\s\S]*?)<\/title>/i
        ];
        for (const re of patterns) {
          const m = html.match(re);
          if (!m)
            continue;
          let title = clean(m[1]);
          title = title.replace(/\s*\(TV Series[^)]*\).*$/i, "").replace(/\s*—\s*The Movie Database.*$/i, "").trim();
          if (title && !titles.includes(title)) {
            titles.push(title);
          }
        }
      } catch (_) {
      }
    }
    return titles;
  });
}
function searchAlooy(title) {
  return __async(this, null, function* () {
    if (!title)
      return [];
    const url = `${DOMAIN}/search?q=${encodeURIComponent(title)}`;
    const html = yield get(url, DOMAIN + "/");
    return extractWatchLinks(html, url);
  });
}
function getStreams(tmdbId, mediaType, season, episode) {
  return __async(this, null, function* () {
    console.log(
      "[AlooyTV] Request:",
      tmdbId,
      mediaType,
      season,
      episode
    );
    if (!tmdbId)
      return [];
    if (mediaType !== "tv")
      return [];
    if (!episode)
      return [];
    const wantedEpisode = Number(episode);
    if (!Number.isFinite(wantedEpisode) || wantedEpisode < 1) {
      return [];
    }
    const titles = yield tmdbTitles(tmdbId);
    console.log("[AlooyTV] Titles:", titles);
    if (!titles.length) {
      return [];
    }
    const watchPages = [];
    for (const title of titles) {
      try {
        const found = yield searchAlooy(title);
        console.log(
          "[AlooyTV] Search:",
          title,
          "=>",
          found.length,
          "watch links"
        );
        for (const link of found) {
          if (!watchPages.includes(link)) {
            watchPages.push(link);
          }
        }
        if (found.length) {
          break;
        }
      } catch (e) {
        console.log(
          "[AlooyTV] Search failed:",
          title,
          e.message
        );
      }
    }
    console.log("[AlooyTV] Watch pages:", watchPages.length);
    const streams = [];
    const seen = /* @__PURE__ */ new Set();
    for (const watchUrl of watchPages) {
      try {
        const seriesHtml = yield get(
          watchUrl,
          DOMAIN + "/"
        );
        const episodeUrl = extractEpisodeLink(
          seriesHtml,
          watchUrl,
          wantedEpisode
        );
        console.log(
          `[AlooyTV] Episode ${wantedEpisode} link:`,
          episodeUrl || "NOT FOUND"
        );
        if (!episodeUrl) {
          continue;
        }
        const episodeHtml = yield get(
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
          "[AlooyTV] Watch/episode failed:",
          watchUrl,
          e.message
        );
      }
    }
    console.log(
      "[AlooyTV] Final streams:",
      streams.length
    );
    return streams;
  });
}
module.exports = {
  getStreams
};
