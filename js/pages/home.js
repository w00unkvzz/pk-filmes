// Home page: hero carousel, continue watching and curated rows.
import { CATALOG, catalogTitles, featured, trending, top10, movies, series, newReleases } from "../data.js";
import * as store from "../store.js";
import { mediaRow, top10Row, qs, escapeHTML, formatDuration, toast, emptyState } from "../ui.js";
import { openTrailerModal } from "../trailer.js";

let heroTimer = null;

function heroImage(item) {
  return item.backdrop || item.poster || "";
}

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
  if (item.genres?.length) bits.push(`<span class="hero-genre">${escapeHTML(item.genres.slice(0, 2).join(" · "))}</span>`);
  return bits.join('<span class="dot"></span>');
}

function heroMarkup(item) {
  const image = heroImage(item);
  return `
    <div class="hero-bg ${image ? "" : "no-image"}" aria-hidden="true">
      ${image ? `<img src="${escapeHTML(image)}" alt="" fetchpriority="high" decoding="async" referrerpolicy="no-referrer">` : ""}
    </div>
    <div class="hero-overlay" aria-hidden="true"></div>
    <div class="hero-content">
      <div class="hero-brand"><span class="hero-brand-mark">W00</span><span>original</span></div>
      <h1 class="hero-title">${escapeHTML(item.title)}</h1>
      <div class="meta hero-meta">${heroMeta(item)}</div>
      <p class="hero-desc">${escapeHTML(item.synopsis)}</p>
      <div class="hero-actions">
        <button class="hero-btn hero-btn-play" data-play="${escapeHTML(item.id)}" type="button">
          <i class="fa-solid fa-play"></i><span>Assistir Agora</span>
        </button>
        <button class="hero-btn hero-btn-trailer" data-trailer="${escapeHTML(item.id)}" type="button">
          <i class="fa-solid fa-video"></i><span>Trailer</span>
        </button>
      </div>
    </div>`;
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
  const family = catalogTitles.filter((item) => item.genres.some((genre) => ["Família", "Animação", "Aventura"].includes(genre))).slice(0, 12);
  const hero = featured[0];

  if (!hero) {
    qs("#page-content").innerHTML = `
      <section class="page-section">
        ${emptyState("fa-film", "Catálogo vazio", "Adicione seus títulos em catalog.json para começar. O site já está pronto para carregar nome, capa, categoria, idade e player.")}
        <div class="row" style="justify-content:center;margin-top:16px">
          <a class="btn btn-primary" href="/catalogo"><i class="fa-solid fa-clapperboard"></i>Ver catálogo</a>
          <a class="btn btn-ghost" href="/amigos"><i class="fa-solid fa-user-group"></i>Encontrar amigos</a>
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
      href: "/perfil#historico",
      progressMap,
      remove: true
    }) : ""}

    ${mediaRow("Filmes Populares", trending, { id: "trending-row" })}
    ${top10Row(top10)}
    ${mediaRow("Filmes para a sua noite", movies, { id: "movies-row", href: "/catalogo?tipo=movie" })}
    ${mediaRow("Séries em destaque", series, { id: "series-row", href: "/catalogo?tipo=series" })}
    ${mediaRow("Novidades no catálogo", newReleases, { id: "new-row" })}
    ${mediaRow("Família & animação", family, { id: "family-row" })}

    <section class="page-section">
      <div class="party-hero" style="margin:0">
        <div class="party-hero-inner">
          <div>
            <h2 style="font-size:clamp(1.5rem,3vw,2.4rem)">Assistir junto ficou mais fácil.</h2>
            <p>Crie uma sala, escolha um título e convide seus amigos para assistir juntos, na mesma hora.</p>
            <div class="row"><a class="btn btn-primary" href="/party"><i class="fa-solid fa-plus"></i>Criar sala</a><a class="btn btn-ghost" href="/party"><i class="fa-solid fa-right-to-bracket"></i>Entrar com código</a></div>
          </div>
          <div class="badge badge-live"><i class="fa-solid fa-circle"></i> salas ao vivo</div>
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
    const trailer = event.target.closest("[data-trailer]");
    if (trailer) {
      event.preventDefault();
      openTrailerModal(featured[index]);
      return;
    }
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
}

export function destroyHome() {
  clearInterval(heroTimer);
  heroTimer = null;
}
