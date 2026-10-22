// Immersive player page: native MP4 or embed, plus season/episode navigation.
import { byId, getSeriesGroup } from "../data.js";
import * as store from "../store.js";
import { qs, escapeHTML, formatDuration, formatClock, toast, emptyState } from "../ui.js";
import { getTitleDetails, getSeasonDetails, tmdbIdFromItem, imageUrl, yearOf, runtimeOf, ratingOf } from "../tmdb.js";
import { openWatchPartyModal } from "../watchparty.js";

const DIRECT_VIDEO = /\.(mp4|m4v|webm|ogv|ogg|mov|m3u8)(\?|#|$)/i;
const EMBED_HOST = /youtube\.com|youtu\.be|vimeo\.com|dailymotion\.com|\/embed\/|player\./i;

function streamFor(item) {
  return String(item?.player || item?.stream || "").trim().replace(/^http:\/\//i, "https://");
}

function isDirectVideo(url) {
  if (!url) return false;
  if (DIRECT_VIDEO.test(url)) return true;
  return !EMBED_HOST.test(url);
}

function episodeName(entry) {
  const name = entry?.name && entry.name !== entry.item?.title ? entry.name : "";
  return name || `Episódio ${entry?.episode ?? 1}`;
}

export function renderPlayer() {
  const params = new URLSearchParams(location.search);
  const id = params.get("id") || params.get("filme") || "";
  const item = byId(id);
  const content = qs("#page-content");

  if (!item) {
    content.innerHTML = `<div class="player-page"><div class="player-missing">${emptyState("fa-film", "Título não encontrado", "Volte ao catálogo e escolha um título para assistir.")}<a class="btn btn-primary" href="catalogo.html"><i class="fa-solid fa-clapperboard"></i>Ver catálogo</a></div></div>`;
    return;
  }

  const group = getSeriesGroup(item);
  const current = group?.items.find((entry) => entry.item.id === item.id) || group?.first || { item, season: null, episode: null };
  const show = group?.show || item;
  const title = show.title;
  document.title = `${title} — assistir`;

  content.innerHTML = `
    <div class="player-page" id="player-page">
      <header class="player-topbar">
        <a class="player-back" href="detalhes.html?id=${encodeURIComponent(current.item.id)}" aria-label="Voltar aos detalhes"><i class="fa-solid fa-arrow-left"></i></a>
        <div class="player-heading">
          <strong id="player-title">${escapeHTML(title)}</strong>
          <span id="player-subtitle">${escapeHTML(playerSubtitle(current, group, show, null))}</span>
        </div>
        <a class="player-brand" href="index.html" aria-label="Início"><span>w00</span></a>
      </header>

      <main class="player-main">
        <div class="player-stage" id="player-stage"></div>

        ${group ? `
          <section class="player-episodes" id="player-episodes-section">
            <div class="player-episodes-head">
              <div>
                <h2>Episódios</h2>
                <p class="player-episodes-sub" id="player-episodes-sub">${group.seasons.length} temporada${group.seasons.length > 1 ? "s" : ""} · ${group.items.length} episódios</p>
              </div>
              <div class="player-episodes-actions">
                <button class="btn btn-party btn-sm" id="player-party" type="button"><i class="fa-solid fa-users"></i>Watch Party</button>
                <div class="details-season-wrap">
                  <label class="sr-only" for="player-season">Temporada</label>
                  <select class="season-select" id="player-season">
                    ${group.seasons.map((season) => `<option value="${season.number}">Temporada ${season.number}</option>`).join("")}
                  </select>
                </div>
              </div>
            </div>
            <div class="episode-strip" id="player-episodes"></div>
          </section>` : `
          <section class="player-movie-foot">
            <div class="player-movie-info">
              <span class="badge badge-accent">${show.type === "series" ? "Série" : "Filme"}</span>
              <strong>${escapeHTML(title)}</strong>
              <span id="player-movie-meta">${escapeHTML(playerSubtitle(current, group, show, null))}</span>
            </div>
            <div class="player-movie-actions">
              <a class="btn btn-ghost" href="detalhes.html?id=${encodeURIComponent(current.item.id)}"><i class="fa-solid fa-circle-info"></i>Detalhes</a>
              <button class="btn btn-party" id="player-party" type="button"><i class="fa-solid fa-users"></i>Criar Watch Party</button>
            </div>
          </section>`}
      </main>
    </div>`;

  mountPlayer({ item, group, show, current });
  hydratePlayer({ item, group, show, current });
}

function playerSubtitle(current, group, show, data) {
  if (group) {
    return `T${current.season} E${current.episode} · ${episodeName(current)}`;
  }
  const year = yearOf(data, show);
  const runtime = runtimeOf(data, show);
  const rating = ratingOf(data, show);
  const bits = [];
  if (year) bits.push(year);
  if (runtime) bits.push(formatDuration(runtime));
  if (rating) bits.push(`★ ${rating.toFixed(1)}`);
  return bits.length ? bits.join(" · ") : (show.type === "series" ? "Série" : "Filme");
}

function stageMarkup(item) {
  const stream = streamFor(item);
  if (!stream) {
    return `<div class="player-fallback"><i class="fa-solid fa-triangle-exclamation"></i><h3>Player indisponível</h3><p>Este título ainda não tem um link de reprodução.</p><a class="btn btn-ghost" href="detalhes.html?id=${encodeURIComponent(item.id)}">Voltar aos detalhes</a></div>`;
  }
  if (isDirectVideo(stream)) {
    return `<video id="player-video" controls autoplay playsinline preload="metadata" poster="${escapeHTML(item.poster || "")}" src="${escapeHTML(stream)}">
      <p>Seu navegador não suporta vídeo HTML5. <a href="${escapeHTML(stream)}" target="_blank" rel="noopener">Abrir vídeo</a>.</p>
    </video>`;
  }
  return `<iframe id="player-frame" src="${escapeHTML(stream)}" title="${escapeHTML(item.title)}" allow="autoplay; fullscreen; picture-in-picture; encrypted-media" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
}

function mountPlayer({ item, group, show, current }) {
  const stage = qs("#player-stage");
  if (!stage) return;
  const activeItem = current.item;
  stage.innerHTML = stageMarkup(activeItem);

  const video = qs("#player-video");
  if (video) {
    let lastSave = 0;
    const history = store.getHistoryEntry(activeItem.id);
    const save = (force = false) => {
      if (!Number.isFinite(video.currentTime)) return;
      const duration = Number.isFinite(video.duration) ? video.duration : (activeItem.duration || 0) * 60;
      if (force || Date.now() - lastSave > 5000) {
        lastSave = Date.now();
        store.addHistory(activeItem, video.currentTime, duration, group ? {
          episode: { season: current.season, number: current.episode, title: episodeName(current), id: activeItem.id }
        } : {});
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
      store.addHistory(activeItem, duration, duration, group ? {
        episode: { season: current.season, number: current.episode, title: episodeName(current), id: activeItem.id }
      } : {});
      toast("Você concluiu este título.", "success", "Sessão concluída");
      window.dispatchEvent(new CustomEvent("pk:history-changed"));
      if (group) {
        const next = nextEpisode(group, current);
        if (next) {
          toast("Próximo episódio em 3 segundos…", "info", "Maratona");
          setTimeout(() => selectEpisode({ group, show, entry: next }), 3000);
        }
      }
    });
    video.addEventListener("error", () => {
      stage.innerHTML = `<div class="player-fallback"><i class="fa-solid fa-triangle-exclamation"></i><h3>Não foi possível carregar o vídeo</h3><p>O servidor pode ter bloqueado a reprodução interna. Tente abrir o arquivo diretamente.</p><a class="btn btn-primary" href="${escapeHTML(streamFor(activeItem))}" target="_blank" rel="noopener"><i class="fa-solid fa-up-right-from-square"></i>Abrir vídeo</a>${group ? `<a class="btn btn-ghost" href="detalhes.html?id=${encodeURIComponent(activeItem.id)}">Escolher outro episódio</a>` : ""}</div>`;
    });
    const started = video.play();
    if (started?.catch) started.catch(() => {});
  }

  const page = qs("#player-page");
  if (page) page.dataset.activeId = activeItem.id;

  if (group) {
    const select = qs("#player-season");
    if (select) select.value = String(current.season);
    renderEpisodeStrip(group, show, current.season, activeItem.id);
  }

  qs("#player-party")?.addEventListener("click", () => {
    openWatchPartyModal(show, { episodeId: activeItem.id, title: show.title, poster: show.poster });
  });

  const seasonSelect = qs("#player-season");
  if (seasonSelect && !seasonSelect.dataset.bound) {
    seasonSelect.dataset.bound = "1";
    seasonSelect.addEventListener("change", (event) => {
      const seasonNumber = Number(event.target.value);
      renderEpisodeStrip(group, show, seasonNumber, qs("#player-page")?.dataset.activeId || activeItem.id);
    });
  }

  updatePlayerHeading(current, group, show, null);
}

function nextEpisode(group, current) {
  if (!group) return null;
  const index = group.items.findIndex((entry) => entry.item.id === current.item.id);
  return index >= 0 ? group.items[index + 1] || null : null;
}

function selectEpisode({ group, show, entry }) {
  const url = new URL(location.href);
  url.searchParams.set("id", entry.item.id);
  url.searchParams.set("temporada", String(entry.season));
  url.searchParams.set("episodio", String(entry.episode));
  history.replaceState(null, "", url);
  mountPlayer({ item: entry.item, group, show, current: entry });
  const stage = qs("#player-stage");
  stage?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function episodeCard(entry, show, activeId, tmdbEpisode) {
  const still = tmdbEpisode?.still_path ? imageUrl(tmdbEpisode.still_path, "w300") : show.poster;
  const name = tmdbEpisode?.name || episodeName(entry);
  const rating = Number(tmdbEpisode?.vote_average) || 0;
  return `<button class="ep-card ${entry.item.id === activeId ? "active" : ""}" type="button" data-player-episode="${escapeHTML(entry.item.id)}" data-season="${entry.season}" data-episode="${entry.episode}">
    <div class="ep-thumb">
      ${still ? `<img src="${escapeHTML(still)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : ""}
      <span class="ep-number">T${entry.season} E${entry.episode}</span>
      <span class="ep-play"><i class="fa-solid fa-play"></i></span>
    </div>
    <div class="ep-body">
      <div class="ep-title-row"><strong>${escapeHTML(name)}</strong>${rating ? `<span class="ep-rating"><i class="fa-solid fa-star"></i>${rating.toFixed(1)}</span>` : ""}</div>
      <span class="ep-sub">${escapeHTML(entry.item.age || "L")}${(tmdbEpisode?.runtime || entry.item.duration) ? ` · ${formatDuration(tmdbEpisode?.runtime || entry.item.duration)}` : ""}</span>
    </div>
  </button>`;
}

function renderEpisodeStrip(group, show, seasonNumber, activeId) {
  const root = qs("#player-episodes");
  const season = group.seasons.find((entry) => entry.number === seasonNumber) || group.seasons[0];
  if (!root || !season) return;
  root.innerHTML = season.episodes.map((entry) => episodeCard(entry, show, activeId, null)).join("");
  root.querySelectorAll("[data-player-episode]").forEach((button) => {
    button.addEventListener("click", () => {
      const entry = group.items.find((candidate) => candidate.item.id === button.dataset.playerEpisode);
      if (entry) selectEpisode({ group, show, entry });
    });
  });
  const id = tmdbIdFromItem(group.first.item);
  getSeasonDetails(id, season.number).then((tmdbSeason) => {
    if (!tmdbSeason || !root.isConnected) return;
    const byNumber = new Map((tmdbSeason.episodes || []).map((episode) => [episode.episode_number, episode]));
    root.innerHTML = season.episodes.map((entry) => episodeCard(entry, show, activeId, byNumber.get(entry.episode))).join("");
    root.querySelectorAll("[data-player-episode]").forEach((button) => {
      button.addEventListener("click", () => {
        const entry = group.items.find((candidate) => candidate.item.id === button.dataset.playerEpisode);
        if (entry) selectEpisode({ group, show, entry });
      });
    });
  });
}

function updatePlayerHeading(current, group, show, data) {
  const title = qs("#player-title");
  const subtitle = qs("#player-subtitle");
  const movieMeta = qs("#player-movie-meta");
  const name = data?.title || data?.name || show.title;
  if (title) title.textContent = name;
  if (subtitle) subtitle.textContent = playerSubtitle(current, group, show, data);
  if (movieMeta) movieMeta.textContent = playerSubtitle(current, group, show, data);
  document.title = `${name} — assistir`;
}

async function hydratePlayer({ item, group, show, current }) {
  const data = await getTitleDetails(group?.first.item || item);
  if (!data) return;
  updatePlayerHeading(current, group, show, data);
}
