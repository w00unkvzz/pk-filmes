// Profile: Supabase identity, avatar upload, watchlist, history and friends.
import { CONFIG } from "../config.js";
import { byId, DEFAULT_USER } from "../data.js";
import * as store from "../store.js";
import { logout as authLogout } from "../auth.js";
import { uploadAvatar, updateProfile, syncSocialCache } from "../social.js";
import {
  qs, qsa, avatar, posterCard, emptyState, formatDuration, formatDate,
  escapeHTML, openModal, closeModal, toast
} from "../ui.js";

const validTabs = ["minha-lista", "historico", "amigos", "conquistas"];

function currentTab() {
  const hash = location.hash.replace("#", "");
  return validTabs.includes(hash) ? hash : "minha-lista";
}

function historyItem(entry) {
  const item = byId(entry.id);
  if (!item) return "";
  const percent = store.progressPercent(entry);
  return `<article class="continue-item" data-open-details="${escapeHTML(item.id)}">
    <div class="poster" style="--c1:${item.colors[0]};--c2:${item.colors[1]}"><span class="poster-title">${escapeHTML(item.title)}</span></div>
    <div class="grow">
      <strong>${escapeHTML(item.title)}</strong>
      <span>${entry.episode ? `T${entry.episode.season} E${entry.episode.number} · ` : ""}${percent}% assistido</span>
      <div class="progress"><span style="width:${percent}%"></span></div>
    </div>
    <button class="btn-icon" data-remove-history="${escapeHTML(item.id)}" type="button" title="Remover do histórico" aria-label="Remover do histórico"><i class="fa-solid fa-xmark"></i></button>
  </article>`;
}

function achievements(watchlist, history, friends) {
  return [
    { icon: "fa-seedling", title: "Primeiro play", text: "Assista a um título", unlocked: history.length > 0 },
    { icon: "fa-bookmark", title: "Colecionador", text: "3 títulos na lista", unlocked: watchlist.length >= 3 },
    { icon: "fa-user-group", title: "Conectado", text: "Tenha um amigo", unlocked: friends.length > 0 },
    { icon: "fa-fire", title: "Maratonista", text: "5 títulos iniciados", unlocked: history.length >= 5 },
    { icon: "fa-tower-broadcast", title: "Sessão aberta", text: "Crie uma sala no w00 Party", unlocked: false },
  ];
}

