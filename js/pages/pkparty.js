// w00 Party: Supabase-backed watch party with realtime chat and host-only
// playback control. The host broadcasts play/pause/seek plus a heartbeat;
// guests apply it immediately and self-correct drift automatically.
import { CATALOG, byId, normalizeStreamUrl } from "../data.js";
import { getRoute, navigate, roomPath } from "../router.js";
import * as store from "../store.js";
import { getClient } from "../supabase.js";
import { SUPABASE_CONFIG } from "../supabase-config.js";
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
  myRoomInvites,
  respondRoomInvite
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
  formatClock
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
let remotePaused = false;
let roomRequest = 0;
let lobbyRequest = 0;
let partyControlsTimer = 0;

const DIRECT_VIDEO = /\.(mp4|webm|ogv|mov|m3u8)(\?|#|$)/i;

function activeRoomCode() {
  return String(getRoute().roomCode || new URLSearchParams(location.search).get("sala") || "").toUpperCase();
}

function safePlay(video) {
  try {
    const started = video.play();
    if (started && typeof started.catch === "function") started.catch(() => {});
  } catch {}
}

// O convidado só pode dar o gesto que libera o autoplay do navegador.
// Quem decide play/pause continua sendo o anfitrião.
function primeGuestPlayback(video) {
  applyingRemote = true;
  const finish = () => setTimeout(() => { applyingRemote = false; updatePartyControls(); }, 150);
  try {
    const started = video.play();
    if (started && typeof started.then === "function") {
      started.then(() => {
        if (remotePaused) { try { video.pause(); } catch {} }
        finish();
      }).catch(finish);
    } else {
      if (remotePaused) { try { video.pause(); } catch {} }
      finish();
    }
  } catch {
    finish();
  }
}

function isDirectVideo(url = "") {
  return DIRECT_VIDEO.test(String(url));
}

function uuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else for (let i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function movieForRoom(nextRoom) {
  if (!nextRoom?.movie_id) return null;
  const catalogItem = byId(nextRoom.movie_id);
  if (catalogItem) return catalogItem;
  if (/^https?:\/\//i.test(nextRoom.movie_id)) {
    const stream = normalizeStreamUrl(nextRoom.movie_id);
    return {
      id: nextRoom.movie_id,
      title: "Sessão privada",
      stream,
      player: stream,
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

function invitesMarkup(invites = []) {
  if (!invites.length) return "";
  return `<section class="page-section"><div class="section-head"><div><div class="section-kicker"><i class="fa-solid fa-envelope-open-text"></i> Convites</div><h2>Chamaram você.</h2></div></div><div class="invite-grid">${invites.map((invite) => `
        <div class="panel panel-pad invite-card">
          ${avatar({ name: invite.host_name, avatar_url: invite.host_avatar }, "md")}
          <div class="grow"><strong>${escapeHTML(invite.room_name)}</strong><span class="tiny muted">${escapeHTML(invite.host_name)} convidou você · ${timeAgo(invite.created_at)}</span></div>
          <button class="btn btn-sm btn-primary" data-accept-invite="${escapeHTML(invite.id)}" data-invite-code="${escapeHTML(invite.room_code)}" type="button">Entrar</button>
          <button class="btn-icon" data-decline-invite="${escapeHTML(invite.id)}" type="button" aria-label="Recusar convite"><i class="fa-solid fa-xmark"></i></button>
        </div>`).join("")}</div></section>`;
}

function roomsMarkup(rooms = []) {
  return rooms.length ? rooms.map(roomCard).join("") : emptyState("fa-tower-broadcast", "Nenhuma sala ativa", "Crie a primeira e chame seus amigos.");
}

function paintLobby(rooms, invites) {
  const inviteSection = qs("#invite-section");
  if (inviteSection) {
    const signature = JSON.stringify(invites.map((invite) => `${invite.id}:${invite.room_name}:${invite.host_name}`));
    if (inviteSection.dataset.signature !== signature) {
      inviteSection.innerHTML = invitesMarkup(invites);
      inviteSection.dataset.signature = signature;
    }
  }
  const grid = qs("#rooms-grid");
  if (grid) {
    const signature = JSON.stringify(rooms.map((room) => `${room.id}:${room.name}:${room.member_count}:${room.is_member}`));
    if (grid.dataset.signature !== signature) {
      grid.innerHTML = roomsMarkup(rooms);
      grid.dataset.signature = signature;
    }
  }
  const badge = qs("#rooms-count-badge");
  if (badge) badge.innerHTML = `<i class="fa-solid fa-users"></i> ${rooms.length} salas`;
  mountLobby();
}

function roomCard(item) {
  const itemMovie = movieForRoom({ movie_id: item.movie_id });
  return `<article class="room-card">
    ${posterMarkup(itemMovie)}
    <div class="room-info">
      <div class="row-between"><h3>${escapeHTML(item.name)}</h3><span class="room-live">ao vivo</span></div>
      <p>${escapeHTML(itemMovie?.title || "Sessão privada")}</p>
      <div class="room-meta">
        ${avatar({ name: item.host_name, avatar_url: item.host_avatar }, "xs")}
        <span>${escapeHTML(item.host_name)}</span><span>·</span><span>${item.member_count} na sala</span><span>·</span><span>${timeAgo(item.created_at)}</span>
      </div>
      <div class="row-between">
        <span class="tiny muted">${item.is_member ? "Você participa" : "Anfitrião convida"}</span>
        <a class="btn btn-sm btn-primary" href="${roomPath(item.code)}">${item.is_member ? "Entrar" : "Participar"} <i class="fa-solid fa-arrow-right"></i></a>
      </div>
    </div>
  </article>`;
}

function destroyPartyVideo() {
  const video = qs("#party-video");
  if (!video) return;
  try { video.pause(); } catch {}
  try { video.removeAttribute("src"); video.load(); } catch {}
  try { video.remove(); } catch {}
}

function cleanupParty() {
  roomRequest += 1;
  lobbyRequest += 1;
  document.body.classList.remove("party-theater");
  destroyPartyVideo();
  clearInterval(heartbeat);
  heartbeat = null;
  clearTimeout(partyControlsTimer);
  partyControlsTimer = 0;
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
  remotePaused = false;
}

export function hasActivePartyRoom() {
  return Boolean(room?.id);
}

function closeRoomQuietly(roomId) {
  if (!roomId) return;
  if (isHost) {
    try {
      realtimeChannel?.send({ type: "broadcast", event: "room-closed", payload: { sender_id: user.id } });
    } catch {}
  }
  leaveRoom(roomId).catch((error) => console.warn("[party] sair:", error.message));
}

export function destroyPkparty() {
  const roomId = room?.id;
  closeRoomQuietly(roomId);
  cleanupParty();
}

export async function renderPkparty() {
  const previousRoomId = room?.id;
  const previousCode = String(room?.code || "").toUpperCase();
  const code = activeRoomCode();
  if (previousRoomId && previousCode !== code) closeRoomQuietly(previousRoomId);
  cleanupParty();
  user = store.getUser();
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
  if (document.body.dataset.page !== "pkparty" || activeRoomCode()) return;
  const request = ++lobbyRequest;
  try {
    const [rooms, invites] = await Promise.all([listRooms(), myRoomInvites()]);
    if (request !== lobbyRequest || document.body.dataset.page !== "pkparty" || activeRoomCode()) return;
    qs("#page-content").innerHTML = `
      <section class="party-hero">
        <div class="party-hero-inner">
          <div>
            <div class="section-kicker"><i class="fa-solid fa-tower-broadcast"></i> Sessão ao vivo</div>
            <h1>w00 Party</h1>
            <div class="row wrap" style="margin-top:18px">
              <button class="btn btn-primary" id="create-room" type="button"><i class="fa-solid fa-plus"></i>Criar sala</button>
              <span class="badge badge-soft" id="rooms-count-badge"><i class="fa-solid fa-users"></i> ${rooms.length} salas</span>
            </div>
          </div>
        </div>
      </section>

      <div id="invite-section">${invitesMarkup(invites)}</div>

      <section class="page-section">
        <div class="section-head"><div><div class="section-kicker"><i class="fa-solid fa-circle-play"></i> Ao vivo agora</div><h2>Salas</h2></div><span class="badge badge-live"><i class="fa-solid fa-circle"></i> ao vivo</span></div>
        <div class="rooms-grid" id="rooms-grid">${roomsMarkup(rooms)}</div>
      </section>

`;

    const inviteSection = qs("#invite-section");
    if (inviteSection) {
      inviteSection.dataset.signature = JSON.stringify(invites.map((invite) => `${invite.id}:${invite.room_name}:${invite.host_name}`));
    }
    const grid = qs("#rooms-grid");
    if (grid) {
      grid.dataset.signature = JSON.stringify(rooms.map((room) => `${room.id}:${room.name}:${room.member_count}:${room.is_member}`));
    }

    mountLobby();
    subscribeLobby();
  } catch (error) {
    if (request !== lobbyRequest || document.body.dataset.page !== "pkparty" || activeRoomCode()) return;
    qs("#page-content").innerHTML = `<div class="page-section">${emptyState("fa-triangle-exclamation", "Não foi possível carregar o w00 Party", error.message)}</div>`;
  }
}

function subscribeLobby() {
  if (lobbyChannel) return;
  const sb = getClient();
  // Só criação/remoção de sala muda o lobby. O UPDATE a cada 2s é o
  // playback_state do anfitrião e não deve redesenhar nada.
  lobbyChannel = sb.channel(`party-lobby:${user.id}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "rooms" }, () => {
      if (document.body.dataset.page === "pkparty" && !activeRoomCode()) refreshLobby();
    })
    .on("postgres_changes", { event: "DELETE", schema: "public", table: "rooms" }, () => {
      if (document.body.dataset.page === "pkparty" && !activeRoomCode()) refreshLobby();
    })
    .subscribe();
}

// Convites de sala chegam pelo feed global do Supabase (js/social.js), então
// aparecem em qualquer página. Aqui só atualizamos o lobby, sem recarregar.
if (typeof window !== "undefined" && !window.__w00PartyInvitesBound) {
  window.__w00PartyInvitesBound = true;
  window.addEventListener("pk:room-invites-changed", () => {
    if (document.body.dataset.page === "pkparty" && !activeRoomCode()) refreshLobby();
  });
}

// Atualiza convites e salas em segundo plano, sem reconstruir a página inteira
// (evita a sensação de reload quando chega um convite ou uma sala nova).
async function refreshLobby() {
  if (document.body.dataset.page !== "pkparty" || activeRoomCode()) return;
  const request = ++lobbyRequest;
  try {
    const [rooms, invites] = await Promise.all([listRooms(), myRoomInvites()]);
    if (request !== lobbyRequest || document.body.dataset.page !== "pkparty" || activeRoomCode()) return;
    if (!qs("#rooms-grid")) { await renderLobby(); return; }
    paintLobby(rooms, invites);
  } catch (error) {
    console.warn("[party] lobby:", error.message);
  }
}

function mountLobby() {
  const create = qs("#create-room");
  if (create && !create.dataset.bound) {
    create.dataset.bound = "1";
    create.addEventListener("click", openCreateRoom);
  }
  qsa("[data-accept-invite]").forEach((button) => {
    if (button.dataset.bound) return;
    button.dataset.bound = "1";
    button.addEventListener("click", async () => {
      try {
        await respondRoomInvite(button.dataset.acceptInvite, true);
        await handleJoin(button.dataset.inviteCode);
      } catch (error) { toast(error.message, "error"); }
    });
  });
  qsa("[data-decline-invite]").forEach((button) => {
    if (button.dataset.bound) return;
    button.dataset.bound = "1";
    button.addEventListener("click", async () => {
      try {
        await respondRoomInvite(button.dataset.declineInvite, false);
        toast("Convite recusado.", "info");
        await refreshLobby();
      } catch (error) { toast(error.message, "error"); }
    });
  });
}

async function handleJoin(code) {
  try {
    await joinRoom(code);
    navigate(roomPath(code));
  } catch (error) {
    toast(error.message === "invite required" ? "Esta sala é privada. Peça o link ao anfitrião." : error.message, "error", "Não foi possível entrar");
  }
}

function openCreateRoom() {
  if (!user.cloud) { toast("Entre na sua conta primeiro.", "info"); return; }
  const items = CATALOG;
  const content = `
    <button class="modal-close" data-close-modal type="button" aria-label="Fechar"><i class="fa-solid fa-xmark"></i></button>
    <div class="auth-head"><div class="brand-mark">w00</div><h2>Criar sala</h2></div>
    <form class="auth-body" id="create-room-form">
      <div class="field"><label for="room-name">Nome da sala</label><input class="input" id="room-name" maxlength="40" placeholder="Ex.: Noite de filme" required></div>
      ${items.length ? `<div class="field"><label for="room-movie">Título do catálogo</label><select class="select" id="room-movie">${items.map((item) => `<option value="${escapeHTML(item.id)}">${escapeHTML(item.title)}</option>`).join("")}</select></div>` : ""}
      <div class="field"><label for="room-url">${items.length ? "Ou link direto do vídeo" : "Link direto do vídeo"}</label><input class="input" id="room-url" type="url" placeholder="https://.../filme.mp4" ${items.length ? "" : "required"}></div>
      <label class="row-between tiny" style="gap:12px"><span>Sala privada (só entra com convite ou link)</span><input type="checkbox" id="room-private"></label>
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
          navigate(roomPath(created.code));
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
  const wanted = String(code || "").toUpperCase();
  const request = ++roomRequest;
  const stillActive = () => request === roomRequest && document.body.dataset.page === "pkparty" && activeRoomCode() === wanted;
  try {
    if (lobbyChannel) {
      getClient().removeChannel(lobbyChannel);
      lobbyChannel = null;
    }
    const joined = await joinRoom(wanted);
    if (!stillActive()) return;
    room = await getRoom(joined.id);
    if (!stillActive()) return;
    if (!room) throw new Error("room not found");
    movie = movieForRoom(room);
    isHost = room.host === user.id;
    members = await roomMembers(room.id);
    if (!stillActive()) return;
    const messages = await loadMessages(room.id);
    if (!stillActive()) return;
    chatRows = messages;
    renderRoom();
    mountRoom();
  } catch (error) {
    if (!stillActive()) return;
    const message = error.message === "invite required"
      ? "Esta sala é privada. Peça o link ao anfitrião."
      : error.message === "room not found"
        ? "Sala não encontrada. Confira o link."
        : error.message;
    qs("#page-content").innerHTML = `<div class="page-section">${emptyState("fa-tower-broadcast", "Não foi possível entrar", message)}<div class="row" style="justify-content:center;margin-top:14px"><a class="btn btn-primary" href="/party"><i class="fa-solid fa-arrow-left"></i>Voltar ao lobby</a></div></div>`;
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
  const online = participants.filter((person) => person.online).length;

  qs("#page-content").innerHTML = `
    <section class="party-room party-room-v2">
      <div class="party-watch">
        <header class="party-room-head glass">
          <div class="party-room-meta">
            <span class="party-live-pill"><i class="fa-solid fa-circle"></i> ao vivo</span>
            <span class="party-people-pill" id="party-member-count"><i class="fa-solid fa-users"></i> ${participants.length}</span>
          </div>
          <div class="party-room-title">
            <h1 id="party-room-name">${escapeHTML(room.name || movie?.title || "Sala sem título")}</h1>
            <span id="party-movie-title">${escapeHTML(movie?.title || "Sala sem vídeo")}</span>
          </div>
        </header>

        <div class="party-stage glass ${canPlay ? "has-video" : ""}" id="party-stage">
          ${movie
            ? canPlay
              ? `<div class="party-video-wrap">
                  <video id="party-video" playsinline preload="metadata"></video>
                  <div class="player-overlay party-overlay" id="party-overlay">
                    <div class="player-top-bar">
                      <div class="player-top-left">
                        <div class="meta-info">
                          <span class="meta-title">${escapeHTML(movie.title || "Sala")}</span>
                          <span class="meta-subtitle">${escapeHTML(room.name || "")}</span>
                        </div>
                      </div>
                      <span class="brand-logo-pk">W00</span>
                    </div>
                    <div class="player-bottom-wrapper">
                      <div class="timeline-container">
                        <button class="control-icon" data-party-play type="button" aria-label="Reproduzir"><i class="fa-solid fa-play"></i></button>
                        <div class="timeline ${isHost ? "" : "is-disabled"}" id="party-timeline" role="slider" aria-label="Progresso do vídeo" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" tabindex="0">
                          <div class="timeline-buffered" id="party-buffered"></div>
                          <div class="timeline-progress" id="party-progress"><div class="timeline-handle"></div></div>
                        </div>
                        <span class="time-display" id="party-time">00:00 / 00:00</span>
                      </div>
                      <div class="controls-bar">
                        <div class="controls-left">
                          <button class="control-icon" data-party-back10 type="button" title="Voltar 10s" aria-label="Voltar 10 segundos" ${isHost ? "" : "disabled"}><i class="fa-solid fa-rotate-left"></i></button>
                          <button class="control-icon" data-party-forward10 type="button" title="Avançar 10s" aria-label="Avançar 10 segundos" ${isHost ? "" : "disabled"}><i class="fa-solid fa-rotate-right"></i></button>
                          <div class="volume-container">
                            <button class="control-icon" data-party-mute type="button" aria-label="Silenciar"><i class="fa-solid fa-volume-high"></i></button>
                            <input type="range" class="volume-slider" id="party-volume" min="0" max="1" step="0.05" value="1" aria-label="Volume">
                          </div>
                        </div>
                        <div class="controls-right">
                          <button class="control-icon" data-party-fullscreen type="button" title="Tela cheia" aria-label="Tela cheia"><i class="fa-solid fa-expand"></i></button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>`
              : `<div class="party-embed-wrap">
                  <iframe id="party-iframe" src="${escapeHTML(movie.stream)}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>
                </div>`
            : `<div class="party-stage-empty">${emptyState("fa-film", "Sala sem vídeo", "Nenhum vídeo definido para esta sala.")}</div>`}
        </div>

        <div class="party-room-actions glass">
          <div class="party-host-line">
            ${avatar({ name: hostMember?.name || "Anfitrião", avatar_url: hostMember?.avatar_url || "" }, "xs")}
            <div><strong>${escapeHTML(hostMember?.name || "Anfitrião")}</strong><span>${isHost ? "você é o anfitrião" : "anfitrião da sala"}</span></div>
          </div>
          <div class="party-actions">
            ${isHost ? `<button class="party-action" data-copy-room-link type="button"><i class="fa-solid fa-link"></i><span>Copiar Link</span></button>` : ""}
            <button class="party-action danger" data-leave-room type="button"><i class="fa-solid fa-right-from-bracket"></i><span>Sair da Sala</span></button>
          </div>
        </div>
      </div>

      <aside class="party-chat glass">
        <div class="party-chat-head">
          <div class="party-chat-title"><h3><i class="fa-solid fa-comments"></i> Chat</h3><span id="party-online-count">${online} online</span></div>
          <div class="party-chat-people" id="party-participants"></div>
        </div>
        <div class="party-chat-log" id="party-chat-log"></div>
        <form class="party-chat-form" id="party-chat-form">
          <input id="party-chat-input" maxlength="1000" placeholder="Escreva uma mensagem..." autocomplete="off" aria-label="Mensagem do chat">
          <button type="submit" aria-label="Enviar mensagem"><i class="fa-solid fa-paper-plane"></i></button>
        </form>
      </aside>
    </section>`;

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
  list.innerHTML = all.map((person) => `<span class="party-person ${person.is_host ? "is-host" : ""}" title="${escapeHTML(person.name)}${person.is_host ? " · anfitrião" : person.online ? " · online" : " · offline"}">${avatar({ name: person.name, avatar_url: person.avatar_url }, "xs")}${person.is_host ? '<i class="fa-solid fa-crown"></i>' : ""}</span>`).join("");
  const online = all.filter((person) => person.online).length;
  const count = qs("#party-member-count");
  if (count) count.innerHTML = `<i class="fa-solid fa-users"></i> ${all.length}`;
  const onlineCount = qs("#party-online-count");
  if (onlineCount) onlineCount.textContent = `${online} online`;
}

function chatMessageMarkup(message) {
  const self = message.user_id === user.id;
  return `<div class="chat-msg ${self ? "self" : ""}">${avatar({ name: message.sender_name || "Convidado", avatar_url: message.sender_avatar || "" }, "xs")}<div class="chat-msg-body"><strong>${escapeHTML(self ? "Você" : message.sender_name || "Convidado")}</strong><p>${escapeHTML(message.body)}</p></div></div>`;
}

function chatMarkup() {
  return chatRows.map(chatMessageMarkup).join("");
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
  const log = qs("#party-chat-log");
  if (!log) return;
  log.insertAdjacentHTML("beforeend", chatMessageMarkup(message));
  log.scrollTop = log.scrollHeight;
}

function roomShareUrl() {
  return new URL(roomPath(room.code), location.origin).toString();
}

async function copyText(text, message = "Link copiado.") {
  try {
    await navigator.clipboard.writeText(text);
    toast(message, "success", "Compartilhar");
  } catch {
    const input = document.createElement("textarea");
    input.value = text;
    input.style.position = "fixed";
    input.style.opacity = "0";
    document.body.appendChild(input);
    input.select();
    try {
      document.execCommand("copy");
      toast(message, "success", "Compartilhar");
    } catch {
      toast(text, "info", "Copie manualmente");
    }
    input.remove();
  }
}

function partyFullscreenElement() {
  return document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement || null;
}

// Native fullscreen on the stage container (same approach as the reference
// player) so the in-room controls stay visible while the browser hides its
// chrome and the mobile navigation bar.
async function togglePartyTheater(force) {
  const stage = qs("#party-stage");
  if (!stage) return;
  const isFullscreen = partyFullscreenElement() === stage;
  const wantFullscreen = typeof force === "boolean" ? force : !isFullscreen;
  if (wantFullscreen === isFullscreen) return;

  if (!wantFullscreen) {
    try {
      if (document.exitFullscreen) await document.exitFullscreen();
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
      else if (document.msExitFullscreen) document.msExitFullscreen();
    } catch {}
    return;
  }

  const request = stage.requestFullscreen || stage.webkitRequestFullscreen || stage.msRequestFullscreen;
  if (request) {
    try {
      await request.call(stage, { navigationUI: "hide" });
      return;
    } catch {}
  }
  // iOS Safari cannot fullscreen a container; fullscreen the video element.
  const video = qs("#party-video");
  if (video && typeof video.webkitEnterFullscreen === "function") {
    try { video.webkitEnterFullscreen(); } catch {}
  }
}

function syncPartyFullscreenUi() {
  const stage = qs("#party-stage");
  const active = Boolean(stage && partyFullscreenElement() === stage);
  stage?.classList.toggle("is-theater", active);
  document.body.classList.toggle("party-theater", active);
  qsa("[data-party-fullscreen]").forEach((button) => {
    const icon = button.querySelector("i");
    if (icon) icon.className = `fa-solid fa-${active ? "compress" : "expand"}`;
    button.setAttribute("aria-pressed", String(active));
  });
  if (!active) stage?.scrollIntoView({ block: "nearest" });
}

function bindPartyFullscreenListener() {
  if (window.__w00PartyFullscreenBound) return;
  window.__w00PartyFullscreenBound = true;
  ["fullscreenchange", "webkitfullscreenchange", "MSFullscreenChange"].forEach((eventName) => {
    document.addEventListener(eventName, syncPartyFullscreenUi);
  });
}

function mountRoom() {
  renderParticipants();
  renderChat();

  qs("[data-copy-room-link]")?.addEventListener("click", () => copyText(roomShareUrl(), "Link da sala copiado."));
  qsa("[data-party-fullscreen]").forEach((button) => button.addEventListener("click", () => togglePartyTheater()));
  bindPartyFullscreenListener();
  qs("[data-leave-room]")?.addEventListener("click", async () => {
    const currentRoomId = room?.id;
    if (!currentRoomId) return;
    if (isHost) realtimeChannel?.send({ type: "broadcast", event: "room-closed", payload: { sender_id: user.id } });
    try {
      await leaveRoom(currentRoomId);
    } catch (error) {
      console.warn("[party] sair:", error.message);
    } finally {
      // Avoid a second leave RPC when the router tears the page down.
      room = null;
    }
    navigate("/party");
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
      const saved = await sendMessage(room.id, text, optimistic.client_id);
      if (saved?.client_id) {
        chatRows = chatRows.map((row) => row.client_id === optimistic.client_id ? saved : row);
        renderChat();
      }
    } catch (error) {
      toast("Mensagem não foi salva. Verifique a conexão.", "error");
    }
  });

  if (!window.__w00PartyKeyBound) {
    window.__w00PartyKeyBound = true;
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && document.body.classList.contains("party-theater")) togglePartyTheater(false);
    });
  }

  bindExitCleanup();
  connectRoomRealtime();
  setupPlayback();
}

function leaveRoomOnExit() {
  const currentRoom = room;
  if (!currentRoom?.id) return;
  try {
    realtimeChannel?.send({ type: "broadcast", event: "room-closed", payload: { sender_id: user.id } });
  } catch {}
  const sb = getClient();
  if (!sb) return;
  sb.auth.getSession().then(({ data }) => {
    const token = data?.session?.access_token;
    if (!token) return;
    const base = SUPABASE_CONFIG.url.replace(/\/$/, "");
    fetch(`${base}/rest/v1/rpc/leave_room`, {
      method: "POST",
      keepalive: true,
      headers: {
        apikey: SUPABASE_CONFIG.anonKey,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ p_room: currentRoom.id })
    }).catch(() => {});
  }).catch(() => {});
}

let exitCleanupBound = false;
function bindExitCleanup() {
  if (exitCleanupBound) return;
  exitCleanupBound = true;
  window.addEventListener("pagehide", leaveRoomOnExit);
}

async function refreshRoomState() {
  const roomId = room?.id;
  if (!roomId || document.body.dataset.page !== "pkparty") return;
  try {
    const updated = await getRoom(roomId);
    if (!updated || room?.id !== roomId || document.body.dataset.page !== "pkparty") return;
    const changed = updated.movie_id !== room.movie_id;
    room = updated;
    if (!changed) return;
    if (document.body.classList.contains("party-theater")) togglePartyTheater(false);
    movie = movieForRoom(room);
    renderRoom();
    mountRoom();
  } catch (error) {
    console.warn("[party] atualizar sala:", error.message);
  }
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
      updateRoomMovie(room.id, payload.movie_id).then(() => refreshRoomState()).catch(() => {});
    })
    .on("broadcast", { event: "state-request" }, ({ payload }) => {
      if (!isHost || payload?.sender_id === user.id) return;
      broadcastPlayback(true);
    })
    .on("broadcast", { event: "room-closed" }, ({ payload }) => {
      if (payload?.sender_id !== room.host) return;
      toast("O anfitrião encerrou a sala.", "info", "Sessão encerrada");
      setTimeout(() => navigate("/party"), 700);
    })
    .on("broadcast", { event: "chat" }, ({ payload }) => {
      if (payload?.room_id === room.id && payload.user_id !== user.id && payload.sender_name !== "Você") appendChat(payload);
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
      if (updated.movie_id !== room.movie_id) refreshRoomState();
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

  if (!window.__w00PartyUnloadBound) {
    window.__w00PartyUnloadBound = true;
    window.addEventListener("beforeunload", () => {
      clearInterval(heartbeat);
      destroyPartyVideo();
      if (realtimeChannel) sb.removeChannel(realtimeChannel);
      realtimeChannel = null;
    }, { once: true });
  }
}

function setPartyControlsHidden(hidden) {
  const overlay = qs("#party-overlay");
  if (!overlay) return;
  overlay.classList.toggle("controls-hidden", hidden);
  overlay.classList.toggle("hide-controls", hidden);
}

function revealPartyControls() {
  const overlay = qs("#party-overlay");
  if (!overlay) return;
  setPartyControlsHidden(false);
  clearTimeout(partyControlsTimer);
  partyControlsTimer = window.setTimeout(() => setPartyControlsHidden(true), 3000);
}

function bindPartyOverlayAutoHide() {
  const stage = qs("#party-stage");
  if (!stage || stage.dataset.hideBound) return;
  stage.dataset.hideBound = "1";
  ["pointermove", "mousemove", "pointerdown", "touchstart", "click"].forEach((eventName) => {
    stage.addEventListener(eventName, revealPartyControls, { passive: true });
  });
  if (!window.__w00PartyOverlayKeyBound) {
    window.__w00PartyOverlayKeyBound = true;
    document.addEventListener("keydown", revealPartyControls);
  }
  revealPartyControls();
}

function seekPartyToClientX(clientX) {
  const video = qs("#party-video");
  const timeline = qs("#party-timeline");
  if (!video || !timeline || !isHost || !Number.isFinite(video.duration)) return;
  const rect = timeline.getBoundingClientRect();
  const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / (rect.width || 1)));
  video.currentTime = ratio * video.duration;
  updatePartyControls();
}

