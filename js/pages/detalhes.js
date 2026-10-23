// Dedicated details page: full-bleed backdrop, centered hero, tabs, cast and episodes.
import { byId, getSeriesGroup, catalogTitles } from "../data.js";
import { getRoute, detailsPath, playerPath } from "../router.js";
import * as store from "../store.js";
import {
  qs, qsa, escapeHTML, initials, formatDuration,
  emptyState, toggleWatchlist, shareItem, posterCard
} from "../ui.js";
import {
  getTitleDetails, getSeasonDetails, getTrailer, tmdbIdFromItem, imageUrl,
  yearOf, runtimeOf, genresOf, ratingOf, synopsisOf, backdropOf, castOf
} from "../tmdb.js";
import { openWatchPartyModal } from "../watchparty.js";

let seasonRequest = 0;
let trailerRequest = 0;
let detailsRequest = 0;

const TAB_NAMES = new Set(["detalhes", "similares", "trailer"]);
const CATEGORY_LABELS = new Set(["filmes", "séries", "series", "movie", "movies"]);

function starsMarkup(rating) {
  const value = Number(rating) || 0;
  if (!value) {
    return `<span class="stars empty" aria-label="Sem avaliação"><i class="fa-regular fa-star"></i><i class="fa-regular fa-star"></i><i class="fa-regular fa-star"></i><i class="fa-regular fa-star"></i><i class="fa-regular fa-star"></i><span>Sem avaliação</span></span>`;
  }
  const outOfFive = value / 2;
  const icons = [1, 2, 3, 4, 5].map((index) => {
    if (outOfFive >= index) return '<i class="fa-solid fa-star"></i>';
    if (outOfFive >= index - 0.5) return '<i class="fa-solid fa-star-half-stroke"></i>';
    return '<i class="fa-regular fa-star"></i>';
  }).join("");
  return `<span class="stars" aria-label="${value.toFixed(1)} de 10">${icons}</span><strong class="stars-value">${value.toFixed(1)}</strong>`;
}

function mainGenre(genres) {
  return (genres || []).find((genre) => !CATEGORY_LABELS.has(String(genre).toLowerCase())) || genres?.[0] || "";
}

function metaMarkup({ year, runtime, genres, seasons, episodes }) {
  const bits = [];
  if (year) bits.push(`<span>${escapeHTML(String(year))}</span>`);
  if (runtime) bits.push(`<span>${escapeHTML(formatDuration(runtime))}</span>`);
  if (seasons) bits.push(`<span>${seasons} temporada${seasons > 1 ? "s" : ""}</span>`);
  if (episodes) bits.push(`<span>${episodes} episódio${episodes > 1 ? "s" : ""}</span>`);
  const genre = mainGenre(genres);
  if (genre) bits.push(`<span class="meta-tag">${escapeHTML(genre)}</span>`);
  return bits.join('<span class="meta-sep" aria-hidden="true">·</span>');
}

function castMarkup(cast) {
  if (!cast.length) {
    return `<p class="details-empty">Elenco não informado para este título.</p>`;
  }
  return cast.map((person) => `
    <article class="actor-card">
      ${person.photo
        ? `<img class="actor-img" src="${escapeHTML(person.photo)}" alt="${escapeHTML(person.name)}" loading="lazy" decoding="async" referrerpolicy="no-referrer">`
        : `<span class="actor-img actor-fallback" aria-hidden="true">${escapeHTML(initials(person.name))}</span>`}
      <div class="actor-name">${escapeHTML(person.name)}</div>
      <div class="actor-char">${escapeHTML(person.character || "Elenco")}</div>
    </article>`).join("");
}

function similarItems(show) {
  const genres = new Set((show.genres || []).filter((genre) => !CATEGORY_LABELS.has(String(genre).toLowerCase())));
  const scored = catalogTitles
    .filter((item) => item.id !== show.id && item.title !== show.title)
    .map((item) => {
      const shared = (item.genres || []).filter((genre) => genres.has(genre)).length;
      return {
        item,
        shared,
        score: shared * 20 + (Number(item.rating) || 0) + (item.type === show.type ? 1 : 0)
      };
    })
    .sort((a, b) => b.score - a.score);
  const matching = scored.filter((entry) => entry.shared > 0);
  return (matching.length ? matching : scored).slice(0, 12).map((entry) => entry.item);
}

