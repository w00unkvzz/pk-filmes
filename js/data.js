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
  Romance: ["#500724", "#ec4899"],
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
  const player = String(raw.player || raw.stream || raw.video || "").trim();
  const type = raw.tipo === "serie" || raw.tipo === "series" || raw.type === "series" ? "series" : "movie";
  const id = String(raw.id || raw.slug || slugify(`${title}-${raw.ano || raw.year || ""}`)).trim();
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
    player,
    stream: player,
    trailer: String(raw.trailer || "").trim(),
    colors: Array.isArray(raw.colors) && raw.colors.length >= 2 ? raw.colors : (GENRE_COLORS[genres[0]] || ["#1e1b4b", "#6a5acd"]),
    featured: Boolean(raw.destaque ?? raw.featured),
    trending: Boolean(raw.tendencia ?? raw.trending),
    top10: Boolean(raw.top10),
    isNew: Boolean(raw.novo ?? raw.isNew),
    addedAt: raw.addedAt || `2026-0${(index % 9) + 1}-${String((index % 27) + 1).padStart(2, "0")}`,
    popularity: Math.round(70 + Number(raw.nota ?? raw.rating ?? 0) * 3 + (raw.top10 ? 8 : 0))
  };
}

const CACHE_KEY = "w00filmes.catalog_cache";
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
  if (cached) return cached;

  try {
    const base = typeof document !== "undefined" && document.baseURI ? document.baseURI : import.meta.url;
    const url = new URL("catalog.json", base);
    const response = await fetch(url, { cache: "default" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    const items = Array.isArray(payload) ? payload : payload?.items;
    if (!Array.isArray(items)) throw new Error("payload sem array items");
<<<<<<< HEAD
    // A valid but empty catalog is intentional: the site shows its empty
    // state instead of silently showing placeholder titles.
=======
>>>>>>> 902a4fa (perf: service worker, preload catalog, lazy rows)
    const normalized = items
      .map((item, index) => normalizeCatalogItem(item, index))
      .filter((item) => item.id && item.title);
    writeCache(normalized);
    return normalized;
  } catch (error) {
    console.warn(`[catalog] catálogo vazio ou indisponível: ${error.message}`);
    return null;
  }
}

const CACHE_KEY = "w00filmes.catalog_cache";
const CACHE_TTL = 60 * 60 * 1000;

function readCache() {
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { ts, items } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL) { localStorage.removeItem(CACHE_KEY); return null; }
    return Array.isArray(items) ? items : null;
  } catch { return null; }
}

function writeCache(items) {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), items }));
  } catch { /* quota ou indisponível */ }
}

const remoteCatalog = await loadRemoteCatalog();
// If catalog.json cannot be loaded, the site stays empty rather than showing
// placeholder titles. This keeps the catalog strictly operator-supplied.
export const CATALOG = remoteCatalog || [];
export const CATALOG_SOURCE = remoteCatalog?.length ? "catalog.json" : "vazio";

// Upcoming titles are intentionally empty until the operator supplies their
// own release list, so no placeholder film appears in the catalog.
export const UPCOMING = [];

export const DEFAULT_PET = {
  name: "Faísca",
  level: 3,
  xp: 240,
  xpNext: 400,
  hunger: 72,
  happiness: 81,
  energy: 64,
  lastCare: { feed: 0, love: 0, play: 0, rest: 0 },
  log: [
    { at: Date.now() - 1000 * 60 * 22, text: "Faísca encontrou um lugar quentinho no sofá." },
    { at: Date.now() - 1000 * 60 * 95, text: "Você deu um petisco. Faísca ficou radiante." }
  ]
};

export const POPULAR_SEARCHES = CATALOG.slice(0, 8).map((item) => item.title);

export const DEFAULT_USER = {
  id: "local-user",
  name: "Visitante",
  email: "",
  avatar_url: "",
  joined: "2026-10-22",
  bio: "Explorando o catálogo.",
  favoriteGenre: "Ficção"
};

export const byId = (id) => CATALOG.find((item) => item.id === id) || UPCOMING.find((item) => item.id === id);
const flaggedFeatured = CATALOG.filter((item) => item.featured);
const flaggedTrending = CATALOG.filter((item) => item.trending);
const flaggedTop10 = CATALOG.filter((item) => item.top10).slice(0, 10);
export const featured = flaggedFeatured.length ? flaggedFeatured : CATALOG.slice(0, 6);
export const trending = flaggedTrending.length ? flaggedTrending : CATALOG.slice(0, 10);
export const top10 = flaggedTop10.length ? flaggedTop10 : [...CATALOG].sort((a, b) => b.rating - a.rating).slice(0, 10);
export const newReleases = [...CATALOG].sort((a, b) => (b.year || 0) - (a.year || 0)).slice(0, 10);
export const movies = CATALOG.filter((item) => item.type === "movie");
export const series = CATALOG.filter((item) => item.type === "series");
export const allGenres = [...new Set(CATALOG.flatMap((item) => item.genres))].sort((a, b) => a.localeCompare(b, "pt-BR"));

export function getGenreMeta(name) {
  return CONFIG.genres.find((genre) => genre.name === name) || { name, icon: "fa-film", colors: ["#1e1b4b", "#6a5acd"] };
}

export function episodesFor(item) {
  return item?.seasons?.[0]?.episodes || [];
}
