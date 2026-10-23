// Clean URL router for the static SPA.
// The app still ships one HTML shell, but every route is rendered by main.js
// through the History API. Vercel rewrites unknown route paths to index.html.
import { CATALOG, byId, catalogTitles, getSeriesGroup } from "./data.js";

const STATIC_ROUTES = new Map([
  ["/", "home"],
  ["/inicio", "home"],
  ["/catalogo", "catalogo"],
  ["/buscar", "catalogo"],
  ["/perfil", "perfil"],
  ["/amigos", "amigos"],
  ["/party", "pkparty"],
  ["/w00-party", "pkparty"],
  ["/em-breve", "cartaz"],
  ["/cartaz", "cartaz"]
]);

const LEGACY_PAGES = {
  "index.html": "home",
  "catalogo.html": "catalogo",
  "search.html": "catalogo",
  "perfil.html": "perfil",
  "amigos.html": "amigos",
  "pkparty.html": "pkparty",
  "cartaz.html": "cartaz",
  "detalhes.html": "detalhes",
  "player.html": "player"
};

const SLUG_BY_ID = new Map();
const ID_BY_SLUG = new Map();

function slugify(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90) || "titulo";
}

function uniqueSlug(base, id, map) {
  let slug = base;
  let suffix = 2;
  while (map.has(slug) && map.get(slug) !== id) {
    slug = `${base}-${suffix++}`;
  }
  map.set(slug, id);
  return slug;
}

// Episodes and movies get their own slug. Series shows get a second,
// friendly slug ("/serie/nome-da-serie") pointing at the first episode id.
for (const item of CATALOG) {
  const slug = uniqueSlug(slugify(item.title), item.id, ID_BY_SLUG);
  SLUG_BY_ID.set(item.id, slug);
}
for (const show of catalogTitles) {
  if (show.type !== "series") continue;
  const base = slugify(show.title);
  let slug = base;
  let suffix = 2;
  while (ID_BY_SLUG.has(slug) && ID_BY_SLUG.get(slug) !== show.id) {
    slug = `${base}-${suffix++}`;
  }
  ID_BY_SLUG.set(slug, show.id);
  SLUG_BY_ID.set(show.id, slug);
}

function decodePart(value = "") {
  try { return decodeURIComponent(value); } catch { return value; }
}

function cleanPath(pathname = "/") {
  const path = decodePart(String(pathname).split("?")[0]);
  if (!path || path === "/index.html") return "/";
  return path.replace(/\/+$/, "") || "/";
}

function itemKind(item) {
  return getSeriesGroup(item) || item?.type === "series" ? "serie" : "filme";
}

export function slugFor(item) {
  if (!item) return "";
  const group = getSeriesGroup(item);
  const target = group?.show || item;
  return SLUG_BY_ID.get(target.id) || SLUG_BY_ID.get(item.id) || slugify(target.title || target.id || "");
}

export function detailsPath(item) {
  if (!item) return "/catalogo";
  return `/${itemKind(item)}/${encodeURIComponent(slugFor(item))}`;
}

export function playerPath(item) {
  if (!item) return "/catalogo";
  return `/assistir/${encodeURIComponent(SLUG_BY_ID.get(item.id) || slugFor(item))}`;
}

export function roomPath(code) {
  return `/sala/${encodeURIComponent(String(code || "").toUpperCase())}`;
}

export function searchPath(query = "") {
  const clean = String(query || "").trim();
  return clean ? `/catalogo?q=${encodeURIComponent(clean)}` : "/catalogo";
}

function resolveSlug(slug, kind = "") {
  if (!slug) return null;
  const id = ID_BY_SLUG.get(decodePart(slug));
  if (!id) return null;
  const item = byId(id);
  if (!item) return null;
  if (kind === "filme" && getSeriesGroup(item)) return null;
  if (kind === "serie" && !getSeriesGroup(item)) return null;
  return item;
}

export function getRoute(pathname = location.pathname, search = location.search) {
  const path = cleanPath(pathname);
  const params = new URLSearchParams(search || "");
  const parts = path.split("/").filter(Boolean);

  if (STATIC_ROUTES.has(path)) {
    return { page: STATIC_ROUTES.get(path), path, params, item: null, itemId: "", roomCode: "" };
  }

  if (parts.length === 2 && ["filme", "serie", "detalhes"].includes(parts[0])) {
    const kind = parts[0] === "detalhes" ? "" : parts[0];
    const item = resolveSlug(parts[1], kind);
    return { page: "detalhes", path, params, item, itemId: item?.id || "", roomCode: "" };
  }

  if (parts.length === 2 && ["assistir", "player"].includes(parts[0])) {
    const item = resolveSlug(parts[1]);
    return { page: "player", path, params, item, itemId: item?.id || "", roomCode: "" };
  }

  if (parts.length === 2 && parts[0] === "sala") {
    return { page: "pkparty", path, params, item: null, itemId: "", roomCode: decodePart(parts[1]).toUpperCase() };
  }

  // Legacy .html URLs still work during the transition and in old shared links.
  const legacy = LEGACY_PAGES[parts[0] || ""];
  if (legacy) {
    const id = params.get("id") || params.get("filme") || "";
    const item = id ? byId(id) : null;
    const roomCode = params.get("sala") || params.get("room") || "";
    return {
      page: legacy,
      path,
      params,
      item,
      itemId: item?.id || "",
      roomCode: String(roomCode).toUpperCase()
    };
  }

  return { page: "home", path, params, item: null, itemId: "", roomCode: "" };
}

