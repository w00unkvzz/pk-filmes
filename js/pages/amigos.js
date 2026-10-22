// Friends: real Supabase directory, requests and friendships.
import * as store from "../store.js";
import { getClient } from "../supabase.js";
import {
  fetchFriendsState,
  searchProfiles,
  sendFriendRequest,
  respondFriendRequest,
  removeFriendship,
  mapFriend
} from "../social.js";
import { qs, qsa, avatar, escapeHTML, toast, emptyState } from "../ui.js";

let channel = null;
let searchTimer = null;

function unsubscribeFriends() {
  if (!channel) return;
  try { getClient()?.removeChannel(channel); } catch {}
  channel = null;
}

function requireLogin() {
  const user = store.getUser();
  if (!user.cloud) {
    unsubscribeFriends();
    qs("#page-content").innerHTML = `
      <div class="friends-hero">
        <div class="section-kicker"><i class="fa-solid fa-user-group"></i> Comunidade</div>
        <h1>Assista com quem importa.</h1>
        <p>Entre na sua conta para encontrar amigos, enviar pedidos e criar sessões juntas.</p>
        <button class="btn btn-primary" data-auth-open type="button" style="margin-top:18px"><i class="fa-solid fa-right-to-bracket"></i>Entrar ou criar conta</button>
      </div>`;
    return false;
  }
  return true;
}

function personRow(person, actions = "") {
  return `<div class="user-card">
    ${avatar(person, "md")}
    <div class="grow"><strong>${escapeHTML(person.name)}</strong><span>${escapeHTML(person.favoriteGenre || person.favorite_genre || "w00filmes")}</span></div>
    ${actions}
  </div>`;
}

function friendRow(friend) {
  return `<div class="friend-mini">${avatar(friend, "md")}
    <div class="grow"><strong>${escapeHTML(friend.name)}</strong><span>amigo desde ${escapeHTML(friend.since || "hoje")}</span></div>
    <span class="status-dot"></span>
    <button class="btn-icon" data-remove-friend="${escapeHTML(friend.friendshipId)}" type="button" title="Remover amigo" aria-label="Remover amigo"><i class="fa-solid fa-user-minus"></i></button>
  </div>`;
}

function requestRow(request) {
  return `<div class="request-card">${avatar(request, "md")}
    <div class="grow"><strong>${escapeHTML(request.name)}</strong><span>quer ser seu amigo</span></div>
    <div class="request-actions">
      <button class="yes" data-accept-request="${escapeHTML(request.friendshipId)}" type="button" title="Aceitar" aria-label="Aceitar"><i class="fa-solid fa-check"></i></button>
      <button class="no" data-reject-request="${escapeHTML(request.friendshipId)}" type="button" title="Recusar" aria-label="Recusar"><i class="fa-solid fa-xmark"></i></button>
    </div>
  </div>`;
}

function resultRow(result) {
  let action = `<button class="btn btn-sm btn-primary" data-add-friend="${escapeHTML(result.id)}" type="button"><i class="fa-solid fa-user-plus"></i>Adicionar</button>`;
  if (result.relation === "friend") action = `<span class="badge badge-soft"><i class="fa-solid fa-check"></i> Amigo</span>`;
  else if (result.relation === "sent") action = `<span class="badge badge-soft"><i class="fa-solid fa-clock"></i> Enviado</span>`;
  else if (result.relation === "received") action = `<button class="btn btn-sm btn-ghost" data-accept-request="${escapeHTML(result.friendship_id)}" type="button">Aceitar</button>`;
  return personRow({ ...result, favoriteGenre: result.favorite_genre }, action);
}