function bindPartyTimeline() {
  const timeline = qs("#party-timeline");
  if (!timeline || timeline.dataset.bound) return;
  timeline.dataset.bound = "1";
  timeline.addEventListener("pointerdown", (event) => {
    if (!isHost) return;
    event.preventDefault();
    seekPartyToClientX(event.clientX);
    const move = (moveEvent) => seekPartyToClientX(moveEvent.clientX);
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      updatePartyControls();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
  });
  timeline.addEventListener("keydown", (event) => {
    if (!isHost) return;
    const video = qs("#party-video");
    if (!video || !Number.isFinite(video.duration)) return;
    if (event.key === "ArrowRight") { video.currentTime = Math.min(video.duration, video.currentTime + 5); event.preventDefault(); }
    if (event.key === "ArrowLeft") { video.currentTime = Math.max(0, video.currentTime - 5); event.preventDefault(); }
    updatePartyControls();
  });
}

function updatePartyControls() {
  const video = qs("#party-video");
  if (!video) return;
  const duration = Number.isFinite(video.duration) ? video.duration : 0;
  const time = qs("#party-time");
  if (time) time.textContent = `${formatClock(video.currentTime || 0)} / ${formatClock(duration)}`;
  const progress = qs("#party-progress");
  if (progress) progress.style.width = duration ? `${(video.currentTime / duration) * 100}%` : "0%";
  const buffered = qs("#party-buffered");
  if (buffered) {
    const end = video.buffered && video.buffered.length ? video.buffered.end(video.buffered.length - 1) : 0;
    buffered.style.width = duration ? `${(end / duration) * 100}%` : "0%";
  }
  const timeline = qs("#party-timeline");
  if (timeline) timeline.setAttribute("aria-valuenow", duration ? String(Math.round((video.currentTime / duration) * 100)) : "0");
  const playIcon = qs("[data-party-play] i");
  if (playIcon) playIcon.className = `fa-solid fa-${video.paused ? "play" : "pause"}`;
  const muteIcon = qs("[data-party-mute] i");
  if (muteIcon) muteIcon.className = `fa-solid fa-volume-${video.muted || !video.volume ? "xmark" : "high"}`;
  const volume = qs("#party-volume");
  if (volume && document.activeElement !== volume) volume.value = String(video.muted ? 0 : (video.volume || 0));
}

