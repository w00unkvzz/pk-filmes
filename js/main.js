// Application entry: shell, route selection and cross-page events.
import { renderShell, renderFooter, bindGlobalEvents, refreshShell, setupRowArrows, openDetailsFromUrl, openPasswordModal, resetRowObservers } from "./ui.js";
import { CONFIG } from "./config.js";
import * as store from "./store.js";
import { initAuth } from "./auth.js";
import { renderHome } from "./pages/home.js";
import { renderCatalogo } from "./pages/catalogo.js";
import { renderSearch } from "./pages/search.js";
import { renderPerfil } from "./pages/perfil.js";
import { renderAmigos } from "./pages/amigos.js";
import { renderPkparty } from "./pages/pkparty.js";
import { renderCartaz } from "./pages/cartaz.js";
import { renderDetalhes } from "./pages/detalhes.js";
import { renderPlayer } from "./pages/player.js";

const routes = {
  home: renderHome,
  catalogo: renderCatalogo,
  search: renderSearch,
  perfil: renderPerfil,
  amigos: renderAmigos,
  pkparty: renderPkparty,
  cartaz: renderCartaz,
  detalhes: renderDetalhes,
  player: renderPlayer
};

const page = document.body.dataset.page || "home";

// Supabase fires several auth events on boot (INITIAL_SESSION, SIGNED_IN,
// TOKEN_REFRESHED). Re-rendering the whole page for each one rebuilt every
// card row and was a big source of jank. Coalesce them and skip no-op changes.
let authRenderTimer = null;
let authRenderKey = null;
function currentAuthKey() {
  const user = store.getUser();
  return [user.authed ? 1 : 0, user.id || "", user.name || "", user.cloud ? 1 : 0].join("|");
}
function scheduleAuthRender() {
  // Never restart an in-progress video because the session refreshed.
  if (page === "player") return;
  const key = currentAuthKey();
  if (key === authRenderKey) return;
  clearTimeout(authRenderTimer);
  authRenderTimer = setTimeout(() => {
    authRenderKey = key;
    renderCurrent();
  }, 80);
}

async function renderCurrent() {
  resetRowObservers();
  const render = routes[page] || routes.home;
  await render();
  if (page !== "player" && page !== "perfil") renderFooter();
  setupRowArrows();
}

function setupServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  const hadController = Boolean(navigator.serviceWorker.controller);
  let refreshing = false;

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController || refreshing) return;
    refreshing = true;
    window.location.reload();
  });

  navigator.serviceWorker.register("/sw.js").then((registration) => {
    const activateUpdate = (worker) => {
      if (!worker) return;
      worker.addEventListener("statechange", () => {
        if (worker.state !== "installed") return;
        // Em uma atualização, o controller antigo ainda está ativo.
        // Pede ao novo worker para assumir; o controllerchange recarrega a página.
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
  renderShell();
  bindGlobalEvents();
  await renderCurrent();
  authRenderKey = currentAuthKey();
  // Sessão do Supabase em background — não bloqueia a pintura inicial.
  initAuth().catch((error) => console.warn("[auth] não restaurado:", error.message));
  openDetailsFromUrl();

  // Password recovery links land on /perfil.html?recovery=1.
  if (page === "perfil" && new URLSearchParams(location.search).has("recovery")) {
    const url = new URL(location.href);
    url.searchParams.delete("recovery");
    history.replaceState({}, "", url);
    setTimeout(() => openPasswordModal(), 0);
  }

  window.addEventListener("pk:auth-changed", () => {
    refreshShell();
    scheduleAuthRender();
  });

  window.addEventListener("pk:social-changed", () => {
    refreshShell();
  });

  window.addEventListener("pk:history-changed", () => {
    if (page === "home" || page === "perfil") renderCurrent();
  });

  // Keep badges and profile labels in sync when another tab changes local state.
  window.addEventListener("storage", (event) => {
    if (event.key && event.key.startsWith(CONFIG.storagePrefix)) {
      refreshShell();
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => { boot(); }, { once: true });
} else {
  boot();
}
