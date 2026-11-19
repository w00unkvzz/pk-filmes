// Shared UI: shell, cards, rows, modals, details, player, toasts and auth.
import { CONFIG } from "./config.js";
import { byId, getGenreMeta } from "./data.js";
import { navigate, detailsPath, playerPath } from "./router.js";
import * as store from "./store.js";
import { authEnabled, logout as authLogout } from "./auth.js";
import { signIn, signUp, signInWithGitHub, sendPasswordReset, updatePassword } from "./supabase.js";
import { SUPABASE_CONFIG } from "./supabase-config.js";

export const qs = (selector, root = document) => root.querySelector(selector);
export const qsa = (selector, root = document) => [...root.querySelectorAll(selector)];

export function escapeHTML(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function initials(name = "") {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "W";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export function avatar(user, size = "sm", extra = "") {
  const name = typeof user === "string" ? user : user?.name || "Visitante";
  const photo = typeof user === "object" ? user?.avatar_url || user?.avatarUrl || "" : "";
  return `<span class="avatar ${size} ${extra}" aria-hidden="true"><span class="avatar-initials">${escapeHTML(initials(name))}</span>${photo ? `<img src="${escapeHTML(photo)}" alt="" loading="lazy" decoding="async" onerror="this.remove()">` : ""}</span>`;
}

// O avatar do perfil vive fora do shell e é reconstruído apenas no upload.
// Atualiza somente as fotos do usuário logado, sem tocar nos avatares de amigos.
function refreshAvatars() {
  const photo = store.getUser()?.avatar_url || "";
  qsa(".avatar.self").forEach((holder) => {
    const existing = holder.querySelector("img");
    if (!photo) {
      existing?.remove();
      return;
    }
    if (existing) {
      if (existing.getAttribute("src") !== photo) existing.src = photo;
      return;
    }
    const img = document.createElement("img");
    img.src = photo;
    img.alt = "";
    img.loading = "lazy";
    img.decoding = "async";
    img.addEventListener("error", () => img.remove(), { once: true });
    holder.appendChild(img);
  });
}



export function formatDuration(minutes) {
  if (!minutes) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}h ${m ? `${m}min` : ""}`.trim() : `${m}min`;
}

export function formatClock(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

export function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

export function formatMonth(value) {
  const date = new Date(value);
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(date);
}

/* Shell */
let lastShellSignature = "";

export function renderShell() {
  const page = document.body.dataset.page || "home";
  const user = store.getUser();
  const requestCount = store.getFriendRequests().length;
  const inviteCount = store.getRoomInvites().length;
  const sidebar = qs("#sidebar");
  const topbar = qs("#topbar");
  if (!sidebar || !topbar) return;

  // Reconstruir sidebar/topbar a cada evento (social, auth, storage) dava a
  // sensação de recarregar. Só redesenha quando algo visível mudou de fato.
  const signature = [
    page,
    location.pathname,
    location.search,
    user.authed ? 1 : 0,
    user.id || "",
    user.name || "",
    user.cloud ? 1 : 0,
    user.avatar_url || "",
    requestCount,
    inviteCount
  ].join("|");
  if (signature === lastShellSignature && topbar.childElementCount) {
    syncSidebarBackdrop();
    return;
  }
  lastShellSignature = signature;

  // A sidebar saiu do desenho. O elemento continua no HTML por
  // compatibilidade com o CSS antigo, mas fica vazio e oculto.
  sidebar.innerHTML = "";

  const currentType = new URLSearchParams(location.search).get("tipo") || "";
  const navItems = [
    { page: "home", href: "/", label: "Início" },
    { page: "catalogo", href: "/catalogo?tipo=series", label: "Séries", type: "series" },
    { page: "catalogo", href: "/catalogo?tipo=movie", label: "Filmes", type: "movie" },
    { page: "cartaz", href: "/em-breve", label: "Novidades" },
    { page: "perfil", href: "/perfil#minha-lista", label: "Minha lista" }
  ];
  const navActive = (item) => {
    if (item.page === "home") return page === "home";
    if (item.page === "catalogo") return page === "catalogo" && currentType === item.type;
    if (item.page === "perfil") return page === "perfil" && location.hash === "#minha-lista";
    return page === item.page;
  };

  topbar.innerHTML = `
    <a class="nf-logo" href="/" aria-label="${escapeHTML(CONFIG.brand)} — início">W00<span>FILMES</span></a>
    <nav class="nf-links" aria-label="Navegação principal">
      ${navItems.map((item) => `<a class="${navActive(item) ? "active" : ""}" href="${item.href}" ${navActive(item) ? 'aria-current="page"' : ""}>${item.label}</a>`).join("")}
    </nav>
    <button class="nf-browse" data-nf-nav-toggle type="button" aria-expanded="false" aria-controls="nf-mobile-panel">
      Navegar <i class="fa-solid fa-caret-down"></i>
    </button>
    <div class="nf-nav-right">
      <form class="topbar-search nf-search" action="/catalogo" method="get" role="search">
        <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
        <input type="search" name="q" placeholder="Títulos, pessoas, gêneros" autocomplete="off" aria-label="Buscar no catálogo">
        <span class="search-hint" aria-hidden="true">/</span>
      </form>
      <button class="nf-icon mobile-search-toggle" data-mobile-search type="button" aria-label="Abrir busca" aria-expanded="false"><i class="fa-solid fa-magnifying-glass"></i></button>
      <a class="nf-icon nf-bell" href="/amigos" aria-label="Amigos e pedidos" title="Amigos">
        <i class="fa-regular fa-bell"></i>${requestCount ? '<span class="dot-badge"></span>' : ""}
      </a>
      <a class="avatar-btn" href="/perfil" aria-label="Abrir meu perfil" title="Meu perfil">
        ${avatar(user, "sm")}
      </a>
    </div>
    <div class="nf-mobile-panel" id="nf-mobile-panel">
      ${CONFIG.nav.map((item) => `<a class="${page === item.page ? "active" : ""}" href="${item.href}">${escapeHTML(item.label)}</a>`).join("")}
    </div>`;

  const search = qs(".topbar-search input", topbar);
  if (search && page === "catalogo") {
    search.value = new URLSearchParams(location.search).get("q") || "";
  }
  document.body.classList.remove("mobile-search-open");

  syncSidebarBackdrop();
}

function syncSidebarBackdrop() {
  const backdrop = qs("#sidebar-backdrop");
  const sidebar = qs("#sidebar");
  backdrop?.classList.toggle("open", Boolean(sidebar?.classList.contains("open")));
  document.body.classList.toggle("sidebar-open", Boolean(sidebar?.classList.contains("open")));
}

/* Toast */
export function toast(message, type = "info", title = "") {
  const root = qs("#toast-root");
  if (!root) return;
  const icons = { info: "fa-circle-info", success: "fa-circle-check", error: "fa-triangle-exclamation", gold: "fa-crown" };
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.innerHTML = `<i class="fa-solid ${icons[type] || icons.info}"></i><div>${title ? `<strong>${escapeHTML(title)}</strong>` : ""}<span>${escapeHTML(message)}</span></div>`;
  root.appendChild(el);
  setTimeout(() => {
    el.classList.add("is-leaving");
    setTimeout(() => el.remove(), 250);
  }, 3400);
}

/* Modal */
let activeModal = null;

export function openModal(content, options = {}) {
  closeModal();
  const root = qs("#modal-root");
  root.innerHTML = `<div class="modal-backdrop" data-modal-backdrop>
    <div class="modal ${options.className || ""}" role="dialog" aria-modal="true" aria-label="${escapeHTML(options.label || "Janela")}">${content}</div>
  </div>`;
  document.body.classList.add("modal-open");
  const backdrop = qs("[data-modal-backdrop]", root);
  const close = () => {
    if (!activeModal) return;
    if (options.onClose) options.onClose();
    activeModal = null;
    document.body.classList.remove("modal-open");
    // Fecha com o mesmo vocabulário de movimento da abertura. O conteúdo só
    // é removido depois da animação; se outro modal abrir nesse meio-tempo,
    // o nó antigo já não pertence ao root e nada é apagado.
    backdrop.classList.add("is-closing");
    setTimeout(() => {
      if (root.contains(backdrop)) root.innerHTML = "";
    }, 200);
  };
  activeModal = { close };
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) close();
  });
  requestAnimationFrame(() => {
    const focusable = qs("button, input, select, textarea, a[href]", qs(".modal", root));
    focusable?.focus({ preventScroll: true });
  });
  if (options.onMount) options.onMount(close);
  return close;
}

export function closeModal() {
  if (activeModal) activeModal.close();
}

/* Cards and rows */
export function posterImage(item, variant = "poster") {
  const source = variant === "backdrop" ? (item?.backdrop || item?.poster) : item?.poster;
  if (!source) return "";
  // Cards de linha usam o backdrop em 16:9, como o catálogo do Netflix.
  // Grids, Top 10 e listas continuam com o pôster 2:3.
  const width = variant === "backdrop" ? "w780" : "w342";
  const src = String(source)
    .replace(/\/t\/p\/(w\d+|original)\//, `/t/p/${width}/`);
  return `<img class="poster-img" src="${escapeHTML(src)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">`;
}

function cardMeta(item) {
  const bits = [];
  if (item.year) bits.push(`<span>${escapeHTML(String(item.year))}</span>`);
  if (Number(item.rating) > 0) bits.push(`<span class="star"><i class="fa-solid fa-star"></i> ${Number(item.rating).toFixed(1)}</span>`);
  if (item.type === "series") bits.push("<span>Série</span>");
  else if (item.duration) bits.push(`<span>${escapeHTML(formatDuration(item.duration))}</span>`);
  return bits.length ? `<span class="card-meta">${bits.join('<span class="dot"></span>')}</span>` : "";
}

export function posterCard(item, options = {}) {
  if (!item) return "";
  const progress = options.progress ?? 0;
  const variant = options.variant || "poster";
  const art = variant === "backdrop" ? (item.backdrop || item.poster) : item.poster;
  const titleEsc = item.titleEsc ?? escapeHTML(item.title);
  return `<article class="title-card ${variant === "backdrop" ? "is-landscape" : ""}" data-open-details="${escapeHTML(item.id)}" tabindex="0" aria-label="${titleEsc}">
    <div class="poster-wrap">
      <div class="poster ${art ? "has-image" : ""}" style="--c1:${item.colors?.[0] || "#1c0f0a"};--c2:${item.colors?.[1] || "#b34724"}">
        ${posterImage(item, variant)}
        <div class="poster-ring"></div>
        <span class="poster-title ${item.title.length > 18 ? "small" : ""}">${titleEsc}</span>
      </div>
      ${options.remove ? `<button class="card-remove" data-remove-history="${escapeHTML(item.id)}" type="button" title="Remover do histórico" aria-label="Remover do histórico"><i class="fa-solid fa-xmark"></i></button>` : ""}
    </div>
    <div class="card-info">
      <span class="card-title">${titleEsc}</span>
      ${cardMeta(item)}
      ${progress ? `<div class="card-progress"><span style="width:${Math.min(100, progress)}%"></span></div>` : ""}
    </div>
  </article>`;
}

// Rows above the fold render immediately; rows below render when they scroll
// into view. This cuts initial paint time for pages with many rows.
const _rowObserver = typeof IntersectionObserver !== "undefined"
  ? new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const row = entry.target;
        const items = row.__lazyItems;
        if (!items?.length) return;
        _rowObserver.unobserve(row);
        const options = row.__rowOptions || {};
        delete row.__lazyItems;
        delete row.__rowOptions;
        injectCards(row, items, options);
      });
    }, { rootMargin: "200px" })
  : null;

// Injects cards in small batches so a row with many titles never blocks the
// main thread. Building all card HTML up-front was the cause of the freezes.
function injectCards(row, items, options) {
  const BATCH = 8;
  function step(start) {
    if (!row.isConnected) return;
    const slice = items.slice(start, start + BATCH);
    const frag = document.createDocumentFragment();
    slice.forEach((item) => {
      const wrap = document.createElement("div");
      const opts = options.progressMap
        ? { ...options, progress: options.progressMap[item.id] || 0 }
        : options;
      wrap.innerHTML = posterCard(item, opts);
      while (wrap.firstChild) frag.appendChild(wrap.firstChild);
    });
    row.appendChild(frag);
    if (start + BATCH < items.length) requestAnimationFrame(() => step(start + BATCH));
  }
  step(0);
}

// Evita que linhas antigas continuem observadas após um re-render
// (o observer guardaria referência ao DOM removido, acumulando memória).
export function resetRowObservers() {
  _rowObserver?.disconnect();
}

export function mediaRow(title, items, options = {}) {
  if (!items.length) return "";
  const rowId = options.id || `row-${Math.random().toString(36).slice(2)}`;
  const progressMap = options.progressMap || {};
  const variant = options.variant || "backdrop";
  // Never dump a huge array into the DOM. The original site requests ~20
  // titles per row; "Ver tudo" leads to the full catalog.  This is what
  // prevents the "Séries em destaque" row (1.5k items) from freezing mobile.
  const MAX_ITEMS = Math.max(1, options.limit ?? 20);
  const pool = items.length > MAX_ITEMS ? items.slice(0, MAX_ITEMS) : items;
  const EAGER = Math.min(12, pool.length); // cards rendered immediately
  const eager = pool.slice(0, EAGER);
  const lazy = pool.slice(EAGER);
  const html = `<section class="page-section nf-row ${options.tight ? "tight" : ""}">
    <div class="section-head">
      <h2>${title}</h2>
      <a class="section-link" href="${options.href || "/catalogo"}">Explorar tudo <i class="fa-solid fa-chevron-right"></i></a>
    </div>
    <div class="media-row-wrap">
      <button class="row-arrow left" data-row-scroll="left" data-target="${rowId}" type="button" aria-label="Rolar para a esquerda"><i class="fa-solid fa-chevron-left"></i></button>
      <div class="media-row" id="${rowId}">
        ${eager.map((item) => posterCard(item, { variant, progress: progressMap[item.id] || 0, remove: options.remove })).join("")}
      </div>
      <button class="row-arrow right" data-row-scroll="right" data-target="${rowId}" type="button" aria-label="Rolar para a direita"><i class="fa-solid fa-chevron-right"></i></button>
    </div>
  </section>`;
  if (lazy.length && _rowObserver) {
    // Store references only. HTML is built when the row approaches the
    // viewport, so offscreen rows cost almost nothing.
    requestAnimationFrame(() => {
      const rowEl = document.getElementById(rowId);
      if (!rowEl) return;
      rowEl.__lazyItems = lazy;
      rowEl.__rowOptions = { variant, progressMap, remove: options.remove };
      _rowObserver.observe(rowEl);
    });
  }
  return html;
}

export function top10Row(items) {
  return `<section class="page-section nf-row nf-top10-row">
    <div class="section-head">
      <h2><span class="top10-badge" aria-hidden="true">TOP<br>10</span> Hoje no w00</h2>
      <a class="section-link" href="/catalogo?ordenar=popular">Explorar tudo <i class="fa-solid fa-chevron-right"></i></a>
    </div>
    <div class="media-row-wrap">
      <button class="row-arrow left" data-row-scroll="left" data-target="top10-row" type="button" aria-label="Rolar para a esquerda"><i class="fa-solid fa-chevron-left"></i></button>
      <div class="top10-row" id="top10-row">
        ${items.map((item, index) => `<div class="top10-card">
          <span class="top10-num" aria-hidden="true">${index + 1}</span>
          ${posterCard(item, { variant: "poster" })}
        </div>`).join("")}
      </div>
      <button class="row-arrow right" data-row-scroll="right" data-target="top10-row" type="button" aria-label="Rolar para a direita"><i class="fa-solid fa-chevron-right"></i></button>
    </div>
  </section>`;
}

export function genreStrip(genres) {
  return `<div class="genre-strip">${genres.map((genre) => {
    const meta = getGenreMeta(genre);
    return `<a class="genre-pill" style="--g1:${meta.colors[0]};--g2:${meta.colors[1]}" href="/catalogo?genero=${encodeURIComponent(genre)}"><span>${escapeHTML(genre)}</span><i class="fa-solid ${meta.icon}" aria-hidden="true"></i></a>`;
  }).join("")}</div>`;
}

export function emptyState(icon, title, text) {
  return `<div class="empty-state"><i class="fa-solid ${icon}"></i><h3>${escapeHTML(title)}</h3><p>${escapeHTML(text)}</p></div>`;
}

export function setupRowArrows() {
  qsa(".media-row-wrap").forEach((wrap) => {
    if (wrap.dataset.bound) return;
    wrap.dataset.bound = "1";
    const row = qs(".media-row, .top10-row", wrap);
    const left = qs(".row-arrow.left", wrap);
    const right = qs(".row-arrow.right", wrap);
    if (!row || !left || !right) return;
    let ticking = false;
    const update = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        const max = row.scrollWidth - row.clientWidth - 2;
        left.disabled = row.scrollLeft <= 2;
        right.disabled = row.scrollLeft >= max;
      });
    };
    row.addEventListener("scroll", update, { passive: true });
    update();
  });
}

/* Sliding tabs: one indicator follows the active tab. */
function paintSlidingTabs(container) {
  if (!container) return;
  const selector = container.dataset.slidingSelector || ".tab";
  const activeClass = container.dataset.slidingActive || "active";
  const indicator = container.querySelector(container.dataset.slidingIndicator || ".tab-indicator");
  if (!indicator) return;
  const active = container.querySelector(`${selector}.${activeClass}`);
  if (!active) return;
  indicator.style.width = `${active.offsetWidth}px`;
  indicator.style.transform = `translateX(${active.offsetLeft}px)`;
  indicator.style.opacity = "1";
}

export function bindSlidingTabs(container, options = {}) {
  if (!container) return;
  const indicator = container.querySelector(options.indicator || ".tab-indicator");
  if (!indicator) return;
  container.dataset.slidingSelector = options.selector || ".tab";
  container.dataset.slidingActive = options.activeClass || "active";
  container.dataset.slidingIndicator = options.indicator || ".tab-indicator";
  container.dataset.slidingTabs = "1";
  container.__paintSlidingTabs = () => paintSlidingTabs(container);
  requestAnimationFrame(() => {
    paintSlidingTabs(container);
    setTimeout(() => paintSlidingTabs(container), 120);
  });
  if (!window.__w00SlidingTabsResize) {
    window.__w00SlidingTabsResize = true;
    window.addEventListener("resize", () => refreshSlidingTabs(), { passive: true });
  }
}

export function refreshSlidingTabs(root = document) {
  root.querySelectorAll("[data-sliding-tabs]").forEach((container) => {
    container.__paintSlidingTabs?.();
  });
}

/* Watchlist */
export function toggleWatchlist(id, notify = true) {
  const result = store.toggleWatchlist(id);
  syncWatchlistButtons(id);
  if (notify) {
    const item = byId(id);
    toast(result.added ? `${item?.title || "Título"} foi adicionado à sua lista.` : `${item?.title || "Título"} saiu da sua lista.`, "success", result.added ? "Na minha lista" : "Removido");
  }
  return result;
}

function syncWatchlistButtons(id) {
  const inList = store.isInWatchlist(id);
  qsa(`[data-watchlist="${id}"]`).forEach((button) => {
    button.innerHTML = `<i class="fa-solid ${inList ? "fa-check" : "fa-plus"}"></i>`;
    button.title = inList ? "Remover da minha lista" : "Adicionar à minha lista";
    button.setAttribute("aria-label", button.title);
  });
  qsa(`[data-watchlist-detail="${id}"]`).forEach((button) => {
    button.innerHTML = `<i class="fa-solid ${inList ? "fa-check" : "fa-plus"}"></i> ${inList ? "Na minha lista" : "Minha lista"}`;
    button.classList.toggle("btn-primary", inList);
    button.classList.toggle("btn-ghost", !inList);
  });
}

/* Details */
// The old details modal was replaced by a dedicated page (detalhes.html) with
// backdrop, cast, episodes and watch-party entry point.
export function openDetails(item) {
  if (!item) return;
  navigate(detailsPath(item));
}

/* Player */
// Playback now happens on a dedicated immersive page (player.html).
export function openPlayer(item, options = {}) {
  if (!item) return;
  const target = options.episode?.item || (options.episode?.id ? byId(options.episode.id) : null) || item;
  navigate(playerPath(target));
}

export function playItem(id, options = {}) {
  const item = byId(id);
  if (!item) return;
  if (item.releaseDate) {
    openDetails(item);
    return;
  }
  if (item.type === "series" && !options.episode) {
    openDetails(item);
    return;
  }
  openPlayer(item, options);
}

/* Share */
export async function shareItem(item) {
  if (!item) return;
  const url = new URL(detailsPath(item), location.origin);
  try {
    await navigator.clipboard.writeText(url.toString());
    toast("Link copiado para a área de transferência.", "success", "Compartilhar");
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = url.toString();
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    try { document.execCommand("copy"); toast("Link copiado.", "success", "Compartilhar"); }
    catch { toast("Não foi possível copiar o link automaticamente.", "error"); }
    textarea.remove();
  }
}



/* Auth */
function authErrorMessage(message = "") {
  const text = String(message);
  const rules = [
    [/invalid login credentials/i, "E-mail ou senha incorretos."],
    [/email not confirmed/i, "Confirme seu e-mail antes de entrar."],
    [/user already registered/i, "Este e-mail já tem uma conta."],
    [/password should be at least/i, "A senha precisa ter pelo menos 6 caracteres."],
    [/unable to validate email|invalid email/i, "E-mail inválido."],
    [/rate limit|too many requests/i, "Muitas tentativas. Aguarde um pouco."],
    [/provider is not enabled/i, "Login com GitHub indisponível no momento."],
    [/supabase não configurado/i, "Recurso temporariamente indisponível."],
    [/network|fetch/i, "Falha de conexão. Verifique sua internet."]
  ];
  for (const [pattern, translation] of rules) {
    if (pattern.test(text)) return translation;
  }
  return text || "Não foi possível concluir. Tente novamente.";
}

function accountModal(user) {
  const cloud = authEnabled();
  const content = `
    <button class="modal-close" data-close-modal type="button" aria-label="Fechar"><i class="fa-solid fa-xmark"></i></button>
    <div class="auth-head">
      <div class="brand-mark">${escapeHTML(CONFIG.brandShort)}</div>
      <h2>Sua conta</h2>
    </div>
    <div class="auth-account">
      ${avatar(user, "md", "self")}
      <div class="grow"><strong>${escapeHTML(user.name)}</strong><span>${escapeHTML(user.email)}</span></div>
      <span class="badge ${cloud ? "badge-live" : "badge-soft"}">${cloud ? "online" : "local"}</span>
    </div>
    <form class="auth-body">
      ${cloud ? `<button class="btn btn-primary btn-block" data-password-change type="button"><i class="fa-solid fa-key"></i>Alterar senha</button>` : ""}
      <button class="btn btn-ghost btn-block" data-logout type="button"><i class="fa-solid fa-right-from-bracket"></i>Sair da conta</button>
    </form>`;
  openModal(content, {
    className: "modal-sm",
    label: "Sua conta",
    onMount: () => {
      qs("[data-password-change]")?.addEventListener("click", () => {
        closeModal();
        openPasswordModal();
      });
    }
  });
}

export function openPasswordModal() {
  const content = `
    <button class="modal-close" data-close-modal type="button" aria-label="Fechar"><i class="fa-solid fa-xmark"></i></button>
    <div class="auth-head">
      <div class="brand-mark">${escapeHTML(CONFIG.brandShort)}</div>
      <h2>Definir nova senha</h2>
      <p>Escolha uma senha com pelo menos 6 caracteres.</p>
    </div>
    <form class="auth-body" id="password-form" novalidate>
      <div class="field"><label for="new-password">Nova senha</label><input class="input" id="new-password" type="password" minlength="6" required autocomplete="new-password" placeholder="Mínimo de 6 caracteres"></div>
      <div class="field"><label for="confirm-password">Confirmar senha</label><input class="input" id="confirm-password" type="password" minlength="6" required autocomplete="new-password" placeholder="Repita a senha"></div>
      <p class="auth-error hidden" id="password-error" role="alert"></p>
      <button class="btn btn-primary btn-block" id="password-submit" type="submit"><i class="fa-solid fa-key"></i>Salvar nova senha</button>
    </form>`;

  openModal(content, {
    className: "modal-sm",
    label: "Definir nova senha",
    onMount: () => {
      const form = qs("#password-form");
      const errorBox = qs("#password-error");
      const submit = qs("#password-submit");
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        errorBox.classList.add("hidden");
        const password = qs("#new-password").value;
        const confirm = qs("#confirm-password").value;
        if (password.length < 6) {
          errorBox.textContent = "A senha precisa ter pelo menos 6 caracteres.";
          errorBox.classList.remove("hidden");
          return;
        }
        if (password !== confirm) {
          errorBox.textContent = "As senhas não coincidem.";
          errorBox.classList.remove("hidden");
          return;
        }
        submit.disabled = true;
        submit.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>Salvando...';
        try {
          await updatePassword(password);
          closeModal();
          toast("Senha atualizada com sucesso.", "success", "Tudo certo");
        } catch (error) {
          errorBox.textContent = authErrorMessage(error.message);
          errorBox.classList.remove("hidden");
        } finally {
          submit.disabled = false;
          submit.innerHTML = '<i class="fa-solid fa-key"></i>Salvar nova senha';
        }
      });
    }
  });
}

function bindCloudAuth() {
  let mode = "login";
  const form = qs("#auth-form");
  const nameField = qs("#auth-name-field");
  const submit = qs("#auth-submit");
  const errorBox = qs("#auth-error");
  const emailInput = qs("#auth-email");
  const passwordInput = qs("#auth-password");

  const showError = (message) => {
    errorBox.textContent = message;
    errorBox.classList.remove("hidden");
  };
  const clearError = () => errorBox.classList.add("hidden");
  const setMode = (next) => {
    mode = next;
    qsa("[data-auth-mode]").forEach((button) => {
      button.classList.toggle("active", button.dataset.authMode === next);
    });
    nameField.classList.toggle("hidden", next !== "signup");
    submit.innerHTML = next === "signup"
      ? '<i class="fa-solid fa-user-plus"></i>Criar conta'
      : '<i class="fa-solid fa-right-to-bracket"></i>Entrar';
    passwordInput.autocomplete = next === "signup" ? "new-password" : "current-password";
    clearError();
  };

  qsa("[data-auth-mode]").forEach((button) => {
    button.addEventListener("click", () => setMode(button.dataset.authMode));
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearError();
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    const name = qs("#auth-name")?.value.trim() || "";
    if (!email) { showError("Informe seu e-mail."); return; }
    if (password.length < 6) { showError("A senha precisa ter pelo menos 6 caracteres."); return; }
    if (mode === "signup" && name.length < 2) { showError("Informe seu nome."); return; }

    const original = submit.innerHTML;
    submit.disabled = true;
    submit.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>Conectando...';
    try {
      if (mode === "signup") {
        const data = await signUp({ name, email, password });
        if (!data.session) {
          closeModal();
          toast("Conta criada. Confirme seu e-mail para entrar.", "success", "Verifique a caixa de entrada");
          return;
        }
        toast("Conta criada com sucesso.", "success", "Bem-vindo");
      } else {
        await signIn({ email, password });
        toast("Login realizado.", "success", "Bem-vindo de volta");
      }
      closeModal();
      refreshShell();
      window.dispatchEvent(new CustomEvent("pk:auth-changed"));
    } catch (error) {
      showError(authErrorMessage(error.message));
    } finally {
      submit.disabled = false;
      submit.innerHTML = original;
    }
  });

  qs("#auth-github")?.addEventListener("click", async () => {
    clearError();
    try {
      await signInWithGitHub();
    } catch (error) {
      showError(authErrorMessage(error.message));
    }
  });

  qs("#auth-reset")?.addEventListener("click", async () => {
    const email = emailInput.value.trim();
    if (!email) { emailInput.focus(); showError("Digite seu e-mail para receber o link."); return; }
    try {
      await sendPasswordReset(email);
      toast("Enviamos um link de redefinição para seu e-mail.", "success", "Verifique a caixa");
    } catch (error) {
      showError(authErrorMessage(error.message));
    }
  });
}

function bindLocalAuth() {
  qs("#auth-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    store.login(data.get("name"), data.get("email"));
    closeModal();
    refreshShell();
    toast("Perfil salvo neste navegador.", "success", "Bem-vindo");
    window.dispatchEvent(new CustomEvent("pk:auth-changed"));
  });
}

export function openAuthModal() {
  const user = store.getUser();
  if (user.authed) {
    accountModal(user);
    return;
  }

  const cloud = authEnabled();
  const content = cloud ? `
    <button class="modal-close" data-close-modal type="button" aria-label="Fechar"><i class="fa-solid fa-xmark"></i></button>
    <div class="auth-head">
      <div class="brand-mark">${escapeHTML(CONFIG.brandShort)}</div>
      <h2>Entrar no w00filmes</h2>
      <p>Entre para continuar.</p>
    </div>
    <div class="auth-tabs" role="tablist" aria-label="Entrar ou criar conta">
      <button class="auth-tab active" data-auth-mode="login" type="button" role="tab" aria-selected="true">Entrar</button>
      <button class="auth-tab" data-auth-mode="signup" type="button" role="tab" aria-selected="false">Criar conta</button>
    </div>
    <form class="auth-body" id="auth-form" novalidate>
      <div class="field hidden" id="auth-name-field">
        <label for="auth-name">Nome de exibição</label>
        <input class="input" id="auth-name" name="name" maxlength="40" autocomplete="name" placeholder="Como podemos chamar você?">
      </div>
      <div class="field">
        <label for="auth-email">E-mail</label>
        <input class="input" id="auth-email" name="email" type="email" autocomplete="email" required placeholder="voce@exemplo.com">
      </div>
      <div class="field">
        <label for="auth-password">Senha</label>
        <input class="input" id="auth-password" name="password" type="password" autocomplete="current-password" minlength="6" required placeholder="Mínimo de 6 caracteres">
      </div>
      <p class="auth-error hidden" id="auth-error" role="alert"></p>
      <button class="btn btn-primary btn-block" id="auth-submit" type="submit"><i class="fa-solid fa-right-to-bracket"></i>Entrar</button>
      ${SUPABASE_CONFIG.githubOAuth ? `<button class="btn btn-ghost btn-block" id="auth-github" type="button"><i class="fa-brands fa-github"></i>Continuar com GitHub</button>` : ""}
      <button class="btn btn-link btn-block" id="auth-reset" type="button">Esqueci minha senha</button>
    </form>` : `
    <button class="modal-close" data-close-modal type="button" aria-label="Fechar"><i class="fa-solid fa-xmark"></i></button>
    <div class="auth-head">
      <div class="brand-mark">${escapeHTML(CONFIG.brandShort)}</div>
      <h2>Entrar no w00filmes</h2>
      <p>Entre para continuar.</p>
    </div>
    <form class="auth-body" id="auth-form">
      <div class="field"><label for="auth-name">Nome de exibição</label><input class="input" id="auth-name" name="name" required maxlength="28" placeholder="Como podemos chamar você?"></div>
      <div class="field"><label for="auth-email">E-mail (opcional)</label><input class="input" id="auth-email" name="email" type="email" placeholder="voce@exemplo.com"></div>
      <button class="btn btn-primary btn-block" type="submit"><i class="fa-solid fa-right-to-bracket"></i>Entrar no modo local</button>
      <p class="auth-note">Crie sua conta para continuar.</p>
    </form>`;

  openModal(content, {
    className: "modal-sm",
    label: cloud ? "Entrar ou criar conta" : "Entrar no modo local",
    onMount: () => {
      if (cloud) bindCloudAuth();
      else bindLocalAuth();
    }
  });
}

export function refreshShell() {
  renderShell();
  refreshAvatars();
}

/**
 * Atualiza apenas os contadores sociais (badge da sidebar e sino do topo).
 * Evita reconstruir a sidebar/topbar inteira a cada mudança em tempo real,
 * que era o que dava a sensação de recarregar a página.
 */
export function refreshSocialBadges() {
  syncSidebarBadge('.sidebar-link[href="/amigos"]', store.getFriendRequests().length);
  syncSidebarBadge('.sidebar-link[href="/party"]', store.getRoomInvites().length);

  const count = store.getFriendRequests().length;
  const bell = qs('.topbar-icon[href="/amigos"]');
  if (bell) {
    let dot = bell.querySelector(".dot-badge");
    if (count && !dot) {
      dot = document.createElement("span");
      dot.className = "dot-badge";
      bell.appendChild(dot);
    } else if (!count) {
      dot?.remove();
    }
  }
}

function syncSidebarBadge(selector, count) {
  const link = qs(selector);
  if (!link) return;
  let badge = link.querySelector(".sidebar-badge");
  if (count) {
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "sidebar-badge";
      link.appendChild(badge);
    }
    if (badge.textContent !== String(count)) badge.textContent = String(count);
  } else {
    badge?.remove();
  }
}

/* Sidebar: will-change só durante a animação (evita GPU/memória presos) */
let sidebarAnimTimer = null;

function sidebarAnimate() {
  const sidebar = qs("#sidebar");
  const backdrop = qs("#sidebar-backdrop");
  sidebar?.classList.add("animating");
  backdrop?.classList.add("animating");
  clearTimeout(sidebarAnimTimer);
  sidebarAnimTimer = setTimeout(() => {
    sidebar?.classList.remove("animating");
    backdrop?.classList.remove("animating");
  }, 320);
}

export function sidebarOpen() {
  sidebarAnimate();
  qs("#sidebar")?.classList.add("open");
  qs("#sidebar-backdrop")?.classList.add("open");
  document.body.classList.add("sidebar-open");
}

export function sidebarClose() {
  const sidebar = qs("#sidebar");
  if (!sidebar?.classList.contains("open")) return;
  sidebarAnimate();
  sidebar.classList.remove("open");
  qs("#sidebar-backdrop")?.classList.remove("open");
  document.body.classList.remove("sidebar-open");
}

/* Global event wiring */
function bindCardMotion() {
  if (!window.matchMedia) return;
  if (window.matchMedia("(hover: none), (pointer: coarse)").matches) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  let frame = 0;
  let pending = null;

  document.addEventListener("pointermove", (event) => {
    const card = event.target.closest?.(".title-card");
    if (!card) return;
    pending = { card, x: event.clientX, y: event.clientY };
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (!pending) return;
      const wrap = pending.card.querySelector(".poster-wrap");
      if (!wrap) return;
      const rect = wrap.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const px = (pending.x - rect.left) / rect.width;
      const py = (pending.y - rect.top) / rect.height;
      wrap.style.setProperty("--mx", `${(px * 100).toFixed(1)}%`);
      wrap.style.setProperty("--my", `${(py * 100).toFixed(1)}%`);
      wrap.style.setProperty("--ry", `${((px - 0.5) * 5).toFixed(2)}deg`);
      wrap.style.setProperty("--rx", `${((0.5 - py) * 5).toFixed(2)}deg`);
    });
  }, { passive: true });

  document.addEventListener("pointerout", (event) => {
    const card = event.target.closest?.(".title-card");
    if (!card || card.contains(event.relatedTarget)) return;
    const wrap = card.querySelector(".poster-wrap");
    if (!wrap) return;
    wrap.style.setProperty("--rx", "0deg");
    wrap.style.setProperty("--ry", "0deg");
  }, { passive: true });
}

export function bindGlobalEvents() {
  if (window.__pkGlobalBound) return;
  window.__pkGlobalBound = true;

  // Long-press on mobile opens Chrome's native link/image menu even with
  // user-select disabled. Keep it off the content, but preserve it on fields
  // where copy/paste is actually useful.
  document.addEventListener("contextmenu", (event) => {
    if (event.target.closest?.("input, textarea, [contenteditable='true']")) return;
    event.preventDefault();
  }, { capture: true });

  document.addEventListener("selectstart", (event) => {
    if (event.target.closest?.("input, textarea, [contenteditable='true']")) return;
    event.preventDefault();
  });

  document.addEventListener("dragstart", (event) => {
    if (event.target.closest?.("input, textarea, [contenteditable='true']")) return;
    event.preventDefault();
  });

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (document.body.classList.contains("mobile-search-open") &&
        !target.closest(".topbar-search") && !target.closest("[data-mobile-search]")) {
      document.body.classList.remove("mobile-search-open");
      qs("[data-mobile-search]")?.setAttribute("aria-expanded", "false");
    }
    const close = target.closest("[data-close-modal]");
    if (close) { event.preventDefault(); closeModal(); return; }

    const sidebarToggle = target.closest("[data-sidebar-toggle]");
    if (sidebarToggle) {
      sidebarOpen();
      return;
    }
    if (target.closest("[data-sidebar-close]") || target.id === "sidebar-backdrop") {
      sidebarClose();
      return;
    }

    const mobileSearch = target.closest("[data-mobile-search]");
    if (mobileSearch) {
      const open = document.body.classList.toggle("mobile-search-open");
      mobileSearch.setAttribute("aria-expanded", String(open));
      qs("#nf-mobile-panel")?.classList.remove("open");
      qs("[data-nf-nav-toggle]")?.setAttribute("aria-expanded", "false");
      if (open) setTimeout(() => qs(".topbar-search input")?.focus({ preventScroll: true }), 40);
      return;
    }

    const navToggle = target.closest("[data-nf-nav-toggle]");
    if (navToggle) {
      const panel = qs("#nf-mobile-panel");
      const open = panel?.classList.toggle("open");
      navToggle.setAttribute("aria-expanded", String(Boolean(open)));
      const icon = navToggle.querySelector("i");
      icon?.classList.toggle("fa-caret-up", Boolean(open));
      icon?.classList.toggle("fa-caret-down", !open);
      return;
    }
    if (!target.closest(".nf-mobile-panel") && !target.closest("[data-nf-nav-toggle]")) {
      qs("#nf-mobile-panel")?.classList.remove("open");
      qs("[data-nf-nav-toggle]")?.setAttribute("aria-expanded", "false");
    }

    const searchForm = target.closest(".nf-search");
    if (searchForm && !target.closest("input")) {
      searchForm.querySelector("input")?.focus({ preventScroll: true });
    }

    if (target.closest("[data-auth-open]")) { event.preventDefault(); sidebarClose(); openAuthModal(); return; }

    if (target.closest("[data-logout]")) {
      event.preventDefault();
      authLogout()
        .then(() => {
          closeModal();
          refreshShell();
          toast("Você saiu da conta.", "info");
        })
        .catch((error) => toast(authErrorMessage(error.message), "error"));
      return;
    }

    const play = target.closest("[data-play]");
    if (play) {
      event.preventDefault(); event.stopPropagation();
      playItem(play.dataset.play);
      return;
    }

    const watch = target.closest("[data-watchlist]");
    if (watch) {
      event.preventDefault(); event.stopPropagation();
      toggleWatchlist(watch.dataset.watchlist);
      return;
    }

    const playDetail = target.closest("[data-play-detail]");
    if (playDetail) {
      event.preventDefault();
      const item = byId(playDetail.dataset.playDetail);
      if (item?.type === "series") {
        const episode = item.seasons?.[0]?.episodes?.[0];
        if (episode) openPlayer(item, { episode });
      } else if (item) {
        openPlayer(item);
      }
      return;
    }

    const watchDetail = target.closest("[data-watchlist-detail]");
    if (watchDetail) {
      event.preventDefault();
      toggleWatchlist(watchDetail.dataset.watchlistDetail);
      return;
    }

    const share = target.closest("[data-share-detail]");
    if (share) {
      event.preventDefault();
      shareItem(byId(share.dataset.shareDetail));
      return;
    }

    const episodeButton = target.closest("[data-play-episode]");
    if (episodeButton) {
      event.preventDefault();
      const item = byId(episodeButton.dataset.playEpisode);
      const season = item?.seasons?.find((entry) => String(entry.number) === String(episodeButton.dataset.season));
      const episode = season?.episodes.find((entry) => String(entry.number) === String(episodeButton.dataset.ep));
      if (item && episode) openPlayer(item, { episode });
      return;
    }

    const removeHistory = target.closest("[data-remove-history]");
    if (removeHistory) {
      event.preventDefault(); event.stopPropagation();
      store.removeHistory(removeHistory.dataset.removeHistory);
      const card = removeHistory.closest(".title-card");
      if (card) card.remove();
      toast("Título removido do histórico.", "success");
      window.dispatchEvent(new CustomEvent("pk:history-changed"));
      return;
    }

    const arrow = target.closest("[data-row-scroll]");
    if (arrow) {
      const row = document.getElementById(arrow.dataset.target);
      if (row) row.scrollBy({ left: (arrow.dataset.rowScroll === "left" ? -1 : 1) * Math.max(320, row.clientWidth * 0.82), behavior: "smooth" });
      return;
    }

    const details = target.closest("[data-open-details]");
    if (details) {
      event.preventDefault();
      openDetails(byId(details.dataset.openDetails));
      return;
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeModal();
      document.body.classList.remove("mobile-search-open");
      qs("[data-mobile-search]")?.setAttribute("aria-expanded", "false");
      qs("#nf-mobile-panel")?.classList.remove("open");
      qs("[data-nf-nav-toggle]")?.setAttribute("aria-expanded", "false");
      sidebarClose();
    }
    const typing = event.target.matches?.("input, textarea, select") || event.target.isContentEditable;
    if (event.key === "/" && !typing && !event.metaKey && !event.ctrlKey && !event.altKey) {
      const input = qs(".topbar-search input");
      if (!input) return;
      event.preventDefault();
      if (window.innerWidth <= 760) document.body.classList.add("mobile-search-open");
      input.focus({ preventScroll: true });
    }
    if (event.key === "Enter" && event.target.matches("[data-open-details]")) {
      event.preventDefault();
      openDetails(byId(event.target.dataset.openDetails));
    }
  });

  store.subscribe(() => {
    refreshSocialBadges();
  });
}
