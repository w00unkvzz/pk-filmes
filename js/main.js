// Application entry: shell, History API routing and cross-page events.
import { renderShell, bindGlobalEvents, refreshShell, setupRowArrows, openPasswordModal, resetRowObservers, closeModal, sidebarClose, toast } from "./ui.js";
import { CONFIG } from "./config.js";
import * as store from "./store.js";
import { initAuth } from "./auth.js";
import { normalizeLocation, getRoute, navigate, routeForHref, searchPath } from "./router.js";
import { renderHome, destroyHome } from "./pages/home.js";
import { renderCatalogo } from "./pages/catalogo.js";
import { renderPerfil } from "./pages/perfil.js";
import { renderAmigos, destroyAmigos } from "./pages/amigos.js";
import { renderPkparty, destroyPkparty, hasActivePartyRoom } from "./pages/pkparty.js";
import { renderCartaz } from "./pages/cartaz.js";
import { renderDetalhes } from "./pages/detalhes.js";
import { renderPlayer } from "./pages/player.js";

const routes = {
  home: renderHome,
  catalogo: renderCatalogo,
  perfil: renderPerfil,
  amigos: renderAmigos,
  pkparty: renderPkparty,
  cartaz: renderCartaz,
  detalhes: renderDetalhes,
  player: renderPlayer
};

let currentRoute = { page: "home", params: new URLSearchParams(), roomCode: "" };
let currentPage = document.body.dataset.page || "home";
let renderToken = 0;

// Supabase fires several auth events on boot (INITIAL_SESSION, SIGNED_IN,
// TOKEN_REFRESHED). Re-rendering the whole page for each one rebuilt every
// card row and was a big source of jank. Coalesce them and skip no-op changes.
let authRenderTimer = null;
let authRenderKey = null;
function currentAuthKey() {
  const user = store.getUser();
  return [user.authed ? 1 : 0, user.id || "", user.name || "", user.cloud ? 1 : 0, user.avatar_url || ""].join("|");
}
function scheduleAuthRender() {
  // Never restart an in-progress video because the session refreshed.
  if (currentPage === "player") return;
  // A room owns its player, chat and realtime channel. Re-rendering it on a
  // token refresh would restart playback and drop the current message list.
  if (currentPage === "pkparty" && hasActivePartyRoom()) return;
  const key = currentAuthKey();
  if (key === authRenderKey) return;
  clearTimeout(authRenderTimer);
  authRenderTimer = setTimeout(() => {
    authRenderKey = key;
    renderCurrent();
  }, 80);
}

async function renderCurrent() {
  const token = ++renderToken;
  destroyHome();
  resetRowObservers();
  const render = routes[currentPage] || routes.home;
  await render();
  if (token !== renderToken) return;
  setupRowArrows();
}

async function applyRoute(route) {
  // Release page-owned channels/timers before switching to the next route.
  if (currentPage === "pkparty" && route.page !== "pkparty") destroyPkparty();
  if (currentPage === "amigos" && route.page !== "amigos") destroyAmigos();
  currentRoute = route;
  currentPage = route.page;
  document.body.dataset.page = currentPage;
  document.body.classList.remove("party-theater");
  if (document.fullscreenElement || document.webkitFullscreenElement) {
    try {
      if (document.exitFullscreen) document.exitFullscreen();
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    } catch {}
  }
  closeModal();
  sidebarClose();
  renderShell();
  window.scrollTo({ top: 0, behavior: "auto" });
  await renderCurrent();
  authRenderKey = currentAuthKey();
}

function bindRouter() {
  if (window.__w00RouterBound) return;
  window.__w00RouterBound = true;

  document.addEventListener("click", (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = event.target.closest?.("a[href]");
    if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
    const href = anchor.getAttribute("href");
    const clean = routeForHref(href);
    if (!clean) return;
    event.preventDefault();
    navigate(clean);
  });

  document.addEventListener("submit", (event) => {
    const form = event.target.closest?.(".topbar-search");
    if (!form) return;
    event.preventDefault();
    const value = String(new FormData(form).get("q") || "").trim();
    navigate(searchPath(value));
  });

  window.addEventListener("popstate", () => {
    applyRoute(getRoute());
  });

  window.addEventListener("w00:navigate", () => {
    applyRoute(getRoute());
  });
}

function setupServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  navigator.serviceWorker.register("/sw.js").then((registration) => {
    const activateUpdate = (worker) => {
      if (!worker) return;
      worker.addEventListener("statechange", () => {
        if (worker.state !== "installed") return;
        // Em uma atualização, o controller antigo ainda está ativo.
        // Pede ao novo worker para assumir sem recarregar a página: a troca
        // acontece em silêncio e o próximo carregamento já usa os arquivos novos.
        if (navigator.serviceWorker.controller) {
          (registration.waiting || worker).postMessage({ type: "SKIP_WAITING" });
        }
      });
    };
    registration.addEventListener("updatefound", () => activateUpdate(registration.installing));
    if (registration.installing) activateUpdate(registration.installing);
    registration.update().catch(() => {});
  }).catch((error) => console.warn("[sw] registro falhou:", error.message));
}

async function boot() {
  setupServiceWorker();
  currentRoute = normalizeLocation();
  currentPage = currentRoute.page;
  document.body.dataset.page = currentPage;
  bindGlobalEvents();
  bindRouter();
  renderShell();
  await renderCurrent();
  authRenderKey = currentAuthKey();

  // Sessão do Supabase em background — não bloqueia a pintura inicial.
  initAuth().catch((error) => console.warn("[auth] não restaurado:", error.message));

  // Password recovery links land on /perfil?recovery=1.
  if (currentPage === "perfil" && currentRoute.params.has("recovery")) {
    const url = new URL(location.href);
    url.searchParams.delete("recovery");
    history.replaceState({}, "", url);
    setTimeout(() => openPasswordModal(), 0);
  }

  window.addEventListener("pk:auth-changed", () => {
    refreshShell();
    scheduleAuthRender();
  });

  window.addEventListener("pk:social-changed", (event) => {
    refreshShell();
    const added = event.detail?.addedRequests || [];
    if (!added.length) return;
    const first = added[0];
    toast(
      added.length === 1
        ? `${first.name} quer ser seu amigo.`
        : `${added.length} novos pedidos de amizade.`,
      "info",
      "Amizade"
    );
  });

  window.addEventListener("pk:history-changed", () => {
    if (currentPage === "home" || currentPage === "perfil") renderCurrent();
  });

  // Keep badges and profile labels in sync when another tab changes local state.
  window.addEventListener("storage", (event) => {
    if (event.key && event.key.startsWith(CONFIG.storagePrefix)) {
      refreshShell();
      if (event.key === `${CONFIG.storagePrefix}user`) scheduleAuthRender();
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => { boot(); }, { once: true });
} else {
  boot();
}