function setupPlayback() {
  clearInterval(heartbeat);
  heartbeat = null;
  const video = qs("#party-video");
  if (!video || !movie) return;
  video.src = movie.stream;
  video.preload = "metadata";
  video.controls = false;

  if (!isHost) {
    video.style.pointerEvents = "none";
    video.addEventListener("play", () => { if (!applyingRemote) video.pause(); });
    video.addEventListener("pause", () => { if (!applyingRemote && !remotePaused && !video.ended) safePlay(video); });
  } else {
    const send = () => { if (!applyingRemote) broadcastPlayback(); };
    video.addEventListener("play", send);
    video.addEventListener("pause", send);
    video.addEventListener("seeked", send);
    video.addEventListener("loadedmetadata", () => {
      const saved = room.playback_state || {};
      if (Number(saved.time) > 0) video.currentTime = Number(saved.time);
      if (saved.paused === false) safePlay(video);
      updatePartyControls();
    });
  }

  qs("[data-party-play]")?.addEventListener("click", () => {
    revealPartyControls();
    if (!isHost) {
      // Convidado não controla a sessão: o clique só libera o autoplay.
      primeGuestPlayback(video);
      return;
    }
    if (video.paused) safePlay(video);
    else video.pause();
  });

  bindPartyTimeline();

  qs("[data-party-back10]")?.addEventListener("click", () => {
    if (!isHost || !Number.isFinite(video.duration)) return;
    video.currentTime = Math.max(0, video.currentTime - 10);
    updatePartyControls();
  });

  qs("[data-party-forward10]")?.addEventListener("click", () => {
    if (!isHost || !Number.isFinite(video.duration)) return;
    video.currentTime = Math.min(video.duration, video.currentTime + 10);
    updatePartyControls();
  });

  qs("[data-party-mute]")?.addEventListener("click", () => {
    if (video.muted || video.volume === 0) {
      video.muted = false;
      if (video.volume === 0) video.volume = 1;
    } else {
      video.muted = true;
    }
    updatePartyControls();
  });

  qs("#party-volume")?.addEventListener("input", (event) => {
    const value = Number(event.target.value);
    video.volume = value;
    video.muted = value === 0;
    updatePartyControls();
  });

  bindPartyOverlayAutoHide();

  ["timeupdate", "play", "pause", "loadedmetadata", "volumechange", "seeked"].forEach((eventName) => {
    video.addEventListener(eventName, updatePartyControls);
  });
  updatePartyControls();

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
  savePlaybackState(room.id, {
    paused: video.paused,
    time: video.currentTime,
    at: Date.now()
  }).catch(() => {});
}

function setGuestNoteVisible(visible) {
  const note = qs(".party-guest-note");
  if (!note || isHost) return;
  note.classList.toggle("is-hidden", !visible);
}

function applyPlayback(payload) {
  if (!payload || payload.sender_id !== room.host || isHost) return;
  const video = qs("#party-video");
  if (!video || !Number.isFinite(Number(payload.time))) return;
  const expected = Number(payload.time);
  applyingRemote = true;
  remotePaused = Boolean(payload.paused);

  // "O anfitrião controla" only matters while the host has it paused.
  setGuestNoteVisible(Boolean(payload.paused));

  if (payload.paused) {
    if (Math.abs(video.currentTime - expected) > 0.3) video.currentTime = expected;
    video.pause();
  } else {
    if (Math.abs(video.currentTime - expected) > 0.8) video.currentTime = expected;
    safePlay(video);
  }
  setTimeout(() => { applyingRemote = false; updatePartyControls(); }, 120);
}
