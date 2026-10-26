// Catalog layer: loads /catalog.json from the operator. No placeholder titles.
// The public schema is intentionally small:
// { nome, capa, categoria, idade, player } plus optional metadata.
import { CONFIG } from "./config.js";

const GENRE_COLORS = {
  Ação: ["#450a0a", "#dc2626"],
  Aventura: ["#052e16", "#16a34a"],
  Animação: ["#3b0764", "#a855f7"],
  Comédia: ["#422006", "#f59e0b"],
  Crime: ["#111827", "#475569"],
  Drama: ["#1e1b4b", "#6366f1"],
  Família: ["#0c4a6e", "#0ea5e9"],
  Fantasia: ["#2e1065", "#8b5cf6"],
  Ficção: ["#020617", "#14b8a6"],
  Mistério: ["#0f172a", "#64748b"],
  Romance: ["#4c1d95", "#a78bfa"],
  Suspense: ["#111827", "#7c3aed"],
  Terror: ["#0a0a0a", "#991b1b"],
  Tecnologia: ["#022c22", "#10b981"]
};

function slugify(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || `titulo-${Date.now()}`;
}

function unique(values) {
  return [...new Set(values.filter(Boolean).map((value) => String(value).trim()).filter(Boolean))];
}

/**
 * Normalize playback URLs. The public feed mostly serves `http://host:80/...`
 * MP4s; on an HTTPS page the browser blocks them as mixed content. Upgrading
 * with `new URL` also drops the default `:80`, which would otherwise make the
 * browser try TLS on port 80 and fail.
 */
export function normalizeStreamUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    if (url.protocol === "http:") url.protocol = "https:";
    if (url.port === "80") url.port = "";
    return url.toString();
  } catch {
    return raw.replace(/^http:\/\//i, "https://").replace(/:80(?=\/|$)/, "");
  }
}

/**
 * Normalize the public catalog schema into the richer shape used by the UI.
 * Only `nome`, `capa`, `categoria`, `idade` and `player` are required.
 * Extra fields (ano, sinopse, nota, duracao, tipo, generos, destaque, ...)
 * are used when present and otherwise get neutral defaults.
 */
function normalizeCatalogItem(raw, index) {
  const title = String(raw.nome || raw.title || raw.name || `Título ${index + 1}`).trim();
  const category = String(raw.categoria || raw.category || raw.genre || "Drama").trim();
  const extraGenres = Array.isArray(raw.generos)
    ? raw.generos
    : Array.isArray(raw.genres)
      ? raw.genres
      : String(raw.generos || raw.genres || "").split(/[,/|]/);
  const genres = unique([category, ...extraGenres]).slice(0, 4);
  // Mixed content: the feed mostly serves http:// MP4s. Every CDN we checked
  // answers on https too, so upgrading avoids the browser blocking playback.
  const player = normalizeStreamUrl(raw.player || raw.stream || raw.video);
  const type = raw.tipo === "serie" || raw.tipo === "series" || raw.type === "series" ? "series" : "movie";
  const id = String(raw.id || raw.slug || slugify(`${title}-${raw.ano || raw.year || ""}`)).trim();
  const escHTML = String(title).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  const escAge = String(String(raw.idade ?? "L")).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  return {
    id,
    title,
    type,
    year: Number(raw.ano ?? raw.year) || null,
    genres,
    rating: Number(raw.nota ?? raw.rating ?? 0),
    duration: Number(raw.duracao ?? raw.duration ?? 0),
    age: String(raw.idade ?? raw.age ?? "L"),
    synopsis: String(raw.sinopse || raw.synopsis || raw.description || "Sinopse em preparação."),
    cast: Array.isArray(raw.elenco) ? raw.elenco : Array.isArray(raw.cast) ? raw.cast : [],
    director: String(raw.direcao || raw.director || ""),
    poster: String(raw.capa || raw.poster || raw.cover || "").trim(),
    backdrop: String(raw.backdrop || raw.backdrop_path || "").trim(),
    player,
    stream: player,
    trailer: String(raw.trailer || "").trim(),
    colors: Array.isArray(raw.colors) && raw.colors.length >= 2 ? raw.colors : (GENRE_COLORS[genres[0]] || ["#1e1b4b", "#6a5acd"]),
    featured: Boolean(raw.destaque ?? raw.featured),
    trending: Boolean(raw.tendencia ?? raw.trending),
    top10: Boolean(raw.top10),
    isNew: Boolean(raw.novo ?? raw.isNew),
    addedAt: raw.addedAt || `2026-0${(index % 9) + 1}-${String((index % 27) + 1).padStart(2, "0")}`,
    popularity: Math.round(70 + Number(raw.nota ?? raw.rating ?? 0) * 3 + (raw.top10 ? 8 : 0)),
    titleEsc: escHTML,
    ageEsc: escAge
  };
}

