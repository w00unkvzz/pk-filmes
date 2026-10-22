// Application entry: shell, route selection and cross-page events.
import { renderShell, renderFooter, bindGlobalEvents, refreshShell, setupRowArrows, openDetailsFromUrl, openPasswordModal } from "./ui.js";
import { CONFIG } from "./config.js";
import * as store from "./store.js";
import { initAuth } from "./auth.js";
import { renderHome } from "./pages/home.js";
import { renderCatalogo } from "./pages/catalogo.js";
import { renderSearch } from "./pages/search.js";
import { renderPerfil } from "./pages/perfil.js";
import { renderVip } from "./pages/vip.js";
import { renderAmigos } from "./pages/amigos.js";
import { renderPkparty } from "./pages/pkparty.js";
import { renderMascote } from "./pages/mascote.js";
import { renderOnboarding } from "./pages/onboarding.js";
import { renderCartaz } from "./pages/cartaz.js";

const routes = {
  home: renderHome,
  catalogo: renderCatalogo,
  search: renderSearch,
  perfil: renderPerfil,
  vip: renderVip,
  amigos: renderAmigos,
  pkparty: renderPkparty,
  mascote: renderMascote,
  onboarding: renderOnboarding,
  cartaz: renderCartaz
};

const page = document.body.dataset.page || "home";

function renderCurrent() {
  const render = routes[page] || routes.home;
  render();
  renderFooter();
  setupRowArrows();
}

async function boot() {
  // Restore a Supabase session before painting the shell. Offline/local mode
  // resolves immediately because initAuth is a no-op without credentials.
  try {
    await initAuth();
  } catch (error) {
    console.warn("[auth] não foi possível restaurar a sessão:", error.message);
  }

  if (page === "onboarding") {
    document.body.classList.add("onboarding-page");
    renderOnboarding();
    return;
  }

  document.body.classList.remove("onboarding-page");
  renderShell();
  bindGlobalEvents();
  renderCurrent();
  openDetailsFromUrl();

  // Password recovery links land on /perfil.html?recovery=1. Supabase has
  // already exchanged the code for a session by this point.
  if (page === "perfil" && new URLSearchParams(location.search).has("recovery")) {
    const url = new URL(location.href);
    url.searchParams.delete("recovery");
    history.replaceState({}, "", url);
    setTimeout(() => openPasswordModal(), 0);
  }

  window.addEventListener("pk:auth-changed", () => {
    refreshShell();
    if (page === "perfil") renderCurrent();
  });

  window.addEventListener("pk:plan-changed", () => {
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

  // First visit: offer onboarding without forcing a redirect.
  if (page === "home" && !store.hasOnboarded()) {
    const banner = document.createElement("div");
    banner.className = "toast";
    banner.style.cssText = "position:fixed;right:18px;bottom:18px;z-index:2500;max-width:330px";
    banner.innerHTML = `<i class="fa-solid fa-wand-magic-sparkles"></i><div><strong>Primeira vez por aqui?</strong><span>Faça o tour de 1 minuto e conheça os recursos.</span><div class="row" style="margin-top:8px;gap:6px"><a class="btn btn-sm btn-primary" href="onboarding.html">Começar tour</a><button class="btn btn-sm btn-ghost" id="dismiss-tour" type="button">Agora não</button></div></div>`;
    document.body.appendChild(banner);
    banner.querySelector("#dismiss-tour")?.addEventListener("click", () => {
      store.setOnboarded(true);
      banner.remove();
    });
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => { boot(); }, { once: true });
} else {
  boot();
}
