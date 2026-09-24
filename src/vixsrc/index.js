const BASE = "https://vixsrc.to";

function parseId(raw) {
  var s = String(raw).trim();
  if (s.startsWith("tmdb:")) return s.slice(5);
  if (/^\d+$/.test(s)) return s;
  if (s.startsWith("tt")) return s;
  return null;
}

function movieUrl(id, lang) {
  var url = BASE + "/movie/" + id;
  if (lang) url += "?lang=" + encodeURIComponent(lang);
  return url;
}

function tvUrl(id, season, episode, lang) {
  var url = BASE + "/tv/" + id + "/" + season + "/" + episode;
  if (lang) url += "?lang=" + encodeURIComponent(lang);
  return url;
}

async function getStreams(ctx) {
  var id = ctx.id;
  var type = ctx.type;
  var season = ctx.season;
  var episode = ctx.episode;
  var settings = ctx.settings || {};
  var parsedId = parseId(id);
  var lang = settings.preferredLanguage || undefined;
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
}

module.exports = { getStreams };
