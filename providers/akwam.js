/**
 * akwam - Built from src/akwam/
 * Generated: 2026-09-22T23:07:44.797Z
 */

// src/akwam/index.js
var BASE = "https://akwam.ss";
var UA = "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Mobile Safari/537.36";
function fetchText(url, referer) {
  const headers = {
    "User-Agent": UA,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
  };
  if (referer)
    headers["Referer"] = referer;
  return fetch(url, { headers }).then(function(r) {
    if (!r.ok)
      throw new Error("HTTP " + r.status);
    return r.text();
  });
}
function htmlDecode(str) {
  return String(str || "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}
function stripHtml(str) {
  return htmlDecode(String(str || "")).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
function normalizeTitle(str) {
  return String(str || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim();
}
function similarity(a, b) {
  a = normalizeTitle(a);
  b = normalizeTitle(b);
  if (!a || !b)
    return 0;
  if (a === b)
    return 1;
  if (a.includes(b) || b.includes(a))
    return 0.85;
  const aa = new Set(a.split(" "));
  const bb = new Set(b.split(" "));
  let common = 0;
  aa.forEach(function(x) {
    if (bb.has(x))
      common++;
  });
  return common / Math.max(aa.size, bb.size);
}
function extractSearchResults(html) {
  const results = [];
  const seen = /* @__PURE__ */ new Set();
  const re = /<a\b[^>]*href=["']([^"']*\/(?:movie|series)\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const url = htmlDecode(m[1]);
    const block = m[2];
    if (seen.has(url))
      continue;
    const titleMatch = block.match(/class=["'][^"']*(?:text-white|entry-title)[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i) || block.match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i);
    const title = stripHtml(titleMatch ? titleMatch[1] : block);
    if (!title || title.length < 2)
      continue;
    seen.add(url);
    results.push({
      url: url.startsWith("http") ? url : BASE + url,
      title
    });
  }
  return results;
}
function extractWatchUrls(html) {
  const urls = [];
  const seen = /* @__PURE__ */ new Set();
  const re = /href=["']([^"']*\/watch\/[^"']+)["']/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const url = htmlDecode(m[1]);
    const absolute = url.startsWith("http") ? url : BASE + url;
    if (!seen.has(absolute)) {
      seen.add(absolute);
      urls.push(absolute);
    }
  }
  return urls;
}
function extractSources(html) {
  const streams = [];
  const seen = /* @__PURE__ */ new Set();
  const re = /<source\b[^>]*>/gi;
  let tag;
  while ((tag = re.exec(html)) !== null) {
    const source = tag[0];
    const srcMatch = source.match(/\bsrc=["']([^"']+)["']/i);
    if (!srcMatch)
      continue;
    let url = htmlDecode(srcMatch[1]).trim();
    if (!url)
      continue;
    if (url.startsWith("//")) {
      url = "https:" + url;
    } else if (url.startsWith("/")) {
      url = BASE + url;
    }
    if (seen.has(url))
      continue;
    seen.add(url);
    const qualityMatch = source.match(/\bsize=["']([^"']+)["']/i) || source.match(/\blabel=["']([^"']+)["']/i);
    const quality = qualityMatch ? qualityMatch[1] : "Unknown";
    streams.push({
      name: "Akwam",
      title: quality === "Unknown" ? "Akwam" : "Akwam " + quality,
      url,
      quality
    });
  }
  return streams;
}
function getCinemetaMeta(tmdbId, mediaType) {
  const type = mediaType === "tv" ? "series" : "movie";
  const id = "tmdb:" + tmdbId;
  const url = "https://v3-cinemeta.strem.io/meta/" + type + "/" + encodeURIComponent(id) + ".json";
  return fetch(url, {
    headers: {
      "User-Agent": UA,
      "Accept": "application/json"
    }
  }).then(function(r) {
    if (!r.ok)
      throw new Error("Cinemeta HTTP " + r.status);
    return r.json();
  }).then(function(data) {
    return data && data.meta ? data.meta : null;
  });
}
function getSearchTitle(tmdbId, mediaType) {
  return getCinemetaMeta(tmdbId, mediaType).then(function(meta) {
    if (!meta || !meta.name) {
      throw new Error("No metadata title");
    }
    return {
      title: meta.name,
      year: meta.year || null
    };
  });
}
function searchAkwam(title) {
  const url = BASE + "/search?q=" + encodeURIComponent(title);
  return fetchText(url).then(function(html) {
    return extractSearchResults(html);
  });
}
function chooseResult(results, title) {
  if (!results.length)
    return null;
  let best = results[0];
  let bestScore = similarity(title, best.title);
  results.forEach(function(r) {
    const score = similarity(title, r.title);
    if (score > bestScore) {
      best = r;
      bestScore = score;
    }
  });
  return bestScore >= 0.45 ? best : null;
}
function getMovieStreams(tmdbId) {
  return getSearchTitle(tmdbId, "movie").then(function(meta) {
    return searchAkwam(meta.title).then(function(results) {
      const result = chooseResult(results, meta.title);
      if (!result)
        return [];
      return fetchText(result.url, BASE).then(function(html) {
        const watchUrls = extractWatchUrls(html);
        return Promise.all(
          watchUrls.map(function(watchUrl) {
            return fetchText(watchUrl, result.url).then(function(watchHtml) {
              return extractSources(watchHtml);
            }).catch(function() {
              return [];
            });
          })
        ).then(function(groups) {
          return groups.reduce(function(all, group) {
            return all.concat(group);
          }, []);
        });
      });
    });
  }).catch(function(error) {
    console.log("[Akwam] Movie error:", error.message);
    return [];
  });
}
function getTvStreams(tmdbId, season, episode) {
  return getSearchTitle(tmdbId, "tv").then(function(meta) {
    return searchAkwam(meta.title).then(function(results) {
      const result = chooseResult(results, meta.title);
      if (!result)
        return [];
      return fetchText(result.url, BASE).then(function(html) {
        const episodeLinks = [];
        const re = /href=["']([^"']*\/episode\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
        let m;
        while ((m = re.exec(html)) !== null) {
          const url = m[1].startsWith("http") ? m[1] : BASE + m[1];
          const text = stripHtml(m[2]);
          const nums = text.match(/\d+/g) || [];
          const ep = nums.length ? parseInt(nums[nums.length - 1], 10) : null;
          if (ep === episode) {
            episodeLinks.push(url);
          }
        }
        return Promise.all(
          episodeLinks.map(function(episodeUrl) {
            return fetchText(episodeUrl, result.url).then(function(episodeHtml) {
              const watchUrls = extractWatchUrls(episodeHtml);
              return Promise.all(
                watchUrls.map(function(watchUrl) {
                  return fetchText(watchUrl, episodeUrl).then(function(watchHtml) {
                    return extractSources(watchHtml);
                  }).catch(function() {
                    return [];
                  });
                })
              );
            }).then(function(groups) {
              return groups.reduce(function(all, group) {
                return all.concat(group);
              }, []);
            }).catch(function() {
              return [];
            });
          })
        ).then(function(groups) {
          return groups.reduce(function(all, group) {
            return all.concat(group);
          }, []);
        });
      });
    });
  }).catch(function(error) {
    console.log("[Akwam] TV error:", error.message);
    return [];
  });
}
function getStreams(tmdbId, mediaType, season, episode) {
  console.log(
    "[Akwam] getStreams:",
    tmdbId,
    mediaType,
    season,
    episode
  );
  if (!tmdbId)
    return Promise.resolve([]);
  if (mediaType === "movie") {
    return getMovieStreams(tmdbId);
  }
  if (mediaType === "tv") {
    return getTvStreams(tmdbId, season, episode);
  }
  return Promise.resolve([]);
}
module.exports = { getStreams };
