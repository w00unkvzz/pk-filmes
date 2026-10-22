// Shared UI: shell, cards, rows, modals, details, player, toasts and auth.
import { CONFIG } from "./config.js";
import { byId, getGenreMeta } from "./data.js";
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
  return `<span class="avatar ${size} ${extra}" aria-hidden="true"><span class="avatar-initials">${escapeHTML(initials(name))}</span>${photo ? `<img src="${escapeHTML(photo)}" alt="" loading="lazy" onerror="this.remove()">` : ""}</span>`;
}

export function petSVG(id = "pet") {
  const safe = String(id).replace(/[^a-zA-Z0-9_-]/g, "");
  return `<svg viewBox="0 0 200 200" role="img" aria-label="Mascote Faísca">
    <defs>
      <radialGradient id="pet-body-${safe}" cx="35%" cy="25%" r="80%">
        <stop offset="0%" stop-color="#ffc4dd"/>
        <stop offset="55%" stop-color="#ff5aa8"/>
        <stop offset="100%" stop-color="#a30f56"/>
      </radialGradient>
      <linearGradient id="pet-ear-${safe}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#ffe0ee"/>
        <stop offset="100%" stop-color="#d61a70"/>
      </linearGradient>
    </defs>
    <ellipse cx="100" cy="172" rx="55" ry="10" fill="#000" opacity=".28"/>
    <path d="M48 68 C30 27 37 13 58 28 L78 48 Z" fill="url(#pet-ear-${safe})"/>
    <path d="M152 68 C170 27 163 13 142 28 L122 48 Z" fill="url(#pet-ear-${safe})"/>
    <path d="M54 64 C43 38 47 30 59 41 L74 52 Z" fill="#f9a8d4" opacity=".6"/>
    <path d="M146 64 C157 38 153 30 141 41 L126 52 Z" fill="#f9a8d4" opacity=".6"/>
    <circle cx="100" cy="111" r="59" fill="url(#pet-body-${safe})"/>
    <ellipse cx="100" cy="123" rx="35" ry="30" fill="#ede9fe" opacity=".2"/>
    <circle cx="79" cy="103" r="8" fill="#171122"/>
    <circle cx="121" cy="103" r="8" fill="#171122"/>
    <circle cx="81.5" cy="100" r="2.8" fill="#fff"/>
    <circle cx="118.5" cy="100" r="2.8" fill="#fff"/>
    <ellipse cx="65" cy="119" rx="9" ry="5" fill="#f9a8d4" opacity=".6"/>
    <ellipse cx="135" cy="119" rx="9" ry="5" fill="#f9a8d4" opacity=".6"/>
    <path d="M92 121 Q100 129 108 121" fill="none" stroke="#3b0764" stroke-width="3" stroke-linecap="round"/>
    <path d="M100 129 Q94 136 88 132" fill="none" stroke="#3b0764" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M100 129 Q106 136 112 132" fill="none" stroke="#3b0764" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M47 143 Q30 152 39 162 Q49 170 56 157" fill="none" stroke="#8b7cf6" stroke-width="8" stroke-linecap="round"/>
    <path d="M153 143 Q170 152 161 162 Q151 170 144 157" fill="none" stroke="#8b7cf6" stroke-width="8" stroke-linecap="round"/>
    <path d="M83 58 Q100 48 117 58" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".4"/>
  </svg>`;
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

export function typeLabel(item) {
  return item?.type === "series" ? "Série" : "Filme";
}

export function pageTitle(title, subtitle = "", eyebrow = "") {
  return `<div class="page-hero">
    ${eyebrow ? `<span class="eyebrow"><i class="fa-solid fa-sparkles"></i>${escapeHTML(eyebrow)}</span>` : ""}
    <h1>${title}</h1>
    ${subtitle ? `<p>${subtitle}</p>` : ""}
  </div>`;
}

/* Shell */
export function renderShell() {
  const page = document.body.dataset.page || "home";
  const user = store.getUser();
  const requestCount = store.getFriendRequests().length;
  const sidebar = qs("#sidebar");
  const topbar = qs("#topbar");
  const mobileNav = qs("#mobile-nav");
  if (!sidebar || !topbar || !mobileNav) return;

  const sections = [...new Set(CONFIG.nav.map((item) => item.section))];
  sidebar.innerHTML = `
    <a class="sidebar-brand" href="index.html" aria-label="${escapeHTML(CONFIG.brand)} — início">
      <span class="brand-mark">${escapeHTML(CONFIG.brandShort)}</span>
      <span class="brand-text"><strong>${escapeHTML(CONFIG.brand)}</strong><span>${escapeHTML(CONFIG.tagline)}</span></span>
    </a>
    <nav class="sidebar-nav">
      ${sections.map((section) => `
        <div class="nav-section-label">${escapeHTML(section)}</div>
        ${CONFIG.nav.filter((item) => item.section === section).map((item) => {
          const active = page === item.page;
          const badge = item.badge === "requests" && requestCount ? `<span class="sidebar-badge">${requestCount}</span>` : "";
          return `<a class="sidebar-link ${active ? "active" : ""}" href="${item.href}" ${active ? 'aria-current="page"' : ""}>
            <i class="fa-solid ${item.icon}"></i><span class="sidebar-label">${escapeHTML(item.label)}</span>${badge}
          </a>`;
        }).join("")}
      `).join("")}
    </nav>
    <div class="sidebar-foot">
      ${user.authed
        ? `<a class="sidebar-user" href="perfil.html">${avatar(user, "sm")}<div><strong>${escapeHTML(user.name)}</strong><span>online</span></div></a>`
        : `<button class="sidebar-user" data-auth-open type="button">${avatar(user, "sm")}<div><strong>Entrar</strong><span>Sua conta</span></div></button>`}
    </div>`;

  topbar.innerHTML = `
    <button class="mobile-menu-btn" data-sidebar-toggle type="button" aria-label="Abrir menu"><i class="fa-solid fa-bars"></i></button>
    <a class="mobile-top-logo" href="index.html"><span class="brand-mark">${escapeHTML(CONFIG.brandShort)}</span><strong>${escapeHTML(CONFIG.brand)}</strong></a>
    <form class="topbar-search" action="search.html" method="get" role="search">
      <i class="fa-solid fa-magnifying-glass"></i>
      <input type="search" name="q" placeholder="Buscar filmes, séries ou gêneros..." autocomplete="off" aria-label="Buscar no catálogo">
    </form>
    <div class="topbar-spacer"></div>
    <div class="topbar-actions">
      <a class="topbar-icon" href="amigos.html" aria-label="Amigos e pedidos" title="Amigos">
        <i class="fa-regular fa-bell"></i>${requestCount ? '<span class="dot-badge"></span>' : ""}
      </a>
      <div class="topbar-menu">
        <button class="avatar-btn" data-profile-toggle type="button" aria-label="Abrir menu do perfil" aria-expanded="false">${avatar(user, "sm")}</button>
        <div class="profile-menu" id="profile-menu">
          <div class="profile-menu-head"><strong>${escapeHTML(user.name)}</strong><span>${escapeHTML(user.authed ? user.email : "Não conectado")}</span></div>
          ${user.authed
            ? `<a href="perfil.html"><i class="fa-solid fa-user"></i>Meu perfil</a>
               <a href="perfil.html#minha-lista"><i class="fa-solid fa-bookmark"></i>Minha lista</a>
               <a href="amigos.html"><i class="fa-solid fa-user-group"></i>Amigos</a>
               <a href="mascote.html"><i class="fa-solid fa-paw"></i>Mascote</a>
               <div class="sep"></div>
               <button data-logout type="button"><i class="fa-solid fa-right-from-bracket"></i>Sair</button>`
            : `<button data-auth-open type="button"><i class="fa-solid fa-right-to-bracket"></i>Entrar</button>`}
        </div>
      </div>
    </div>`;

  mobileNav.innerHTML = CONFIG.mobileNav.map((item) => {
    const active = page === item.page;
    return `<a class="${active ? "active" : ""}" href="${item.href}" ${active ? 'aria-current="page"' : ""}><i class="fa-solid ${item.icon}"></i><span>${escapeHTML(item.label)}</span></a>`;
  }).join("");

  const search = qs(".topbar-search input", topbar);
  if (search && page === "search") {
    const query = new URLSearchParams(location.search).get("q") || "";
    search.value = query;
  }
  syncSidebarBackdrop();
}

export function renderFooter() {
  const content = qs("#page-content");
  if (!content || qs(".site-footer", content)) return;
  content.insertAdjacentHTML("beforeend", `
    <footer class="site-footer">
      <div class="row-between">
        <div class="footer-brand"><span class="brand-mark">${escapeHTML(CONFIG.brandShort)}</span>${escapeHTML(CONFIG.brand)}</div>
        <div class="footer-links">
          <a href="catalogo.html">Catálogo</a>
          <a href="cartaz.html">Em breve</a>
          <a href="pkparty.html">w00 Party</a>
          <a href="amigos.html">Amigos</a>
          <a href="perfil.html">Perfil</a>
        </div>
        <span>© ${new Date().getFullYear()} w00filmes</span>
      </div>
    </footer>`);
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
    el.style.opacity = "0";
    el.style.transform = "translateY(6px)";
    el.style.transition = "all .22s ease";
    setTimeout(() => el.remove(), 230);
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
    root.innerHTML = "";
    document.body.classList.remove("modal-open");
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
function posterImage(item) {
  if (!item?.poster) return "";
  return `<img class="poster-img" src="${escapeHTML(item.poster)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">`;
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
  const inList = store.isInWatchlist(item.id);
  const progress = options.progress ?? 0;
  const isSeries = item.type === "series";
  const type = typeLabel(item).toUpperCase();
  return `<article class="title-card" data-open-details="${escapeHTML(item.id)}" tabindex="0" aria-label="${escapeHTML(item.title)}">
    <div class="poster-wrap">
      <div class="poster ${item.poster ? "has-image" : ""}" style="--c1:${item.colors?.[0] || "#1e1b4b"};--c2:${item.colors?.[1] || "#6a5acd"}">
        ${posterImage(item)}
        <div class="poster-topline"><span class="poster-grade">${escapeHTML(item.age || "L")}</span><span class="poster-type">${type}</span></div>
        <div class="poster-ring"></div>
        <span class="poster-title ${item.title.length > 18 ? "small" : ""}">${escapeHTML(item.title)}</span>
      </div>
      <div class="poster-overlay">
        <button class="card-play" data-play="${escapeHTML(item.id)}" type="button" aria-label="Assistir ${escapeHTML(item.title)}"><i class="fa-solid fa-play"></i></button>
        <div class="card-quick">
          <button data-watchlist="${escapeHTML(item.id)}" type="button" title="${inList ? "Remover da minha lista" : "Adicionar à minha lista"}" aria-label="${inList ? "Remover da lista" : "Adicionar à lista"}"><i class="fa-solid ${inList ? "fa-check" : "fa-plus"}"></i></button>
          <button data-open-details="${escapeHTML(item.id)}" type="button" title="Mais informações" aria-label="Mais informações"><i class="fa-solid fa-circle-info"></i></button>
        </div>
      </div>
      ${options.remove ? `<button class="card-remove" data-remove-history="${escapeHTML(item.id)}" type="button" title="Remover do histórico" aria-label="Remover do histórico"><i class="fa-solid fa-xmark"></i></button>` : ""}
    </div>
    <div class="card-info">
      <span class="card-title">${escapeHTML(item.title)}</span>
      ${cardMeta(item)}
      ${progress ? `<div class="card-progress"><span style="width:${Math.min(100, progress)}%"></span></div>` : ""}
    </div>
  </article>`;
}

export function mediaRow(title, items, options = {}) {
  if (!items.length) return "";
  const rowId = options.id || `row-${Math.random().toString(36).slice(2)}`;
  const progressMap = options.progressMap || {};
  return `<section class="page-section ${options.tight ? "tight" : ""}">
    <div class="section-head">
      <div>${options.kicker ? `<div class="section-kicker">${options.kicker}</div>` : ""}<h2>${title}</h2></div>
      <a class="section-link" href="${options.href || "catalogo.html"}">Ver tudo <i class="fa-solid fa-arrow-right"></i></a>
    </div>
    <div class="media-row-wrap">
      <button class="row-arrow left" data-row-scroll="left" data-target="${rowId}" type="button" aria-label="Rolar para a esquerda"><i class="fa-solid fa-chevron-left"></i></button>
      <div class="media-row" id="${rowId}">
        ${items.map((item) => posterCard(item, { progress: progressMap[item.id] || 0, remove: options.remove })).join("")}
      </div>
      <button class="row-arrow right" data-row-scroll="right" data-target="${rowId}" type="button" aria-label="Rolar para a direita"><i class="fa-solid fa-chevron-right"></i></button>
    </div>
  </section>`;
}

export function top10Row(items) {
  return `<section class="page-section">
    <div class="section-head">
      <div><div class="section-kicker"><i class="fa-solid fa-fire"></i> Ranking semanal</div><h2>Top 10 da semana</h2></div>
      <a class="section-link" href="catalogo.html?ordenar=popular">Ver catálogo <i class="fa-solid fa-arrow-right"></i></a>
    </div>
    <div class="media-row-wrap">
      <button class="row-arrow left" data-row-scroll="left" data-target="top10-row" type="button" aria-label="Rolar para a esquerda"><i class="fa-solid fa-chevron-left"></i></button>
      <div class="top10-row" id="top10-row">
        ${items.map((item, index) => `<div class="top10-card">
          <span class="top10-num" aria-hidden="true">${index + 1}</span>
          ${posterCard(item)}
        </div>`).join("")}
      </div>
      <button class="row-arrow right" data-row-scroll="right" data-target="top10-row" type="button" aria-label="Rolar para a direita"><i class="fa-solid fa-chevron-right"></i></button>
    </div>
  </section>`;
}

export function genreStrip(genres) {
  return `<div class="genre-strip">${genres.map((genre) => {
    const meta = getGenreMeta(genre);
    return `<a class="genre-pill" href="catalogo.html?genero=${encodeURIComponent(genre)}"><i class="fa-solid ${meta.icon}"></i>${escapeHTML(genre)}</a>`;
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
    const update = () => {
      const max = row.scrollWidth - row.clientWidth - 2;
      left.disabled = row.scrollLeft <= 2;
      right.disabled = row.scrollLeft >= max;
    };
    row.addEventListener("scroll", update, { passive: true });
    update();
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

function detailMeta(item) {
  const bits = [];
  if (Number(item.rating) > 0) bits.push(`<span class="rating"><i class="fa-solid fa-star"></i>${Number(item.rating).toFixed(1)}</span>`);
  const year = item.year || (item.releaseDate ? new Date(item.releaseDate).getFullYear() : "");
  if (year) bits.push(`<span>${escapeHTML(String(year))}</span>`);
  const seasons = item.seasons?.length || 1;
  const length = item.type === "series"
    ? `${seasons} temporada${seasons > 1 ? "s" : ""}`
    : (item.duration ? formatDuration(item.duration) : "");
  if (length) bits.push(`<span>${escapeHTML(length)}</span>`);
  if (item.age) bits.push(`<span class="badge-age">${escapeHTML(item.age)}</span>`);
  return bits.join('<span class="dot"></span>');
}

/* Details */
export function openDetails(item) {
  if (!item) return;
  const inList = store.isInWatchlist(item.id);
  const history = store.getHistoryEntry(item.id);
  const isSeries = item.type === "series";
  const firstSeason = item.seasons?.[0];
  const firstEpisode = firstSeason?.episodes?.[0];
  const genreBadges = (item.genres || []).map((genre) => `<span class="badge badge-soft">${escapeHTML(genre)}</span>`).join(" ");
  const upcoming = Boolean(item.releaseDate);
  const episodes = firstSeason?.episodes || [];
  const content = `
    <button class="modal-close" data-close-modal type="button" aria-label="Fechar"><i class="fa-solid fa-xmark"></i></button>
    <div class="modal-head" style="--c1:${item.colors?.[0] || "#1e1b4b"};--c2:${item.colors?.[1] || "#6a5acd"}">
      <div class="modal-head-inner">
        <div class="modal-poster">
          <div class="poster ${item.poster ? "has-image" : ""}" style="--c1:${item.colors?.[0] || "#1e1b4b"};--c2:${item.colors?.[1] || "#6a5acd"}">
            ${posterImage(item)}
            <div class="poster-topline"><span class="poster-grade">${escapeHTML(item.age || "L")}</span><span class="poster-type">${typeLabel(item).toUpperCase()}</span></div>
            <div class="poster-ring"></div>
            <span class="poster-title">${escapeHTML(item.title)}</span>
          </div>
        </div>
        <div class="modal-head-info">
          <div class="hero-badges">${upcoming ? '<span class="badge badge-accent">Em breve</span>' : `<span class="badge ${item.isNew ? "badge-new" : "badge-soft"}">${item.isNew ? "Novo" : "Catálogo"}</span>`}</div>
          <h2>${escapeHTML(item.title)}</h2>
          <div class="meta">${detailMeta(item)}</div>
          <div class="modal-actions">
            ${upcoming
              ? `<button class="btn btn-primary" data-watchlist-detail="${escapeHTML(item.id)}" type="button"><i class="fa-solid ${inList ? "fa-check" : "fa-plus"}"></i>${inList ? "Na minha lista" : "Lembrar-me"}</button>`
              : `<button class="btn btn-light" data-play-detail="${escapeHTML(item.id)}" type="button"><i class="fa-solid fa-play"></i>Assistir ${isSeries && firstEpisode ? "T1 E1" : "agora"}</button>
                 <button class="btn ${inList ? "btn-primary" : "btn-ghost"}" data-watchlist-detail="${escapeHTML(item.id)}" type="button"><i class="fa-solid ${inList ? "fa-check" : "fa-plus"}"></i>${inList ? "Na minha lista" : "Minha lista"}</button>`}
            <button class="btn-icon" data-share-detail="${escapeHTML(item.id)}" type="button" aria-label="Compartilhar título" title="Compartilhar"><i class="fa-solid fa-share-nodes"></i></button>
          </div>
        </div>
      </div>
    </div>
    <div class="modal-body" data-detail-id="${escapeHTML(item.id)}">
      <div class="modal-cols">
        <div>
          <p>${escapeHTML(item.synopsis || "Sinopse em preparação.")}</p>
          ${isSeries && episodes.length ? `
            <div class="row-between" style="margin-top:24px;gap:12px">
              <h3>Episódios</h3>
              ${(item.seasons?.length || 1) > 1 ? `<select class="select" id="detail-season" style="width:auto;min-height:34px;height:34px;padding-block:0;font-size:11px">${item.seasons.map((season) => `<option value="${season.number}">Temporada ${season.number}</option>`).join("")}</select>` : ""}
            </div>
            <div id="detail-episodes">${episodeList(item, firstSeason?.number || 1)}</div>` : ""}
          ${history ? `<div class="row" style="margin-top:22px"><div class="progress grow" style="max-width:260px"><span style="width:${store.progressPercent(history)}%"></span></div><span class="tiny muted">${store.progressPercent(history)}% assistido</span></div>` : ""}
        </div>
        <div class="modal-facts">
          <div class="modal-fact"><span>Direção</span><strong>${escapeHTML(item.director || "Equipe w00")}</strong></div>
          <div class="modal-fact"><span>Elenco</span><strong>${escapeHTML((item.cast || []).join(", ") || "Elenco não informado")}</strong></div>
          <div class="modal-fact"><span>Gêneros</span><strong>${escapeHTML((item.genres || []).join(" · "))}</strong></div>
          <div class="modal-fact"><span>${upcoming ? "Estreia" : "Disponível em"}</span><strong>${formatDate(item.releaseDate || item.addedAt || "2026-10-22")}</strong></div>
          ${upcoming ? `<div class="modal-fact"><span>Contagem</span><strong>${daysUntil(item.releaseDate)} dias</strong></div>` : ""}
          <div class="modal-fact"><span>Classificação</span><strong>${escapeHTML(item.age || "L")} · ${escapeHTML(item.genres?.[0] || "Livre")}</strong></div>
        </div>
      </div>
    </div>`;

  openModal(content, {
    className: "modal-lg",
    label: item.title,
    onMount: () => {
      const seasonSelect = qs("#detail-season");
      if (seasonSelect) {
        seasonSelect.addEventListener("change", () => {
          const season = item.seasons.find((entry) => String(entry.number) === seasonSelect.value);
          const target = qs("#detail-episodes");
          if (season && target) target.innerHTML = episodeList(item, season.number);
        });
      }
    }
  });
}

function episodeList(item, seasonNumber) {
  const season = item.seasons?.find((entry) => entry.number === seasonNumber) || item.seasons?.[0];
  if (!season) return "";
  return `<div class="episode-list">${season.episodes.map((episode) => `
    <button class="episode-item" data-play-episode="${escapeHTML(item.id)}" data-season="${season.number}" data-ep="${episode.number}" type="button">
      <span class="episode-num">${String(episode.number).padStart(2, "0")}</span>
      <span class="grow"><strong>${escapeHTML(episode.title)}</strong><span>T${season.number} E${episode.number} · ${formatDuration(episode.duration)}</span></span>
      <span class="episode-play"><i class="fa-solid fa-play"></i></span>
    </button>`).join("")}</div>`;
}

export function daysUntil(date) {
  const target = new Date(date).getTime();
  return Math.max(0, Math.ceil((target - Date.now()) / 86400000));
}

/* Player */
function isEmbedStream(url = "") {
  const value = String(url).trim();
  if (!value) return false;
  if (/^data:video\//i.test(value) || /^blob:/i.test(value)) return false;
  const clean = value.split("#")[0].split("?")[0].toLowerCase();
  if (/\.(mp4|m4v|webm|ogv|ogg|mov|m3u8)$/.test(clean)) return false;
  return /youtube\.com|youtu\.be|vimeo\.com|dailymotion\.com|embed|player\./i.test(value);
}

export function openPlayer(item, options = {}) {
  if (!item) return;
  const episode = options.episode || null;
  const stream = episode?.stream || item.player || item.stream;
  if (!stream) {
    toast("Este título ainda não tem um player configurado.", "info", "Em breve");
    return;
  }
  const embed = isEmbedStream(stream);
  const history = store.getHistoryEntry(item.id);
  const displayTitle = episode ? `${item.title} · T${episode.season} E${episode.number}` : item.title;
  const content = `
    <div class="player-top">
      <div class="grow"><h3>${escapeHTML(displayTitle)}</h3><div class="meta"><span>${episode ? escapeHTML(episode.title) : typeLabel(item)}</span><span class="dot"></span><span>${formatDuration(episode?.duration || item.duration)}</span><span class="dot"></span><span class="badge badge-soft">w00filmes</span></div></div>
      <button class="btn-icon" data-close-modal type="button" aria-label="Fechar player"><i class="fa-solid fa-xmark"></i></button>
    </div>
    <div class="player-stage">${embed
      ? `<iframe id="player-frame" src="${escapeHTML(stream)}" title="${escapeHTML(displayTitle)}" allow="autoplay; fullscreen; picture-in-picture; encrypted-media" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`
      : `<video id="player-video" controls autoplay playsinline preload="metadata" src="${escapeHTML(stream)}"></video>`}</div>
    <div class="player-note"><i class="fa-solid fa-circle-info"></i><span>${embed ? "Player incorporado do provedor. O progresso não pode ser sincronizado neste modo." : "Reprodução direta do endereço configurado no campo player. O progresso fica salvo neste navegador."}</span></div>
    <div class="player-next">
      <div class="poster" style="--c1:${item.colors?.[0] || "#1e1b4b"};--c2:${item.colors?.[1] || "#6a5acd"}"><span class="poster-title">${escapeHTML(item.title)}</span></div>
      <div class="grow"><strong style="display:block;font-size:11px">Você está assistindo</strong><span class="tiny muted">O progresso fica salvo neste navegador.</span></div>
      <button class="btn btn-sm btn-ghost" data-close-modal type="button">Fechar</button>
    </div>`;

  let cleanup = null;
  openModal(content, {
    className: "player-modal",
    label: `Player — ${item.title}`,
    onMount: () => {
      const video = qs("#player-video");
      if (!video) {
        // Embedded provider (iframe): no cross-origin progress events available.
        cleanup = () => {};
        return;
      }
      let lastSave = 0;
      const save = (force = false) => {
        if (!video || !Number.isFinite(video.currentTime)) return;
        const duration = Number.isFinite(video.duration) ? video.duration : (episode?.duration || item.duration || 0) * 60;
        if (force || Date.now() - lastSave > 5000) {
          lastSave = Date.now();
          store.addHistory(item, video.currentTime, duration, episode ? { episode: { season: episode.season, number: episode.number, title: episode.title, id: episode.id } } : {});
        }
      };
      video.addEventListener("loadedmetadata", () => {
        if (history?.progress > 5 && history.progress < (video.duration || Infinity) - 10) {
          video.currentTime = history.progress;
          toast(`Retomando de ${formatClock(history.progress)}.`, "info", "Continuar assistindo");
        }
      });
      video.addEventListener("play", () => save(true));
      video.addEventListener("pause", () => save(true));
      video.addEventListener("timeupdate", () => save(false));
      video.addEventListener("ended", () => {
        const duration = Number.isFinite(video.duration) ? video.duration : 0;
        store.addHistory(item, duration, duration, episode ? { episode: { season: episode.season, number: episode.number, title: episode.title, id: episode.id } } : {});
        toast("Você concluiu este título. Bom filme!", "success", "Sessão concluída");
      });
      const started = video.play();
      if (started && typeof started.catch === "function") started.catch(() => {});
      cleanup = () => { try { video.pause(); save(true); video.removeAttribute("src"); video.load(); } catch { /* noop */ } };
    },
    onClose: () => {
      if (cleanup) cleanup();
      cleanup = null;
      window.dispatchEvent(new CustomEvent("pk:history-changed"));
    }
  });
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
  const url = new URL(location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("filme", item.id);
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

export function openDetailsFromUrl() {
  const params = new URLSearchParams(location.search);
  const id = params.get("filme") || params.get("id");
  if (!id) return false;
  const item = byId(id);
  if (!item) return false;
  setTimeout(() => openDetails(item), 80);
  return true;
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
    [/provider is not enabled/i, "Login com GitHub não está ativado no Supabase."],
    [/supabase não configurado/i, "Supabase não configurado."],
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
      <p>${cloud ? "Sessão sincronizada pelo Supabase." : "Perfil local salvo neste navegador."}</p>
    </div>
    <div class="auth-account">
      ${avatar(user, "md")}
      <div class="grow"><strong>${escapeHTML(user.name)}</strong><span>${escapeHTML(user.email)}</span></div>
      <span class="badge ${cloud ? "badge-live" : "badge-soft"}">${cloud ? "online" : "local"}</span>
    </div>
    <form class="auth-body">
      ${cloud ? `<button class="btn btn-primary btn-block" data-password-change type="button"><i class="fa-solid fa-key"></i>Alterar senha</button>` : ""}
      <button class="btn btn-ghost btn-block" data-logout type="button"><i class="fa-solid fa-right-from-bracket"></i>Sair da conta</button>
      <p class="auth-note">${cloud ? "Seus dados estão no seu projeto Supabase." : "Configure o Supabase para ativar contas reais e sincronização."}</p>
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
      <p>Sua conta sincroniza perfil, foto, amigos e salas do w00 Party.</p>
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
      <p class="auth-note">Conta real via Supabase · seus dados ficam no seu projeto.</p>
    </form>` : `
    <button class="modal-close" data-close-modal type="button" aria-label="Fechar"><i class="fa-solid fa-xmark"></i></button>
    <div class="auth-head">
      <div class="brand-mark">${escapeHTML(CONFIG.brandShort)}</div>
      <h2>Entrar no w00filmes</h2>
      <p>Modo local enquanto o Supabase não está configurado.</p>
    </div>
    <form class="auth-body" id="auth-form">
      <div class="field"><label for="auth-name">Nome de exibição</label><input class="input" id="auth-name" name="name" required maxlength="28" placeholder="Como podemos chamar você?"></div>
      <div class="field"><label for="auth-email">E-mail (opcional)</label><input class="input" id="auth-email" name="email" type="email" placeholder="voce@exemplo.com"></div>
      <button class="btn btn-primary btn-block" type="submit"><i class="fa-solid fa-right-to-bracket"></i>Entrar no modo local</button>
      <p class="auth-note">Para ativar contas reais, preencha <code>js/supabase-config.js</code> com a URL e a anon key do seu projeto Supabase.</p>
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
  qsa(".avatar-btn, .sidebar-user .avatar").forEach(() => {});
}

/* Global event wiring */
export function bindGlobalEvents() {
  if (window.__pkGlobalBound) return;
  window.__pkGlobalBound = true;

  document.addEventListener("click", (event) => {
    const target = event.target;
    const close = target.closest("[data-close-modal]");
    if (close) { event.preventDefault(); closeModal(); return; }

    const sidebarToggle = target.closest("[data-sidebar-toggle]");
    if (sidebarToggle) {
      qs("#sidebar")?.classList.add("open");
      qs("#sidebar-backdrop")?.classList.add("open");
      document.body.classList.add("sidebar-open");
      return;
    }
    if (target.closest("[data-sidebar-close]") || target.id === "sidebar-backdrop") {
      qs("#sidebar")?.classList.remove("open");
      qs("#sidebar-backdrop")?.classList.remove("open");
      document.body.classList.remove("sidebar-open");
      return;
    }

    const profileToggle = target.closest("[data-profile-toggle]");
    if (profileToggle) {
      event.stopPropagation();
      const menu = qs("#profile-menu");
      const open = menu?.classList.toggle("open");
      profileToggle.setAttribute("aria-expanded", String(Boolean(open)));
      return;
    }
    if (!target.closest(".topbar-menu")) {
      qs("#profile-menu")?.classList.remove("open");
      qs('[data-profile-toggle]')?.setAttribute("aria-expanded", "false");
    }

    if (target.closest("[data-auth-open]")) { event.preventDefault(); openAuthModal(); return; }

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
      qs("#profile-menu")?.classList.remove("open");
      qs("#sidebar")?.classList.remove("open");
      qs("#sidebar-backdrop")?.classList.remove("open");
      document.body.classList.remove("sidebar-open");
    }
    if (event.key === "Enter" && event.target.matches("[data-open-details]")) {
      event.preventDefault();
      openDetails(byId(event.target.dataset.openDetails));
    }
  });

  store.subscribe(() => {
    const badge = store.getFriendRequests().length;
    qsa(".sidebar-badge").forEach((el) => { el.textContent = badge; el.style.display = badge ? "grid" : "none"; });
  });
}
