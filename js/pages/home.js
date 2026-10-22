// Home page: hero carousel, continue watching, curated rows and genres.
import { CONFIG } from "../config.js";
import { CATALOG, featured, trending, top10, movies, series, newReleases } from "../data.js";
import * as store from "../store.js";
import { mediaRow, top10Row, genreStrip, qs, escapeHTML, formatDuration, toast, emptyState } from "../ui.js";

let heroTimer = null;

function heroMeta(item) {
  const bits = [];
  if (Number(item.rating) > 0) {
    bits.push(`<span class="rating"><i class="fa-solid fa-star"></i>${Number(item.rating).toFixed(1)}</span>`);
  }
  if (item.year) bits.push(`<span>${escapeHTML(String(item.year))}</span>`);
  const seasons = item.seasons?.length || 1;
  const length = item.type === "series"
    ? `${seasons} temporada${seasons > 1 ? "s" : ""}`
    : (item.duration ? formatDuration(item.duration) : "");
  if (length) bits.push(`<span>${escapeHTML(length)}</span>`);
  if (item.age) bits.push(`<span class="badge-age">${escapeHTML(item.age)}</span>`);
  if (item.genres?.length) bits.push(`<span>${escapeHTML(item.genres.slice(0, 2).join(" · "))}</span>`);
  return bits.join('<span class="dot"></span>');
}

function heroMarkup(item) {
  const inList = store.isInWatchlist(item.id);
  return `
    <div class="hero-art" aria-hidden="true" style="--c1:${item.colors[0]};--c2:${item.colors[1]}">
      <span class="hero-art-word">${escapeHTML(item.title.split(" ").slice(0, 2).join(" "))}</span>
    </div>
    <div class="hero-content">
      <div class="hero-badges">
        <span class="badge badge-accent"><i class="fa-solid fa-bolt"></i> Em destaque</span>
        <span class="badge ${item.type === "series" ? "badge-live" : "badge-new"}">${item.type === "series" ? "Série original" : "Filme original"}</span>
        ${item.isNew ? '<span class="badge badge-new">Novo</span>' : ""}
      </div>
      <h1 class="hero-title">${escapeHTML(item.title)}</h1>
      <div class="meta hero-meta">${heroMeta(item)}</div>
      <p class="hero-desc">${escapeHTML(item.synopsis)}</p>
      <div class="hero-actions">
        <button class="btn btn-light btn-lg" data-play="${escapeHTML(item.id)}" type="button"><i class="fa-solid fa-play"></i>Assistir agora</button>
        <button class="btn btn-ghost btn-lg" data-open-details="${escapeHTML(item.id)}" type="button"><i class="fa-solid fa-circle-info"></i>Mais informações</button>
        <button class="btn btn-icon" data-watchlist="${escapeHTML(item.id)}" type="button" title="${inList ? "Remover da lista" : "Adicionar à lista"}" aria-label="${inList ? "Remover da lista" : "Adicionar à lista"}"><i class="fa-solid ${inList ? "fa-check" : "fa-plus"}"></i></button>
      </div>
    </div>
    <div class="hero-side-note">w00filmes · sessão da casa</div>`;
}

function heroDots(active) {
  return `<div class="hero-dots" role="tablist" aria-label="Destaques">
    ${featured.map((item, index) => `<button class="hero-dot ${index === active ? "active" : ""}" data-hero-index="${index}" type="button" role="tab" aria-selected="${index === active}" aria-label="${escapeHTML(item.title)}"></button>`).join("")}
  </div>`;
}

