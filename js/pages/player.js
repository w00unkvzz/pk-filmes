// Immersive player page: custom overlay controls, resume prompt, skip intro,
// next episode and a season carousel matching the reference player.
import { byId, getSeriesGroup } from "../data.js";
import { getRoute, detailsPath, playerPath, replaceRoute } from "../router.js";
import * as store from "../store.js";
import { qs, escapeHTML, formatDuration, formatClock, toast, emptyState } from "../ui.js";
import { getTitleDetails, getSeasonDetails, tmdbIdFromItem, imageUrl, yearOf, runtimeOf, ratingOf } from "../tmdb.js";
import { openWatchPartyModal } from "../watchparty.js";

const DIRECT_VIDEO = /\.(mp4|m4v|webm|ogv|ogg|mov|m3u8)(\?|#|$)/i;
const EMBED_HOST = /youtube\.com|youtu\.be|vimeo\.com|dailymotion\.com|\/embed\/|player\./i;
let stripRequest = 0;
let playerRequest = 0;
let controlsTimer = 0;

function setPlayerControlsHidden(hidden) {
  const overlay = qs("#player-overlay");
  if (!overlay) return;
  const prompt = qs("#player-continue");
  if (hidden && prompt && !prompt.hidden) return;
  overlay.classList.toggle("controls-hidden", hidden);
  overlay.classList.toggle("hide-controls", hidden);
}

function revealPlayerControls() {
  const overlay = qs("#player-overlay");
  if (!overlay || overlay.hidden) return;
  setPlayerControlsHidden(false);
  clearTimeout(controlsTimer);
  controlsTimer = window.setTimeout(() => setPlayerControlsHidden(true), 3000);
}

function bindOverlayAutoHide() {
  const viewport = qs("#player-viewport");
  if (!viewport || viewport.dataset.hideBound) return;
  viewport.dataset.hideBound = "1";
  ["pointermove", "mousemove", "pointerdown", "touchstart", "click"].forEach((eventName) => {
    viewport.addEventListener(eventName, revealPlayerControls, { passive: true });
  });
  if (!window.__w00PlayerKeyBound) {
    window.__w00PlayerKeyBound = true;
    document.addEventListener("keydown", revealPlayerControls);
  }
  revealPlayerControls();
}

// The CSS uses min(56.25vw, 100dvh), but some Android browsers report a stale
// 100vh (or keep an old cached stylesheet) and end up centring the video inside
// an off-screen 16:9 box — a big black band on top and a cropped bottom edge.
// This inline height is the safety net: it always matches the visible screen.
function syncPlayerViewportHeight() {
  const viewport = qs("#player-viewport");
  if (!viewport) return;
  if (fullscreenElement()) {
    viewport.style.removeProperty("height");
    viewport.style.removeProperty("min-height");
    viewport.style.removeProperty("max-height");
    return;
  }
  const visible = window.visualViewport?.height || window.innerHeight || 0;
  if (!visible) return;
  const width = viewport.clientWidth || window.innerWidth || 0;
  const height = Math.max(140, Math.round(Math.min(width * 0.5625, visible)));
  // height + max-height beat any leftover 16/9 aspect-ratio from an old cached
  // stylesheet, so the box can never grow taller than the visible screen.
  viewport.style.height = `${height}px`;
  viewport.style.minHeight = "0";
  viewport.style.maxHeight = `${Math.round(visible)}px`;
}

function bindPlayerViewportHeight() {
  syncPlayerViewportHeight();
  if (window.__w00PlayerViewportHeightBound) return;
  window.__w00PlayerViewportHeightBound = true;
  const sync = () => syncPlayerViewportHeight();
  window.addEventListener("resize", sync, { passive: true });
  window.addEventListener("orientationchange", sync, { passive: true });
  window.visualViewport?.addEventListener("resize", sync, { passive: true });
  document.addEventListener("fullscreenchange", sync);
  document.addEventListener("webkitfullscreenchange", sync);
}

function fullscreenElement() {
  return document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement || null;
}

// Mirrors the reference player: request fullscreen on the viewport container so
// the custom controls (and their overlay) remain visible, with the native
// iOS `webkitEnterFullscreen` fallback on the video element when needed.
async function togglePlayerFullscreen() {
  const viewport = qs("#player-viewport");
  const video = qs("#player-video");
  if (!viewport) return;

  if (fullscreenElement()) {
    try {
      if (document.exitFullscreen) await document.exitFullscreen();
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
      else if (document.msExitFullscreen) document.msExitFullscreen();
    } catch {}
    return;
  }

  const request = viewport.requestFullscreen || viewport.webkitRequestFullscreen || viewport.msRequestFullscreen;
  if (request) {
    try {
      await request.call(viewport, { navigationUI: "hide" });
      revealPlayerControls();
      return;
    } catch {}
  }
  // iOS Safari cannot fullscreen a container; fall back to the native player.
  if (video && typeof video.webkitEnterFullscreen === "function") {
    try { video.webkitEnterFullscreen(); } catch {}
  }
}

function syncFullscreenUi() {
  const active = Boolean(fullscreenElement());
  qs("#player-fullscreen i")?.setAttribute("class", `fa-solid fa-${active ? "compress" : "expand"}`);
  qs("#player-fullscreen")?.setAttribute("aria-pressed", String(active));
  if (active) revealPlayerControls();
}

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
  const request = ++playerRequest;
  const route = getRoute();
  const params = route.params;
  const id = route.itemId || params.get("id") || params.get("filme") || "";
  const item = route.item || byId(id);
  const content = qs("#page-content");

  if (!item) {
    content.innerHTML = `<div class="player-page"><div class="player-missing">${emptyState("fa-film", "Título não encontrado", "Volte ao catálogo e escolha um título para assistir.")}<a class="btn btn-primary" href="/catalogo"><i class="fa-solid fa-clapperboard"></i>Ver catálogo</a></div></div>`;
    return;
  }

  const group = getSeriesGroup(item);
  const current = group?.items.find((entry) => entry.item.id === item.id) || group?.first || { item, season: null, episode: null };
  const show = group?.show || item;
  const title = show.title;
  document.title = `${title} — assistir`;

  content.innerHTML = `
    <div class="player-page" id="player-page" data-active-id="${escapeHTML(current.item.id)}">
      <div class="player-viewport" id="player-viewport">
        <div class="player-stage" id="player-stage"></div>
        <div class="center-indicator" aria-hidden="true"><div class="buffering-spinner" id="player-buffering"></div></div>
        <div class="player-overlay" id="player-overlay" hidden></div>
      </div>

      ${group ? `
        <section class="episodes-section" id="player-episodes-section">
          <div class="section-header-center">
            <h2 class="section-title-taste" id="player-episodes-title">Episódios</h2>
            <p class="section-subtitle-taste" id="player-episodes-sub">${group.seasons.length} temporada${group.seasons.length > 1 ? "s" : ""} · ${group.items.length} episódios</p>
          </div>

          <div class="player-episodes-tools">
            <div class="season-selector" id="player-season-selector">
              <button class="season-btn" id="player-season-btn" type="button" aria-haspopup="listbox" aria-expanded="false">
                <span id="player-season-label">Temporada ${current.season || group.seasons[0]?.number || 1}</span>
                <i class="fa-solid fa-chevron-down"></i>
              </button>
              <div class="season-dropdown" id="player-season-dropdown" role="listbox">
                ${group.seasons.map((season) => `<button class="season-option ${season.number === (current.season || group.seasons[0]?.number) ? "active" : ""}" type="button" role="option" aria-selected="${season.number === (current.season || group.seasons[0]?.number) ? "true" : "false"}" data-season="${season.number}">Temporada ${season.number}</button>`).join("")}
              </div>
            </div>
            <button class="btn btn-party btn-sm player-party-btn" id="player-party" type="button"><i class="fa-solid fa-users"></i>Watch Party</button>
          </div>

          <div class="episodes-container-wrapper">
            <div class="episodes-grid" id="player-episodes"></div>
            <div class="carousel-controls-wrapper">
              <div class="carousel-nav-pill">
                <button class="nav-arrow-btn" id="player-prev" type="button" aria-label="Episódios anteriores"><i class="fa-solid fa-arrow-left"></i></button>
                <div class="nav-arrow-divider"></div>
                <button class="nav-arrow-btn" id="player-next" type="button" aria-label="Próximos episódios"><i class="fa-solid fa-arrow-right"></i></button>
              </div>
              <div class="carousel-dots-container" id="player-dots"></div>
            </div>
          </div>
        </section>` : `
        <section class="player-movie-foot">
          <div class="player-movie-info">
            <span class="badge badge-accent">${show.type === "series" ? "Série" : "Filme"}</span>
            <strong>${escapeHTML(title)}</strong>
            <span id="player-movie-meta">${escapeHTML(playerSubtitle(current, group, show, null))}</span>
          </div>
          <div class="player-movie-actions">
            <a class="btn btn-ghost" href="${detailsPath(current.item)}"><i class="fa-solid fa-circle-info"></i>Detalhes</a>
            <button class="btn btn-party" id="player-party" type="button"><i class="fa-solid fa-users"></i>Criar Watch Party</button>
          </div>
        </section>`}
    </div>`;

  mountPlayer({ item, group, show, current });
  hydratePlayer({ item, group, show, current, request });
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
    return { mode: "none", html: `<div class="player-fallback"><i class="fa-solid fa-triangle-exclamation"></i><h3>Player indisponível</h3><p>Este título ainda não tem um link de reprodução.</p><a class="btn btn-ghost" href="${detailsPath(item)}">Voltar aos detalhes</a></div>` };
  }
  if (isDirectVideo(stream)) {
    return {
      mode: "direct",
      html: `<video id="player-video" autoplay playsinline preload="metadata" poster="${escapeHTML(item.poster || "")}" src="${escapeHTML(stream)}">
        <p>Seu navegador não suporta vídeo HTML5. <a href="${escapeHTML(stream)}" target="_blank" rel="noopener">Abrir vídeo</a>.</p>
      </video>`
    };
  }
  return {
    mode: "iframe",
    html: `<iframe id="player-frame" src="${escapeHTML(stream)}" title="${escapeHTML(item.title)}" allow="autoplay; fullscreen; picture-in-picture; encrypted-media" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`
  };
}

