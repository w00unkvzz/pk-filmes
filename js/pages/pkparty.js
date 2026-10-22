// w00 Party: Supabase-backed watch party with realtime chat and host-only
// playback control. The host broadcasts play/pause/seek plus a heartbeat;
// guests apply it immediately and self-correct drift automatically.
import { CATALOG, byId } from "../data.js";
import * as store from "../store.js";
import { getClient } from "../supabase.js";
import {
  listRooms,
  createRoom,
  joinRoom,
  leaveRoom,
  getRoom,
  roomMembers,
  updateRoomMovie,
  savePlaybackState,
  loadMessages,
  sendMessage,
  inviteFriendToRoom,
  myRoomInvites,
  respondRoomInvite,
  fetchFriendsState,
  mapFriend
} from "../social.js";
import {
  qs,
  qsa,
  avatar,
  escapeHTML,
  emptyState,
  openModal,
  closeModal,
  toast,
  formatDuration
} from "../ui.js";

let realtimeChannel = null;
let lobbyChannel = null;
let heartbeat = null;
let chatRows = [];
let members = [];
let room = null;
let movie = null;
let isHost = false;
let user = null;
let applyingRemote = false;

const DIRECT_VIDEO = /\.(mp4|webm|ogv|mov|m3u8)(\?|#|$)/i;

function safePlay(video) {
  try {
    const started = video.play();
    if (started && typeof started.catch === "function") started.catch(() => {});
  } catch {}
}

function isDirectVideo(url = "") {
  return DIRECT_VIDEO.test(String(url));
}

function uuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function movieForRoom(nextRoom) {
  if (!nextRoom?.movie_id) return null;
  const catalogItem = byId(nextRoom.movie_id);
  if (catalogItem) return catalogItem;
  if (/^https?:\/\//i.test(nextRoom.movie_id)) {
    return {
      id: nextRoom.movie_id,
      title: "Sessão privada",
      stream: nextRoom.movie_id,
      player: nextRoom.movie_id,
      poster: "",
      age: "L",
      duration: 0,
      synopsis: "Vídeo enviado pelo anfitrião.",
      genres: []
    };
  }
  return null;
}

function timeAgo(timestamp) {
  const diff = Math.max(0, Date.now() - new Date(timestamp).getTime());
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "agora";
  if (minutes < 60) return `há ${minutes} min`;
  return `há ${Math.floor(minutes / 60)}h`;
}

function posterMarkup(item, className = "room-poster") {
  if (item?.poster) return `<div class="${className}"><img src="${escapeHTML(item.poster)}" alt="${escapeHTML(item.title)}" loading="lazy"></div>`;
  const colors = item?.colors || ["#1e1b4b", "#6366f1"];
  return `<div class="${className}" style="--c1:${colors[0]};--c2:${colors[1]}"><span>${escapeHTML(item?.title || "w00")}</span></div>`;
}

function roomCard(item) {
  const itemMovie = movieForRoom({ movie_id: item.movie_id });
  return `<article class="room-card">
    ${posterMarkup(itemMovie)}
    <div class="room-info">
      <div class="row-between"><h3>${escapeHTML(item.name)}</h3>${item.is_private ? '<i class="fa-solid fa-lock tiny muted"></i>' : '<span class="room-live">ao vivo</span>'}</div>
      <p>${escapeHTML(itemMovie?.title || "Sessão privada")}</p>
      <div class="room-meta">
        ${avatar({ name: item.host_name, avatar_url: item.host_avatar }, "xs")}
        <span>${escapeHTML(item.host_name)}</span><span>·</span><span>${item.member_count} na sala</span><span>·</span><span>${timeAgo(item.created_at)}</span>
      </div>
      <div class="row-between">
        <span class="tiny muted">${item.is_member ? "Você participa" : "Anfitrião convida"}</span>
        <a class="btn btn-sm btn-primary" href="pkparty.html?sala=${encodeURIComponent(item.code)}">${item.is_member ? "Entrar" : "Participar"} <i class="fa-solid fa-arrow-right"></i></a>
      </div>
    </div>
  </article>`;
}

function cleanupParty() {
  clearInterval(heartbeat);
  heartbeat = null;
  try {
    const sb = getClient();
    if (realtimeChannel) sb?.removeChannel(realtimeChannel);
    if (lobbyChannel) sb?.removeChannel(lobbyChannel);
  } catch {}
  realtimeChannel = null;
  lobbyChannel = null;
  chatRows = [];
  members = [];
  room = null;
  movie = null;
  isHost = false;
  applyingRemote = false;
}

export async function renderPkparty() {
  cleanupParty();
  user = store.getUser();
  const code = new URLSearchParams(location.search).get("sala");
  if (!user.cloud) {
    qs("#page-content").innerHTML = `<div class="page-section">${emptyState("fa-tower-broadcast", "Entre para assistir junto", "Entre para criar salas, conversar e assistir junto.")}<div class="row" style="justify-content:center;margin-top:14px"><button class="btn btn-primary" data-auth-open type="button"><i class="fa-solid fa-right-to-bracket"></i>Entrar ou criar conta</button></div></div>`;
    return;
  }
  if (code) {
    qs("#page-content").innerHTML = `<div class="page-section"><div class="empty-state"><i class="fa-solid fa-spinner fa-spin"></i><h3>Entrando na sala…</h3></div></div>`;
    await openRoom(code);
    return;
  }
  await renderLobby();
}

async function renderLobby() {
  try {
    const [rooms, invites] = await Promise.all([listRooms(), myRoomInvites()]);
    qs("#page-content").innerHTML = `
      <section class="party-hero">
        <div class="party-hero-inner">
          <div>
            <div class="section-kicker"><i class="fa-solid fa-tower-broadcast"></i> Sessão sincronizada</div>
            <h1>w00 Party</h1>
            <p>Crie uma sala, convide amigos e assista junto. O anfitrião controla play, pause e avanço — todos recebem em tempo real, sem botão de sincronizar.</p>
            <div class="row wrap" style="margin-top:18px">
              <button class="btn btn-primary" id="create-room" type="button"><i class="fa-solid fa-plus"></i>Criar sala</button>
              <span class="badge badge-soft"><i class="fa-solid fa-users"></i> ${rooms.length} salas</span>
            </div>
          </div>
          <form class="party-code-box" id="join-form">
            <input id="join-code" placeholder="CÓDIGO DA SALA" maxlength="12" autocomplete="off" aria-label="Código da sala">
            <button class="btn btn-light btn-sm" type="submit"><i class="fa-solid fa-right-to-bracket"></i>Entrar</button>
          </form>
        </div>
      </section>

      ${invites.length ? `<section class="page-section"><div class="section-head"><div><div class="section-kicker"><i class="fa-solid fa-envelope-open-text"></i> Convites</div><h2>Chamaram você.</h2></div></div><div class="invite-grid">${invites.map((invite) => `
        <div class="panel panel-pad invite-card">
          ${avatar({ name: invite.host_name, avatar_url: invite.host_avatar }, "md")}
          <div class="grow"><strong>${escapeHTML(invite.room_name)}</strong><span class="tiny muted">${escapeHTML(invite.host_name)} convidou você · ${timeAgo(invite.created_at)}</span></div>
          <button class="btn btn-sm btn-primary" data-accept-invite="${escapeHTML(invite.id)}" data-invite-code="${escapeHTML(invite.room_code)}" type="button">Entrar</button>
          <button class="btn-icon" data-decline-invite="${escapeHTML(invite.id)}" type="button" aria-label="Recusar convite"><i class="fa-solid fa-xmark"></i></button>
        </div>`).join("")}</div></section>` : ""}

      <section class="page-section">
        <div class="section-head"><div><div class="section-kicker"><i class="fa-solid fa-circle-play"></i> Ao vivo agora</div><h2>Salas</h2></div><span class="badge badge-live"><i class="fa-solid fa-circle"></i> ao vivo</span></div>
        <div class="rooms-grid">${rooms.length ? rooms.map(roomCard).join("") : emptyState("fa-tower-broadcast", "Nenhuma sala ativa", "Crie a primeira e chame seus amigos.")}</div>
      </section>

`;

    mountLobby();
    subscribeLobby();
  } catch (error) {
    qs("#page-content").innerHTML = `<div class="page-section">${emptyState("fa-triangle-exclamation", "Não foi possível carregar o w00 Party", error.message)}</div>`;
  }
}

function subscribeLobby() {
  if (lobbyChannel) return;
  const sb = getClient();
  lobbyChannel = sb.channel(`party-lobby:${user.id}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "room_invites", filter: `invitee=eq.${user.id}` }, () => renderLobby())
    .subscribe();
}

function mountLobby() {
  qs("#create-room")?.addEventListener("click", openCreateRoom);
  qs("#join-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const code = qs("#join-code").value.trim().toUpperCase();
    if (!code) return;
    await handleJoin(code);
  });
  qsa("[data-accept-invite]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await respondRoomInvite(button.dataset.acceptInvite, true);
        await handleJoin(button.dataset.inviteCode);
      } catch (error) { toast(error.message, "error"); }
    });
  });
  qsa("[data-decline-invite]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await respondRoomInvite(button.dataset.declineInvite, false);
        toast("Convite recusado.", "info");
        renderLobby();
      } catch (error) { toast(error.message, "error"); }
    });
  });
}

async function handleJoin(code) {
  try {
    await joinRoom(code);
    location.href = `pkparty.html?sala=${encodeURIComponent(String(code).toUpperCase())}`;
  } catch (error) {
    toast(error.message === "invite required" ? "Esta sala é privada e exige convite." : error.message, "error", "Não foi possível entrar");
  }
}

function openCreateRoom() {
  if (!user.cloud) { toast("Entre na sua conta primeiro.", "info"); return; }
  const items = CATALOG;
  const content = `
    <button class="modal-close" data-close-modal type="button" aria-label="Fechar"><i class="fa-solid fa-xmark"></i></button>
    <div class="auth-head"><div class="brand-mark">w00</div><h2>Criar sala</h2><p>Você será o anfitrião e controlará a reprodução.</p></div>
    <form class="auth-body" id="create-room-form">
      <div class="field"><label for="room-name">Nome da sala</label><input class="input" id="room-name" maxlength="40" placeholder="Ex.: Noite de filme" required></div>
      ${items.length ? `<div class="field"><label for="room-movie">Título do catálogo</label><select class="select" id="room-movie">${items.map((item) => `<option value="${escapeHTML(item.id)}">${escapeHTML(item.title)}</option>`).join("")}</select></div>` : ""}
      <div class="field"><label for="room-url">${items.length ? "Ou link direto do vídeo" : "Link direto do vídeo"}</label><input class="input" id="room-url" type="url" placeholder="https://.../filme.mp4" ${items.length ? "" : "required"}></div>
      <label class="row-between tiny" style="gap:12px"><span>Sala privada (só entra com convite ou código)</span><input type="checkbox" id="room-private"></label>
      <button class="btn btn-primary btn-block" type="submit"><i class="fa-solid fa-tower-broadcast"></i>Criar sala</button>
    </form>`;

  openModal(content, {
    className: "modal-sm",
    label: "Criar sala",
    onMount: () => {
      qs("#create-room-form")?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const name = qs("#room-name").value.trim();
        const url = qs("#room-url").value.trim();
        const selected = qs("#room-movie")?.value || "";
        const movieId = url || selected;
        if (!movieId) { toast("Escolha um título ou cole um link de vídeo.", "error"); return; }
        const submit = event.currentTarget.querySelector("button[type=submit]");
        submit.disabled = true;
        submit.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>Criando...';
        try {
          const created = await createRoom({ name, movieId, isPrivate: qs("#room-private").checked });
          closeModal();
          location.href = `pkparty.html?sala=${encodeURIComponent(created.code)}`;
        } catch (error) {
          toast(error.message, "error");
          submit.disabled = false;
          submit.innerHTML = '<i class="fa-solid fa-tower-broadcast"></i>Criar sala';
        }
      });
    }
  });
}

async function openRoom(code) {
  try {
    if (lobbyChannel) {
      getClient().removeChannel(lobbyChannel);
      lobbyChannel = null;
    }
    const joined = await joinRoom(code);
    room = await getRoom(joined.id);
    movie = movieForRoom(room);
    isHost = room.host === user.id;
    members = await roomMembers(room.id);
    const messages = await loadMessages(room.id);
    chatRows = messages;
    renderRoom();
    mountRoom();
  } catch (error) {
    const message = error.message === "invite required"
      ? "Esta sala é privada. Peça um convite ao anfitrião."
      : error.message === "room not found"
        ? "Sala não encontrada. Confira o código."
        : error.message;
    qs("#page-content").innerHTML = `<div class="page-section">${emptyState("fa-tower-broadcast", "Não foi possível entrar", message)}<div class="row" style="justify-content:center;margin-top:14px"><a class="btn btn-primary" href="pkparty.html"><i class="fa-solid fa-arrow-left"></i>Voltar ao lobby</a></div></div>`;
  }
}

function renderRoom() {
  const participants = members.map((member) => ({
    ...member,
    online: member.user_id === user.id,
    isHost: member.is_host
  }));
  const hostMember = participants.find((person) => person.isHost);
  const canPlay = Boolean(movie && isDirectVideo(movie.stream));

  qs("#page-content").innerHTML = `
    <div class="party-room">
      <div>
        <div class="party-stage glass">
          <div class="party-stage-head">
            <span class="badge badge-live"><i class="fa-solid fa-circle"></i> ${isHost ? "você controla" : "sessão ao vivo"}</span>
            <div class="grow"><h2 id="party-movie-title">${escapeHTML(movie?.title || "Sala sem título")}</h2><div class="meta"><span>${escapeHTML(room.name)}</span><span class="dot"></span><span class="tiny">${isHost ? "Só você pode pausar, tocar e avançar" : "O anfitrião controla a reprodução"}</span></div></div>
            <span class="badge badge-soft" id="party-member-count"><i class="fa-solid fa-users"></i> ${participants.length}</span>
          </div>
          ${movie
            ? canPlay
              ? `<div class="party-video-wrap"><video id="party-video" ${isHost ? "controls" : ""} playsinline preload="metadata"></video>${isHost ? "" : '<div class="party-guest-note"><i class="fa-solid fa-lock"></i> O anfitrião controla o vídeo</div>'}</div>`
              : `<div class="party-embed-wrap"><iframe id="party-iframe" src="${escapeHTML(movie.stream)}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe><div class="party-guest-note"><i class="fa-solid fa-circle-info"></i> Este player incorporado não permite sincronização. Use links diretos MP4/WebM para o modo sincronizado.</div></div>`
            : `<div class="party-stage-empty">${emptyState("fa-film", "Sala sem vídeo", "O anfitrião precisa escolher um título ou link direto.")}</div>`}
          <div class="party-stage-foot">
            <div class="grow"><strong>${escapeHTML(hostMember?.name || "Anfitrião")}</strong><span>${isHost ? "Você é o anfitrião" : "Anfitrião da sala"}</span></div>
            ${isHost && CATALOG.length ? '<button class="btn btn-sm btn-ghost" data-change-media type="button"><i class="fa-solid fa-film"></i>Trocar título</button>' : ""}
            ${isHost ? '<button class="btn btn-sm btn-ghost" data-invite-friends type="button"><i class="fa-solid fa-user-plus"></i>Convidar</button>' : ""}
            ${!isHost && canPlay ? '<button class="btn btn-sm btn-ghost" data-party-fullscreen type="button"><i class="fa-solid fa-expand"></i>Tela cheia</button>' : ""}
            <button class="btn btn-sm btn-ghost" data-copy-party-code type="button"><i class="fa-solid fa-copy"></i><span class="hide-xs">${escapeHTML(room.code)}</span></button>
            <button class="btn btn-sm btn-danger" data-leave-room type="button"><i class="fa-solid fa-right-from-bracket"></i>Sair</button>
          </div>
        </div>
        ${movie ? `<div class="panel panel-pad" style="margin-top:12px"><div class="row-between"><div><div class="section-kicker"><i class="fa-solid fa-circle-info"></i> Sobre a sessão</div><h3>${escapeHTML(movie.title)}</h3></div><span class="badge badge-soft">${escapeHTML(movie.age || "L")}${movie.duration ? ` · ${formatDuration(movie.duration)}` : ""}</span></div><p class="small" style="margin-top:8px">${escapeHTML(movie.synopsis || "")}</p></div>` : ""}
      </div>

      <aside class="party-side">
        <div class="party-chat glass">
          <div class="party-chat-head"><h3><i class="fa-solid fa-comments"></i> Chat</h3><span id="party-online-count">${participants.filter((person) => person.online).length} online</span></div>
          <div class="party-chat-log" id="party-chat-log"></div>
          <form class="party-chat-form" id="party-chat-form">
            <input id="party-chat-input" maxlength="1000" placeholder="Escreva uma mensagem..." autocomplete="off" aria-label="Mensagem do chat">
            <button type="submit" aria-label="Enviar mensagem"><i class="fa-solid fa-paper-plane"></i></button>
          </form>
        </div>

        <div class="participants glass">
          <div class="participants-head"><i class="fa-solid fa-users"></i> Participantes</div>
          <div class="participants-list" id="party-participants"></div>
        </div>

        <div class="panel panel-pad">
          <div class="section-kicker"><i class="fa-solid fa-link"></i> Convite</div>
          <p class="tiny" style="margin-top:6px">Código: <strong>${escapeHTML(room.code)}</strong>. Compartilhe o código ou convide um amigo.</p>
          <button class="btn btn-ghost btn-sm btn-block" data-copy-party-code type="button" style="margin-top:10px"><i class="fa-solid fa-copy"></i>Copiar código</button>
        </div>
      </aside>
    </div>`;

  renderParticipants();
  renderChat();
}

function renderParticipants(onlineIds = new Set()) {
  const list = qs("#party-participants");
  if (!list) return;
  const all = members.map((member) => ({
    ...member,
    online: member.user_id === user.id || onlineIds.has(member.user_id)
  }));
  all.sort((a, b) => Number(b.is_host) - Number(a.is_host));
  list.innerHTML = all.map((person) => `<div class="participant">${avatar({ name: person.name, avatar_url: person.avatar_url }, "xs")}<strong>${escapeHTML(person.name)}</strong><span>${person.is_host ? '<i class="fa-solid fa-crown"></i> anfitrião' : person.online ? '<span class="status-dot"></span> online' : "offline"}</span></div>`).join("");
  const online = all.filter((person) => person.online).length;
  const count = qs("#party-member-count");
  if (count) count.innerHTML = `<i class="fa-solid fa-users"></i> ${all.length}`;
  const onlineCount = qs("#party-online-count");
  if (onlineCount) onlineCount.textContent = `${online} online`;
}

function chatMarkup() {
  return chatRows.map((message) => {
    const self = message.user_id === user.id;
    return `<div class="chat-msg ${self ? "self" : ""}">${avatar({ name: message.sender_name || "Convidado", avatar_url: message.sender_avatar || "" }, "xs")}<div class="chat-msg-body"><strong>${escapeHTML(self ? "Você" : message.sender_name || "Convidado")}</strong><p>${escapeHTML(message.body)}</p></div></div>`;
  }).join("");
}

function renderChat() {
  const log = qs("#party-chat-log");
  if (!log) return;
  log.innerHTML = chatMarkup();
  log.scrollTop = log.scrollHeight;
}

function appendChat(message) {
  if (!message?.client_id) return;
  if (chatRows.some((row) => row.client_id === message.client_id)) return;
  chatRows.push(message);
  renderChat();
}

function mountRoom() {
  renderParticipants();
  renderChat();

  qsa("[data-copy-party-code]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(room.code);
        toast(`Código ${room.code} copiado.`, "success", "Convite");
      } catch {
        toast(`Código: ${room.code}`, "info");
      }
    });
  });

  qs("[data-leave-room]")?.addEventListener("click", async () => {
    if (isHost) realtimeChannel?.send({ type: "broadcast", event: "room-closed", payload: { sender_id: user.id } });
    try {
      await leaveRoom(room.id);
    } catch (error) {
      console.warn("[party] sair:", error.message);
    }
    location.href = "pkparty.html";
  });

  qs("[data-invite-friends]")?.addEventListener("click", openInviteModal);
  qs("[data-change-media]")?.addEventListener("click", openMediaPicker);
  qs("[data-party-fullscreen]")?.addEventListener("click", () => {
    qs("#party-video")?.requestFullscreen?.().catch(() => {});
  });

  qs("#party-chat-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = qs("#party-chat-input");
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    const optimistic = {
      client_id: uuid(),
      user_id: user.id,
      body: text,
      sender_name: user.name,
      sender_avatar: user.avatar_url || "",
      created_at: new Date().toISOString()
    };
    appendChat(optimistic);
    realtimeChannel?.send({
      type: "broadcast",
      event: "chat",
      payload: { ...optimistic, room_id: room.id }
    });
    try {
      const saved = await sendMessage(room.id, text);
      if (saved?.client_id) {
        chatRows = chatRows.map((row) => row.client_id === optimistic.client_id ? saved : row);
        renderChat();
      }
    } catch (error) {
      toast("Mensagem não foi salva. Verifique a conexão.", "error");
    }
  });

  connectRoomRealtime();
  setupPlayback();
}

function connectRoomRealtime() {
  const sb = getClient();
  if (realtimeChannel) sb.removeChannel(realtimeChannel);
  realtimeChannel = sb.channel(`w00-room:${room.id}`, {
    config: {
      broadcast: { self: false },
      presence: { key: user.id }
    }
  });

  realtimeChannel
    .on("broadcast", { event: "playback" }, ({ payload }) => applyPlayback(payload))
    .on("broadcast", { event: "media" }, ({ payload }) => {
      if (payload?.sender_id !== room.host || !payload.movie_id) return;
      updateRoomMovie(room.id, payload.movie_id).catch(() => {});
      location.reload();
    })
    .on("broadcast", { event: "state-request" }, ({ payload }) => {
      if (!isHost || payload?.sender_id === user.id) return;
      broadcastPlayback(true);
    })
    .on("broadcast", { event: "room-closed" }, ({ payload }) => {
      if (payload?.sender_id !== room.host) return;
      toast("O anfitrião encerrou a sala.", "info", "Sessão encerrada");
      setTimeout(() => { location.href = "pkparty.html"; }, 700);
    })
    .on("broadcast", { event: "chat" }, ({ payload }) => {
      if (payload?.room_id === room.id) appendChat(payload);
    })
    .on("presence", { event: "sync" }, () => {
      const state = realtimeChannel.presenceState();
      const ids = new Set(Object.values(state).flat().map((entry) => entry.user_id));
      renderParticipants(ids);
    })
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "room_messages", filter: `room_id=eq.${room.id}` }, ({ new: message }) => {
      appendChat(message);
    })
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "rooms", filter: `id=eq.${room.id}` }, ({ new: updated }) => {
      if (updated.movie_id !== room.movie_id) location.reload();
    })
    .subscribe(async (status) => {
      if (status !== "SUBSCRIBED") return;
      try {
        await realtimeChannel.track({
          user_id: user.id,
          name: user.name,
          avatar_url: user.avatar_url || ""
        });
      } catch (error) {
        console.warn("[party] presença:", error.message);
      }
      if (isHost) {
        broadcastPlayback(true);
      } else {
        realtimeChannel.send({ type: "broadcast", event: "state-request", payload: { sender_id: user.id } });
        const saved = room.playback_state || {};
        if (Number.isFinite(Number(saved.time))) applyPlayback({ ...saved, sender_id: room.host });
      }
    });

  window.addEventListener("beforeunload", () => {
    clearInterval(heartbeat);
    if (realtimeChannel) sb.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }, { once: true });
}

function setupPlayback() {
  const video = qs("#party-video");
  if (!video || !movie) return;
  video.src = movie.stream;
  video.preload = "metadata";

  if (!isHost) {
    video.controls = false;
    video.addEventListener("play", () => { if (!applyingRemote) video.pause(); });
    video.addEventListener("pause", () => { if (!applyingRemote && !video.ended) safePlay(video); });
  } else {
    const send = () => { if (!applyingRemote) broadcastPlayback(); };
    video.addEventListener("play", send);
    video.addEventListener("pause", send);
    video.addEventListener("seeked", send);
    video.addEventListener("loadedmetadata", () => {
      const saved = room.playback_state || {};
      if (Number(saved.time) > 0) video.currentTime = Number(saved.time);
      if (saved.paused === false) safePlay(video);
    });
  }

  heartbeat = setInterval(() => {
    if (!isHost || !video || video.paused) return;
    broadcastPlayback();
    const state = { paused: false, time: video.currentTime, at: Date.now() };
    savePlaybackState(room.id, state).catch(() => {});
  }, 2000);
}

function broadcastPlayback(force = false) {
  const video = qs("#party-video");
  if (!isHost || !video || !realtimeChannel) return;
  const payload = {
    sender_id: user.id,
    paused: video.paused,
    time: video.currentTime,
    at: Date.now(),
    force
  };
  realtimeChannel.send({ type: "broadcast", event: "playback", payload });
  if (!video.paused) savePlaybackState(room.id, { paused: false, time: video.currentTime, at: Date.now() }).catch(() => {});
}

function applyPlayback(payload) {
  if (!payload || payload.sender_id !== room.host || isHost) return;
  const video = qs("#party-video");
  if (!video || !Number.isFinite(Number(payload.time))) return;
  const expected = Number(payload.time);
  applyingRemote = true;

  if (payload.paused) {
    if (Math.abs(video.currentTime - expected) > 0.3) video.currentTime = expected;
    video.pause();
  } else {
    if (Math.abs(video.currentTime - expected) > 0.8) video.currentTime = expected;
    safePlay(video);
  }
  setTimeout(() => { applyingRemote = false; }, 120);
}

async function openInviteModal() {
  let friends = store.getFriends();
  if (!friends.length) {
    try {
      const rows = await fetchFriendsState();
      friends = rows.filter((row) => row.status === "accepted").map(mapFriend);
      store.setSocialCache(friends, rows.filter((row) => row.status === "pending" && row.direction === "received").map(mapFriend));
    } catch {}
  }
  const content = `
    <button class="modal-close" data-close-modal type="button" aria-label="Fechar"><i class="fa-solid fa-xmark"></i></button>
    <div class="auth-head"><div class="brand-mark">w00</div><h2>Convidar amigos</h2><p>Eles recebem o convite no w00 Party.</p></div>
    <div class="auth-body">
      ${friends.length ? friends.map((friend) => `<div class="user-card">${avatar(friend, "md")}<div class="grow"><strong>${escapeHTML(friend.name)}</strong><span>${escapeHTML(friend.favoriteGenre || "amigo")}</span></div><button class="btn btn-sm btn-ghost" data-send-room-invite="${escapeHTML(friend.id)}" type="button"><i class="fa-solid fa-paper-plane"></i>Convidar</button></div>`).join("") : `<p class="tiny muted">Você ainda não tem amigos. Adicione alguém na página Amigos.</p><a class="btn btn-ghost btn-block btn-sm" href="amigos.html">Ir para Amigos</a>`}
    </div>`;
  openModal(content, {
    className: "modal-sm",
    label: "Convidar amigos",
    onMount: () => {
      qsa("[data-send-room-invite]").forEach((button) => {
        button.addEventListener("click", async () => {
          button.disabled = true;
          try {
            await inviteFriendToRoom(room.id, button.dataset.sendRoomInvite);
            button.innerHTML = '<i class="fa-solid fa-check"></i>Convidado';
            toast("Convite enviado.", "success");
          } catch (error) {
            toast(error.message, "error");
            button.disabled = false;
          }
        });
      });
    }
  });
}

function openMediaPicker() {
  if (!isHost || !CATALOG.length) return;
  const content = `
    <button class="modal-close" data-close-modal type="button" aria-label="Fechar"><i class="fa-solid fa-xmark"></i></button>
    <div class="auth-head"><div class="brand-mark">w00</div><h2>Trocar título</h2><p>Somente o anfitrião pode alterar a mídia.</p></div>
    <div style="padding:20px 24px 26px"><div class="media-pick-grid">${CATALOG.map((item) => `<button class="media-pick" type="button" data-pick-media="${escapeHTML(item.id)}">
      ${posterMarkup(item, "media-poster")}
      <strong>${escapeHTML(item.title)}</strong><span>${item.year || ""} · ${escapeHTML(item.genres[0] || "")}</span>
    </button>`).join("")}</div></div>`;
  openModal(content, {
    className: "modal-lg",
    label: "Escolher mídia",
    onMount: () => {
      qsa("[data-pick-media]").forEach((button) => {
        button.addEventListener("click", async () => {
          const next = byId(button.dataset.pickMedia);
          if (!next) return;
          await updateRoomMovie(room.id, next.id);
          realtimeChannel?.send({ type: "broadcast", event: "media", payload: { sender_id: user.id, movie_id: next.id } });
          closeModal();
          location.reload();
        });
      });
    }
  });
}