function cleanUrlFor(pathname, search = "", hash = "") {
  const path = cleanPath(pathname);
  const params = new URLSearchParams(search || "");
  const legacy = LEGACY_PAGES[path.split("/").filter(Boolean)[0] || ""];

  if (path === "/buscar") {
    const query = params.toString();
    return `/catalogo${query ? `?${query}` : ""}${hash || ""}`;
  }

  if (path === "/party" || path === "/w00-party") {
    const code = params.get("sala") || params.get("room");
    if (code) return `${roomPath(code)}${hash || ""}`;
  }

  if (!legacy && path !== "/") {
    return `${path}${search || ""}${hash || ""}`;
  }

  if (path === "/") {
    const id = params.get("filme") || params.get("id");
    const item = id ? byId(id) : null;
    if (item) return `${detailsPath(item)}${hash || ""}`;
    const code = params.get("sala") || params.get("room");
    if (code) return `${roomPath(code)}${hash || ""}`;
    const page = params.get("page");
    if (page && STATIC_ROUTES.has(`/${page}`)) return `/${page}${hash || ""}`;
    return `/${hash || ""}`;
  }

  if (legacy === "detalhes") {
    const item = byId(params.get("id") || params.get("filme") || "");
    return item ? `${detailsPath(item)}${hash || ""}` : `/catalogo${hash || ""}`;
  }
  if (legacy === "player") {
    const item = byId(params.get("id") || params.get("filme") || "");
    return item ? `${playerPath(item)}${hash || ""}` : `/catalogo${hash || ""}`;
  }
  if (legacy === "pkparty") {
    const code = params.get("sala") || params.get("room");
    return code ? `${roomPath(code)}${hash || ""}` : `/party${hash || ""}`;
  }
  if (legacy === "home") return `/${hash || ""}`;
  if (legacy) return `/${legacy === "cartaz" ? "em-breve" : legacy}${search || ""}${hash || ""}`;
  return `${path}${search || ""}${hash || ""}`;
}

/** Rewrite old query-string and .html URLs in place, before first render. */
export function normalizeLocation() {
  const target = cleanUrlFor(location.pathname, location.search, location.hash);
  const current = `${location.pathname}${location.search}${location.hash}`;
  if (target !== current) {
    history.replaceState(history.state || {}, "", target);
  }
  return getRoute();
}

export function navigate(url, { replace = false } = {}) {
  const next = new URL(url, location.origin);
  if (next.origin !== location.origin) {
    location.href = next.href;
    return false;
  }
  const target = cleanUrlFor(next.pathname, next.search, next.hash);
  if (replace) history.replaceState(history.state || {}, "", target);
  else history.pushState({}, "", target);
  window.dispatchEvent(new CustomEvent("w00:navigate"));
  return true;
}

export function replaceRoute(url) {
  const next = new URL(url, location.origin);
  const target = cleanUrlFor(next.pathname, next.search, next.hash);
  history.replaceState(history.state || {}, "", target);
}

/** Convert an in-app href to its clean route, or return null when it is not a route. */
export function routeForHref(href) {
  if (!href) return null;
  const raw = String(href).trim();
  if (!raw || raw.startsWith("#") || /^(mailto:|tel:|javascript:|data:|blob:)/i.test(raw)) return null;
  let url;
  try { url = new URL(raw, location.origin); } catch { return null; }
  if (url.origin !== location.origin) return null;
  if (url.pathname.match(/\.(?:css|js|json|png|jpe?g|webp|svg|gif|ico|woff2?|ttf|mp4|webm|m3u8)$/i)) return null;
  const clean = cleanUrlFor(url.pathname, url.search, url.hash);
  // Only intercept paths the router understands.
  const route = getRoute(new URL(clean, location.origin).pathname, new URL(clean, location.origin).search);
  const known = STATIC_ROUTES.has(route.path)
    || /^\/(?:filme|serie|assistir|sala)\//.test(route.path)
    || LEGACY_PAGES[route.path.split("/").filter(Boolean)[0] || ""];
  return known ? clean : null;
}
