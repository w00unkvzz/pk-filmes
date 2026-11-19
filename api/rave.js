// Server-rendered Rave page. The reference site does not embed a player: it
// publishes a schema.org VideoObject with contentUrl/embedUrl and lets the Rave
// app pick the stream up. Keeping the same shape is what makes the Rave player
// appear instead of a dead HTML5 <video>.
const crypto = require("crypto");
const catalog = require("../catalog.json");

const UA = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36";
const FALLBACK_ORIGIN = "https://w00filmes.vercel.app";
const PROXY_SECRET = process.env.RAVE_PROXY_SECRET || "w00-rave-stream-v1";

function proxySignature(url) {
  return crypto.createHmac("sha256", PROXY_SECRET).update(String(url)).digest("base64url").slice(0, 32);
}

function isHlsUrl(url) {
  return /\.m3u8(?:$|\?)/i.test(String(url || ""));
}

function isMp4Url(url) {
  return /\.mp4(?:$|\?)/i.test(String(url || ""));
}

function ravePlaybackUrl(origin, stream) {
  if (!isHlsUrl(stream)) return stream;
  return `${origin}/rave-stream.m3u8?u=${encodeURIComponent(stream)}&s=${proxySignature(stream)}`;
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[ch]));
}

function slugify(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90) || "titulo";
}

function findItem(id) {
  return (catalog.items || []).find((item) => String(item.id) === String(id));
}

function parseEpisodeTitle(title) {
  const match = String(title).match(/\s*[-–]\s*T(\d+)\s*E(\d+)\b([\s\S]*)$/i);
  if (!match) return null;
  return {
    base: String(title).slice(0, match.index).trim(),
    season: Number(match[1]),
    episode: Number(match[2]),
    extra: String(match[3] || "").replace(/^\s*[-–]\s*/, "").trim()
  };
}

function buildSeriesIndex() {
  const byId = new Map();
  const groups = new Map();
  for (const item of catalog.items || []) {
    if (!(item.tipo === "serie" || item.tipo === "series" || item.type === "series")) continue;
    const title = String(item.nome || item.title || "");
    const parsed = parseEpisodeTitle(title);
    const base = parsed?.base || title;
    const key = base.toLowerCase();
    let group = groups.get(key);
    if (!group) {
      group = { key, base, items: [] };
      groups.set(key, group);
    }
    group.items.push({
      item,
      season: parsed?.season ?? 1,
      episode: parsed?.episode ?? group.items.length + 1,
      name: parsed?.extra || title
    });
    byId.set(item.id, group);
  }
  for (const group of groups.values()) {
    group.items.sort((a, b) => a.season - b.season || a.episode - b.episode);
    const seasonNumbers = [...new Set(group.items.map((entry) => entry.season))].sort((a, b) => a - b);
    group.seasons = seasonNumbers.map((number) => ({
      number,
      episodes: group.items.filter((entry) => entry.season === number)
    }));
  }
  return { byId, groups: [...groups.values()] };
}

const SERIES_INDEX = buildSeriesIndex();

function seriesGroupFor(item) {
  return SERIES_INDEX.byId.get(item.id) || null;
}

function episodeListMarkup(item, group) {
  if (!group || !group.items.length) return "";
  const currentId = String(item.id);
  const seasons = group.seasons.map((season) => {
    const rows = season.episodes.map((entry) => {
      const active = String(entry.item.id) === currentId;
      const label = entry.name && entry.name !== entry.item.nome
        ? entry.name
        : `Episódio ${entry.episode}`;
      const runtime = durationLabel(entry.item.duracao || entry.item.duration || 0);
      return `<a class="episode${active ? " current" : ""}" href="/rave/${encodeURIComponent(entry.item.id)}"${active ? ' aria-current="true"' : ""}>
        <span class="episode-num">${entry.episode}</span>
        <span class="episode-name">${escapeHTML(label)}</span>
        ${runtime ? `<span class="episode-time">${escapeHTML(runtime)}</span>` : ""}
      </a>`;
    }).join("");
    return `<div class="season">
      <h3>Temporada ${season.number}</h3>
      ${rows}
    </div>`;
  }).join("");
  return `<section class="episodes">
    <h2>Episódios</h2>
    ${seasons}
  </section>`;
}

function durationParts(minutes) {
  const total = Math.max(0, Math.round(Number(minutes) || 0));
  return { hours: Math.floor(total / 60), minutes: total % 60, total };
}

function durationLabel(minutes) {
  const { hours, minutes: mins, total } = durationParts(minutes);
  if (!total) return "";
  return hours ? `${hours}h ${String(mins).padStart(2, "0")}min` : `${mins}min`;
}

function durationISO(minutes) {
  const { hours, minutes: mins, total } = durationParts(minutes);
  if (!total) return "PT0M";
  return `PT${hours ? `${hours}H` : ""}${mins ? `${mins}M` : ""}`;
}

async function resolveDirectStream(stream, origin) {
  if (!stream) return "";
  let absolute;
  try {
    absolute = new URL(stream, origin).href;
  } catch {
    return String(stream);
  }
  // Only our resolver needs a server-side hop. Direct MP4/HLS URLs are already
  // what Rave wants.
  if (!/\/api\/stream(\?|$)/i.test(absolute)) return absolute;
  try {
    const response = await fetch(absolute, {
      redirect: "manual",
      headers: { "user-agent": UA, accept: "*/*" }
    });
    const location = response.headers.get("location");
    if (location) return new URL(location, absolute).href;
    return absolute;
  } catch {
    return absolute;
  }
}