export async function renderPerfil() {
  const user = store.getUser();
  if (user.cloud) {
    try { await syncSocialCache(); } catch {}
  }
  const watchlist = store.getWatchlist().map(byId).filter(Boolean);
  const history = store.getHistory();
  const friends = store.getFriends();
  const hours = Math.round(history.reduce((total, entry) => total + (entry.progress || 0), 0) / 3600);
  const tab = currentTab();
  const badgeList = achievements(watchlist, history, friends);

  qs("#page-content").innerHTML = `
    <section class="profile-cover">
      <div class="profile-cover-glow"></div>
    </section>
    <div class="profile-head">
      <div class="profile-avatar-wrap">
        <button class="profile-avatar-btn" id="profile-avatar-edit" type="button" aria-label="Alterar foto ou GIF">
          ${avatar(user, "xl", "self")}
          <span class="edit-dot"><i class="fa-solid fa-camera"></i></span>
        </button>
        <input type="file" id="avatar-file" class="hidden" accept="image/png,image/jpeg,image/webp,image/gif">
      </div>
      <div class="profile-identity">
        <div class="row wrap" style="gap:9px"><h1>${escapeHTML(user.name)}</h1>${user.cloud ? '<span class="badge badge-live"><i class="fa-solid fa-cloud"></i>sincronizado</span>' : '<span class="badge badge-soft">local</span>'}</div>
        <div class="meta"><span>${escapeHTML(user.email || "sem e-mail")}</span><span class="dot"></span><span>Desde ${formatDate(user.joined)}</span><span class="dot"></span><span>${escapeHTML(user.bio)}</span></div>
      </div>
      <div class="profile-actions">
        ${user.authed ? `<button class="btn btn-primary" id="edit-profile" type="button"><i class="fa-solid fa-pen"></i>Editar perfil</button>` : `<button class="btn btn-primary" data-auth-open type="button"><i class="fa-solid fa-right-to-bracket"></i>Entrar</button>`}
      </div>
    </div>

    <div class="profile-body">
      <div class="profile-main">
        <div class="stat-grid">
          <div class="stat"><strong>${watchlist.length}</strong><span>Na minha lista</span></div>
          <div class="stat"><strong>${history.length}</strong><span>Títulos iniciados</span></div>
          <div class="stat"><strong>${hours}h</strong><span>Tempo assistido</span></div>
          <div class="stat"><strong>${friends.length}</strong><span>Amigos</span></div>
        </div>

        <div class="profile-section profile-panel">
          <div class="tabs" role="tablist">
            <button class="tab ${tab === "minha-lista" ? "active" : ""}" data-profile-tab="minha-lista" type="button">Minha lista</button>
            <button class="tab ${tab === "historico" ? "active" : ""}" data-profile-tab="historico" type="button">Histórico</button>
            <button class="tab ${tab === "amigos" ? "active" : ""}" data-profile-tab="amigos" type="button">Amigos</button>
            <button class="tab ${tab === "conquistas" ? "active" : ""}" data-profile-tab="conquistas" type="button">Conquistas</button>
          </div>
          <div class="profile-panel-body">
            <div class="profile-tab-panel ${tab === "minha-lista" ? "active" : ""}" id="profile-panel-minha-lista">
              ${watchlist.length ? `<div class="card-grid">${watchlist.map((item) => posterCard(item)).join("")}</div>` : emptyState("fa-bookmark", "Sua lista está vazia", "Toque no + em qualquer pôster para guardar um título aqui.")}
            </div>
            <div class="profile-tab-panel ${tab === "historico" ? "active" : ""}" id="profile-panel-historico">
              <div class="row-between" style="margin-bottom:12px"><span class="tiny muted">${history.length} título${history.length === 1 ? "" : "s"} no histórico</span>${history.length ? '<button class="section-link" id="clear-history" type="button">Limpar histórico <i class="fa-solid fa-trash-can"></i></button>' : ""}</div>
              ${history.length ? `<div class="continue-grid">${history.map(historyItem).join("")}</div>` : emptyState("fa-clock-rotate-left", "Nada assistido ainda", "Quando você abrir um player, o progresso aparece aqui automaticamente.")}
            </div>
            <div class="profile-tab-panel ${tab === "amigos" ? "active" : ""}" id="profile-panel-amigos">
              ${friends.length ? `<div class="my-friends-list">${friends.map((friend) => `<div class="friend-mini">${avatar(friend, "sm")}<div class="grow"><strong>${escapeHTML(friend.name)}</strong><span>${escapeHTML(friend.favoriteGenre || "amigo")}</span></div><span class="status-dot"></span></div>`).join("")}</div><a class="btn btn-ghost btn-sm" href="amigos.html" style="margin-top:13px"><i class="fa-solid fa-user-group"></i>Gerenciar amigos</a>` : emptyState("fa-user-group", "Conecte-se com alguém", "Adicione amigos para compartilhar sessões e salas do w00 Party.")}
            </div>
            <div class="profile-tab-panel ${tab === "conquistas" ? "active" : ""}" id="profile-panel-conquistas">
              <div class="badge-grid">${badgeList.map((badge) => `<div class="achievement ${badge.unlocked ? "" : "locked"}"><i class="fa-solid ${badge.icon}"></i><strong>${escapeHTML(badge.title)}</strong><span>${escapeHTML(badge.text)}</span></div>`).join("")}</div>
            </div>
          </div>
        </div>
      </div>

      <aside class="profile-side">
        

        <div class="profile-panel">
          <div class="panel-head"><h3>Conta</h3><i class="fa-solid fa-shield-halved muted"></i></div>
          <div class="panel-body" style="display:flex;flex-direction:column;gap:12px">
            <div class="row-between tiny"><span class="muted">Login</span><strong>${user.cloud ? "Conta" : "Local"}</strong></div>
            <div class="row-between tiny"><span class="muted">Foto</span><strong>${user.avatar_url ? "Personalizada" : "Iniciais"}</strong></div>
            <button class="btn btn-ghost btn-sm" id="change-avatar" type="button"><i class="fa-solid fa-image"></i>Foto ou GIF</button>
            ${user.authed ? `<button class="btn btn-danger btn-sm" id="profile-logout" type="button"><i class="fa-solid fa-right-from-bracket"></i>Sair da conta</button>` : ""}
          </div>
        </div>

        <div class="profile-panel">
          <div class="panel-head"><h3>Preferências</h3><i class="fa-solid fa-sliders muted"></i></div>
          <div class="panel-body" style="display:flex;flex-direction:column;gap:12px">
            <label class="row-between tiny" style="gap:12px"><span>Pular abertura automaticamente</span><input type="checkbox" id="setting-autoSkip" ${store.getSettings().autoSkipIntro ? "checked" : ""}></label>
            <label class="row-between tiny" style="gap:12px"><span>Notificações de amigos</span><input type="checkbox" id="setting-notifications" ${store.getSettings().notifications ? "checked" : ""}></label>
          </div>
        </div>

        <div class="panel panel-pad">
          <div class="section-kicker"><i class="fa-solid fa-cloud"></i> Conta w00filmes</div>
          <p class="tiny" style="margin-top:7px">Perfil, foto, amigos e salas ficam salvos na sua conta. Lista e histórico continuam neste navegador.</p>
        </div>
      </aside>
    </div>`;

  mountPerfil();
}

