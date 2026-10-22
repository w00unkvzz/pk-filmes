// w00filmes Service Worker
// Strategy:
//   catalog.json  → cache-first, background update (instant second load)
//   JS / CSS      → stale-while-revalidate (serves cached, updates silently)
//   HTML pages    → network-first, fallback to cache
//   Supabase/fonts/FA → network-only (no cache)

const VERSION = "w00-v6";
// Catalog stays on v1 on purpose: bumping it forces a multi-MB re-download.
const CATALOG_CACHE = "w00-catalog-v2";
const STATIC_CACHE  = "w00-static-v6";
const HTML_CACHE    = "w00-html-v6";

const STATIC_ASSETS = [
  "/css/base.css",
  "/css/layout.css",
  "/css/components.css",
  "/css/pages.css",
  "/css/theme.css",
  "/css/detalhes.css",
  "/js/tmdb.js",
  "/js/watchparty.js",
  "/js/main.js",
  "/js/config.js",
  "/js/data.js",
  "/js/ui.js",
  "/js/auth.js",
  "/js/store.js",
  "/js/social.js",
  "/js/supabase.js",
  "/js/supabase-config.js",
  "/js/pages/home.js",
  "/js/pages/catalogo.js",
  "/js/pages/search.js",
  "/js/pages/perfil.js",
  "/js/pages/amigos.js",
  "/js/pages/pkparty.js",
  "/js/pages/cartaz.js",
  "/js/pages/detalhes.js",
  "/js/pages/player.js",
];

// ── install: pre-cache static assets ──────────────────────────────────────
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) =>
      Promise.allSettled(STATIC_ASSETS.map((url) => cache.add(url)))
    )
  );
});

// ── activate: delete old caches ───────────────────────────────────────────
self.addEventListener("activate", (event) => {
  const keep = new Set([CATALOG_CACHE, STATIC_CACHE, HTML_CACHE]);
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => !keep.has(k)).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ── fetch ─────────────────────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and cross-origin except what we handle
  if (request.method !== "GET") return;

  // Supabase, Google Fonts, FontAwesome CDN → always network
  if (
    url.hostname.includes("supabase.co") ||
    url.hostname.includes("supabase.com") ||
    url.hostname.includes("googleapis.com") ||
    url.hostname.includes("gstatic.com") ||
    url.hostname.includes("cloudflare.com")
  ) return;

  // catalog.json → cache-first + background revalidate
  if (url.pathname.endsWith("/catalog.json")) {
    event.respondWith(catalogStrategy(request));
    return;
  }

  // JS / CSS → stale-while-revalidate
  if (url.pathname.match(/\.(js|css)$/)) {
    event.respondWith(staleWhileRevalidate(request, STATIC_CACHE));
    return;
  }

  // HTML pages → network-first, fallback cache
  if (request.headers.get("accept")?.includes("text/html") || url.pathname.endsWith(".html") || url.pathname === "/") {
    event.respondWith(networkFirstHtml(request));
    return;
  }
});

async function catalogStrategy(request) {
  const cache = await caches.open(CATALOG_CACHE);
  const cached = await cache.match(request);

  // Serve cached immediately, revalidate in background
  if (cached) {
    event_revalidateCatalog(cache, request);
    return cached;
  }

  // First load: fetch, cache and return
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    return new Response(JSON.stringify({ items: [] }), {
      headers: { "Content-Type": "application/json" }
    });
  }
}

function event_revalidateCatalog(cache, request) {
  fetch(request).then((response) => {
    if (response.ok) cache.put(request, response);
  }).catch(() => {});
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request).then((response) => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => cached);
  return cached || fetchPromise;
}

async function networkFirstHtml(request) {
  const cache = await caches.open(HTML_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request);
    return cached || fetch(request);
  }
}
