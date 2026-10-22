// Shared "Criar Watch Party" modal, used by details and player pages.
import { openModal, closeModal, toast, escapeHTML, openAuthModal } from "./ui.js";
import * as store from "./store.js";
import { createRoom } from "./social.js";

export function openWatchPartyModal(item, options = {}) {
  if (!item) return;
  const user = store.getUser();
  if (!user.cloud) {
    toast("Entre na sua conta para criar uma sala.", "info", "Watch Party");
    openAuthModal();
    return;
  }

  const movieId = options.episodeId || item.id;
  const displayTitle = options.title || item.title;
  const poster = options.poster || item.poster || "";
  const type = item.type === "series" ? "Série" : "Filme";
  const defaultName = `Sessão: ${displayTitle}`.slice(0, 40);

  const content = `
    <button class="modal-close" data-close-modal type="button" aria-label="Fechar"><i class="fa-solid fa-xmark"></i></button>
    <div class="wp-head">
      <h2><i class="fa-solid fa-users"></i> Criar Watch Party</h2>
      <span class="badge badge-live"><i class="fa-solid fa-circle"></i> ao vivo</span>
    </div>
    <div class="wp-media-preview">
      ${poster ? `<img class="wp-media-thumb" src="${escapeHTML(poster)}" alt="" loading="lazy" decoding="async">` : `<div class="wp-media-thumb wp-media-fallback"><i class="fa-solid fa-film"></i></div>`}
      <div class="wp-media-info">
        <span class="wp-media-type">${type} · HD</span>
        <strong class="wp-media-title">${escapeHTML(displayTitle)}</strong>
      </div>
    </div>
    <form class="wp-form" id="wp-form">
      <label class="wp-label" for="wp-room-name">Nome da sala <span>(opcional)</span></label>
      <input class="input wp-input" id="wp-room-name" maxlength="40" value="${escapeHTML(defaultName)}" placeholder="Ex.: Maratona de filmes 🍿" autocomplete="off">
      <span class="wp-label">Privacidade da sala</span>
      <div class="wp-privacy-options" role="radiogroup" aria-label="Privacidade">
        <button class="wp-privacy-card active" type="button" data-wp-privacy="public" role="radio" aria-checked="true">
          <i class="fa-solid fa-globe"></i>
          <strong>Pública</strong>
          <span>Qualquer um pode entrar</span>
        </button>
        <button class="wp-privacy-card" type="button" data-wp-privacy="private" role="radio" aria-checked="false">
          <i class="fa-solid fa-lock"></i>
          <strong>Privada</strong>
          <span>Apenas convidados</span>
        </button>
      </div>
      <div class="wp-buttons">
        <button class="btn btn-ghost" type="button" data-close-modal>Cancelar</button>
        <button class="btn btn-primary" id="wp-submit" type="submit"><i class="fa-solid fa-users"></i> Criar e Entrar</button>
      </div>
    </form>`;

  openModal(content, {
    className: "modal-wp",
    label: "Criar Watch Party",
    onMount: () => {
      let isPrivate = false;
      const cards = [...document.querySelectorAll("[data-wp-privacy]")];
      cards.forEach((card) => {
        card.addEventListener("click", () => {
          isPrivate = card.dataset.wpPrivacy === "private";
          cards.forEach((entry) => {
            const active = entry === card;
            entry.classList.toggle("active", active);
            entry.setAttribute("aria-checked", String(active));
          });
        });
      });

      const form = document.getElementById("wp-form");
      form?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const submit = document.getElementById("wp-submit");
        const name = document.getElementById("wp-room-name")?.value.trim() || defaultName;
        submit.disabled = true;
        submit.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Criando...';
        try {
          const room = await createRoom({ name, movieId, isPrivate });
          closeModal();
          location.href = `pkparty.html?sala=${encodeURIComponent(room.code)}`;
        } catch (error) {
          toast(error.message || "Não foi possível criar a sala.", "error", "Watch Party");
          submit.disabled = false;
          submit.innerHTML = '<i class="fa-solid fa-users"></i> Criar e Entrar';
        }
      });
    }
  });
}