module.exports = async function handler(req, res) {
  const id = String(req.query?.id || "").trim();
  const item = findItem(id);
  if (!item) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.end("<!DOCTYPE html><html lang=\"pt-BR\"><meta charset=\"utf-8\"><title>Título não encontrado</title><body style=\"background:#1a1a1a;color:#eee;font-family:sans-serif;padding:24px\">Título não encontrado. <a href=\"/\" style=\"color:#ccc\">Voltar</a></body></html>");
    return;
  }

  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers.host || FALLBACK_ORIGIN.replace(/^https?:\/\//, "");
  const origin = `${proto}://${host}`;
  const title = item.nome || item.title || "Título";
  const poster = item.capa || item.poster || "";
  const synopsis = item.sinopse || item.synopsis || `Assista ${title}`;
  // Rave's native player only opens MP4. Prefer an MP4 field even when the
  // item also has an HLS URL; fall back to the first available source.
  const candidates = [item.rave, item.player, item.stream].filter(Boolean);
  const stream = candidates.find(isMp4Url) || candidates[0] || "";
  const direct = await resolveDirectStream(stream, origin);
  const playbackUrl = ravePlaybackUrl(origin, direct);
  const hls = isHlsUrl(direct);
  const minutes = item.duracao || item.duration || 0;
  const durationText = durationLabel(minutes);
  const duration = durationISO(minutes);
  const seriesGroup = seriesGroupFor(item);
  const episodes = episodeListMarkup(item, seriesGroup);
  const canonical = `${origin}/rave/${encodeURIComponent(item.id)}`;
  const detailsHref = seriesGroup
    ? `/serie/${encodeURIComponent(slugify(seriesGroup.base || title))}`
    : item.tipo === "serie" || item.type === "series"
      ? "/"
      : `/filme/${encodeURIComponent(slugify(title))}`;
  const addedAt = item.addedAt || "2026-01-01";
  const videoName = `${title} - 🕸️ W00`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    name: videoName,
    description: synopsis,
    thumbnailUrl: poster ? [poster] : [],
    uploadDate: `${addedAt}T00:00:00+00:00`,
    inLanguage: "pt",
    interactionStatistic: {
      "@type": "InteractionCounter",
      interactionType: { "@type": "WatchAction" },
      userInteractionCount: Number(item.popularity) || 0
    },
    duration,
    encodingFormat: hls ? "application/vnd.apple.mpegurl" : "video/mp4",
    contentUrl: playbackUrl,
    embedUrl: playbackUrl
  };

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, "\\u003c")}</script>
<title>${escapeHTML(videoName)}</title>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="${escapeHTML(synopsis)}">
<link rel="canonical" href="${escapeHTML(canonical)}">
<meta property="og:locale" content="pt_BR">
<meta property="og:type" content="video.movie">
<meta property="og:title" content="${escapeHTML(videoName)}">
<meta property="og:description" content="${escapeHTML(synopsis)}">
${poster ? `<meta property="og:image" content="${escapeHTML(poster)}">` : ""}
<meta property="og:url" content="${escapeHTML(canonical)}">
${playbackUrl ? `<meta property="og:video" content="${escapeHTML(playbackUrl)}">
<meta property="og:video:secure_url" content="${escapeHTML(playbackUrl)}">
<meta property="og:video:type" content="${hls ? "application/vnd.apple.mpegurl" : "video/mp4"}">
<meta property="og:video:width" content="1280">
<meta property="og:video:height" content="720">` : ""}
<meta name="theme-color" content="#1a1a1a">
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  background: #1a1a1a;
  color: #eee;
  font-family: -apple-system, sans-serif;
  padding: 12px;
  max-width: 480px;
  margin: 0 auto;
}
a { color: #ccc; text-decoration: none; }
.back { display: inline-flex; align-items: center; padding: 8px 0; }
.back svg { opacity: .85; }
.back:active svg { opacity: 1; }
h1 { font-size: 20px; margin: 8px 0 4px; }
.poster { width: 100%; max-height: 220px; object-fit: cover; border-radius: 8px; display: block; }
.duration { color: #aaa; font-size: 13px; margin: 4px 0 2px; }
.episodes { margin-top: 18px; border-top: 1px solid rgba(255,255,255,.1); padding-top: 14px; }
.episodes h2 { font-size: 15px; margin-bottom: 10px; }
.season + .season { margin-top: 14px; }
.season h3 { font-size: 12px; color: #999; font-weight: 600; margin: 0 0 6px; text-transform: uppercase; letter-spacing: .04em; }
.episode { display: flex; align-items: center; gap: 10px; padding: 9px 8px; border-radius: 8px; color: #ddd; }
.episode:active { background: rgba(255,255,255,.07); }
.episode.current { background: rgba(255,255,255,.09); color: #fff; }
.episode-num { flex: 0 0 26px; text-align: center; color: #888; font-size: 12px; font-variant-numeric: tabular-nums; }
.episode.current .episode-num { color: #fff; }
.episode-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; }
.episode-time { color: #888; font-size: 11px; }
</style>
</head>
<body>
${poster ? `<img class="poster" src="${escapeHTML(poster)}" alt="${escapeHTML(title)}" loading="lazy">` : ""}
<a class="back" href="${escapeHTML(detailsHref)}">
<svg width="28" height="28" viewBox="0 0 24 24" fill="white">
<path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
</svg>
</a>
<h1>${escapeHTML(title)}</h1>
${durationText ? `<p class="duration">⏱ ${escapeHTML(durationText)}</p>` : ""}
${episodes}
</body>
</html>`;

  res.statusCode = 200;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.end(html);
};
