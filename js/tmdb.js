// Optional TMDB enrichment. The catalog feed only carries title/poster/player,
// so details use TMDB for year, runtime, rating, synopsis, backdrop and cast.
// Everything degrades gracefully when the API is unavailable.

const API_KEY = "af8b0300c48e26a8b4da9bbf571515ce";
const BASE = "https://api.themoviedb.org/3";
const IMAGE = "https://image.tmdb.org/t/p";
const memory = new Map();

export function tmdbIdFromItem(item) {
  if (!item?.id) return "";
  const matches = String(item.id).match(/(?:^|-)(\d{3,})(?=-|$)/g) || [];
  const nums = matches.map((entry) => entry.replace(/^-/, "")).filter(Boolean);
  return nums.length ? nums[nums.length - 1] : "";
}

export function imageUrl(path, size = "w500") {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  return `${IMAGE}/${size}${path.startsWith("/") ? path : `/${path}`}`;
}

function cacheKey(kind, id, season = "") {
  // v2 invalidates old trailer keys cached by previous builds. A stale key
  // that YouTube no longer allows to be embedded looked like a broken player.
  return `w00.tmdb.v2.${kind}.${id}${season ? `.s${season}` : ""}`;
}

function readCache(key) {
  if (memory.has(key)) return memory.get(key);
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    memory.set(key, parsed);
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(key, value) {
  memory.set(key, value);
  try { sessionStorage.setItem(key, JSON.stringify(value)); } catch { /* quota */ }
}

async function request(path) {
  const response = await fetch(`${BASE}${path}`, { signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error(`TMDB ${response.status}`);
  return response.json();
}

export async function getTitleDetails(item) {
  const id = tmdbIdFromItem(item);
  if (!id) return null;
  const preferred = item?.type === "series" ? "tv" : "movie";
  const fallbacks = preferred === "tv" ? ["movie"] : ["tv"];
  for (const kind of [preferred, ...fallbacks]) {
    const key = cacheKey(kind, id);
    const cached = readCache(key);
    if (cached) return { ...cached, _kind: kind };
    try {
      const data = await request(`/${kind}/${id}?api_key=${API_KEY}&language=pt-BR&append_to_response=credits`);
      if (data && (data.id || data.title || data.name)) {
        writeCache(key, data);
        return { ...data, _kind: kind };
      }
    } catch {
      // try the other media type
    }
  }
  return null;
}

export async function getTrailer(item) {
  const id = tmdbIdFromItem(item);
  if (!id) return null;
  const preferred = item?.type === "series" ? "tv" : "movie";
  const kinds = preferred === "tv" ? ["tv", "movie"] : ["movie", "tv"];
  const key = cacheKey("trailer", id);
  const cached = readCache(key);
  if (cached) return cached;
  for (const kind of kinds) {
    for (const language of ["pt-BR", "en-US"]) {
      try {
        const data = await request(`/${kind}/${id}/videos?api_key=${API_KEY}&language=${language}`);
        const videos = Array.isArray(data?.results) ? data.results : [];
        const trailer = videos.find((video) => video.site === "YouTube" && video.type === "Trailer")
          || videos.find((video) => video.site === "YouTube" && /teaser|clip/i.test(video.type))
          || videos.find((video) => video.site === "YouTube");
        if (trailer?.key) {
          const result = { key: trailer.key, name: trailer.name || "Trailer", site: trailer.site };
          writeCache(key, result);
          return result;
        }
      } catch {
        // tenta o próximo idioma/tipo
      }
    }
  }
  return null;
}

export async function getSeasonDetails(tvId, seasonNumber) {
  if (!tvId || seasonNumber == null) return null;
  const key = cacheKey("tv", tvId, seasonNumber);
  const cached = readCache(key);
  if (cached) return cached;
  try {
    const data = await request(`/tv/${tvId}/season/${seasonNumber}?api_key=${API_KEY}&language=pt-BR`);
    writeCache(key, data);
    return data;
  } catch {
    return null;
  }
}

export function yearOf(data, fallbackItem) {
  const date = data?.release_date || data?.first_air_date || "";
  const year = Number(String(date).slice(0, 4));
  return year || fallbackItem?.year || null;
}

export function runtimeOf(data, fallbackItem) {
  if (Number(data?.runtime) > 0) return Number(data.runtime);
  if (Array.isArray(data?.episode_run_time) && data.episode_run_time.length) return Number(data.episode_run_time[0]) || 0;
  if (Number(data?.last_episode_to_air?.runtime) > 0) return Number(data.last_episode_to_air.runtime);
  return Number(fallbackItem?.duration) || 0;
}

export function genresOf(data, fallbackItem) {
  const names = (data?.genres || []).map((genre) => genre.name).filter(Boolean);
  return names.length ? names : (fallbackItem?.genres || []);
}

export function ratingOf(data, fallbackItem) {
  const value = Number(data?.vote_average);
  return value > 0 ? Math.round(value * 10) / 10 : Number(fallbackItem?.rating) || 0;
}

export function synopsisOf(data, fallbackItem) {
  const text = String(data?.overview || "").trim();
  if (text) return text;
  const fallback = String(fallbackItem?.synopsis || "").trim();
  return fallback && fallback !== "Sinopse em preparação." ? fallback : "";
}

export function backdropOf(data, fallbackItem) {
  if (data?.backdrop_path) return imageUrl(data.backdrop_path, "w1280");
  if (data?.poster_path) return imageUrl(data.poster_path, "original");
  return fallbackItem?.backdrop || fallbackItem?.poster || "";
}

export function posterOf(data, fallbackItem) {
  if (data?.poster_path) return imageUrl(data.poster_path, "w500");
  return fallbackItem?.poster || "";
}

export function castOf(data) {
  return (data?.credits?.cast || []).slice(0, 14).map((person) => ({
    id: person.id,
    name: person.name,
    character: person.character || person.roles?.[0]?.character || "",
    photo: person.profile_path ? imageUrl(person.profile_path, "w185") : ""
  }));
}
