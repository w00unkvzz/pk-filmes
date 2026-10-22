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
import { renderMascote } from "./pages/mascote.js";
import { renderCartaz } from "./pages/cartaz.js";

const routes = {
  home: renderHome,
  catalogo: renderCatalogo,
  search: renderSearch,
  perfil: renderPerfil,
  amigos: renderAmigos,
  pkparty: renderPkparty,
  mascote: renderMascote,
  cartaz: renderCartaz
};

const page = document.body.dataset.page || "home";

async function renderCurrent() {
  resetRowObservers();
  const render = routes[page] || routes.home;
  await render();
  renderFooter();
  setupRowArrows();
}

async function boot() {
  renderShell();
  bindGlobalEvents();
  await renderCurrent();
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
    renderCurrent();
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
