var BASE = "https://akwam.ss";
var UA = "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Mobile Safari/537.36";

function fetchText(url, referer) {
  var headers = {
    "User-Agent": UA,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
  };

  if (referer)
    headers["Referer"] = referer;

  return fetch(url, {
    headers: headers,
    redirect: "follow"
  }).then(function(r) {
    if (!r.ok)
      throw new Error("HTTP " + r.status);
    return r.text();
  });
}

function decodeHtml(str) {
  return String(str || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function stripHtml(str) {
  return decodeHtml(String(str || ""))
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTitle(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
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

  var aa = new Set(a.split(" "));
  var bb = new Set(b.split(" "));
  var common = 0;

  aa.forEach(function(x) {
    if (bb.has(x))
      common++;
  });

  return common / Math.max(aa.size, bb.size);
}

function getSearchTitle(tmdbId, mediaType) {
  var type = mediaType === "tv" ? "tv" : "movie";

  var urls = [
    "https://www.themoviedb.org/" + type + "/" + encodeURIComponent(tmdbId),
    "https://www.themoviedb.org/" + type + "/" + encodeURIComponent(tmdbId) + "?language=ar"
  ];

  return Promise.all(
    urls.map(function(url) {
      return fetchText(url).catch(function() {
        return "";
      });
    })
  ).then(function(pages) {
    var titles = [];
    var years = [];

    pages.forEach(function(html) {
      if (!html)
        return;

      var m;

      m = html.match(
        /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i
      );

      if (m) {
        var title = decodeHtml(m[1])
          .replace(/\s*\|\s*TMDB\s*$/i, "")
          .replace(/\s*-\s*The Movie Database\s*$/i, "")
          .trim();

        if (title && titles.indexOf(title) === -1)
          titles.push(title);
      }

      m = html.match(
        /<meta[^>]+name=["']twitter:title["'][^>]+content=["']([^"']+)/i
      );

      if (m) {
        var twitterTitle = decodeHtml(m[1])
          .replace(/\s*\|\s*TMDB\s*$/i, "")
          .trim();

        if (twitterTitle && titles.indexOf(twitterTitle) === -1)
          titles.push(twitterTitle);
      }

      m = html.match(
        /"original_title"\s*:\s*"([^"]+)"/i
      );

      if (m) {
        var original = decodeHtml(m[1]);

        if (original && titles.indexOf(original) === -1)
          titles.push(original);
      }

      m = html.match(
        /"release_date"\s*:\s*"([0-9]{4})-[0-9]{2}-[0-9]{2}"/i
      );

      if (m && years.indexOf(m[1]) === -1)
        years.push(m[1]);

      m = html.match(
        /\b(19[0-9]{2}|20[0-9]{2})\b/
      );

      if (m && years.indexOf(m[1]) === -1)
        years.push(m[1]);
    });

    if (!titles.length)
      throw new Error("Could not extract TMDB titles");

    console.log("[Akwam] TMDB titles:", titles.join(" | "));
    console.log("[Akwam] TMDB years:", years.join(" | "));

    return {
      titles: titles,
      year: years.length ? years[0] : null,
      title: titles[0]
    };
  });
}

function extractSearchResults(html) {
  var results = [];
  var seen = new Set();

  var re =
    /<a\b[^>]*href=["']([^"']*\/(?:movie|series)\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

  var m;

  while ((m = re.exec(html)) !== null) {
    var url = decodeHtml(m[1]);
    var block = m[2];

    if (seen.has(url))
      continue;

    var title = "";

    var titleMatch =
      block.match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i) ||
      block.match(
        /class=["'][^"']*(?:entry-title|title|text-white)[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i
      );

    if (titleMatch)
      title = stripHtml(titleMatch[1]);

    if (!title || title === "-->" || title.length < 2) {
      var pathMatch = url.match(
        /\/(?:movie|series)\/[^\/]+\/([^?#"']+)/i
      );

      if (pathMatch) {
        try {
          title = decodeURIComponent(pathMatch[1]);
        } catch (e) {
          title = pathMatch[1];
        }

        title = title
          .replace(/[-_]+/g, " ")
          .replace(/\s+/g, " ")
          .trim();
      }
    }

    if (!title || title === "-->" || title.length < 2)
      continue;

    var absolute = url.startsWith("http")
      ? url
      : BASE + url;

    seen.add(url);

    results.push({
      url: absolute,
      title: title
    });
  }

  return results;
}

function searchAkwam(title) {
  var url =
    BASE +
    "/search?q=" +
    encodeURIComponent(title);

  console.log("[Akwam] Search:", url);

  return fetchText(url, BASE).then(function(html) {
    var results = extractSearchResults(html);

    console.log(
      "[Akwam] Search results for",
      title + ":",
      results.length
    );

    return results;
  });
}

function getCandidatePage(url) {
  return fetchText(url, BASE).then(function(html) {
    var title = "";

    var m = html.match(
      /<h1[^>]*class=["'][^"']*entry-title[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i
    );

    if (!m) {
      m = html.match(
        /<h1[^>]*>([\s\S]*?)<\/h1>/i
      );
    }

    if (m)
      title = stripHtml(m[1]);

    var year = null;

    m = html.match(
      /\b(19[0-9]{2}|20[0-9]{2})\b/
    );

    if (m)
      year = m[1];

    return {
      url: url,
      title: title,
      year: year,
      html: html
    };
  });
}

function chooseResult(results, meta) {
  if (!results || !results.length)
    return Promise.resolve(null);

  var candidates = [];

  return Promise.all(
    results.map(function(result) {
      return getCandidatePage(result.url)
        .then(function(page) {
          candidates.push(page);

          console.log(
            "[Akwam] Candidate page:",
            page.title || result.title,
            "year:",
            page.year || "?"
          );

          return page;
        })
        .catch(function() {
          return null;
        });
    })
  ).then(function() {
    var best = null;
    var bestScore = 0;

    candidates.forEach(function(candidate) {
      if (!candidate)
        return;

      var titleScore = 0;

      meta.titles.forEach(function(tmdbTitle) {
        var score = similarity(
          candidate.title,
          tmdbTitle
        );

        if (score > titleScore)
          titleScore = score;
      });

      var yearScore = 0;

      if (
        meta.year &&
        candidate.year &&
        String(meta.year) === String(candidate.year)
      ) {
        yearScore = 0.25;
      }

      var total = titleScore + yearScore;

      console.log(
        "[Akwam] Match:",
        candidate.title,
        "title:",
        titleScore.toFixed(3),
        "year:",
        yearScore ? "MATCH" : "NO",
        "total:",
        total.toFixed(3)
      );

      if (total > bestScore) {
        bestScore = total;
        best = candidate;
      }
    });

    /*
     * Critical safety rule:
     * never choose an unrelated Akwam result just because
     * it happened to be returned by the search page.
     */
    if (!best || bestScore < 0.80) {
      console.log(
        "[Akwam] No safe title match. Best score:",
        bestScore.toFixed(3)
      );

      return null;
    }

    console.log(
      "[Akwam] SAFE SELECT:",
      best.title,
      best.url,
      "score:",
      bestScore.toFixed(3)
    );

    return best;
  });
}

function extractWatchUrls(html) {
  var urls = [];
  var seen = new Set();

  var re =
    /href=["']([^"']*\/watch\/[^"']+)["']/gi;

  var m;

  while ((m = re.exec(html)) !== null) {
    var url = decodeHtml(m[1]);

    var absolute = url.startsWith("http")
      ? url
      : BASE + url;

    if (!seen.has(absolute)) {
      seen.add(absolute);
      urls.push(absolute);
    }
  }

  return urls;
}

function extractSources(html) {
  var streams = [];
  var seen = new Set();

  var re = /<source\b[^>]*>/gi;
  var tag;

  while ((tag = re.exec(html)) !== null) {
    var source = tag[0];

    var srcMatch =
      source.match(/\bsrc=["']([^"']+)["']/i);

    if (!srcMatch)
      continue;

    var url = decodeHtml(srcMatch[1]).trim();

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

    var qualityMatch =
      source.match(/\bsize=["']([^"']+)["']/i) ||
      source.match(/\blabel=["']([^"']+)["']/i);

    var quality =
      qualityMatch
        ? qualityMatch[1]
        : "Unknown";

    streams.push({
      name: "Akwam",
      title:
        quality === "Unknown"
          ? "Akwam"
          : "Akwam " + quality,
      url: url,
      quality: quality
    });
  }

  return streams;
}

function getMovieStreams(tmdbId) {
  return getSearchTitle(tmdbId, "movie")
    .then(function(meta) {

      var searches = meta.titles.slice();

      /*
       * Search every known TMDB title variant.
       */
      return Promise.all(
        searches.map(function(title) {
          return searchAkwam(title)
            .catch(function() {
              return [];
            });
        })
      ).then(function(groups) {

        var all = [];
        var seen = new Set();

        groups.forEach(function(group) {
          group.forEach(function(result) {
            if (!seen.has(result.url)) {
              seen.add(result.url);
              all.push(result);
            }
          });
        });

        console.log(
          "[Akwam] Unique candidates:",
          all.length
        );

        return chooseResult(all, meta);
      }).then(function(result) {

        if (!result)
          return [];

        return Promise.resolve(result.html)
          .then(function(html) {

            var watchUrls =
              extractWatchUrls(html);

            console.log(
              "[Akwam] Watch pages:",
              watchUrls.length
            );

            return Promise.all(
              watchUrls.map(function(watchUrl) {
                return fetchText(
                  watchUrl,
                  result.url
                )
                  .then(function(watchHtml) {
                    return extractSources(
                      watchHtml
                    );
                  })
                  .catch(function() {
                    return [];
                  });
              })
            );
          })
          .then(function(groups) {
            return groups.flat();
          });
      });
    })
    .catch(function(err) {
      console.error(
        "[Akwam] Movie error:",
        err.message
      );

      return [];
    });
}

function getTvStreams(tmdbId, season, episode) {
  return getSearchTitle(tmdbId, "tv")
    .then(function(meta) {
      return searchAkwam(meta.title)
        .then(function(results) {
          var result =
            chooseResult(results, meta.title);

          if (!result)
            return [];

          return fetchText(result.url, BASE)
            .then(function(html) {
              var episodeLinks = [];
              var seen = new Set();

              var re =
                /href=["']([^"']*\/episode\/[^"']+)["']/gi;

              var m;

              while ((m = re.exec(html)) !== null) {
                var url = decodeHtml(m[1]);

                var absolute =
                  url.startsWith("http")
                    ? url
                    : BASE + url;

                if (!seen.has(absolute)) {
                  seen.add(absolute);
                  episodeLinks.push(absolute);
                }
              }

              var wanted =
                Number(episode);

              var selected =
                episodeLinks.filter(function(url) {
                  var match =
                    url.match(
                      /episode[^0-9]*([0-9]+)/i
                    );

                  return (
                    match &&
                    Number(match[1]) === wanted
                  );
                });

              return Promise.all(
                selected.map(function(url) {
                  return fetchText(
                    url,
                    result.url
                  )
                    .then(function(epHtml) {
                      var watchUrls =
                        extractWatchUrls(epHtml);

                      return Promise.all(
                        watchUrls.map(function(watchUrl) {
                          return fetchText(
                            watchUrl,
                            url
                          )
                            .then(function(watchHtml) {
                              return extractSources(
                                watchHtml
                              );
                            })
                            .catch(function() {
                              return [];
                            });
                        })
                      );
                    })
                    .then(function(groups) {
                      return groups.flat();
                    })
                    .catch(function() {
                      return [];
                    });
                })
              ).then(function(groups) {
                return groups.flat();
              });
            });
        });
    })
    .catch(function(err) {
      console.error(
        "[Akwam] TV error:",
        err.message
      );

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

  if (mediaType === "tv") {
    return getTvStreams(
      tmdbId,
      season,
      episode
    );
  }

  return getMovieStreams(tmdbId);
}

module.exports = {
  getStreams: getStreams
};
