// Profile: local identity, watchlist, history, friends, achievements, pet and settings.
import { CONFIG } from "../config.js";
import { byId, DEFAULT_USER } from "../data.js";
import * as store from "../store.js";
import { qs, qsa, avatar, petSVG, posterCard, emptyState, formatDuration, formatDate, escapeHTML, openModal, closeModal, toast, refreshShell } from "../ui.js";

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

function achievements(user, watchlist, history, friends, pet) {
  return [
    { icon: "fa-seedling", title: "Primeiro play", text: "Assista a um título", unlocked: history.length > 0 },
    { icon: "fa-bookmark", title: "Colecionador", text: "3 títulos na lista", unlocked: watchlist.length >= 3 },
    { icon: "fa-user-group", title: "Conectado", text: "Tenha um amigo", unlocked: friends.length > 0 },
    { icon: "fa-fire", title: "Maratonista", text: "5 títulos iniciados", unlocked: history.length >= 5 },
    { icon: "fa-crown", title: "VIP demo", text: "Ative um plano", unlocked: user.planId !== "free" },
    { icon: "fa-paw", title: "Cuidador", text: "Faísca no nível 3", unlocked: pet.level >= 3 }
  ];
}

export function renderPerfil() {
  const user = store.getUser();
  const watchlist = store.getWatchlist().map(byId).filter(Boolean);
  const history = store.getHistory();
  const friends = store.getFriends();
  const pet = store.getPet();
  const hours = Math.round(history.reduce((total, entry) => total + (entry.progress || 0), 0) / 3600);
  const tab = currentTab();
  const plan = CONFIG.plans.find((entry) => entry.id === user.planId) || CONFIG.plans[0];
  const badgeList = achievements(user, watchlist, history, friends, pet);
  const coverColor = user.color || "#6a5acd";

  qs("#page-content").innerHTML = `
    <section class="profile-cover" style="background:linear-gradient(130deg, ${escapeHTML(coverColor)}, #4c1d95 50%, #831843)">
      <div style="position:absolute;right:8%;top:14%;width:170px;height:170px;border-radius:50%;border:1px solid rgba(255,255,255,.2);box-shadow:0 0 0 22px rgba(255,255,255,.04),0 0 0 44px rgba(255,255,255,.025)"></div>
    </section>
    <div class="profile-head">
      <div class="profile-avatar-wrap">
        ${avatar(user, "xl")}
        <button class="edit-dot" id="profile-avatar-edit" type="button" aria-label="Editar perfil"><i class="fa-solid fa-pen"></i></button>
      </div>
      <div class="profile-identity">
        <div class="row" style="gap:9px"><h1>${escapeHTML(user.name)}</h1><span class="badge ${user.planId !== "free" ? "badge-vip" : "badge-soft"}"><i class="fa-solid fa-${user.planId !== "free" ? "crown" : "user"}"></i>${escapeHTML(user.plan)}</span></div>
        <div class="meta"><span>${escapeHTML(user.email)}</span><span class="dot"></span><span>Desde ${formatDate(user.joined)}</span><span class="dot"></span><span>${escapeHTML(user.bio)}</span></div>
      </div>
      <div class="profile-actions">
        ${user.authed ? `<button class="btn btn-ghost" id="edit-profile" type="button"><i class="fa-solid fa-pen"></i>Editar perfil</button>` : `<button class="btn btn-primary" data-auth-open type="button"><i class="fa-solid fa-right-to-bracket"></i>Entrar</button>`}
        <a class="btn btn-outline" href="vip.html"><i class="fa-solid fa-crown"></i>Planos</a>
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
              <div class="row-between" style="margin-bottom:12px"><span class="tiny muted">${history.length} título${history.length === 1 ? "" : "s"} no histórico local</span>${history.length ? '<button class="section-link" id="clear-history" type="button">Limpar histórico <i class="fa-solid fa-trash-can"></i></button>' : ""}</div>
              ${history.length ? `<div class="continue-grid">${history.map(historyItem).join("")}</div>` : emptyState("fa-clock-rotate-left", "Nada assistido ainda", "Quando você abrir um player, o progresso aparece aqui automaticamente.")}
            </div>
            <div class="profile-tab-panel ${tab === "amigos" ? "active" : ""}" id="profile-panel-amigos">
              ${friends.length ? `<div class="my-friends-list">${friends.map((friend) => `<div class="friend-mini">${avatar(friend, "sm")}<div class="grow"><strong>${escapeHTML(friend.name)}</strong><span>${escapeHTML(friend.email)}</span></div><span class="status-dot ${friend.status === "offline" ? "off" : ""}"></span></div>`).join("")}</div><a class="btn btn-ghost btn-sm" href="amigos.html" style="margin-top:13px"><i class="fa-solid fa-user-group"></i>Gerenciar amigos</a>` : emptyState("fa-user-group", "Conecte-se com alguém", "Adicione amigos para compartilhar sessões e salas do PK Party.")}
            </div>
            <div class="profile-tab-panel ${tab === "conquistas" ? "active" : ""}" id="profile-panel-conquistas">
              <div class="badge-grid">${badgeList.map((badge) => `<div class="achievement ${badge.unlocked ? "" : "locked"}"><i class="fa-solid ${badge.icon}"></i><strong>${escapeHTML(badge.title)}</strong><span>${escapeHTML(badge.text)}</span></div>`).join("")}</div>
            </div>
          </div>
        </div>
      </div>

      <aside class="profile-side">
        <a class="profile-pet-card" href="mascote.html">
          <div class="pet-mini small">${petSVG("profile-pet")}</div>
          <div><h3>${escapeHTML(pet.name)} · nível ${pet.level}</h3><p>${pet.happiness}% de felicidade</p></div>
          <i class="fa-solid fa-chevron-right muted"></i>
        </a>

        <div class="profile-panel">
          <div class="panel-head"><h3>Seu plano</h3><span class="badge ${user.planId !== "free" ? "badge-vip" : "badge-soft"}">${escapeHTML(plan.name)}</span></div>
          <div class="panel-body">
            <div class="row-between"><div><strong style="font-size:17px">${escapeHTML(plan.price)}</strong><span class="tiny muted" style="display:block">${escapeHTML(plan.period)}</span></div><a class="btn btn-sm ${user.planId === "free" ? "btn-primary" : "btn-ghost"}" href="vip.html">${user.planId === "free" ? "Conhecer VIP" : "Gerenciar"}</a></div>
            <div class="divider" style="margin:14px 0"></div>
            <ul class="stack" style="gap:7px">${plan.features.slice(0, 3).map((feature) => `<li class="tiny ${feature.on ? "" : "muted"}"><i class="fa-solid ${feature.on ? "fa-check" : "fa-xmark"}" style="color:${feature.on ? "var(--green)" : "var(--muted-2)"};margin-right:6px"></i>${escapeHTML(feature.text)}</li>`).join("")}</ul>
          </div>
        </div>

        <div class="profile-panel">
          <div class="panel-head"><h3>Preferências</h3><i class="fa-solid fa-sliders muted"></i></div>
          <div class="panel-body" style="display:flex;flex-direction:column;gap:12px">
            <label class="row-between tiny" style="gap:12px"><span>Pular abertura automaticamente</span><input type="checkbox" id="setting-autoSkip" ${store.getSettings().autoSkipIntro ? "checked" : ""}></label>
            <label class="row-between tiny" style="gap:12px"><span>Notificações de amigos</span><input type="checkbox" id="setting-notifications" ${store.getSettings().notifications ? "checked" : ""}></label>
            ${user.authed ? `<button class="btn btn-danger btn-sm" id="profile-logout" type="button" style="margin-top:4px"><i class="fa-solid fa-right-from-bracket"></i>Sair da conta</button>` : ""}
          </div>
        </div>

        <div class="panel panel-pad">
          <div class="section-kicker"><i class="fa-solid fa-shield-halved"></i> Sobre este perfil</div>
          <p class="tiny" style="margin-top:7px">Tudo é salvo no <strong>localStorage</strong> deste navegador. Nenhuma conta é enviada para servidores externos.</p>
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
  qs("#profile-avatar-edit")?.addEventListener("click", openEditProfile);

  qs("#clear-history")?.addEventListener("click", () => {
    store.clearHistory();
    renderPerfil();
    toast("Histórico limpo.", "success");
  });

  qs("#profile-logout")?.addEventListener("click", () => {
    store.logout();
    refreshShell();
    renderPerfil();
    toast("Você saiu da conta demo.", "info");
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
  const colors = CONFIG.defaultAvatarColors;
  const content = `
    <button class="modal-close" data-close-modal type="button" aria-label="Fechar"><i class="fa-solid fa-xmark"></i></button>
    <div class="auth-head"><div class="brand-mark">${escapeHTML(CONFIG.brandShort)}</div><h2>Editar perfil</h2><p>As mudanças ficam salvas neste navegador.</p></div>
    <form class="auth-body" id="edit-profile-form">
      <div class="field"><label for="edit-name">Nome</label><input class="input" id="edit-name" name="name" required maxlength="28" value="${escapeHTML(user.name)}"></div>
      <div class="field"><label for="edit-email">E-mail</label><input class="input" id="edit-email" name="email" type="email" value="${escapeHTML(user.email)}"></div>
      <div class="field"><label for="edit-bio">Bio</label><textarea class="textarea" id="edit-bio" name="bio" maxlength="120">${escapeHTML(user.bio)}</textarea></div>
      <div class="field"><label for="edit-genre">Gênero favorito</label><select class="select" id="edit-genre" name="favoriteGenre">${CONFIG.genres.map((genre) => `<option value="${genre.name}" ${user.favoriteGenre === genre.name ? "selected" : ""}>${genre.name}</option>`).join("")}</select></div>
      <div class="field"><label>Cor do avatar</label><div class="row wrap" style="gap:8px">${colors.map((color) => `<label style="cursor:pointer"><input type="radio" name="color" value="${color}" ${user.color === color ? "checked" : ""} style="position:absolute;opacity:0"><span class="avatar sm" style="background:${color};box-shadow:${user.color === color ? "0 0 0 2px #fff" : "none"}"></span></label>`).join("")}</div></div>
      <button class="btn btn-primary btn-block" type="submit"><i class="fa-solid fa-check"></i>Salvar alterações</button>
    </form>`;

  openModal(content, { className: "modal-sm", label: "Editar perfil", onMount: () => {
    qs("#edit-profile-form")?.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      store.saveUser({
        name: String(data.get("name") || "").trim() || DEFAULT_USER.name,
        email: String(data.get("email") || "").trim() || DEFAULT_USER.email,
        bio: String(data.get("bio") || "").trim() || "Explorando o catálogo de demonstração.",
        favoriteGenre: data.get("favoriteGenre"),
        color: data.get("color") || user.color,
        authed: true
      });
      closeModal();
      refreshShell();
      renderPerfil();
      toast("Perfil atualizado.", "success", "Tudo certo");
    });
    qsa('input[name="color"]').forEach((input) => input.addEventListener("change", () => {
      qsa('input[name="color"]').forEach((entry) => {
        entry.nextElementSibling.style.boxShadow = entry.checked ? "0 0 0 2px #fff" : "none";
      });
    }));
  }});
}
