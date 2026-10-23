// Dedicated details page: blurred backdrop, poster, metadata, cast and episodes.
import { byId, getSeriesGroup } from "../data.js";
import * as store from "../store.js";
import {
  qs, escapeHTML, initials, formatDuration,
  emptyState, toggleWatchlist, shareItem
} from "../ui.js";
import {
  getTitleDetails, getSeasonDetails, tmdbIdFromItem, imageUrl,
  yearOf, runtimeOf, genresOf, ratingOf, synopsisOf, backdropOf, posterOf, castOf
} from "../tmdb.js";
import { openWatchPartyModal } from "../watchparty.js";

let seasonRequest = 0;

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

function metaMarkup({ year, runtime, genres, seasons, episodes, age }) {
  const bits = [];
  if (year) bits.push(`<span>${escapeHTML(String(year))}</span>`);
  if (runtime) bits.push(`<span>${escapeHTML(formatDuration(runtime))}</span>`);
  if (seasons) bits.push(`<span>${seasons} temporada${seasons > 1 ? "s" : ""}</span>`);
  if (episodes) bits.push(`<span>${episodes} episódio${episodes > 1 ? "s" : ""}</span>`);
  if (age) bits.push(`<span class="details-age-inline">${escapeHTML(age)}</span>`);
  if (genres?.length) bits.push(`<span>${escapeHTML(genres.slice(0, 3).join(" · "))}</span>`);
  return bits.join('<span class="dot"></span>');
}

function castMarkup(cast) {
  if (!cast.length) {
    return `<p class="details-empty">Elenco não informado para este título.</p>`;
  }
  return `<div class="cast-row">${cast.map((person) => `
    <article class="cast-card">
      <div class="cast-photo">${person.photo
        ? `<img src="${escapeHTML(person.photo)}" alt="${escapeHTML(person.name)}" loading="lazy" decoding="async" referrerpolicy="no-referrer">`
        : `<span>${escapeHTML(initials(person.name))}</span>`}</div>
      <strong>${escapeHTML(person.name)}</strong>
      <span>${escapeHTML(person.character || "Elenco")}</span>
    </article>`).join("")}</div>`;
}