function overlayMarkup(mode, current, group, show) {
  if (mode === "none") return "";
  const canControl = mode === "direct";
  return `
    <div class="player-top-bar">
      <div class="player-top-left">
        <a class="back-btn" href="${detailsPath(current.item)}" aria-label="Voltar aos detalhes"><i class="fa-solid fa-arrow-left"></i></a>
        <div class="meta-info">
          <span class="meta-title" id="player-title">${escapeHTML(show.title)}</span>
          <span class="meta-subtitle" id="player-subtitle">${escapeHTML(playerSubtitle(current, group, show, null))}</span>
        </div>
      </div>
      <a class="brand-logo-pk" href="/" aria-label="Início">W00</a>
    </div>

    <div class="player-bottom-wrapper">
      ${canControl ? `
        <div class="controls-row">
          <button class="skip-intro-btn" id="player-skip-intro" type="button" hidden>Pular Abertura</button>
          <button class="skip-next-btn" id="player-skip-next" type="button" hidden><i class="fa-solid fa-forward-step"></i> Próximo Episódio</button>
        </div>

        <div class="continue-prompt" id="player-continue" hidden>
          <span>Você parou em <strong id="player-continue-time">00:00</strong>. Deseja continuar assistindo?</span>
          <div class="prompt-buttons">
            <button class="prompt-btn-yes" id="player-resume-yes" type="button">Sim</button>
            <button class="prompt-btn-no" id="player-resume-no" type="button">Não</button>
          </div>
        </div>

        <div class="timeline-container" id="player-timeline-container">
          <button class="control-icon" id="player-playpause" type="button" aria-label="Reproduzir"><i class="fa-solid fa-play"></i></button>
          <div class="timeline" id="player-timeline" role="slider" aria-label="Progresso do vídeo" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" tabindex="0">
            <div class="timeline-buffered" id="player-buffered"></div>
            <div class="timeline-progress" id="player-progress"><div class="timeline-handle"></div></div>
          </div>
          <span class="time-display" id="player-time">00:00 / 00:00</span>
        </div>

        <div class="controls-bar">
          <div class="controls-left">
            <button class="capsule-btn" id="player-report" type="button">Reportar</button>
            <button class="control-icon" id="player-back10" type="button" title="Voltar 10s" aria-label="Voltar 10 segundos"><i class="fa-solid fa-rotate-left"></i></button>
            <button class="control-icon" id="player-forward10" type="button" title="Avançar 10s" aria-label="Avançar 10 segundos"><i class="fa-solid fa-rotate-right"></i></button>
            <div class="volume-container">
              <button class="control-icon" id="player-mute" type="button" aria-label="Silenciar"><i class="fa-solid fa-volume-high"></i></button>
              <input type="range" class="volume-slider" id="player-volume" min="0" max="1" step="0.05" value="1" aria-label="Volume">
            </div>
          </div>
          <div class="controls-right">
            <button class="control-icon" id="player-pip" type="button" title="Picture-in-Picture" aria-label="Picture-in-Picture"><i class="fa-solid fa-clone"></i></button>
            <button class="control-icon" id="player-fullscreen" type="button" title="Tela cheia" aria-label="Tela cheia"><i class="fa-solid fa-expand"></i></button>
          </div>
        </div>` : `<div class="player-external-note"><i class="fa-solid fa-up-right-from-square"></i> Reprodução externa</div>`}
    </div>`;
}

