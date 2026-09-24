/**
 * vixsrc - Built from src/vixsrc/
 * Generated: 2026-09-24T11:13:19.113Z
 */
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

// src/vixsrc/index.js
var BASE = "https://vixsrc.to";
function parseId(raw) {
  var s = String(raw).trim();
  if (s.startsWith("tmdb:"))
    return s.slice(5);
  if (/^\d+$/.test(s))
    return s;
  if (s.startsWith("tt"))
    return s;
  return null;
}
function movieUrl(id, lang) {
  var url = BASE + "/movie/" + id;
  if (lang)
    url += "?lang=" + encodeURIComponent(lang);
  return url;
}
function tvUrl(id, season, episode, lang) {
  var url = BASE + "/tv/" + id + "/" + season + "/" + episode;
  if (lang)
    url += "?lang=" + encodeURIComponent(lang);
  return url;
}
function getStreams(ctx) {
  return __async(this, null, function* () {
    var id = ctx.id;
    var type = ctx.type;
    var season = ctx.season;
    var episode = ctx.episode;
    var settings = ctx.settings || {};
    var parsedId = parseId(id);
    var lang = settings.preferredLanguage || void 0;
    var embedUrl;
    if (type === "movie") {
      embedUrl = movieUrl(parsedId, lang);
    } else if (type === "tv" || type === "series") {
      embedUrl = tvUrl(parsedId, season, episode, lang);
    } else {
      return [];
    }
    return [
      {
        name: "VixSrc",
        description: "45K+ movies and 15K+ shows",
        url: embedUrl,
        type: "iframe",
        quality: "Auto",
        source: "VixSrc",
        behaviorHints: { isIframe: true, notWebReady: false }
      }
    ];
  });
}
module.exports = { getStreams };