function episodeCard(entry, show, tmdbEpisode) {
  const still = tmdbEpisode?.still_path ? imageUrl(tmdbEpisode.still_path, "w300") : show.poster;
  const name = tmdbEpisode?.name || entry.name || `Episódio ${entry.episode}`;
  const rating = Number(tmdbEpisode?.vote_average) || 0;
  return `<a class="ep-card" href="player.html?id=${encodeURIComponent(entry.item.id)}" aria-label="Assistir ${escapeHTML(name)}">
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
  const params = new URLSearchParams(location.search);
  const id = params.get("id") || params.get("filme") || "";
  const item = byId(id);
  const content = qs("#page-content");

  if (!item) {
    content.innerHTML = `<section class="page-section details-missing">
      ${emptyState("fa-film", "Título não encontrado", "O link pode estar incompleto ou o título saiu do catálogo.")}
      <div class="row" style="justify-content:center"><a class="btn btn-primary" href="catalogo.html"><i class="fa-solid fa-clapperboard"></i>Voltar ao catálogo</a></div>
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
      <div class="details-bg" aria-hidden="true">
        ${initialBackdrop ? `<img id="details-bg-img" src="${escapeHTML(initialBackdrop)}" alt="" fetchpriority="high" decoding="async" referrerpolicy="no-referrer">` : ""}
      </div>
      <div class="details-veil" aria-hidden="true"></div>
      <div class="details-inner">
        <a class="details-back" href="index.html"><i class="fa-solid fa-arrow-left"></i><span>Voltar</span></a>

        <div class="details-hero">
          <div class="details-poster" id="details-poster">
            ${show.poster ? `<img id="details-poster-img" src="${escapeHTML(show.poster)}" alt="${escapeHTML(title)}" fetchpriority="high" decoding="async" referrerpolicy="no-referrer">` : `<span class="details-poster-fallback">${escapeHTML(title)}</span>`}
            <span class="details-age">${escapeHTML(show.age || "L")}</span>
          </div>

          <div class="details-info">
            <div class="details-tags">
              <span class="badge badge-accent">${show.type === "series" ? "Série" : "Filme"}</span>
              <span class="badge badge-soft">HD</span>
              ${show.isNew ? '<span class="badge badge-new">Novo</span>' : ""}
            </div>
            <h1 class="details-title" id="details-title">${escapeHTML(title)}</h1>
            <div class="details-meta" id="details-meta">${metaMarkup({
              year: yearOf(null, show),
              runtime: runtimeOf(null, show),
              genres: initialGenres,
              seasons: group?.seasons.length || 0,
              episodes: group?.items.length || 0,
              age: show.age
            })}</div>
            <div class="details-score" id="details-score">${starsMarkup(ratingOf(null, show))}</div>

            <div class="details-actions">
              <a class="btn btn-light btn-lg details-play" id="details-play" href="player.html?id=${encodeURIComponent(playId)}">
                <i class="fa-solid fa-play"></i>Assistir${group && selected ? ` T${selected.season} E${selected.episode}` : ""}
              </a>
              <button class="btn btn-party btn-lg" id="details-party" type="button">
                <i class="fa-solid fa-users"></i>Criar Watch Party
              </button>
              <button class="details-icon-btn" id="details-watchlist" type="button" title="${inList ? "Remover da minha lista" : "Adicionar à minha lista"}" aria-label="${inList ? "Remover da minha lista" : "Adicionar à minha lista"}">
                <i class="fa-solid ${inList ? "fa-check" : "fa-plus"}"></i>
              </button>
              <button class="details-icon-btn" id="details-share" type="button" title="Compartilhar" aria-label="Compartilhar"><i class="fa-solid fa-share-nodes"></i></button>
            </div>
          </div>
        </div>

        <section class="details-section details-synopsis-section">
          <div class="details-section-head"><h2>Sinopse</h2></div>
          <p class="details-synopsis clamp" id="details-synopsis">${escapeHTML(initialSynopsis)}</p>
          <button class="details-more hidden" id="details-more" type="button">Ler mais <i class="fa-solid fa-chevron-down"></i></button>
        </section>

        <section class="details-section" id="details-cast-section">
          <div class="details-section-head"><h2>Elenco</h2><span class="tiny muted" id="details-cast-count"></span></div>
          <div id="details-cast">${castMarkup(castOf(null))}</div>
        </section>

        <section class="details-section hidden" id="details-episodes-section">
          <div class="details-section-head">
            <h2>Episódios</h2>
            <div class="details-season-wrap">
              <label class="sr-only" for="details-season">Temporada</label>
              <select class="season-select" id="details-season"></select>
            </div>
          </div>
          <div class="episode-strip" id="details-episodes"></div>
        </section>
      </div>
    </section>`;

  mountDetails({ item, group, show, selected, playId });
  hydrateDetails({ item, group, show, selected });
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
    const result = toggleWatchlist(show.id);
    const button = qs("#details-watchlist");
    const inList = store.isInWatchlist(show.id);
    button.innerHTML = `<i class="fa-solid ${inList ? "fa-check" : "fa-plus"}"></i>`;
    button.title = inList ? "Remover da minha lista" : "Adicionar à minha lista";
    button.setAttribute("aria-label", button.title);
    return result;
  });

  qs("#details-share")?.addEventListener("click", () => shareItem(show));
  qs("#details-party")?.addEventListener("click", () => {
    openWatchPartyModal(show, { episodeId: playId, title: show.title, poster: show.poster });
  });

  qs("#details-season")?.addEventListener("change", (event) => {
    renderSeason(group, show, Number(event.target.value));
  });

  if (selected) qs("#details-episodes-section")?.classList.remove("hidden");
}

async function hydrateDetails({ item, group, show, selected }) {
  const metaItem = group?.first?.item || item;
  const data = await getTitleDetails(metaItem);
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
  const poster = posterOf(data, show);
  const cast = castOf(data);

  if (title) {
    document.title = `${title} — w00filmes`;
    const heading = qs("#details-title");
    if (heading) heading.textContent = title;
  }
  const bg = qs("#details-bg-img");
  if (bg && backdrop) bg.src = backdrop;
  const posterImg = qs("#details-poster-img");
  if (posterImg && poster) posterImg.src = poster;
  else if (!posterImg && poster) {
    const holder = qs("#details-poster");
    if (holder) holder.innerHTML = `<img id="details-poster-img" src="${escapeHTML(poster)}" alt="${escapeHTML(title)}" decoding="async" referrerpolicy="no-referrer"><span class="details-age">${escapeHTML(show.age || "L")}</span>`;
  }

  const meta = qs("#details-meta");
  if (meta) meta.innerHTML = metaMarkup({
    year, runtime, genres,
    seasons: group?.seasons.length || 0,
    episodes: group?.items.length || 0,
    age: show.age
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