function mountPlayer({ item, group, show, current }) {
  const stage = qs("#player-stage");
  const overlay = qs("#player-overlay");
  if (!stage || !overlay) return;
  const activeItem = current.item;
  const { mode, html } = stageMarkup(activeItem);
  stage.innerHTML = html;
  overlay.hidden = mode === "none";
  overlay.classList.remove("controls-hidden", "hide-controls");
  overlay.innerHTML = overlayMarkup(mode, current, group, show);
  const page = qs("#player-page");
  if (page) page.dataset.activeId = activeItem.id;
  if (overlay) overlay.dataset.mode = mode;

  if (group) {
    updateSeasonLabel(current.season);
    markSeasonOption(current.season);
    renderEpisodeStrip(group, show, current.season, activeItem.id);
  }

  bindSharedControls({ item, group, show, current, activeItem });
  bindOverlayAutoHide();
  bindPlayerViewportHeight();
  if (mode === "direct") bindVideoControls({ group, show, current, activeItem });
  updatePlayerHeading(current, group, show, null);
}

function bindSharedControls({ group, show, activeItem }) {
  const partyButton = qs("#player-party");
  if (partyButton && !partyButton.dataset.bound) {
    partyButton.dataset.bound = "1";
    partyButton.addEventListener("click", () => {
      const activeId = qs("#player-page")?.dataset.activeId;
      const active = group?.items.find((entry) => entry.item.id === activeId)?.item || activeItem;
      openWatchPartyModal(show, { episodeId: active.id, title: show.title, poster: show.poster });
    });
  }

  const seasonButton = qs("#player-season-btn");
  const seasonDropdown = qs("#player-season-dropdown");
  if (seasonButton && !seasonButton.dataset.bound) {
    seasonButton.dataset.bound = "1";
    seasonButton.addEventListener("click", (event) => {
      event.stopPropagation();
      const open = seasonDropdown?.classList.toggle("open");
      seasonButton.setAttribute("aria-expanded", open ? "true" : "false");
    });
    if (!window.__w00PlayerSeasonClickBound) {
      window.__w00PlayerSeasonClickBound = true;
      document.addEventListener("click", () => {
        qs("#player-season-dropdown")?.classList.remove("open");
        qs("#player-season-btn")?.setAttribute("aria-expanded", "false");
      });
    }
  }
  if (seasonDropdown && !seasonDropdown.dataset.bound) {
    seasonDropdown.dataset.bound = "1";
    seasonDropdown.addEventListener("click", (event) => {
      const option = event.target.closest("[data-season]");
      if (!option) return;
      const seasonNumber = Number(option.dataset.season);
      markSeasonOption(seasonNumber);
      updateSeasonLabel(seasonNumber);
      seasonDropdown.classList.remove("open");
      qs("#player-season-btn")?.setAttribute("aria-expanded", "false");
      renderEpisodeStrip(group, show, seasonNumber, qs("#player-page")?.dataset.activeId || activeItem.id);
    });
  }

  const episodes = qs("#player-episodes");
  if (episodes && !episodes.dataset.bound) {
    episodes.dataset.bound = "1";
    episodes.addEventListener("click", (event) => {
      const button = event.target.closest("[data-player-episode]");
      if (!button) return;
      const entry = group?.items.find((candidate) => candidate.item.id === button.dataset.playerEpisode);
      if (entry) selectEpisode({ group, show, entry });
    });
    episodes.addEventListener("scroll", () => updateCarouselDots(episodes), { passive: true });
  }

  const prev = qs("#player-prev");
  const next = qs("#player-next");
  if (prev && !prev.dataset.bound) {
    prev.dataset.bound = "1";
    prev.addEventListener("click", () => scrollList("left"));
  }
  if (next && !next.dataset.bound) {
    next.dataset.bound = "1";
    next.addEventListener("click", () => scrollList("right"));
  }
  const dots = qs("#player-dots");
  if (dots && !dots.dataset.bound) {
    dots.dataset.bound = "1";
    dots.addEventListener("click", (event) => {
      const dot = event.target.closest("[data-card-index]");
      if (dot) scrollToCardIndex(Number(dot.dataset.cardIndex));
    });
  }
}

