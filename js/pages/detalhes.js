// Página de detalhes no formato do preview modal da Netflix:
// backdrop full-screen, logo, play/lista/curtir, metadados, elenco/gêneros,
// episódios e títulos semelhantes. O play só existe aqui dentro.
import { byId, getSeriesGroup, catalogTitles } from "../data.js";
import { getRoute, playerPath, navigate } from "../router.js";
import * as store from "../store.js";
import {
  qs, escapeHTML, formatDuration, emptyState,
  toggleWatchlist, shareItem, toast
} from "../ui.js";
import {
  getTitleDetails, getSeasonDetails, getLogo, tmdbIdFromItem, imageUrl,
  yearOf, runtimeOf, genresOf, synopsisOf, backdropOf, castOf
} from "../tmdb.js";
import { openWatchPartyModal } from "../watchparty.js";
import { raveHref } from "../rave.js";
import { openTrailerModal } from "../trailer.js";

let seasonRequest = 0;
let detailsRequest = 0;

const LIKE_KEY = "w00filmes.likes";
const CATEGORY_LABELS = new Set(["filmes", "séries", "series", "movie", "movies"]);
const VIBE_MAP = {
  Terror: "Sombrio",
  Suspense: "Suspense no ar",
  Drama: "Emocional",
  Ação: "Adrenalina",
  Aventura: "Aventura",
  Comédia: "Leve",
  Crime: "Tenso",
  Mistério: "Mistério",
  Romance: "Romântico",
  Ficção: "Futurista",
  Fantasia: "Imaginativo",
  Animação: "Para a família",
  Família: "Para a família",
  Tecnologia: "Tecnologia"
};

function readLikes() {
  try {
    const value = JSON.parse(localStorage.getItem(LIKE_KEY) || "[]");
    return new Set(Array.isArray(value) ? value : []);
  } catch {
    return new Set();
  }
}

function writeLikes(set) {
  try {
    localStorage.setItem(LIKE_KEY, JSON.stringify([...set]));
  } catch {
    /* modo privado */
  }
}

function isLiked(id) {
  return readLikes().has(id);
}

function mainGenres(genres) {
  return (genres || []).filter((genre) => !CATEGORY_LABELS.has(String(genre).toLowerCase()));
}

function ageBadge(item) {
  const age = String(item?.age || "L").trim() || "L";
  return `<span class="nf-age" aria-label="Classificação ${escapeHTML(age)}">${escapeHTML(age)}</span>`;
}

function ageWarning(item) {
  const age = String(item?.age || "L").trim();
  if (!age || age === "L" || age === "0") return "Livre para todos os públicos";
  return `Conteúdo não recomendado para menores de ${escapeHTML(age)} anos`;
}

function metaMarkup({ year, runtime, seasons, type }) {
  const bits = [];
  if (year) bits.push(`<span>${escapeHTML(String(year))}</span>`);
  if (type === "series" && seasons) {
    bits.push(`<span>${seasons} temporada${seasons > 1 ? "s" : ""}</span>`);
  } else if (runtime) {
    bits.push(`<span>${escapeHTML(formatDuration(runtime))}</span>`);
  }
  bits.push('<span class="nf-hd">HD</span>');
  bits.push('<i class="fa-solid fa-audio-description" title="Audiodescrição" aria-label="Audiodescrição"></i>');
  bits.push('<i class="fa-solid fa-closed-captioning" title="Legendas" aria-label="Legendas"></i>');
  return bits.join('<span class="nf-dot"></span>');
}

function castNamesMarkup(cast) {
  if (!cast.length) return `<span class="details-empty-inline">Elenco não informado.</span>`;
  const visible = cast.slice(0, 4).map((person) => escapeHTML(person.name));
  const extra = cast.slice(4).map((person) => escapeHTML(person.name));
  return `<span>${visible.join(", ")}</span>${extra.length
    ? `<span class="cast-extra" hidden>, ${extra.join(", ")}</span> <button class="cast-more" data-cast-more type="button">mais</button>`
    : ""}`;
}

