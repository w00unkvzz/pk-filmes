// Vercel serverless proxy: resolves a fresh Cuevana HLS URL per request.
// Cuevana signs its .m3u8 URLs for ~7 days; fetching the detail page on demand
// gives us a valid token without hardcoding an expiring link in catalog.json.
const SHOWS = {
  "parede-de-gelo": {
    1: "wdFYzTWzfnuuW009ByWGC-The-Ramparts-of-Ice",
    2: "Bmq3LGmYHqCZ8ClNMGd17-The-Ramparts-of-Ice-Season-2"
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

module.exports = async function handler(req, res) {
  try {
    const show = String(req.query?.show || "").toLowerCase();
    const season = Number(req.query?.season || 0);
    const episode = parseEpisode(req.query?.file || req.query?.ep || req.query?.episode);
    const url = await resolveStream({ show, season, episode });
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
