// Vercel serverless proxy: resolves a fresh Cuevana HLS URL per request.
// Cuevana signs its .m3u8 URLs for ~7 days; fetching the detail page on demand
// gives us a valid token without hardcoding an expiring link in catalog.json.
const SHOWS = {
  "parede-de-gelo": {
    1: "wdFYzTWzfnuuW009ByWGC-The-Ramparts-of-Ice",
    2: "Bmq3LGmYHqCZ8ClNMGd17-The-Ramparts-of-Ice-Season-2"
  }
};

// 123flmsfree also signs its HLS URLs. The detail page is server-rendered with
// a fresh `mediaUrl`, so resolve it on demand instead of storing a token that
// dies in a few days.
const MOVIES = {
  "outra-mamae": {
    pages: [
      "https://ww1.123flmsfree.com/pt/detail/movie/ScFNBtkLXycDEjkgykG6f-Other-Mommy/0",
      "https://www.123flmsfree.com/pt/detail/movie/ScFNBtkLXycDEjkgykG6f-Other-Mommy/0"
    ],
    // GROOT_SD is the 720P variant on this provider; LD/FD are 540P/360P.
    prefer: "GROOT_SD"
  }
};

const PAGE_BASE = "https://es.cuevana4br.com/pt/detail/drama";
const UA = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36";
const CACHE_TTL = 10 * 60 * 1000;
const cache = new Map();

function parseEpisode(file) {
  const match = String(file || "").match(/(\d+)(?:\.m3u8)?$/i);
  return match ? Number(match[1]) : 0;
}

async function resolveStream({ show, season, episode }) {
  const params = SHOWS[show];
  if (!params) throw Object.assign(new Error("show desconhecido"), { status: 404 });
  const websiteParam = params[Number(season)];
  if (!websiteParam) throw Object.assign(new Error("temporada não encontrada"), { status: 404 });
  if (!episode) throw Object.assign(new Error("episódio inválido"), { status: 400 });

  const key = `${show}:${season}:${episode}`;
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.url;

  const pageUrl = `${PAGE_BASE}/${websiteParam}/${episode}`;
  const response = await fetch(pageUrl, {
    headers: {
      "user-agent": UA,
      accept: "text/html,application/xhtml+xml",
      referer: "https://es.cuevana4br.com/"
    },
    redirect: "follow"
  });
  if (!response.ok) throw Object.assign(new Error(`cuevana HTTP ${response.status}`), { status: 502 });

  const html = await response.text();
  const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!match) throw Object.assign(new Error("__NEXT_DATA__ ausente"), { status: 502 });

  let data;
  try { data = JSON.parse(match[1]); } catch {
    throw Object.assign(new Error("JSON inválido"), { status: 502 });
  }
  const page = data?.props?.pageProps;
  if (!page) throw Object.assign(new Error("pageProps ausente"), { status: 502 });
  if (page.currentEpisodeNumber != null && String(page.currentEpisodeNumber) !== String(episode)) {
    throw Object.assign(new Error("episódio divergente"), { status: 404 });
  }

  const media = Array.isArray(page.mediaInfoList)
    ? page.mediaInfoList.find((entry) => entry?.currentDefinition === "GROOT_SD") || page.mediaInfoList[0]
    : null;
  if (!media?.mediaUrl) throw Object.assign(new Error("stream indisponível"), { status: 404 });

  cache.set(key, { url: media.mediaUrl, expires: Date.now() + CACHE_TTL });
  return media.mediaUrl;
}

function decodeMediaUrl(value) {
  return String(value || "")
    .replace(/\\u0026/gi, "&")
    .replace(/\\\//g, "/")
    .replace(/&amp;/gi, "&");
}

function hlsExpiry(url) {
  const match = String(url || "").match(/[?&]hdnts=[^#]*?exp=(\d+)/i);
  return match ? Number(match[1]) * 1000 : 0;
}

function pick123Stream(html, prefer) {
  const entries = [];
  const re = /"currentDefinition"\s*:\s*"([^"]+)"\s*,\s*"mediaUrl"\s*:\s*"([^"]+)"/g;
  let match;
  while ((match = re.exec(html))) {
    entries.push({ definition: match[1], url: decodeMediaUrl(match[2]) });
  }
  if (entries.length) {
    const chosen = entries.find((entry) => entry.definition === prefer) || entries[0];
    return chosen.url;
  }
  const fallback = html.match(/https?:\/\/[^"'\\\s]+\.m3u8[^"'\\\s]*/);
  return fallback ? decodeMediaUrl(fallback[0]) : "";
}

async function resolve123Movie({ movie }) {
  const params = MOVIES[movie];
  if (!params) throw Object.assign(new Error("filme desconhecido"), { status: 404 });

  const key = `123:${movie}`;
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.url;

  let lastStatus = 0;
  for (const page of params.pages) {
    const pageUrl = `${page}${page.includes("?") ? "&" : "?"}t=${Date.now()}`;
    let response;
    try {
      response = await fetch(pageUrl, {
        headers: {
          "user-agent": UA,
          accept: "text/html,application/xhtml+xml",
          "accept-language": "pt-BR,pt;q=0.9,en;q=0.8",
          referer: "https://ww1.123flmsfree.com/",
          "cache-control": "no-cache",
          pragma: "no-cache"
        },
        redirect: "follow",
        cache: "no-store"
      });
    } catch {
      continue;
    }
    lastStatus = response.status;
    if (!response.ok) continue;
    const html = await response.text();
    const url = pick123Stream(html, params.prefer);
    if (!url) continue;
    const expiresAt = hlsExpiry(url);
    if (expiresAt && expiresAt < Date.now() + 60000) continue;
    const ttl = expiresAt ? Math.min(CACHE_TTL, expiresAt - Date.now() - 60000) : CACHE_TTL;
    cache.set(key, { url, expires: Date.now() + Math.max(60000, ttl) });
    return url;
  }

  throw Object.assign(new Error(`123flmsfree HTTP ${lastStatus || "sem resposta"}`), { status: 502 });
}

module.exports = async function handler(req, res) {
  try {
    const movie = String(req.query?.movie || "").toLowerCase();
    const show = String(req.query?.show || "").toLowerCase();
    const season = Number(req.query?.season || 0);
    const episode = parseEpisode(req.query?.file || req.query?.ep || req.query?.episode);
    const url = movie
      ? await resolve123Movie({ movie })
      : await resolveStream({ show, season, episode });
    res.statusCode = 302;
    res.setHeader("Location", url);
    res.setHeader("Cache-Control", "no-store, max-age=0");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.end();
  } catch (error) {
    const status = error.status || 502;
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.end(JSON.stringify({ error: error.message || "stream indisponível" }));
  }
};