function genreMarkup(genres) {
  const list = mainGenres(genres);
  if (!list.length) return `<span class="details-empty-inline">Gêneros não informados.</span>`;
  return list.map((genre) => `<a class="details-tag" href="/catalogo?genero=${encodeURIComponent(genre)}">${escapeHTML(genre)}</a>`).join(", ");
}

function vibeMarkup(genres) {
  const list = mainGenres(genres);
  const vibes = list.map((genre) => VIBE_MAP[genre]).filter(Boolean);
  const final = (vibes.length ? vibes : list).slice(0, 3);
  if (!final.length) return "";
  return final.map((vibe) => `<span class="details-tag">${escapeHTML(vibe)}</span>`).join(", ");
}

function cardArt(url) {
  return String(url || "").replace(/\/t\/p\/(w\d+|original)\//, "/t/p/w780/");
}

function durationLabel(item) {
  if (Number(item?.duration) > 0) return formatDuration(Number(item.duration));
  if (item?.type === "series") {
    const count = getSeriesGroup(item)?.seasons.length || item.seasons?.length || 1;
    return `${count} temporada${count > 1 ? "s" : ""}`;
  }
  return "";
}

function similarItems(show) {
  const genres = new Set(mainGenres(show.genres));
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

function similarCard(item) {
  const art = cardArt(item.backdrop || item.poster);
  const inList = store.isInWatchlist(item.id);
  const length = durationLabel(item);
  return `<article class="nf-similar-card" data-open-details="${escapeHTML(item.id)}" tabindex="0" aria-label="${escapeHTML(item.title)}">
    <div class="nf-similar-art">
      ${art ? `<img src="${escapeHTML(art)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : ""}
      ${length ? `<span class="nf-similar-duration">${escapeHTML(length)}</span>` : ""}
      <span class="nf-similar-title">${escapeHTML(item.title)}</span>
    </div>
    <div class="nf-similar-body">
      <div class="nf-similar-meta">
        ${ageBadge(item)}
        <span class="nf-hd">HD</span>
        ${item.year ? `<span>${escapeHTML(String(item.year))}</span>` : ""}
        <button class="nf-similar-add" data-watchlist="${escapeHTML(item.id)}" type="button" aria-label="${inList ? "Remover da minha lista" : "Adicionar à minha lista"}" title="${inList ? "Remover da minha lista" : "Adicionar à minha lista"}"><i class="fa-solid ${inList ? "fa-check" : "fa-plus"}"></i></button>
      </div>
      <p>${escapeHTML(item.synopsis || "Sinopse em preparação.")}</p>
    </div>
  </article>`;
}

function similarMarkup(show) {
  const items = similarItems(show);
  if (!items.length) return `<p class="details-empty">Nenhum título similar encontrado.</p>`;
  return `<div class="nf-similar-grid">${items.map(similarCard).join("")}</div>`;
}

function episodeRow(entry, show, tmdbEpisode, current) {
  const still = tmdbEpisode?.still_path
    ? imageUrl(tmdbEpisode.still_path, "w300")
    : cardArt(show.backdrop || show.poster);
  const name = tmdbEpisode?.name || entry.name || `Episódio ${entry.episode}`;
  const runtime = Number(tmdbEpisode?.runtime) || Number(entry.item.duration) || 0;
  const synopsis = tmdbEpisode?.overview || entry.item.synopsis || show.synopsis || "";
  return `<a class="nf-episode ${current ? "current" : ""}" href="${playerPath(entry.item)}" aria-label="Assistir ${escapeHTML(name)}">
    <span class="nf-episode-num">${entry.episode}</span>
    <span class="nf-episode-thumb">
      ${still ? `<img src="${escapeHTML(still)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : ""}
      <span class="nf-episode-play"><i class="fa-solid fa-play"></i></span>
    </span>
    <span class="nf-episode-body">
      <span class="nf-episode-head"><strong>${escapeHTML(name)}</strong>${runtime ? `<span>${escapeHTML(formatDuration(runtime))}</span>` : ""}</span>
      <span class="nf-episode-synopsis">${escapeHTML(synopsis)}</span>
    </span>
  </a>`;
}

function closeDetails() {
  if (window.history.length > 1) window.history.back();
  else navigate("/");
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
  const liked = isLiked(show.id);
  const title = show.title;
  const initialGenres = genresOf(null, show);
  const initialSynopsis = synopsisOf(null, show) || "Sinopse em preparação.";
  const initialBackdrop = backdropOf(null, show);
  const initialCast = castOf(null);
  const initialVibe = vibeMarkup(initialGenres);
  const seasonNumber = selected?.season || group?.seasons?.[0]?.number || 1;

  document.title = `${title} — w00filmes`;

  content.innerHTML = `
    <section class="details-page" id="details-page" style="--c1:${show.colors?.[0] || "#101012"};--c2:${show.colors?.[1] || "#e50914"}">
      <button class="details-close" data-details-close type="button" aria-label="Fechar detalhes"><i class="fa-solid fa-xmark"></i></button>

      <div class="details-hero">
        <div class="details-bg" id="details-bg" aria-hidden="true"${initialBackdrop ? ` style="background-image:url(${escapeHTML(initialBackdrop)})"` : ""}></div>
        <div class="details-veil" aria-hidden="true"></div>
        <div class="details-hero-content">
          <div class="details-brand">W00FILMES</div>
          <div class="details-title-wrap" id="details-title-wrap">
            <h1 class="details-title" id="details-title">${escapeHTML(title)}</h1>
          </div>
          <div class="details-actions">
            <a class="details-play" id="details-play" href="${playerPath(byId(playId) || show)}">
              <i class="fa-solid fa-play"></i><span>Assistir</span>
            </a>
            <button class="details-round ${inList ? "active" : ""}" id="details-watchlist" type="button" aria-label="${inList ? "Remover da minha lista" : "Adicionar à minha lista"}" title="${inList ? "Remover da minha lista" : "Adicionar à minha lista"}">
              <i class="fa-solid ${inList ? "fa-check" : "fa-plus"}"></i>
            </button>
            <button class="details-round ${liked ? "active" : ""}" id="details-like" type="button" aria-label="${liked ? "Remover curtida" : "Curtir"}" title="${liked ? "Remover curtida" : "Curtir"}">
              <i class="fa-${liked ? "solid" : "regular"} fa-thumbs-up"></i>
            </button>
          </div>
          <div class="details-under-actions">
            <button class="details-text-link" id="details-trailer" type="button"><i class="fa-solid fa-film"></i>Trailer</button>
            <button class="details-text-link" id="details-party" type="button"><i class="fa-solid fa-users"></i>Assistir junto</button>
            <a class="details-text-link" href="${raveHref(byId(playId) || show)}" target="_blank" rel="noopener"><i class="fa-solid fa-tower-broadcast"></i>Rave</a>
            <button class="details-text-link" id="details-share" type="button"><i class="fa-solid fa-share-nodes"></i>Compartilhar</button>
          </div>
        </div>
      </div>

      <div class="details-body">
        <div class="details-info">
          <div class="details-info-left">
            <div class="details-meta" id="details-meta">${metaMarkup({
              year: yearOf(null, show),
              runtime: runtimeOf(null, show),
              seasons: group?.seasons.length || 0,
              type: show.type
            })}</div>
            <div class="details-rating-line" id="details-rating-line">
              ${ageBadge(show)}
              <span>${ageWarning(show)}</span>
            </div>
            <p class="details-synopsis" id="details-synopsis">${escapeHTML(initialSynopsis)}</p>
          </div>
          <div class="details-info-right">
            <div class="details-info-row">
              <span class="details-info-label">Elenco:</span>
              <div class="details-info-value" id="details-cast-names">${castNamesMarkup(initialCast)}</div>
            </div>
            <div class="details-info-row">
              <span class="details-info-label">Gêneros:</span>
              <div class="details-info-value" id="details-genres">${genreMarkup(initialGenres)}</div>
            </div>
            <div class="details-info-row" id="details-vibe-row" ${initialVibe ? "" : "hidden"}>
              <span class="details-info-label">${show.type === "series" ? "Esta série é:" : "Este filme é:"}</span>
              <div class="details-info-value" id="details-vibe">${initialVibe}</div>
            </div>
          </div>
        </div>

        ${group ? `<section class="details-episodes" id="details-episodes-section">
          <div class="details-section-head">
            <h2>Episódios</h2>
            <label class="nf-season-select">
              <span class="sr-only">Temporada</span>
              <select id="details-season">${group.seasons.map((season) => `<option value="${season.number}" ${season.number === seasonNumber ? "selected" : ""}>Temporada ${season.number}</option>`).join("")}</select>
              <i class="fa-solid fa-caret-down" aria-hidden="true"></i>
            </label>
          </div>
          <div class="details-season-line">
            <span id="details-season-label">Temporada ${seasonNumber}:</span>
            ${ageBadge(show)}
            <span>${ageWarning(show)}</span>
          </div>
          <div class="nf-episode-list" id="details-episodes"></div>
        </section>` : ""}

        <section class="details-similar">
          <h2>Títulos semelhantes</h2>
          <div id="details-similar">${similarMarkup(show)}</div>
        </section>
      </div>
    </section>`;

  mountDetails({ item, group, show, selected, playId, seasonNumber });
  hydrateDetails({ item, group, show, selected, request, playId, seasonNumber });
}

function mountDetails({ group, show, selected, playId, seasonNumber }) {
  qs("[data-details-close]")?.addEventListener("click", closeDetails);

  qs("#details-watchlist")?.addEventListener("click", () => {
    toggleWatchlist(show.id);
    const button = qs("#details-watchlist");
    const inList = store.isInWatchlist(show.id);
    button.classList.toggle("active", inList);
    button.innerHTML = `<i class="fa-solid ${inList ? "fa-check" : "fa-plus"}"></i>`;
    button.title = inList ? "Remover da minha lista" : "Adicionar à minha lista";
    button.setAttribute("aria-label", button.title);
  });

  qs("#details-like")?.addEventListener("click", () => {
    const likes = readLikes();
    const button = qs("#details-like");
    const nowLiked = !likes.has(show.id);
    if (nowLiked) likes.add(show.id);
    else likes.delete(show.id);
    writeLikes(likes);
    button.classList.toggle("active", nowLiked);
    button.innerHTML = `<i class="fa-${nowLiked ? "solid" : "regular"} fa-thumbs-up"></i>`;
    button.setAttribute("aria-label", nowLiked ? "Remover curtida" : "Curtir");
    button.title = nowLiked ? "Remover curtida" : "Curtir";
    toast(nowLiked ? "Você curtiu este título." : "Curtida removida.", "success");
  });

  qs("#details-trailer")?.addEventListener("click", () => openTrailerModal(show));
  qs("#details-share")?.addEventListener("click", () => shareItem(show));
  qs("#details-party")?.addEventListener("click", () => {
    openWatchPartyModal(show, { episodeId: playId, title: show.title, poster: show.poster });
  });

  qs("#details-cast-names")?.addEventListener("click", (event) => {
    const more = event.target.closest("[data-cast-more]");
    if (!more) return;
    const extra = qs("#details-cast-names .cast-extra");
    if (!extra) return;
    extra.hidden = false;
    more.remove();
  });

  qs("#details-season")?.addEventListener("change", (event) => {
    renderSeason(group, show, Number(event.target.value), null, playId);
  });

  document.addEventListener("keydown", function onEscape(event) {
    if (document.body.dataset.page !== "detalhes") {
      document.removeEventListener("keydown", onEscape);
      return;
    }
    if (event.key === "Escape" && !document.querySelector("#modal-root .modal-backdrop")) closeDetails();
  });

  if (group) setupSeasons(group, show, null, seasonNumber, playId);
}

async function hydrateDetails({ item, group, show, selected, request, playId, seasonNumber }) {
  const metaItem = group?.first?.item || item;
  const data = await getTitleDetails(metaItem);
  if (request !== detailsRequest || document.body.dataset.page !== "detalhes") return;
  if (!data) {
    if (group) setupSeasons(group, show, null, seasonNumber, playId);
    return;
  }

  const title = data.title || data.name || show.title;
  const year = yearOf(data, show);
  const runtime = runtimeOf(data, show);
  const genres = genresOf(data, show);
  const synopsis = synopsisOf(data, show) || "Sinopse em preparação.";
  const backdrop = backdropOf(data, show);
  const cast = castOf(data);

  document.title = `${title} — w00filmes`;
  const heading = qs("#details-title");
  if (heading) heading.textContent = title;

  getLogo(metaItem).then((logo) => {
    if (!logo || request !== detailsRequest || document.body.dataset.page !== "detalhes") return;
    const wrap = qs("#details-title-wrap");
    if (!wrap) return;
    wrap.innerHTML = `<img class="details-logo" src="${escapeHTML(logo)}" alt="${escapeHTML(title)}" loading="eager" decoding="async" referrerpolicy="no-referrer">`;
    const image = wrap.querySelector("img");
    image?.addEventListener("error", () => {
      wrap.innerHTML = `<h1 class="details-title" id="details-title">${escapeHTML(title)}</h1>`;
    }, { once: true });
  });

  const bg = qs("#details-bg");
  if (bg && backdrop) bg.style.backgroundImage = `url("${backdrop}")`;

  const meta = qs("#details-meta");
  if (meta) meta.innerHTML = metaMarkup({
    year,
    runtime,
    seasons: group?.seasons.length || 0,
    type: show.type
  });

  const synopsisEl = qs("#details-synopsis");
  if (synopsisEl) synopsisEl.textContent = synopsis;

  const castRoot = qs("#details-cast-names");
  if (castRoot) castRoot.innerHTML = castNamesMarkup(cast);

  const genresRoot = qs("#details-genres");
  if (genresRoot) genresRoot.innerHTML = genreMarkup(genres);

  const vibe = vibeMarkup(genres);
  const vibeRoot = qs("#details-vibe");
  if (vibeRoot) vibeRoot.innerHTML = vibe;
  const vibeRow = qs("#details-vibe-row");
  if (vibeRow) vibeRow.hidden = !vibe;

  const similar = qs("#details-similar");
  if (similar && genres.length) similar.innerHTML = similarMarkup({ ...show, genres });

  if (group) setupSeasons(group, show, data.id, seasonNumber, playId);
}

function setupSeasons(group, show, tvId = null, selectedSeason = null, currentId = "") {
  const section = qs("#details-episodes-section");
  const select = qs("#details-season");
  if (!section || !select) return;
  section.classList.remove("hidden");
  select.innerHTML = group.seasons.map((season) => `<option value="${season.number}">Temporada ${season.number}</option>`).join("");
  const firstSeason = selectedSeason ?? group.seasons[0]?.number ?? 1;
  select.value = String(firstSeason);
  renderSeason(group, show, firstSeason, tvId, currentId);
}

async function renderSeason(group, show, seasonNumber, tvId = null, currentId = "") {
  const root = qs("#details-episodes");
  const season = group?.seasons.find((entry) => entry.number === seasonNumber);
  if (!root || !season) return;
  const request = ++seasonRequest;
  const label = qs("#details-season-label");
  if (label) label.textContent = `Temporada ${seasonNumber}:`;
  root.innerHTML = season.episodes.map((entry) => episodeRow(entry, show, null, entry.item.id === currentId)).join("");
  const id = tvId || tmdbIdFromItem(group.first.item);
  const tmdbSeason = await getSeasonDetails(id, seasonNumber);
  if (!tmdbSeason || !root.isConnected || request !== seasonRequest) return;
  const byNumber = new Map((tmdbSeason.episodes || []).map((episode) => [episode.episode_number, episode]));
  root.innerHTML = season.episodes.map((entry) => episodeRow(entry, show, byNumber.get(entry.episode), entry.item.id === currentId)).join("");
}
