// Server-rendered Rave page. The reference site does not embed a player: it
// publishes a schema.org VideoObject with contentUrl/embedUrl and lets the Rave
// app pick the stream up. Keeping the same shape is what makes the Rave player
// appear instead of a dead HTML5 <video>.
const crypto = require("crypto");
const catalog = require("../catalog.json");

const UA = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36";
const FALLBACK_ORIGIN = "https://w00filmes.vercel.app";
const PROXY_SECRET = process.env.RAVE_PROXY_SECRET || "w00-rave-stream-v1";
const TMDB_API_KEY = "af8b0300c48e26a8b4da9bbf571515ce";
const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_IMAGE = "https://image.tmdb.org/t/p/w300";
const TMDB_TTL = 6 * 60 * 60 * 1000;
const TMDB_TIMEOUT = 2500;
const TMDB_CACHE = new Map();

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

function tmdbIdFromItem(item) {
  const matches = String(item?.id || "").match(/(?:^|-)(\d{3,})(?=-|$)/g) || [];
  const nums = matches.map((entry) => entry.replace(/^-/, "")).filter(Boolean);
  return nums.length ? nums[nums.length - 1] : "";
}

async function fetchSeasonDetails(tvId, seasonNumber) {
  if (!tvId || seasonNumber == null) return null;
  const key = `${tvId}:${seasonNumber}`;
  const cached = TMDB_CACHE.get(key);
  if (cached && Date.now() - cached.ts < TMDB_TTL) return cached.data;
  try {
    const url = `${TMDB_BASE}/tv/${encodeURIComponent(tvId)}/season/${encodeURIComponent(seasonNumber)}?api_key=${TMDB_API_KEY}&language=pt-BR`;
    const response = await fetch(url, { signal: AbortSignal.timeout(TMDB_TIMEOUT) });
    if (!response.ok) throw new Error(`TMDB ${response.status}`);
    const data = await response.json();
    TMDB_CACHE.set(key, { ts: Date.now(), data });
    return data;
  } catch {
    return null;
  }
}

async function seriesStills(group) {
  const stills = new Map();
  if (!group || !group.items.length) return stills;
  const tvId = tmdbIdFromItem(group.items[0].item);
  if (!tvId) return stills;
  const seasonNumbers = group.seasons.map((season) => season.number);
  const results = await Promise.allSettled(seasonNumbers.map((number) => fetchSeasonDetails(tvId, number)));
  results.forEach((result, index) => {
    if (result.status !== "fulfilled" || !result.value) return;
    const seasonNumber = seasonNumbers[index];
    for (const episode of result.value.episodes || []) {
      if (episode?.still_path) {
        stills.set(`${seasonNumber}:${episode.episode_number}`, `${TMDB_IMAGE}${episode.still_path}`);
      }
    }
  });
  return stills;
}