export async function renderAmigos() {
  clearTimeout(searchTimer);
  if (!requireLogin()) return;
  qs("#page-content").innerHTML = `<div class="page-section"><div class="empty-state"><i class="fa-solid fa-spinner fa-spin"></i><h3>Carregando sua comunidade…</h3></div></div>`;
  try {
    const rows = await fetchFriendsState();
    const friends = rows.filter((row) => row.status === "accepted").map(mapFriend);
    const requests = rows.filter((row) => row.status === "pending" && row.direction === "received").map(mapFriend);
    store.setSocialCache(friends, requests);

    qs("#page-content").innerHTML = `
      <div class="friends-hero">
        <div class="section-kicker"><i class="fa-solid fa-user-group"></i> Comunidade w00filmes</div>
        <h1>Assista com quem importa.</h1>
        <p>Encontre pessoas, envie pedidos e combine uma sessão no w00 Party. Tudo sincronizado na sua conta.</p>
      </div>

      <div class="friends-layout">
        <div>
          <div class="panel">
            <div class="panel-head"><h3>Encontrar pessoas</h3><span class="badge badge-soft" id="friend-count-badge">${friends.length} amigos</span></div>
            <div class="panel-body">
              <div class="friend-search"><i class="fa-solid fa-magnifying-glass"></i><input class="input" id="friend-search" type="search" placeholder="Buscar por nome ou e-mail..." aria-label="Buscar pessoas" autocomplete="off"></div>
              <div class="community-grid" id="community-grid" style="margin-top:14px">
                <p class="tiny muted" id="search-hint">Digite um nome ou e-mail para buscar pessoas.</p>
              </div>
            </div>
          </div>

          <div class="panel" style="margin-top:14px">
            <div class="panel-head"><h3>Meus amigos</h3><span class="badge badge-soft">${friends.length}</span></div>
            <div class="panel-body">
              ${friends.length ? `<div class="my-friends-list">${friends.map(friendRow).join("")}</div>` : emptyState("fa-user-group", "Sua lista está vazia", "Busque alguém pelo nome ou e-mail e envie um pedido.")}
            </div>
          </div>
        </div>

        <aside class="profile-side">
          <div class="panel">
            <div class="panel-head"><h3>Pedidos recebidos</h3><span class="badge ${requests.length ? "badge-live" : "badge-soft"}">${requests.length}</span></div>
            <div class="panel-body">
              ${requests.length ? requests.map(requestRow).join("") : `<p class="tiny muted">Nenhum pedido pendente.</p>`}
            </div>
          </div>

          <div class="panel panel-pad">
            <div class="section-kicker"><i class="fa-solid fa-tower-broadcast"></i> w00 Party</div>
            <h3 style="margin-top:6px">Convide para uma sala.</h3>
            <p class="tiny" style="margin-top:6px">Dentro de uma sala, o anfitrião pode convidar os amigos direto pela lista.</p>
            <a class="btn btn-ghost btn-block btn-sm" href="pkparty.html" style="margin-top:12px"><i class="fa-solid fa-arrow-right"></i>Ir para o w00 Party</a>
          </div>
        </aside>
      </div>`;

    mountAmigos();
    subscribeFriends();
  } catch (error) {
    qs("#page-content").innerHTML = `<div class="page-section">${emptyState("fa-triangle-exclamation", "Não foi possível carregar amigos", error.message)}</div>`;
  }
}

function bindAction(button) {
  const add = button.dataset.addFriend;
  const accept = button.dataset.acceptRequest;
  const reject = button.dataset.rejectRequest;
  const remove = button.dataset.removeFriend;

  if (add) {
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        await sendFriendRequest(add);
        toast("Pedido enviado.", "success", "Amizade");
        await renderAmigos();
      } catch (error) {
        toast(error.message, "error");
        button.disabled = false;
      }
    });
  }
  if (accept) {
    button.addEventListener("click", async () => {
      try {
        await respondFriendRequest(accept, true);
        toast("Pedido aceito.", "success", "Novo amigo");
        await renderAmigos();
      } catch (error) { toast(error.message, "error"); }
    });
  }
  if (reject) {
    button.addEventListener("click", async () => {
      try {
        await respondFriendRequest(reject, false);
        toast("Pedido recusado.", "info");
        await renderAmigos();
      } catch (error) { toast(error.message, "error"); }
    });
  }
  if (remove) {
    button.addEventListener("click", async () => {
      try {
        await removeFriendship(remove);
        toast("Amizade removida.", "info");
        await renderAmigos();
      } catch (error) { toast(error.message, "error"); }
    });
  }
}

function mountAmigos() {
  qsa("[data-add-friend], [data-accept-request], [data-reject-request], [data-remove-friend]").forEach(bindAction);

  const input = qs("#friend-search");
  input?.addEventListener("input", () => {
    clearTimeout(searchTimer);
    const term = input.value.trim();
    if (!term) {
      qs("#community-grid").innerHTML = `<p class="tiny muted" id="search-hint">Digite um nome ou e-mail para buscar pessoas.</p>`;
      return;
    }
    searchTimer = setTimeout(async () => {
      try {
        const results = await searchProfiles(term);
        const grid = qs("#community-grid");
        if (!grid) return;
        grid.innerHTML = results.length
          ? results.map(resultRow).join("")
          : `<div class="empty-state"><i class="fa-solid fa-magnifying-glass"></i><h3>Ninguém encontrado</h3><p>Tente outro nome ou e-mail.</p></div>`;
        grid.querySelectorAll("[data-add-friend], [data-accept-request]").forEach(bindAction);
      } catch (error) {
        toast(error.message, "error");
      }
    }, 280);
  });
}

function subscribeFriends() {
  const user = store.getUser();
  if (!user.cloud || channel) return;
  const sb = getClient();
  channel = sb.channel(`friends:${user.id}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "friendships" }, () => {
      renderAmigos();
    })
    .subscribe();
  window.addEventListener("beforeunload", () => {
    unsubscribeFriends();
  }, { once: true });
}