function similarMarkup(show) {
  const items = similarItems(show);
  if (!items.length) return `<p class="details-empty">Nenhum título similar encontrado.</p>`;
  return `<div class="similar-grid">${items.map((item) => posterCard(item)).join("")}</div>`;
}

function trailerPlaceholder(backdrop, title) {
  return `<div class="trailer-placeholder">
    ${backdrop ? `<img class="trailer-placeholder-bg" src="${escapeHTML(backdrop)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : ""}
    <div class="trailer-placeholder-body">
      <span class="trailer-placeholder-icon"><i class="fa-solid fa-film"></i></span>
      <strong>Trailer de ${escapeHTML(title)}</strong>
      <p>Assista ao trailer oficial deste título.</p>
      <button class="btn btn-primary" id="details-trailer-load" type="button"><i class="fa-solid fa-play"></i>Carregar trailer</button>
    </div>
  </div>`;
}

function trailerFallback(title) {
  const query = encodeURIComponent(`${title} trailer oficial`);
  return `<div class="trailer-unavailable">
    <span class="trailer-unavailable-icon"><i class="fa-solid fa-film"></i></span>
    <strong>Trailer indisponível</strong>
    <p>Não encontramos um trailer oficial para este título agora.</p>
    <a class="btn btn-ghost" href="https://www.youtube.com/results?search_query=${query}" target="_blank" rel="noopener noreferrer"><i class="fa-brands fa-youtube"></i>Procurar no YouTube</a>
  </div>`;
}

function episodeCard(entry, show, tmdbEpisode) {
  const still = tmdbEpisode?.still_path ? imageUrl(tmdbEpisode.still_path, "w300") : show.poster;
  const name = tmdbEpisode?.name || entry.name || `Episódio ${entry.episode}`;
  const rating = Number(tmdbEpisode?.vote_average) || 0;
  return `<a class="ep-card" href="${playerPath(entry.item)}" aria-label="Assistir ${escapeHTML(name)}">
    <div class="ep-thumb">
      ${still ? `<img src="${escapeHTML(still)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : ""}
      <span class="ep-number">T${entry.season} E${entry.episode}</span>
      <span class="ep-play"><i class="fa-solid fa-play"></i></span>
    </div>
    <div class="ep-body">
      <div class="ep-title-row"><strong>${escapeHTML(name)}</strong>${rating ? `<span class="ep-rating"><i class="fa-solid fa-star"></i>${rating.toFixed(1)}</span>` : ""}</div>
      <span class="ep-sub">${escapeHTML(entry.item.age || "L")}${(tmdbEpisode?.runtime || entry.item.duration) ? ` · ${formatDuration(tmdbEpisode?.runtime || entry.item.duration)}` : ""}</span>
    </div>
  </a>`;
}

export function renderDetalhes() {
  const request = ++detailsRequest;
  const route = getRoute();
  const params = route.params;
  const id = route.itemId || params.get("id") || params.get("filme") || "";
  const item = route.item || byId(id);
  const content = qs("#page-content");

  if (!item) {
    content.innerHTML = `<section class="page-section details-missing">
      ${emptyState("fa-film", "Título não encontrado", "O link pode estar incompleto ou o título saiu do catálogo.")}
      <div class="row" style="justify-content:center"><a class="btn btn-primary" href="/catalogo"><i class="fa-solid fa-clapperboard"></i>Voltar ao catálogo</a></div>
    </section>`;
    return;
  }

  const group = getSeriesGroup(item);
  const show = group?.show || item;
  const selected = group?.items.find((entry) => entry.item.id === item.id) || group?.first || null;
  const playId = selected?.item?.id || item.id;
  const inList = store.isInWatchlist(show.id);
  const title = show.title;
  const initialGenres = genresOf(null, show);
  const initialSynopsis = synopsisOf(null, show) || "Sinopse em preparação.";
  const initialBackdrop = backdropOf(null, show);
  document.title = `${title} — w00filmes`;

  content.innerHTML = `
    <section class="details-page" id="details-page" style="--c1:${show.colors?.[0] || "#172554"};--c2:${show.colors?.[1] || "#6366f1"}">
      <div class="details-bg" id="details-bg" aria-hidden="true"${initialBackdrop ? ` style="background-image:url(${escapeHTML(initialBackdrop)})"` : ""}></div>
      <div class="details-veil" aria-hidden="true"></div>

      <div class="details-inner">
        <a class="details-back" href="/"><i class="fa-solid fa-arrow-left"></i><span>Voltar</span></a>

        <header class="details-hero">
          <div class="brand-label"><span class="brand-logo-s">W00</span><span>original</span></div>
          <h1 class="details-title" id="details-title">${escapeHTML(title)}</h1>
          <div class="details-meta" id="details-meta">${metaMarkup({
            year: yearOf(null, show),
            runtime: runtimeOf(null, show),
            genres: initialGenres,
            seasons: group?.seasons.length || 0,
            episodes: group?.items.length || 0
          })}</div>
          <div class="details-score" id="details-score">${starsMarkup(ratingOf(null, show))}</div>

          <p class="details-synopsis clamp" id="details-synopsis">${escapeHTML(initialSynopsis)}</p>
          <button class="details-more hidden" id="details-more" type="button">Ler mais <i class="fa-solid fa-chevron-down"></i></button>

          <div class="details-actions">
            <a class="details-cta details-cta-play" id="details-play" href="${playerPath(byId(playId) || show)}">
              <span class="details-cta-icon"><i class="fa-solid fa-play"></i></span>
              <span>Assistir${group && selected ? ` T${selected.season} E${selected.episode}` : ""}</span>
            </a>
            <button class="details-cta details-cta-party" id="details-party" type="button">
              <span class="details-cta-icon"><i class="fa-solid fa-users"></i></span>
              <span>Criar Watch Party</span>
            </button>
          </div>

          <div class="details-links">
            <button class="details-link" id="details-watchlist" type="button" title="${inList ? "Remover da minha lista" : "Adicionar à minha lista"}">
              <i class="fa-solid ${inList ? "fa-check" : "fa-plus"}"></i><span>${inList ? "Na minha lista" : "Minha lista"}</span>
            </button>
            <button class="details-link" id="details-share" type="button" title="Compartilhar"><i class="fa-solid fa-share-nodes"></i><span>Compartilhar</span></button>
          </div>
        </header>

        <section class="tabs-section" aria-label="Informações do título">
          <div class="section-tabs" role="tablist" aria-label="Seções">
            <button class="tab-item active" data-details-tab="detalhes" role="tab" aria-selected="true" aria-controls="tab-detalhes" type="button">Detalhes</button>
            <button class="tab-item" data-details-tab="similares" role="tab" aria-selected="false" aria-controls="tab-similares" type="button">Similares</button>
            <button class="tab-item" data-details-tab="trailer" role="tab" aria-selected="false" aria-controls="tab-trailer" type="button">Trailer</button>
          </div>

          <div class="tab-content active" id="tab-detalhes" role="tabpanel">
            <div class="details-subtitle">
              <h2>Elenco Principal</h2>
              <span class="tiny muted" id="details-cast-count"></span>
            </div>
            <div class="cast-container" id="details-cast-container">
              <button class="cast-nav-btn prev" data-cast-scroll="-1" type="button" aria-label="Elenco anterior"><i class="fa-solid fa-chevron-left"></i></button>
              <div class="cast-wrapper" id="details-cast">${castMarkup(castOf(null))}</div>
              <button class="cast-nav-btn next" data-cast-scroll="1" type="button" aria-label="Próximo elenco"><i class="fa-solid fa-chevron-right"></i></button>
            </div>

            <section class="details-section hidden" id="details-episodes-section">
              <div class="details-subtitle">
                <h2>Episódios</h2>
                <div class="details-season-wrap">
                  <label class="sr-only" for="details-season">Temporada</label>
                  <select class="season-select" id="details-season"></select>
                </div>
              </div>
              <div class="episode-strip" id="details-episodes"></div>
            </section>
          </div>

          <div class="tab-content" id="tab-similares" role="tabpanel">
            ${similarMarkup(show)}
          </div>

          <div class="tab-content" id="tab-trailer" role="tabpanel">
            <div class="details-trailer" id="details-trailer">${trailerPlaceholder(initialBackdrop, title)}</div>
          </div>
        </section>
      </div>
    </section>`;

  mountDetails({ item, group, show, selected, playId });
  hydrateDetails({ item, group, show, selected, request });
}

function mountDetails({ group, show, selected, playId }) {
  const synopsis = qs("#details-synopsis");
  const more = qs("#details-more");
  if (synopsis && more) {
    requestAnimationFrame(() => {
      if (synopsis.scrollHeight > synopsis.clientHeight + 8) more.classList.remove("hidden");
    });
    more.addEventListener("click", () => {
      const expanded = synopsis.classList.toggle("clamp");
      more.innerHTML = expanded ? 'Ler mais <i class="fa-solid fa-chevron-down"></i>' : 'Ler menos <i class="fa-solid fa-chevron-up"></i>';
    });
  }

  qs("#details-watchlist")?.addEventListener("click", () => {
    toggleWatchlist(show.id);
    const button = qs("#details-watchlist");
    const inList = store.isInWatchlist(show.id);
    button.innerHTML = `<i class="fa-solid ${inList ? "fa-check" : "fa-plus"}"></i><span>${inList ? "Na minha lista" : "Minha lista"}</span>`;
    button.title = inList ? "Remover da minha lista" : "Adicionar à minha lista";
    button.setAttribute("aria-label", button.title);
  });

  qs("#details-share")?.addEventListener("click", () => shareItem(show));
  qs("#details-party")?.addEventListener("click", () => {
    openWatchPartyModal(show, { episodeId: playId, title: show.title, poster: show.poster });
  });

  qs("#details-season")?.addEventListener("change", (event) => {
    renderSeason(group, show, Number(event.target.value));
  });

  const tabs = qsa("[data-details-tab]");
  const panels = qsa(".tab-content");
  const activateTab = (name, { updateHash = true } = {}) => {
    if (!TAB_NAMES.has(name)) return;
    tabs.forEach((tab) => {
      const active = tab.dataset.detailsTab === name;
      tab.classList.toggle("active", active);
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
    });
    panels.forEach((panel) => panel.classList.toggle("active", panel.id === `tab-${name}`));
    if (name === "trailer") loadTrailer(show);
    if (updateHash) history.replaceState(history.state, "", `#${name}`);
  };

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => activateTab(tab.dataset.detailsTab));
    tab.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
      event.preventDefault();
      const current = tabs.indexOf(tab);
      const next = (current + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
      tabs[next].focus();
      activateTab(tabs[next].dataset.detailsTab);
    });
  });

  qs("#details-trailer-load")?.addEventListener("click", () => loadTrailer(show));
  bindCastNav();

  const initialTab = location.hash.replace("#", "");
  if (TAB_NAMES.has(initialTab)) activateTab(initialTab, { updateHash: false });
  if (selected) qs("#details-episodes-section")?.classList.remove("hidden");
}