function episodeListMarkup(item, group, stills = new Map()) {
  if (!group || !group.items.length) return "";
  const currentId = String(item.id);
  const currentEntry = group.items.find((entry) => String(entry.item.id) === currentId) || group.items[0];
  const currentSeason = currentEntry?.season ?? group.seasons[0]?.number ?? 1;
  const playIcon = `<span class="episode-play" aria-hidden="true"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></span>`;
  const checkIcon = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

  const rowsFor = (season) => season.episodes.map((entry) => {
    const active = String(entry.item.id) === currentId;
    const label = entry.name && entry.name !== entry.item.nome
      ? entry.name
      : `Episódio ${entry.episode}`;
    const runtime = durationLabel(entry.item.duracao || entry.item.duration || 0);
    const thumb = stills.get(`${entry.season}:${entry.episode}`) || entry.item.still || entry.item.backdrop || entry.item.capa || entry.item.poster || "";
    const synopsis = entry.item.sinopse || entry.item.synopsis || "";
    const num = String(entry.episode).padStart(2, "0");
    return `<div class="episode${active ? " current" : ""}" role="link" tabindex="0" data-href="/rave/${encodeURIComponent(entry.item.id)}"${active ? ' aria-current="true"' : ""}>
      <span class="episode-num">${num}</span>
      <span class="episode-thumb${thumb ? "" : " episode-thumb-empty"}">
        ${thumb ? `<img src="${escapeHTML(thumb)}" alt="" loading="lazy" decoding="async" draggable="false">` : ""}
        ${playIcon}
      </span>
      <span class="episode-body">
        <span class="episode-head"><strong>${escapeHTML(label)}</strong>${runtime ? `<span>${escapeHTML(runtime)}</span>` : ""}</span>
        ${synopsis ? `<span class="episode-synopsis">${escapeHTML(synopsis)}</span>` : ""}
      </span>
    </div>`;
  }).join("");

  const currentSeasonData = group.seasons.find((season) => season.number === currentSeason);
  const count = currentSeasonData?.episodes.length || 0;
  const options = group.seasons.map((season) => `<button class="nf-season-option ${season.number === currentSeason ? "active" : ""}" type="button" role="option" data-season="${season.number}" aria-selected="${season.number === currentSeason}"><span>Temporada ${season.number}</span>${checkIcon}</button>`).join("");
  const panels = group.seasons.map((season) => `<div class="rave-season-panel" data-season="${season.number}"${season.number === currentSeason ? "" : " hidden"}>
    <div class="episode-list">${rowsFor(season)}</div>
  </div>`).join("");

  return `<section class="episodes">
    <div class="season-head">
      <h2>Episódios</h2>
      <div class="nf-season-select" id="rave-season-select">
        <button class="nf-season-button" id="rave-season-button" type="button" aria-haspopup="listbox" aria-expanded="false" aria-controls="rave-season-menu">
          <span id="rave-season-value">Temporada ${currentSeason}</span>
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <div class="nf-season-menu" id="rave-season-menu" role="listbox" aria-label="Temporada">${options}</div>
      </div>
    </div>
    <div class="details-season-line"><span id="rave-season-label">Temporada ${currentSeason}:</span><span id="rave-season-count">${count} episódio${count === 1 ? "" : "s"}</span></div>
    ${panels}
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
    res.end("<!DOCTYPE html><html lang=\"pt-BR\"><meta charset=\"utf-8\"><meta name=\"theme-color\" content=\"#000000\"><title>Título não encontrado</title><body style=\"margin:0;min-height:100vh;display:grid;place-items:center;background:#000;color:#f5f3ef;font-family:Inter,Helvetica,Arial,sans-serif;padding:24px;text-align:center\"><div><strong style=\"display:block;font-size:18px;margin-bottom:8px\">Título não encontrado</strong><a href=\"/\" style=\"color:#a855f7;font-weight:700\">Voltar</a></div></body></html>");
    return;
  }

  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers.host || FALLBACK_ORIGIN.replace(/^https?:\/\//, "");
  const origin = `${proto}://${host}`;
  const title = item.nome || item.title || "Título";
  const poster = item.capa || item.poster || "";
  const backdrop = item.backdrop || item.capa || item.poster || "";
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
  const stills = await seriesStills(seriesGroup);
  const episodes = episodeListMarkup(item, seriesGroup, stills);
  const currentEntry = seriesGroup?.items.find((entry) => String(entry.item.id) === String(item.id)) || null;
  const showTitle = seriesGroup?.base || title;
  const episodeLabel = currentEntry
    ? `T${currentEntry.season} E${currentEntry.episode}${currentEntry.name ? ` · ${currentEntry.name}` : ""}`
    : "";
  const episodeCount = seriesGroup?.items.length || 0;
  const seasonCount = seriesGroup?.seasons.length || 0;
  const metaBits = [];
  if (item.ano || item.year) metaBits.push(`<span class="meta-pill">${escapeHTML(item.ano || item.year)}</span>`);
  if (seriesGroup) {
    metaBits.push(`<span class="meta-pill">${episodeCount} episódio${episodeCount === 1 ? "" : "s"}</span>`);
    metaBits.push(`<span class="meta-pill">${seasonCount} temporada${seasonCount === 1 ? "" : "s"}</span>`);
  } else if (durationText) {
    metaBits.push(`<span class="meta-pill">${escapeHTML(durationText)}</span>`);
  }
  if (item.idade) metaBits.push(`<span class="meta-pill age">${escapeHTML(item.idade)}</span>`);
  if (item.nota) metaBits.push(`<span class="meta-pill rating">★ ${escapeHTML(item.nota)}</span>`);
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
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
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
<meta name="theme-color" content="#000000">
<style>
:root {
  --bg: #000;
  --surface: #0a0a0b;
  --surface-2: #111114;
  --line: rgba(255, 255, 255, .08);
  --line-strong: rgba(255, 255, 255, .14);
  --text: #f5f3ef;
  --muted: #b8b4ac;
  --muted-2: #7a756d;
  --accent: #7c3aed;
  --accent-bright: #a855f7;
  --accent-soft: rgba(124, 58, 237, .14);
  --radius: 18px;
  --font: "Inter", "Helvetica Neue", Helvetica, Arial, sans-serif;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
html { background: #000; }
html, body {
  -webkit-user-select: none;
  user-select: none;
  -webkit-touch-callout: none;
  -webkit-tap-highlight-color: transparent;
}
body {
  min-height: 100vh;
  background:
    radial-gradient(900px 520px at 8% -10%, rgba(124, 58, 237, .14), transparent 60%),
    radial-gradient(760px 480px at 96% 6%, rgba(124, 58, 237, .08), transparent 62%),
    #000;
  color: var(--text);
  font-family: var(--font);
  font-size: 14px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
  overflow-x: hidden;
}
body::before {
  content: "";
  position: fixed;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  background-image: radial-gradient(rgba(255, 255, 255, .18) .5px, transparent .5px);
  background-size: 9px 9px;
  opacity: .035;
}
a { color: inherit; text-decoration: none; }
img {
  display: block;
  max-width: 100%;
  pointer-events: none;
  -webkit-user-drag: none;
  user-select: none;
}
.page { width: 100%; max-width: 640px; margin: 0 auto; padding-bottom: 34px; }

.topbar {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 12px 16px;
  background: linear-gradient(to bottom, rgba(0, 0, 0, .94), rgba(0, 0, 0, .62) 70%, transparent);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
}
.back {
  width: 40px;
  height: 40px;
  flex: 0 0 40px;
  display: grid;
  place-items: center;
  border-radius: 14px;
  background: rgba(255, 255, 255, .05);
  border: 1px solid var(--line);
  color: #fff;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.back:active { background: var(--accent-soft); border-color: rgba(124, 58, 237, .32); }
.back svg { width: 20px; height: 20px; }
.rave-badge {
  margin-left: auto;
  padding: 5px 9px;
  border-radius: 999px;
  background: var(--accent-soft);
  border: 1px solid rgba(124, 58, 237, .28);
  color: #ffd9c9;
  font-size: 8px;
  font-weight: 800;
  letter-spacing: .16em;
}

.hero {
  position: relative;
  margin: 4px 16px 0;
  min-height: 250px;
  overflow: hidden;
  border-radius: var(--radius);
  border: 1px solid var(--line);
  background: var(--surface);
  box-shadow: 0 24px 70px rgba(0, 0, 0, .55), 0 0 0 1px rgba(168, 85, 247, .025);
}
.hero-bg {
  position: absolute;
  inset: 0;
  background-size: cover;
  background-position: center 22%;
  opacity: .52;
  transform: scale(1.02);
}
.hero-veil {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(to top, rgba(0, 0, 0, .97) 0%, rgba(0, 0, 0, .58) 46%, rgba(0, 0, 0, .12) 100%),
    linear-gradient(90deg, rgba(0, 0, 0, .72), transparent 72%);
}
.hero-content {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  gap: 8px;
  min-height: 250px;
  padding: 24px 18px 18px;
}
h1 {
  color: #fff;
  font-size: clamp(1.55rem, 6.2vw, 2.15rem);
  font-weight: 800;
  line-height: 1.04;
  letter-spacing: -.04em;
  text-shadow: 0 2px 22px rgba(0, 0, 0, .6);
}
.episode-label { color: #fff; font-size: 12px; font-weight: 700; letter-spacing: .01em; }
.meta { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.meta-pill {
  padding: 4px 8px;
  border-radius: 6px;
  background: rgba(255, 255, 255, .07);
  border: 1px solid var(--line);
  color: var(--muted);
  font-size: 10px;
  font-weight: 700;
  line-height: 1.1;
}
.meta-pill.age { background: var(--accent-soft); border-color: rgba(124, 58, 237, .28); color: #ffd9c9; }
.meta-pill.rating { color: #ffd9c9; }
.synopsis {
  color: var(--muted);
  font-size: 11.5px;
  line-height: 1.55;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.episodes {
  margin: 24px 16px 0;
  padding-top: 18px;
  border-top: 1px solid var(--line);
}
.season + .season { margin-top: 20px; }
.season-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin: 0 2px 10px;
}
.season-head h2 { color: #fff; font-size: 1.05rem; font-weight: 800; letter-spacing: -.02em; margin: 0; }
.season-head h3 { color: #fff; font-size: 11px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; }
.season-head > span { color: var(--muted-2); font-size: 9px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; }

.nf-season-select { position: relative; display: inline-flex; align-items: center; }
.nf-season-button {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 34px;
  padding: 0 12px;
  border: 1px solid #444;
  border-radius: 4px;
  background: #141414;
  color: #fff;
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: border-color .2s ease, background .2s ease;
}
.nf-season-button:hover { border-color: #777; background: #1a1a1a; }
.nf-season-button:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
.nf-season-button svg { width: 14px; height: 14px; color: #bbb; transition: transform .2s ease; }
.nf-season-select.open .nf-season-button svg { transform: rotate(180deg); }
.nf-season-menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 30;
  display: none;
  width: 178px;
  padding: 6px;
  border: 1px solid #333;
  border-radius: 4px;
  background: #0a0a0a;
  box-shadow: 0 18px 44px rgba(0, 0, 0, .7);
}
.nf-season-select.open .nf-season-menu { display: block; }
.nf-season-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  min-height: 36px;
  padding: 0 10px;
  border: 0;
  border-radius: 3px;
  background: none;
  color: #b3b3b3;
  font-family: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}
.nf-season-option:hover,
.nf-season-option.active { background: #1f1f1f; color: #fff; }
.nf-season-option svg { width: 14px; height: 14px; color: var(--accent); opacity: 0; }
.nf-season-option.active svg { opacity: 1; }
.details-season-line { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin: 0 2px 12px; color: var(--muted-2); font-size: 12px; }
.details-season-line #rave-season-label { color: #fff; font-weight: 700; }
.rave-season-panel[hidden] { display: none; }
.episode-list { display: grid; }
.episode {
  display: grid;
  grid-template-columns: 26px 92px minmax(0, 1fr);
  gap: 11px;
  align-items: center;
  padding: 11px 6px;
  border-bottom: 1px solid var(--line);
  color: #fff;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: background .18s ease;
}
.episode:last-child { border-bottom: 0; }
.episode:active { background: rgba(255, 255, 255, .045); }
.episode-num {
  color: var(--muted-2);
  font-size: 12px;
  font-weight: 800;
  text-align: center;
  font-variant-numeric: tabular-nums;
}
.episode-thumb {
  position: relative;
  display: block;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  border-radius: 8px;
  background: #141416;
  border: 1px solid var(--line);
}
.episode-thumb img { width: 100%; height: 100%; object-fit: cover; opacity: .9; }
.episode-thumb-empty {
  background:
    radial-gradient(circle at 30% 20%, rgba(124, 58, 237, .24), transparent 58%),
    #141416;
}
.episode-play {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  background: transparent;
  color: #fff;
  opacity: .5;
  transition: opacity .18s ease, background .18s ease;
}
.episode:hover .episode-play { opacity: 1; background: rgba(0, 0, 0, .22); }
.episode-play svg {
  width: 26px;
  height: 26px;
  padding: 6px;
  border-radius: 50%;
  background: rgba(124, 58, 237, .92);
  box-shadow: 0 6px 18px rgba(124, 58, 237, .35);
}
.episode-body { min-width: 0; display: grid; gap: 4px; }
.episode-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
.episode-head strong {
  color: #fff;
  font-size: 12.5px;
  font-weight: 700;
  line-height: 1.25;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.episode-head span { flex: 0 0 auto; color: var(--muted-2); font-size: 10px; font-weight: 600; }
.episode-synopsis {
  color: var(--muted-2);
  font-size: 10.5px;
  line-height: 1.42;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.footer {
  margin: 26px 16px 0;
  padding-top: 14px;
  border-top: 1px solid var(--line);
  color: var(--muted-2);
  font-size: 9px;
  letter-spacing: .1em;
  text-transform: uppercase;
  text-align: center;
}

@media (max-width: 360px) {
  .hero { margin-left: 12px; margin-right: 12px; }
  .episodes { margin-left: 12px; margin-right: 12px; }
  .episode { grid-template-columns: 22px 78px minmax(0, 1fr); gap: 9px; }
  .episode-head strong { font-size: 12px; }
  .episode-synopsis { -webkit-line-clamp: 1; }
}
</style>
</head>
<body>
<div class="page">
  <header class="topbar">
    <div class="back" role="link" tabindex="0" data-href="${escapeHTML(detailsHref)}" aria-label="Voltar">
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M15 18l-6-6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </div>
    <span class="rave-badge">RAVE</span>
  </header>

  <section class="hero">
    ${backdrop ? `<div class="hero-bg" style="background-image:url(${escapeHTML(backdrop)})"></div>` : ""}
    <div class="hero-veil"></div>
    <div class="hero-content">
      <h1>${escapeHTML(showTitle)}</h1>
      ${episodeLabel ? `<p class="episode-label">${escapeHTML(episodeLabel)}</p>` : ""}
      ${metaBits.length ? `<div class="meta">${metaBits.join("")}</div>` : ""}
      ${synopsis ? `<p class="synopsis">${escapeHTML(synopsis)}</p>` : ""}
    </div>
  </section>

  ${episodes}

  <footer class="footer">w00filmes · player nativo do Rave</footer>
</div>
<script>
(() => {
  const go = (element) => {
    const href = element && element.dataset ? element.dataset.href : "";
    if (href) window.location.href = href;
  };
  document.addEventListener("click", (event) => {
    const target = event.target.closest("[data-href]");
    if (!target) return;
    event.preventDefault();
    go(target);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const target = event.target.closest("[data-href]");
    if (!target) return;
    event.preventDefault();
    go(target);
  });
  const seasonSelect = document.getElementById("rave-season-select");
  const seasonButton = document.getElementById("rave-season-button");
  const seasonMenu = document.getElementById("rave-season-menu");
  const seasonValue = document.getElementById("rave-season-value");
  const seasonLabel = document.getElementById("rave-season-label");
  const seasonCount = document.getElementById("rave-season-count");
  const setSeason = (number) => {
    seasonSelect?.classList.remove("open");
    seasonButton?.setAttribute("aria-expanded", "false");
    if (seasonValue) seasonValue.textContent = "Temporada " + number;
    if (seasonLabel) seasonLabel.textContent = "Temporada " + number + ":";
    document.querySelectorAll(".rave-season-panel").forEach((panel) => {
      panel.hidden = Number(panel.dataset.season) !== Number(number);
    });
    const panel = document.querySelector('.rave-season-panel[data-season="' + number + '"]');
    const total = panel ? panel.querySelectorAll(".episode").length : 0;
    if (seasonCount) seasonCount.textContent = total + " episódio" + (total === 1 ? "" : "s");
    seasonMenu?.querySelectorAll("[data-season]").forEach((option) => {
      const active = Number(option.dataset.season) === Number(number);
      option.classList.toggle("active", active);
      option.setAttribute("aria-selected", String(active));
    });
  };
  seasonButton?.addEventListener("click", (event) => {
    event.stopPropagation();
    const open = seasonSelect?.classList.toggle("open");
    seasonButton.setAttribute("aria-expanded", String(Boolean(open)));
  });
  seasonMenu?.addEventListener("click", (event) => {
    const option = event.target.closest("[data-season]");
    if (!option) return;
    setSeason(Number(option.dataset.season));
  });
  document.addEventListener("click", (event) => {
    if (seasonSelect && !event.target.closest("#rave-season-select")) {
      seasonSelect.classList.remove("open");
      seasonButton?.setAttribute("aria-expanded", "false");
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    seasonSelect?.classList.remove("open");
    seasonButton?.setAttribute("aria-expanded", "false");
  });
  document.addEventListener("contextmenu", (event) => event.preventDefault());
  document.addEventListener("selectstart", (event) => event.preventDefault());
  document.addEventListener("dragstart", (event) => event.preventDefault());
})();
</script>
</body>
</html>`;

  res.statusCode = 200;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.end(html);
};