function bindVideoControls({ group, show, current, activeItem }) {
  const video = qs("#player-video");
  if (!video) return;
  const playPause = qs("#player-playpause");
  const timeline = qs("#player-timeline");
  const progress = qs("#player-progress");
  const buffered = qs("#player-buffered");
  const timeDisplay = qs("#player-time");
  const skipIntro = qs("#player-skip-intro");
  const skipNext = qs("#player-skip-next");
  const continuePrompt = qs("#player-continue");
  const continueTime = qs("#player-continue-time");
  const volume = qs("#player-volume");
  const mute = qs("#player-mute");
  const settings = store.getSettings();
  const history = store.getHistoryEntry(activeItem.id);
  const next = group ? nextEpisode(group, current) : null;
  let lastSave = 0;
  let introSkipped = false;
  let pendingResume = 0;
  let promptTimer = 0;

  if (skipNext && next) {
    skipNext.hidden = false;
    skipNext.addEventListener("click", () => selectEpisode({ group, show, entry: next }));
  }

  const save = (force = false) => {
    if (!Number.isFinite(video.currentTime)) return;
    // Do not overwrite the saved position while the resume prompt is open.
    if (pendingResume > 0 && video.currentTime < 5) return;
    const duration = Number.isFinite(video.duration) ? video.duration : (activeItem.duration || 0) * 60;
    if (force || Date.now() - lastSave > 5000) {
      lastSave = Date.now();
      store.addHistory(activeItem, video.currentTime, duration, group ? {
        episode: { season: current.season, number: current.episode, title: episodeName(current), id: activeItem.id }
      } : {});
    }
  };

  const setPlayIcon = (playing) => {
    if (playPause) playPause.innerHTML = `<i class="fa-solid fa-${playing ? "pause" : "play"}"></i>`;
    if (playPause) playPause.setAttribute("aria-label", playing ? "Pausar" : "Reproduzir");
  };

  const showControls = () => revealPlayerControls();

  const hidePrompt = () => {
    continuePrompt?.setAttribute("hidden", "");
    pendingResume = 0;
    clearTimeout(promptTimer);
  };

  const showPrompt = (seconds) => {
    if (!continuePrompt || !continueTime) return;
    pendingResume = seconds;
    continueTime.textContent = formatClock(seconds);
    continuePrompt.removeAttribute("hidden");
    clearTimeout(promptTimer);
    promptTimer = window.setTimeout(hidePrompt, 12000);
  };

  qs("#player-resume-yes")?.addEventListener("click", () => {
    if (pendingResume > 0) {
      video.currentTime = pendingResume;
      toast(`Reprodução retomada de ${formatClock(pendingResume)}.`, "info");
      video.play().catch(() => {});
    }
    hidePrompt();
  });
  qs("#player-resume-no")?.addEventListener("click", hidePrompt);

  const seekBy = (amount) => {
    if (!Number.isFinite(video.duration)) return;
    video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + amount));
    showControls();
  };
  qs("#player-back10")?.addEventListener("click", () => seekBy(-10));
  qs("#player-forward10")?.addEventListener("click", () => seekBy(10));

  playPause?.addEventListener("click", () => {
    if (video.paused) video.play().catch(() => {});
    else video.pause();
  });

  const seekToClientX = (clientX) => {
    if (!timeline || !Number.isFinite(video.duration) || video.duration <= 0) return;
    const rect = timeline.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    video.currentTime = percent * video.duration;
  };

  if (timeline) {
    let dragging = false;
    timeline.addEventListener("pointerdown", (event) => {
      dragging = true;
      timeline.setPointerCapture?.(event.pointerId);
      seekToClientX(event.clientX);
      showControls();
    });
    timeline.addEventListener("pointermove", (event) => {
      if (dragging) seekToClientX(event.clientX);
    });
    timeline.addEventListener("pointerup", (event) => {
      dragging = false;
      timeline.releasePointerCapture?.(event.pointerId);
    });
    timeline.addEventListener("keydown", (event) => {
      if (event.key === "ArrowLeft") seekBy(-5);
      if (event.key === "ArrowRight") seekBy(5);
    });
  }

  const updateVolumeIcon = () => {
    if (!mute) return;
    const icon = video.muted || video.volume === 0 ? "volume-xmark" : video.volume < 0.5 ? "volume-low" : "volume-high";
    mute.innerHTML = `<i class="fa-solid fa-${icon}"></i>`;
  };
  volume?.addEventListener("input", (event) => {
    video.volume = Number(event.target.value);
    video.muted = video.volume === 0;
    updateVolumeIcon();
  });
  mute?.addEventListener("click", () => {
    video.muted = !video.muted;
    updateVolumeIcon();
  });

  qs("#player-pip")?.addEventListener("click", async () => {
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await video.requestPictureInPicture();
    } catch {
      toast("Picture-in-Picture não está disponível neste navegador.", "info");
    }
  });

  qs("#player-fullscreen")?.addEventListener("click", togglePlayerFullscreen);

  qs("#player-report")?.addEventListener("click", () => {
    toast("Para reportar um problema, use o suporte do w00filmes.", "info", "Reportar");
  });

  video.addEventListener("loadedmetadata", () => {
    if (timeDisplay) timeDisplay.textContent = `00:00 / ${formatClock(video.duration || 0)}`;
    if (history?.progress > 30 && history.progress < (video.duration || Infinity) - 10) {
      video.pause();
      showPrompt(history.progress);
    }
    setPlayIcon(!video.paused);
  });
  video.addEventListener("play", () => {
    save(true);
    setPlayIcon(true);
    showControls();
  });
  video.addEventListener("pause", () => {
    save(true);
    setPlayIcon(false);
    revealPlayerControls();
  });
  video.addEventListener("playing", () => {
    qs("#player-buffering")?.classList.remove("is-visible");
    setPlayIcon(true);
    showControls();
  });
  video.addEventListener("waiting", () => qs("#player-buffering")?.classList.add("is-visible"));
  video.addEventListener("canplay", () => qs("#player-buffering")?.classList.remove("is-visible"));
  video.addEventListener("timeupdate", () => {
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    const currentTime = Number.isFinite(video.currentTime) ? video.currentTime : 0;
    if (timeDisplay) timeDisplay.textContent = `${formatClock(currentTime)} / ${formatClock(duration)}`;
    const percent = duration > 0 ? (currentTime / duration) * 100 : 0;
    if (progress) progress.style.width = `${percent}%`;
    timeline?.setAttribute("aria-valuenow", String(Math.round(percent)));
    save(false);

    const skipStart = 1;
    const skipEnd = group ? 180 : 120;
    if (currentTime < skipStart) introSkipped = false;
    if (skipIntro) {
      if (currentTime >= skipStart && currentTime <= skipEnd && !introSkipped) skipIntro.removeAttribute("hidden");
      else skipIntro.setAttribute("hidden", "");
    }
    if (settings.autoSkipIntro && !introSkipped && currentTime >= 3 && currentTime <= 5) {
      const target = group ? 90 : 85;
      video.currentTime = Number.isFinite(video.duration) ? Math.min(target, Math.max(0, video.duration - 5)) : target;
      introSkipped = true;
      skipIntro?.setAttribute("hidden", "");
      toast("Abertura pulada automaticamente.", "info");
    }
  });
  video.addEventListener("progress", () => {
    if (!buffered || !video.buffered?.length || !video.duration) return;
    const end = video.buffered.end(video.buffered.length - 1);
    buffered.style.width = `${Math.min(100, (end / video.duration) * 100)}%`;
  });
  video.addEventListener("ended", () => {
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    store.addHistory(activeItem, duration, duration, group ? {
      episode: { season: current.season, number: current.episode, title: episodeName(current), id: activeItem.id }
    } : {});
    window.dispatchEvent(new CustomEvent("pk:history-changed"));
    setPlayIcon(false);
    revealPlayerControls();
    if (group && next) {
      toast("Próximo episódio disponível.", "info", "Maratona");
      if (store.getSettings().autoNextEpisode) setTimeout(() => selectEpisode({ group, show, entry: next }), 2000);
    } else {
      toast("Você concluiu este título.", "success", "Sessão concluída");
    }
  });
  video.addEventListener("error", () => {
    stageError(activeItem, group);
  });

  skipIntro?.addEventListener("click", () => {
    const target = group ? 90 : 85;
    video.currentTime = Number.isFinite(video.duration) ? Math.min(target, Math.max(0, video.duration - 5)) : target;
    introSkipped = true;
    skipIntro.setAttribute("hidden", "");
    showControls();
  });

  qs("#player-viewport")?.addEventListener("pointermove", showControls, { passive: true });
  qs("#player-viewport")?.addEventListener("touchstart", showControls, { passive: true });
  if (!window.__w00FullscreenBound) {
    window.__w00FullscreenBound = true;
    ["fullscreenchange", "webkitfullscreenchange", "MSFullscreenChange"].forEach((eventName) => {
      document.addEventListener(eventName, syncFullscreenUi);
    });
  }
  syncFullscreenUi();

  if (volume) volume.value = String(video.volume);
  updateVolumeIcon();
  const started = video.play();
  if (started?.catch) started.catch(() => {});
}

