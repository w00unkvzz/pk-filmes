// w00filmes Service Worker
// Strategy:
//   catalog.json  → cache-first, background update (instant second load)
//   JS / CSS      → stale-while-revalidate (serves cached, updates silently)
//   HTML pages    → network-first, fallback to cache
//   Supabase/fonts/FA → network-only (no cache)

const VERSION = "w00-v25";
// v3 forces one fresh catalog download so the new Parede de Gelo rows appear.
const CATALOG_CACHE = "w00-catalog-v3";
const STATIC_CACHE  = "w00-static-v25";
const HTML_CACHE    = "w00-html-v25";
// Stylesheets are requested with ?v=19 from the HTML shells, so the precache
// must use the same URL to be served from cache instead of the network.
const CSS_VERSION = "?v=19";

const STATIC_ASSETS = [
  "/",
  "/manifest.json",
  "/assets/icon.svg",
  `/css/base.css${CSS_VERSION}`,
  `/css/layout.css${CSS_VERSION}`,
  `/css/components.css${CSS_VERSION}`,
  `/css/pages.css${CSS_VERSION}`,
  `/css/theme.css${CSS_VERSION}`,
  `/css/detalhes.css${CSS_VERSION}`,
  "/js/tmdb.js",
  "/js/hls.js",
  "/js/vendor/hls.min.js",
  "/js/trailer.js",
  "/js/watchparty.js",
  "/js/router.js",
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
  "/js/pages/perfil.js",
  "/js/pages/amigos.js",
  "/js/pages/pkparty.js",
  "/js/pages/cartaz.js",
  "/js/pages/detalhes.js",
  "/js/pages/player.js",
];

// ── message: activate a freshly installed worker immediately ──────────────
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

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

  // Stream resolver and signed HLS URLs must always hit the network. A cached
  // redirect would pin an expired Cuevana token.
  if (url.pathname.startsWith("/stream/") || url.pathname.startsWith("/api/")) return;

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

  // HTML pages and clean SPA routes → network-first, fallback cache
  if (request.mode === "navigate" || request.headers.get("accept")?.includes("text/html") || url.pathname.endsWith(".html") || url.pathname === "/") {
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
    const cached = await cache.match(request)
      || await caches.match("/index.html")
      || await caches.match("/");
    return cached || fetch(request);
  }
}