export function renderHome() {
  const history = store.getHistory();
  const historyItems = history.map((entry) => ({ item: CATALOG.find((movie) => movie.id === entry.id), entry })).filter(({ item }) => item);
  const progressMap = Object.fromEntries(history.map((entry) => [entry.id, store.progressPercent(entry)]));
  const family = CATALOG.filter((item) => item.genres.some((genre) => ["Família", "Animação", "Aventura"].includes(genre))).slice(0, 12);
  const hero = featured[0];

  if (!hero) {
    qs("#page-content").innerHTML = `
      <section class="page-section">
        ${emptyState("fa-film", "Catálogo vazio", "Adicione seus títulos em catalog.json para começar. O site já está pronto para carregar nome, capa, categoria, idade e player.")}
        <div class="row" style="justify-content:center;margin-top:16px">
          <a class="btn btn-primary" href="catalogo.html"><i class="fa-solid fa-clapperboard"></i>Ver catálogo</a>
          <a class="btn btn-ghost" href="amigos.html"><i class="fa-solid fa-user-group"></i>Encontrar amigos</a>
        </div>
      </section>`;
    return;
  }

  const content = `
    <section class="hero" id="hero" style="--c1:${hero.colors[0]};--c2:${hero.colors[1]}">
      ${heroMarkup(hero)}
      ${heroDots(0)}
    </section>

    ${historyItems.length ? mediaRow("Continuar assistindo", historyItems.map(({ item }) => item), {
      id: "continue-row",
      href: "perfil.html#historico",
      progressMap,
      remove: true
    }) : ""}

    <section class="page-section tight">
      <div class="section-head">
        <h2>Explorar por gênero</h2>
        <a class="section-link" href="catalogo.html">Ver catálogo <i class="fa-solid fa-arrow-right"></i></a>
      </div>
      ${genreStrip(CONFIG.genres.map((genre) => genre.name))}
    </section>

    ${mediaRow("Filmes Populares", trending, { id: "trending-row" })}
    ${top10Row(top10)}
    ${mediaRow("Filmes para a sua noite", movies, { id: "movies-row", href: "catalogo.html?tipo=movie" })}
    ${mediaRow("Séries em destaque", series, { id: "series-row", href: "catalogo.html?tipo=series" })}
    ${mediaRow("Novidades no catálogo", newReleases, { id: "new-row" })}
    ${mediaRow("Família & animação", family, { id: "family-row" })}

    <section class="page-section">
      <div class="party-hero" style="margin:0">
        <div class="party-hero-inner">
          <div>
            <h2 style="font-size:clamp(1.5rem,3vw,2.4rem)">Assistir junto ficou mais fácil.</h2>
            <p>Crie uma sala, escolha um título e converse com seus amigos em tempo real — sincronizado pelo Supabase.</p>
            <div class="row"><a class="btn btn-primary" href="pkparty.html"><i class="fa-solid fa-plus"></i>Criar sala</a><a class="btn btn-ghost" href="pkparty.html"><i class="fa-solid fa-right-to-bracket"></i>Entrar com código</a></div>
          </div>
          <div class="badge badge-live"><i class="fa-solid fa-circle"></i> salas em tempo real</div>
        </div>
      </div>
    </section>`;

  qs("#page-content").innerHTML = content;
  mountHome();
}

function mountHome() {
  const hero = qs("#hero");
  if (!hero) return;
  let index = 0;
  const paint = (next) => {
    index = (next + featured.length) % featured.length;
    const item = featured[index];
    hero.style.setProperty("--c1", item.colors[0]);
    hero.style.setProperty("--c2", item.colors[1]);
    hero.innerHTML = `${heroMarkup(item)}${heroDots(index)}`;
  };
  const start = () => {
    clearInterval(heroTimer);
    heroTimer = setInterval(() => paint(index + 1), 8000);
  };
  hero.addEventListener("click", (event) => {
    const dot = event.target.closest("[data-hero-index]");
    if (!dot) return;
    paint(Number(dot.dataset.heroIndex));
    start();
  });
  hero.addEventListener("mouseenter", () => clearInterval(heroTimer));
  hero.addEventListener("mouseleave", start);
  hero.addEventListener("focusin", () => clearInterval(heroTimer));
  hero.addEventListener("focusout", start);
  start();
  window.addEventListener("pk:history-changed", () => {
    // The row is intentionally refreshed by a page reload-like re-render only when visible.
    // Keeping the hero stable avoids interrupting the carousel.
  }, { once: true });
}

export function destroyHome() {
  clearInterval(heroTimer);
  heroTimer = null;
}
