// Trailer modal shared by the home hero and the details page.
import { getTrailer } from "./tmdb.js";
import { openModal, escapeHTML } from "./ui.js";

function trailerFallback(title) {
  const query = encodeURIComponent(`${title} trailer oficial`);
  return `<div class="trailer-unavailable">
    <span class="trailer-unavailable-icon"><i class="fa-solid fa-film"></i></span>
    <strong>Trailer indisponível</strong>
    <p>Não encontramos um trailer oficial para este título agora.</p>
    <a class="btn btn-ghost" href="https://www.youtube.com/results?search_query=${query}" target="_blank" rel="noopener noreferrer">
      <i class="fa-brands fa-youtube"></i>Procurar no YouTube
    </a>
  </div>`;
}

export function openTrailerModal(item) {
  if (!item) return;
  const title = item.title || item.name || "Trailer";
  const poster = item.backdrop || item.poster || "";
  const content = `
    <button class="modal-close" data-close-modal type="button" aria-label="Fechar"><i class="fa-solid fa-xmark"></i></button>
    <div class="trailer-modal-head">
      <span class="trailer-modal-kicker"><i class="fa-solid fa-clapperboard"></i> Trailer oficial</span>
      <h2>${escapeHTML(title)}</h2>
    </div>
    <div class="trailer-player" id="trailer-player">
      <div class="trailer-loading"><i class="fa-solid fa-spinner fa-spin"></i><span>Carregando trailer…</span></div>
    </div>`;

  openModal(content, {
    className: "modal-trailer",
    label: `Trailer de ${title}`,
    onMount: async () => {
      const root = document.getElementById("trailer-player");
      if (!root) return;
      const trailer = await getTrailer(item);
      if (!root.isConnected) return;
      if (trailer?.key) {
        const key = encodeURIComponent(trailer.key);
        root.innerHTML = `<iframe
          src="https://www.youtube.com/embed/${key}?autoplay=1&rel=0&modestbranding=1&playsinline=1"
          title="${escapeHTML(trailer.name || `Trailer de ${title}`)}"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowfullscreen></iframe>
          <a class="trailer-open-link" href="https://www.youtube.com/watch?v=${key}" target="_blank" rel="noopener noreferrer"><i class="fa-brands fa-youtube"></i>Abrir no YouTube</a>`;
        return;
      }
      root.innerHTML = `${poster ? `<img class="trailer-poster" src="${escapeHTML(poster)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : ""}${trailerFallback(title)}`;
    }
  });
}