function stageError(activeItem, group) {
  const stage = qs("#player-stage");
  if (!stage) return;
  qs("#player-buffering")?.classList.remove("is-visible");
  qs("#player-overlay")?.classList.add("controls-hidden", "hide-controls");
  stage.innerHTML = `<div class="player-fallback"><i class="fa-solid fa-triangle-exclamation"></i><h3>Não foi possível carregar o vídeo</h3><p>O servidor pode ter bloqueado a reprodução interna. Tente abrir o arquivo diretamente.</p><a class="btn btn-primary" href="${escapeHTML(streamFor(activeItem))}" target="_blank" rel="noopener"><i class="fa-solid fa-up-right-from-square"></i>Abrir vídeo</a>${group ? `<a class="btn btn-ghost" href="${detailsPath(activeItem)}">Escolher outro episódio</a>` : ""}</div>`;
}

function updateSeasonLabel(seasonNumber) {
  const label = qs("#player-season-label");
  const season = Number(seasonNumber);
  if (label && Number.isFinite(season)) label.textContent = `Temporada ${season}`;
}

function markSeasonOption(seasonNumber) {
  const season = Number(seasonNumber);
  qsaSeasonOptions().forEach((option) => {
    const active = Number(option.dataset.season) === season;
    option.classList.toggle("active", active);
    option.setAttribute("aria-selected", active ? "true" : "false");
  });
}