function bindCastNav() {
  const container = qs("#details-cast-container");
  const row = qs("#details-cast");
  if (!container || !row || container.dataset.castBound) return;
  container.dataset.castBound = "1";
  const buttons = [...container.querySelectorAll("[data-cast-scroll]")];
  const update = () => {
    const max = row.scrollWidth - row.clientWidth - 2;
    buttons.forEach((button) => {
      const direction = Number(button.dataset.castScroll) || 1;
      button.disabled = direction < 0 ? row.scrollLeft <= 2 : row.scrollLeft >= max;
    });
  };
  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      const direction = Number(button.dataset.castScroll) || 1;
      row.scrollBy({ left: direction * Math.max(220, row.clientWidth * 0.8), behavior: "smooth" });
    });
  });
  row.addEventListener("scroll", update, { passive: true });
  update();
}

async function loadTrailer(show) {
  const root = qs("#details-trailer");
  if (!root || root.dataset.state === "loading" || root.dataset.state === "ready") return;
  const request = ++trailerRequest;
  root.dataset.state = "loading";
  root.innerHTML = `<div class="trailer-loading"><i class="fa-solid fa-spinner fa-spin"></i><span>Carregando trailer…</span></div>`;
  const trailer = await getTrailer(show);
  if (!root.isConnected || request !== trailerRequest) return;
  if (trailer?.key) {
    root.dataset.state = "ready";
    const key = encodeURIComponent(trailer.key);
    root.innerHTML = `<div class="trailer-frame"><iframe
      src="https://www.youtube.com/embed/${key}?autoplay=1&rel=0&modestbranding=1&playsinline=1"
      title="${escapeHTML(trailer.name || `Trailer de ${show.title}`)}"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      allowfullscreen></iframe></div>
      <a class="trailer-open-link" href="https://www.youtube.com/watch?v=${key}" target="_blank" rel="noopener noreferrer"><i class="fa-brands fa-youtube"></i>Abrir no YouTube</a>`;
    return;
  }
  root.dataset.state = "empty";
  root.innerHTML = trailerFallback(show.title);
}

