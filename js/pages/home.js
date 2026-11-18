// Home page: hero carousel, continue watching and curated rows.
import { CATALOG, catalogTitles, featured, trending, top10, movies, series, newReleases, allGenres } from "../data.js";
import * as store from "../store.js";
import { mediaRow, top10Row, genreStrip, qs, escapeHTML, formatDuration, toast, emptyState } from "../ui.js";
import { getLogo } from "../tmdb.js";

let heroTimer = null;

function heroImage(item) {
  const image = item.backdrop || item.poster || "";
  // Posters do catálogo vêm em w500; no hero full-bleed isso fica borrado.
  return image.replace(/\/t\/p\/w\d+\//, "/t/p/original/");
}

function matchScore(item) {
  const rating = Number(item.rating) || 0;
  return Math.min(98, Math.max(70, Math.round(70 + rating * 3)));
}

function heroMeta(item) {
  const bits = [];
  bits.push(`<span class="match">${matchScore(item)}% relevante</span>`);
  if (item.year) bits.push(`<span>${escapeHTML(String(item.year))}</span>`);
  const seasons = item.seasons?.length || 1;
  const length = item.type === "series"
    ? `${seasons} temporada${seasons > 1 ? "s" : ""}`
    : (item.duration ? formatDuration(item.duration) : "");
  if (length) bits.push(`<span>${escapeHTML(length)}</span>`);
  bits.push('<span class="hd-badge">HD</span>');
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
      <div class="hero-kicker"><span class="hero-n">W</span>${item.type === "series" ? "SÉRIE" : "FILME"}</div>
      <div class="hero-title-wrap" id="hero-title-wrap">
        <h1 class="hero-title">${escapeHTML(item.title)}</h1>
      </div>
      <div class="meta hero-meta">${heroMeta(item)}</div>
      <p class="hero-desc">${escapeHTML(item.synopsis)}</p>
      <div class="hero-actions">
        <button class="nf-btn nf-btn-play" data-play="${escapeHTML(item.id)}" type="button">
          <i class="fa-solid fa-play"></i><span>Assistir</span>
        </button>
        <button class="nf-btn nf-btn-info" data-open-details="${escapeHTML(item.id)}" type="button">
          <i class="fa-solid fa-circle-info"></i><span>Mais informações</span>
        </button>
      </div>
    </div>
    <div class="hero-age" aria-hidden="true">${escapeHTML(item.age || "L")}</div>`;
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
  const genreSelection = allGenres.slice(0, 12);

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

    ${top10Row(top10)}
    ${mediaRow("Em alta agora", trending, { id: "trending-row" })}
    ${mediaRow("Filmes", movies, { id: "movies-row", href: "/catalogo?tipo=movie" })}
    ${mediaRow("Séries", series, { id: "series-row", href: "/catalogo?tipo=series" })}
    ${mediaRow("Novidades", newReleases, { id: "new-row" })}
    ${mediaRow("Família & animação", family, { id: "family-row" })}

    <section class="page-section nf-genre-section">
      <div class="section-head">
        <h2>Navegue por gêneros</h2>
        <a class="section-link" href="/catalogo">Explorar tudo <i class="fa-solid fa-chevron-right"></i></a>
      </div>
      ${genreStrip(genreSelection)}
    </section>`;

  qs("#page-content").innerHTML = content;
  mountHome();
}

function mountHome() {
  const hero = qs("#hero");
  if (!hero) return;
  let index = 0;
  let paintToken = 0;
  const logoMap = new Map();
  const setHeroTitle = (item, logo) => {
    const wrap = hero.querySelector("#hero-title-wrap");
    if (!wrap) return;
    if (logo) {
      wrap.innerHTML = `<img class="hero-logo" src="${escapeHTML(logo)}" alt="${escapeHTML(item.title)}" loading="eager" decoding="async" referrerpolicy="no-referrer">`;
      const image = wrap.querySelector("img");
      image?.addEventListener("error", () => {
        wrap.innerHTML = `<h1 class="hero-title">${escapeHTML(item.title)}</h1>`;
      }, { once: true });
    } else {
      wrap.innerHTML = `<h1 class="hero-title">${escapeHTML(item.title)}</h1>`;
    }
  };
  const paint = (next) => {
    const target = (next + featured.length) % featured.length;
    if (target === index) return;
    index = target;
    const item = featured[index];
    const token = ++paintToken;
    hero.style.setProperty("--c1", item.colors[0]);
    hero.style.setProperty("--c2", item.colors[1]);

    const bg = hero.querySelector(".hero-bg");
    const image = heroImage(item);
    if (bg) {
      bg.classList.toggle("no-image", !image);
      const old = bg.querySelector("img");
      if (image) {
        const img = document.createElement("img");
        img.src = image;
        img.alt = "";
        img.decoding = "async";
        img.referrerPolicy = "no-referrer";
        img.className = "hero-img-next";
        const swap = () => {
          if (token !== paintToken) return;
          bg.appendChild(img);
          setTimeout(() => {
            if (token === paintToken) img.classList.add("is-ready");
          }, 20);
          if (old) {
            old.classList.add("is-out");
            setTimeout(() => old.remove(), 760);
          }
        };
        if (img.complete) swap();
        else {
          img.addEventListener("load", swap, { once: true });
          img.addEventListener("error", () => { if (token === paintToken) img.remove(); }, { once: true });
        }
      } else if (old) {
        old.remove();
      }
    }

    setHeroTitle(item, logoMap.get(item.id));
    const meta = hero.querySelector(".hero-meta");
    if (meta) meta.innerHTML = heroMeta(item);
    const desc = hero.querySelector(".hero-desc");
    if (desc) desc.textContent = item.synopsis;
    hero.classList.remove("is-painting");
    void hero.offsetWidth;
    hero.classList.add("is-painting");
    const play = hero.querySelector("[data-play]");
    if (play) play.dataset.play = item.id;
    const info = hero.querySelector("[data-open-details]");
    if (info) info.dataset.openDetails = item.id;
    hero.querySelectorAll("[data-hero-index]").forEach((dot, i) => {
      dot.classList.toggle("active", i === index);
      dot.setAttribute("aria-selected", i === index ? "true" : "false");
    });
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
  featured.forEach((item) => {
    getLogo(item).then((logo) => {
      logoMap.set(item.id, logo);
      if (featured[index]?.id === item.id) setHeroTitle(item, logo || "");
      if (logo) {
        try {
          const preload = new Image();
          preload.src = logo;
        } catch { /* pré-carregamento opcional */ }
      }
    }).catch(() => {});
  });
  start();
}

export function destroyHome() {
  clearInterval(heroTimer);
  heroTimer = null;
}