const CACHE_KEY = "w00filmes.catalog_cache_v2";
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { ts, items } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL) { localStorage.removeItem(CACHE_KEY); return null; }
    return Array.isArray(items) ? items : null;
  } catch { return null; }
}

function writeCache(items) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), items })); } catch { /* quota */ }
}

async function loadRemoteCatalog() {
  if (typeof fetch !== "function") return null;

  // Serve from cache on subsequent page loads — avoids fetching + normalising
  // 2886 items on every navigation.
  const cached = readCache();
  if (cached) {
    // Cache guarda payload cru — mantém normalização ao voltar do cache.
    return cached
      .map((item, index) => normalizeCatalogItem(item, index))
      .filter((item) => item.id && item.title);
  }
  try {
    // No navegador, resolve contra a página para fetch HTTP a partir da raiz.
    // Em testes Node, document.baseURI é setado pelo harness no servidor local.
    const base = typeof document !== "undefined" && document.baseURI ? document.baseURI : import.meta.url;
    const url = new URL("catalog.json", base);
    const response = await fetch(url, { cache: "default" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    const items = Array.isArray(payload) ? payload : payload?.items;
    if (!Array.isArray(items)) throw new Error("payload sem array items");
    // Salva o payload cru: evita normalizar 2886 itens na segunda visita.
    writeCache(items);
    const normalized = items
      .map((item, index) => normalizeCatalogItem(item, index))
      .filter((item) => item.id && item.title);
    return normalized;
  } catch (error) {
    console.warn(`[catalog] catálogo vazio ou indisponível: ${error.message}`);
    return null;
  }
}


const remoteCatalog = await loadRemoteCatalog();
// If catalog.json cannot be loaded, the site stays empty rather than showing
// placeholder titles. This keeps the catalog strictly operator-supplied.
export const CATALOG = remoteCatalog || [];
export const CATALOG_SOURCE = remoteCatalog?.length ? "catalog.json" : "vazio";

// Pré-computa haystack de busca uma vez por item (y evita reconcatenar strings
// em cada filtragem dentro de filtered() em catalogo.js).
for (const item of CATALOG) {
  if (!item._hay) item._hay = `${item.title} ${item.genres.join(" ")} ${item.synopsis} ${item.cast.join(" ")}`.toLowerCase();
}

// Map id -> item: lookup O(1) no byId em vez do .find() O(n).
const ID_INDEX = new Map();
for (const item of CATALOG) { ID_INDEX.set(item.id, item); }
export const byId = (id) => ID_INDEX.get(id) || null;

// Upcoming titles are intentionally empty until the operator supplies their
// own release list, so no placeholder film appears in the catalog.
export const UPCOMING = [];



export const DEFAULT_USER = {
  id: "local-user",
  name: "Visitante",
  email: "",
  avatar_url: "",
  joined: "2026-10-22",
  bio: "Explorando o catálogo.",
  favoriteGenre: "Ficção"
};

/* --------------------------------------------------------------------------
   Series grouping
   The feed ships episodes as flat rows ("Show - T3E8 - Episódio 8"). We group
   them once so cards, catalog and details show one entry per show while the
   player still receives the exact episode and its play link.
   ----------------------------------------------------------------------- */
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

const SERIES_GROUP_BY_ID = new Map();
const SERIES_GROUP_LIST = [];

for (const item of CATALOG) {
  if (item.type !== "series") continue;
  const parsed = parseEpisodeTitle(item.title);
  const base = parsed?.base || item.title;
  const key = base.toLowerCase();
  let group = SERIES_GROUP_LIST.find((entry) => entry.key === key);
  if (!group) {
    group = { key, base, items: [] };
    SERIES_GROUP_LIST.push(group);
  }
  group.items.push({
    item,
    season: parsed?.season ?? 1,
    episode: parsed?.episode ?? group.items.length + 1,
    name: parsed?.extra || item.title
  });
  SERIES_GROUP_BY_ID.set(item.id, group);
}

for (const group of SERIES_GROUP_LIST) {
  group.items.sort((a, b) => a.season - b.season || a.episode - b.episode);
  group.first = group.items[0];
  const seasonNumbers = [...new Set(group.items.map((entry) => entry.season))].sort((a, b) => a - b);
  group.seasons = seasonNumbers.map((number) => ({
    number,
    episodes: group.items.filter((entry) => entry.season === number)
  }));
  const baseItem = group.first.item;
  const showTitle = group.base || baseItem.title;
  const titleEsc = String(showTitle).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  group.show = {
    ...baseItem,
    id: baseItem.id,
    title: showTitle,
    titleEsc,
    type: "series",
    isShow: true,
    groupKey: group.key,
    episodeCount: group.items.length,
    seasonCount: group.seasons.length,
    seasonNumbers,
    _hay: `${showTitle} ${group.items.map((entry) => entry.item.title).join(" ")} ${baseItem.genres.join(" ")} ${baseItem.synopsis}`.toLowerCase()
  };
}

export const movies = CATALOG.filter((item) => item.type === "movie");
export const series = SERIES_GROUP_LIST.map((group) => group.show);
export const seriesEpisodes = CATALOG.filter((item) => item.type === "series");
export const catalogTitles = [...movies, ...series];
export const allGenres = [...new Set(catalogTitles.flatMap((item) => item.genres))].sort((a, b) => a.localeCompare(b, "pt-BR"));

export function getSeriesGroup(value) {
  const item = typeof value === "string" ? byId(value) : value;
  return item ? SERIES_GROUP_BY_ID.get(item.id) || null : null;
}

export function getSeriesShow(value) {
  return getSeriesGroup(value)?.show || null;
}

export const POPULAR_SEARCHES = catalogTitles.slice(0, 8).map((item) => item.title);

const flaggedFeatured = movies.filter((item) => item.featured);
const flaggedTrending = catalogTitles.filter((item) => item.trending);
const flaggedTop10 = catalogTitles.filter((item) => item.top10);
const byScore = (a, b) => (b.rating || 0) - (a.rating || 0) || (b.popularity || 0) - (a.popularity || 0);
export const featured = flaggedFeatured.length >= 3 ? flaggedFeatured.slice(0, 6) : movies.slice(0, 6);
export const trending = flaggedTrending.length >= 6 ? flaggedTrending.slice(0, 10) : [...catalogTitles].sort(byScore).slice(0, 10);
export const top10 = flaggedTop10.length >= 10 ? flaggedTop10.slice(0, 10) : [...catalogTitles].sort(byScore).slice(0, 10);
export const newReleases = [...catalogTitles].sort((a, b) => (b.year || 0) - (a.year || 0) || byScore(a, b)).slice(0, 10);

export function getGenreMeta(name) {
  return CONFIG.genres.find((genre) => genre.name === name) || { name, icon: "fa-film", colors: ["#1e1b4b", "#6a5acd"] };
}

export function episodesFor(item) {
  return getSeriesGroup(item)?.items || [];
}