async function hydrateDetails({ item, group, show, selected, request }) {
  const metaItem = group?.first?.item || item;
  const data = await getTitleDetails(metaItem);
  if (request !== detailsRequest || document.body.dataset.page !== "detalhes") return;
  if (!data) {
    if (group) setupSeasons(group, show, null, selected?.season);
    return;
  }

  const title = data.title || data.name || show.title;
  const year = yearOf(data, show);
  const runtime = runtimeOf(data, show);
  const genres = genresOf(data, show);
  const rating = ratingOf(data, show);
  const synopsis = synopsisOf(data, show) || "Sinopse em preparação.";
  const backdrop = backdropOf(data, show);
  const cast = castOf(data);

  if (title) {
    document.title = `${title} — w00filmes`;
    const heading = qs("#details-title");
    if (heading) heading.textContent = title;
  }
  const bg = qs("#details-bg");
  if (bg && backdrop) bg.style.backgroundImage = `url("${backdrop}")`;

  const meta = qs("#details-meta");
  if (meta) meta.innerHTML = metaMarkup({
    year, runtime, genres,
    seasons: group?.seasons.length || 0,
    episodes: group?.items.length || 0
  });
  const score = qs("#details-score");
  if (score) score.innerHTML = starsMarkup(rating);

  const synopsisEl = qs("#details-synopsis");
  if (synopsisEl) {
    synopsisEl.textContent = synopsis;
    synopsisEl.classList.add("clamp");
    const more = qs("#details-more");
    if (more) {
      more.classList.add("hidden");
      more.innerHTML = 'Ler mais <i class="fa-solid fa-chevron-down"></i>';
      requestAnimationFrame(() => {
        if (synopsisEl.scrollHeight > synopsisEl.clientHeight + 8) more.classList.remove("hidden");
      });
    }
  }

  const castRoot = qs("#details-cast");
  if (castRoot) castRoot.innerHTML = castMarkup(cast);
  const castCount = qs("#details-cast-count");
  if (castCount) castCount.textContent = cast.length ? `${cast.length} nomes` : "";
  bindCastNav();

  const similar = qs("#tab-similares");
  if (similar && genres.length) similar.innerHTML = similarMarkup({ ...show, genres });

  if (group) setupSeasons(group, show, data.id, selected?.season);
}