function mountPerfil() {
  qsa("[data-profile-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      const tab = button.dataset.profileTab;
      qsa("[data-profile-tab]").forEach((entry) => entry.classList.toggle("active", entry === button));
      qsa(".profile-tab-panel").forEach((panel) => panel.classList.toggle("active", panel.id === `profile-panel-${tab}`));
      history.replaceState(null, "", `#${tab}`);
    });
  });

  qs("#edit-profile")?.addEventListener("click", openEditProfile);
  qs("#profile-avatar-edit")?.addEventListener("click", () => qs("#avatar-file")?.click());
  qs("#change-avatar")?.addEventListener("click", () => qs("#avatar-file")?.click());
  qs("#avatar-file")?.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const button = qs("#profile-avatar-edit");
    button?.classList.add("uploading");
    toast(file.type === "image/gif" ? "Enviando GIF..." : "Enviando foto...", "info", "Upload");
    try {
      await uploadAvatar(file);
      toast("Foto atualizada.", "success", "Perfil");
    } catch (error) {
      toast(error.message, "error", "Upload");
    } finally {
      button?.classList.remove("uploading");
      event.target.value = "";
    }
  });

  qs("#clear-history")?.addEventListener("click", () => {
    store.clearHistory();
    window.dispatchEvent(new CustomEvent("pk:history-changed"));
    toast("Histórico limpo.", "success");
  });

  qs("#profile-logout")?.addEventListener("click", async () => {
    await authLogout();
    toast("Você saiu da conta.", "info");
  });

  qs("#setting-autoSkip")?.addEventListener("change", (event) => {
    store.saveSettings({ autoSkipIntro: event.target.checked });
    toast("Preferência salva.", "success");
  });
  qs("#setting-notifications")?.addEventListener("change", (event) => {
    store.saveSettings({ notifications: event.target.checked });
    toast("Preferência salva.", "success");
  });
}

function openEditProfile() {
  const user = store.getUser();
  if (!user.authed) { toast("Entre na sua conta para editar o perfil.", "info"); return; }
  const content = `
    <button class="modal-close" data-close-modal type="button" aria-label="Fechar"><i class="fa-solid fa-xmark"></i></button>
    <div class="auth-head"><div class="brand-mark">w00</div><h2>Editar perfil</h2><p>Seus dados ficam sincronizados na sua conta.</p></div>
    <form class="auth-body" id="edit-profile-form">
      <div class="field"><label for="edit-name">Nome</label><input class="input" id="edit-name" name="name" required maxlength="40" value="${escapeHTML(user.name)}"></div>
      <div class="field"><label for="edit-email">E-mail</label><input class="input" id="edit-email" type="email" value="${escapeHTML(user.email)}" disabled></div>
      <div class="field"><label for="edit-bio">Bio</label><textarea class="textarea" id="edit-bio" name="bio" maxlength="140">${escapeHTML(user.bio)}</textarea></div>
      <div class="field"><label for="edit-genre">Gênero favorito</label><select class="select" id="edit-genre" name="favoriteGenre">${CONFIG.genres.map((genre) => `<option value="${genre.name}" ${user.favoriteGenre === genre.name ? "selected" : ""}>${genre.name}</option>`).join("")}</select></div>
      <button class="btn btn-primary btn-block" type="submit"><i class="fa-solid fa-check"></i>Salvar alterações</button>
    </form>`;

  openModal(content, {
    className: "modal-sm",
    label: "Editar perfil",
    onMount: () => {
      qs("#edit-profile-form")?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const patch = {
          name: String(data.get("name") || "").trim() || DEFAULT_USER.name,
          bio: String(data.get("bio") || "").trim() || "Explorando o catálogo.",
          favoriteGenre: data.get("favoriteGenre")
        };
        const submit = event.currentTarget.querySelector("button[type=submit]");
        submit.disabled = true;
        try {
          if (user.cloud) {
            await updateProfile(patch);
          } else {
            store.saveUser(patch);
            window.dispatchEvent(new CustomEvent("pk:auth-changed"));
          }
          closeModal();
          toast("Perfil atualizado.", "success", "Tudo certo");
        } catch (error) {
          toast(error.message, "error");
          submit.disabled = false;
        }
      });
    }
  });
}
