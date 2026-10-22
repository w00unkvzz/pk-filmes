// Friends: community search, requests and local friend management.
import { COMMUNITY_USERS } from "../data.js";
import * as store from "../store.js";
import { qs, qsa, avatar, escapeHTML, toast } from "../ui.js";

export function renderAmigos() {
  const friends = store.getFriends();
  const requests = store.getFriendRequests();
  const friendIds = new Set(friends.map((friend) => friend.id));

  qs("#page-content").innerHTML = `
    <div class="friends-hero">
      <div class="section-kicker"><i class="fa-solid fa-user-group"></i> Comunidade</div>
      <h1>Assista com quem importa.</h1>
      <p>Adicione amigos, aceite pedidos e combine sessões no PK Party. Tudo fica neste navegador.</p>
    </div>

    <div class="friends-layout">
      <div>
        <div class="panel">
          <div class="panel-head"><h3>Encontrar pessoas</h3><span class="badge badge-soft">${COMMUNITY_USERS.length} perfis demo</span></div>
          <div class="panel-body">
            <div class="friend-search"><i class="fa-solid fa-magnifying-glass"></i><input class="input" id="friend-search" type="search" placeholder="Buscar por nome ou e-mail..." aria-label="Buscar pessoas"></div>
            <div class="community-grid" id="community-grid" style="margin-top:14px">
              ${COMMUNITY_USERS.map((user) => `<div class="user-card" data-user-name="${escapeHTML(user.name.toLowerCase())}" data-user-email="${escapeHTML((user.email || "").toLowerCase())}">
                ${avatar(user, "md")}
                <div class="grow"><strong>${escapeHTML(user.name)}</strong><span>${user.mutual ? `${user.mutual} amigos em comum` : user.email}</span></div>
                ${friendIds.has(user.id) ? `<span class="badge badge-soft"><i class="fa-solid fa-check"></i> Amigo</span>` : `<button class="btn btn-sm btn-ghost" data-add-friend="${escapeHTML(user.id)}" type="button"><i class="fa-solid fa-user-plus"></i>Adicionar</button>`}
              </div>`).join("")}
            </div>
            <div id="community-empty" class="empty-state hidden" style="margin-top:14px"><i class="fa-solid fa-magnifying-glass"></i><h3>Ninguém encontrado</h3><p>Tente outro nome ou e-mail.</p></div>
          </div>
        </div>

        <div class="panel" style="margin-top:14px">
          <div class="panel-head"><h3>Meus amigos</h3><span class="badge badge-soft">${friends.length}</span></div>
          <div class="panel-body">
            ${friends.length ? `<div class="my-friends-list">${friends.map((friend) => `<div class="friend-mini">${avatar(friend, "md")}<div class="grow"><strong>${escapeHTML(friend.name)}</strong><span>${escapeHTML(friend.email)} · desde ${escapeHTML(friend.since || "2025")}</span></div><span class="status-dot ${friend.status === "offline" ? "off" : ""}"></span><button class="btn-icon" data-remove-friend="${escapeHTML(friend.id)}" type="button" title="Remover amigo" aria-label="Remover amigo"><i class="fa-solid fa-user-minus"></i></button></div>`).join("")}</div>` : `<div class="empty-state"><i class="fa-solid fa-user-group"></i><h3>Sua lista está vazia</h3><p>Adicione alguém da comunidade para começar.</p></div>`}
          </div>
        </div>
      </div>

      <aside class="profile-side">
        <div class="panel">
          <div class="panel-head"><h3>Pedidos pendentes</h3><span class="badge ${requests.length ? "badge-live" : "badge-soft"}">${requests.length}</span></div>
          <div class="panel-body">
            ${requests.length ? requests.map((request) => `<div class="request-card">${avatar(request, "md")}<div class="grow"><strong>${escapeHTML(request.name)}</strong><span>${request.mutual ? `${request.mutual} amigos em comum` : escapeHTML(request.email)}</span></div><div class="request-actions"><button class="yes" data-accept-request="${escapeHTML(request.id)}" type="button" title="Aceitar" aria-label="Aceitar"><i class="fa-solid fa-check"></i></button><button class="no" data-reject-request="${escapeHTML(request.id)}" type="button" title="Recusar" aria-label="Recusar"><i class="fa-solid fa-xmark"></i></button></div></div>`).join("") : `<p class="tiny muted">Nenhum pedido no momento. Quando alguém quiser conectar, aparece aqui.</p>`}
          </div>
        </div>

        <div class="panel panel-pad">
          <div class="section-kicker"><i class="fa-solid fa-link"></i> Convite</div>
          <h3 style="margin-top:6px">Chame alguém para a sessão.</h3>
          <p class="tiny" style="margin-top:6px">Copie o link da plataforma e combine um horário no PK Party.</p>
          <button class="btn btn-ghost btn-block btn-sm" id="copy-invite" type="button" style="margin-top:12px"><i class="fa-solid fa-copy"></i>Copiar convite</button>
        </div>

        <div class="panel panel-pad">
          <div class="section-kicker"><i class="fa-solid fa-shield-halved"></i> Privacidade</div>
          <p class="tiny" style="margin-top:7px">Amigos e pedidos são simulados localmente. Nenhum perfil é enviado para a internet.</p>
        </div>
      </aside>
    </div>`;

  mountAmigos();
}

function mountAmigos() {
  const input = qs("#friend-search");
  input?.addEventListener("input", () => {
    const term = input.value.trim().toLowerCase();
    let visible = 0;
    qsa("#community-grid .user-card").forEach((card) => {
      const match = `${card.dataset.userName} ${card.dataset.userEmail}`.includes(term);
      card.classList.toggle("hidden", !match);
      if (match) visible += 1;
    });
    qs("#community-empty")?.classList.toggle("hidden", visible > 0);
  });

  qsa("[data-add-friend]").forEach((button) => {
    button.addEventListener("click", () => {
      const user = COMMUNITY_USERS.find((entry) => entry.id === button.dataset.addFriend);
      if (!user) return;
      const result = store.addFriend(user);
      if (result.added) {
        toast(`${user.name} entrou na sua lista de amigos.`, "success", "Novo amigo");
        renderAmigos();
      } else {
        toast("Você já é amigo desta pessoa.", "info");
      }
    });
  });

  qsa("[data-accept-request]").forEach((button) => {
    button.addEventListener("click", () => {
      const request = store.getFriendRequests().find((entry) => entry.id === button.dataset.acceptRequest);
      store.acceptRequest(button.dataset.acceptRequest);
      toast(`${request?.name || "Pedido"} agora é seu amigo.`, "success", "Pedido aceito");
      renderAmigos();
    });
  });

  qsa("[data-reject-request]").forEach((button) => {
    button.addEventListener("click", () => {
      store.rejectRequest(button.dataset.rejectRequest);
      toast("Pedido recusado.", "info");
      renderAmigos();
    });
  });

  qsa("[data-remove-friend]").forEach((button) => {
    button.addEventListener("click", () => {
      store.removeFriend(button.dataset.removeFriend);
      toast("Amigo removido da lista.", "info");
      renderAmigos();
    });
  });

  qs("#copy-invite")?.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(location.href.replace(/amigos\.html.*$/, "index.html"));
      toast("Convite copiado.", "success");
    } catch {
      toast("Não foi possível copiar. Copie a URL do navegador.", "error");
    }
  });
}