function setupSeasons(group, show, tvId = null, selectedSeason = null) {
  const section = qs("#details-episodes-section");
  const select = qs("#details-season");
  if (!section || !select) return;
  section.classList.remove("hidden");
  select.innerHTML = group.seasons.map((season) => `<option value="${season.number}">Temporada ${season.number}</option>`).join("");
  const firstSeason = selectedSeason ?? group.seasons[0]?.number ?? 1;
  select.value = String(firstSeason);
  renderSeason(group, show, firstSeason, tvId);
}

async function renderSeason(group, show, seasonNumber, tvId = null) {
  const root = qs("#details-episodes");
  const season = group?.seasons.find((entry) => entry.number === seasonNumber);
  if (!root || !season) return;
  const request = ++seasonRequest;
  root.innerHTML = season.episodes.map((entry) => episodeCard(entry, show, null)).join("");
  const id = tvId || tmdbIdFromItem(group.first.item);
  const tmdbSeason = await getSeasonDetails(id, seasonNumber);
  if (!tmdbSeason || !root.isConnected || request !== seasonRequest) return;
  const byNumber = new Map((tmdbSeason.episodes || []).map((episode) => [episode.episode_number, episode]));
  root.innerHTML = season.episodes.map((entry) => episodeCard(entry, show, byNumber.get(entry.episode))).join("");
}