function qsaSeasonOptions() {
  return [...(qs("#player-season-dropdown")?.querySelectorAll(".season-option") || [])];
}

function nextEpisode(group, current) {
  if (!group) return null;
  const index = group.items.findIndex((entry) => entry.item.id === current.item.id);
  return index >= 0 ? group.items[index + 1] || null : null;
}

function selectEpisode({ group, show, entry }) {
  if (!qs("#player-page")) return;
  const previousVideo = qs("#player-video");
  if (previousVideo && !previousVideo.paused) previousVideo.pause();
  replaceRoute(`${playerPath(entry.item)}?temporada=${encodeURIComponent(entry.season)}&episodio=${encodeURIComponent(entry.episode)}`);
  const request = ++playerRequest;
  mountPlayer({ item: entry.item, group, show, current: entry });
  hydratePlayer({ item: entry.item, group, show, current: entry, request });
  qs("#player-viewport")?.scrollIntoView?.({ behavior: "smooth", block: "start" });
}

function episodeCard(entry, show, activeId, tmdbEpisode) {
  const still = tmdbEpisode?.still_path ? imageUrl(tmdbEpisode.still_path, "w300") : show.poster;
  const name = tmdbEpisode?.name || episodeName(entry);
  const rating = Number(tmdbEpisode?.vote_average) || 0;
  return `<button class="ep-card ${entry.item.id === activeId ? "active" : ""}" type="button" data-player-episode="${escapeHTML(entry.item.id)}" data-season="${entry.season}" data-episode="${entry.episode}">
    <div class="ep-thumb-wrapper">
      <div class="ep-thumb">
        ${still ? `<img src="${escapeHTML(still)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : ""}
      </div>
      <div class="ep-play-overlay"></div>
      <div class="ep-details">
        <span class="ep-card-title">${escapeHTML(name)}</span>
        <div class="ep-details-footer">
          <span class="ep-card-num">T${entry.season} E${entry.episode}</span>
          ${rating ? `<span class="ep-rating-badge"><i class="fa-solid fa-star"></i>${rating.toFixed(1)}</span>` : ""}
        </div>
      </div>
    </div>
  </button>`;
}

function renderEpisodeStrip(group, show, seasonNumber, activeId) {
  const root = qs("#player-episodes");
  const season = group.seasons.find((entry) => entry.number === seasonNumber) || group.seasons[0];
  if (!root || !season) return;
  const request = ++stripRequest;
  root.innerHTML = season.episodes.map((entry) => episodeCard(entry, show, activeId, null)).join("");
  updateCarouselDots(root);
  root.querySelector(`[data-player-episode="${activeId}"]`)?.scrollIntoView?.({ behavior: "smooth", block: "nearest", inline: "center" });
  const id = tmdbIdFromItem(group.first.item);
  getSeasonDetails(id, season.number).then((tmdbSeason) => {
    if (!tmdbSeason || !root.isConnected || request !== stripRequest) return;
    const byNumber = new Map((tmdbSeason.episodes || []).map((episode) => [episode.episode_number, episode]));
    root.innerHTML = season.episodes.map((entry) => episodeCard(entry, show, activeId, byNumber.get(entry.episode))).join("");
    updateCarouselDots(root);
    root.querySelector(`[data-player-episode="${activeId}"]`)?.scrollIntoView?.({ behavior: "smooth", block: "nearest", inline: "center" });
  });
}

function updateCarouselDots(grid) {
  const dotsContainer = qs("#player-dots");
  if (!grid || !dotsContainer) return;
  const cards = grid.querySelectorAll(".ep-card");
  const totalCards = cards.length;
  if (!totalCards) {
    dotsContainer.innerHTML = "";
    return;
  }
  const cardWidth = cards[0].offsetWidth || 195;
  let gap = 16;
  try {
    gap = parseFloat(getComputedStyle(grid).gap) || 16;
  } catch {}
  const activeIndex = Math.min(totalCards - 1, Math.max(0, Math.round(grid.scrollLeft / Math.max(1, cardWidth + gap))));
  const dotCount = Math.min(6, totalCards);
  let html = "";
  for (let index = 0; index < dotCount; index += 1) {
    const target = Math.floor((index / Math.max(1, dotCount - 1)) * (totalCards - 1));
    const active = dotCount >= totalCards
      ? index === activeIndex
      : Math.abs(activeIndex - target) < Math.ceil(totalCards / dotCount);
    html += `<button class="carousel-dot ${active ? "active" : ""}" type="button" data-card-index="${target}" aria-label="Ir para o episódio ${target + 1}"></button>`;
  }
  dotsContainer.innerHTML = html;
}

function scrollList(direction) {
  const grid = qs("#player-episodes");
  if (!grid) return;
  const cardWidth = grid.querySelector(".ep-card")?.offsetWidth || 195;
  const amount = (cardWidth + 16) * 2;
  grid.scrollBy({ left: direction === "left" ? -amount : amount, behavior: "smooth" });
}

function scrollToCardIndex(index) {
  const grid = qs("#player-episodes");
  const cards = grid?.querySelectorAll(".ep-card");
  const card = cards?.[index];
  if (!grid || !card) return;
  grid.scrollTo({ left: card.offsetLeft - grid.offsetLeft - 10, behavior: "smooth" });
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

async function hydratePlayer({ item, group, show, current, request }) {
  const data = await getTitleDetails(group?.first.item || item);
  if (!data) return;
  if (request !== playerRequest || document.body.dataset.page !== "player") return;
  updatePlayerHeading(current, group, show, data);
}

// Keyboard shortcuts are global, but resolve the active player at call time.
if (!window.__w00PlayerKeysBound) {
  window.__w00PlayerKeysBound = true;
  document.addEventListener("keydown", (event) => {
    const video = qs("#player-video");
    if (!video) return;
    const tag = event.target?.tagName?.toLowerCase();
    if (["input", "select", "textarea"].includes(tag)) return;
    if (event.key === " " || event.key === "k") {
      event.preventDefault();
      if (video.paused) video.play().catch(() => {});
      else video.pause();
    } else if (event.key === "ArrowLeft") {
      video.currentTime = Math.max(0, video.currentTime - 10);
    } else if (event.key === "ArrowRight") {
      video.currentTime = Math.min(video.duration || Infinity, video.currentTime + 10);
    } else if (event.key === "m") {
      video.muted = !video.muted;
    } else if (event.key === "f") {
      qs("#player-fullscreen")?.click();
    } else if (event.key === "Escape" && fullscreenElement()) {
      qs("#player-fullscreen")?.click();
    }
  });
}
