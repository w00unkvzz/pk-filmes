// PK Party: local watch-party lobby, room chat and cross-tab playback sync.
import { CATALOG, byId, DEMO_FRIENDS, COMMUNITY_USERS } from "../data.js";
import * as store from "../store.js";
import { qs, qsa, avatar, escapeHTML, emptyState, openModal, closeModal, toast, formatDuration } from "../ui.js";

let activeChannel = null;

function roomUser(id, fallback = "Convidado") {
  const user = COMMUNITY_USERS.find((entry) => entry.id === id);
  return user || { id, name: fallback, color: "#6a5acd", status: "offline" };
}

function timeAgo(timestamp) {
  const diff = Math.max(0, Date.now() - timestamp);
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "agora";
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `há ${hours}h`;
}

const MISSING_MOVIE = { title: "Título indisponível", age: "L", duration: 0, colors: ["#1e1b4b", "#6a5acd"] };

function roomCard(room, currentUser) {
  const movie = byId(room.movieId) || CATALOG[0] || MISSING_MOVIE;
  const isHost = room.hostId === currentUser.id;
  const people = [currentUser, ...room.participants.filter((id) => id !== currentUser.id).map((id) => roomUser(id))].slice(0, 4);
  return `<article class="room-card">
    <div class="room-thumb"><div class="poster" style="--c1:${movie.colors[0]};--c2:${movie.colors[1]}"><div class="poster-topline"><span class="poster-grade">${escapeHTML(movie.age)}</span></div><div class="poster-ring"></div><span class="poster-title">${escapeHTML(movie.title)}</span></div></div>
    <div class="room-info">
      <div class="row-between"><h3>${escapeHTML(room.name)}</h3>${room.isPrivate ? '<i class="fa-solid fa-lock tiny muted"></i>' : '<span class="room-live">ao vivo</span>'}</div>
      <p>${escapeHTML(movie.title)} · ${formatDuration(movie.duration)}</p>
      <div class="room-meta"><span class="room-avatars">${people.map((person) => avatar(person, "xs")).join("")}</span><span>${room.participants.length + (room.participants.includes(currentUser.id) ? 0 : 1)} pessoas</span><span>·</span><span>${timeAgo(room.createdAt)}</span></div>
      <div class="row-between"><span class="tiny muted">Anfitrião: ${escapeHTML(room.host)}</span><button class="btn btn-sm ${isHost ? "btn-primary" : "btn-ghost"}" data-join-room="${escapeHTML(room.code)}" type="button">${isHost ? "Sua sala" : room.isPrivate ? "Entrar" : "Participar"} <i class="fa-solid fa-arrow-right"></i></button></div>
    </div>
  </article>`;
}

export function renderPkparty() {
  const code = new URLSearchParams(location.search).get("sala");
  const room = code ? store.getRoom(code) : null;
  if (code && room) {
    renderRoom(room);
    return;
  }
  if (code && !room) {
    qs("#page-content").innerHTML = `<div class="page-section">${emptyState("fa-tower-broadcast", "Sala não encontrada", "Confira o código ou volte ao lobby para criar uma nova sala.")}<div class="row" style="justify-content:center;margin-top:14px"><a class="btn btn-primary" href="pkparty.html"><i class="fa-solid fa-arrow-left"></i>Voltar ao lobby</a></div></div>`;
    return;
  }
  renderLobby();
}

function renderLobby() {
  const user = store.getUser();
  const rooms = store.getRooms();
  const publicRooms = rooms.filter((room) => !room.isPrivate || room.hostId === user.id);
  qs("#page-content").innerHTML = `
    <section class="party-hero">
      <div class="party-hero-inner">
        <div>
          <div class="section-kicker"><i class="fa-solid fa-tower-broadcast"></i> Sessão sincronizada</div>
          <h1>PK Party</h1>
          <p>Crie uma sala, convide seus amigos e assista junto. O chat e os controles de reprodução são sincronizados entre abas deste navegador.</p>
          <div class="row" style="margin-top:18px"><button class="btn btn-primary" id="create-room" type="button"><i class="fa-solid fa-plus"></i>Criar watch party</button><span class="badge badge-soft"><i class="fa-solid fa-users"></i> ${rooms.length} salas</span></div>
        </div>
        <form class="party-code-box" id="join-form">
          <input id="join-code" placeholder="CÓDIGO DA SALA" maxlength="12" autocomplete="off" aria-label="Código da sala">
          <button class="btn btn-light btn-sm" type="submit"><i class="fa-solid fa-right-to-bracket"></i>Entrar</button>
        </form>
      </div>
    </section>

    <section class="page-section">
      <div class="section-head"><div><div class="section-kicker"><i class="fa-solid fa-circle-play"></i> Ao vivo agora</div><h2>Salas públicas</h2></div><span class="badge badge-live"><i class="fa-solid fa-circle"></i> demo local</span></div>
      <div class="rooms-grid">${publicRooms.length ? publicRooms.map((room) => roomCard(room, user)).join("") : emptyState("fa-tower-broadcast", "Nenhuma sala ativa", "Crie a primeira watch party e convide alguém.")}</div>
    </section>

    <section class="page-section">
      <div class="section-head"><div><div class="section-kicker"><i class="fa-solid fa-wand-magic-sparkles"></i> Como funciona</div><h2>Três passos, uma sessão.</h2></div></div>
      <div class="stat-grid">
        <div class="panel panel-pad"><div class="section-kicker">01 · Escolha</div><h3 style="margin-top:6px">Selecione um título</h3><p class="tiny" style="margin-top:5px">Filmes ou séries do catálogo demo, com vídeo de prévia.</p></div>
        <div class="panel panel-pad"><div class="section-kicker">02 · Convide</div><h3 style="margin-top:6px">Compartilhe o código</h3><p class="tiny" style="margin-top:5px">Abra em outra aba para testar chat e sincronização.</p></div>
        <div class="panel panel-pad"><div class="section-kicker">03 · Assista</div><h3 style="margin-top:6px">Controles em conjunto</h3><p class="tiny" style="margin-top:5px">O anfitrião controla play, pause e seek para todos.</p></div>
        <div class="panel panel-pad"><div class="section-kicker">Extra</div><h3 style="margin-top:6px">Privacidade</h3><p class="tiny" style="margin-top:5px">Salas privadas exigem o código para entrar.</p></div>
      </div>
    </section>`;

  mountLobby();
}

function mountLobby() {
  qs("#create-room")?.addEventListener("click", openCreateRoom);
  qs("#join-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const code = qs("#join-code").value.trim().toUpperCase();
    if (!code) return;
    const room = store.getRoom(code);
    if (!room) { toast("Código não encontrado. Confira e tente novamente.", "error", "Sala inexistente"); return; }
    location.href = `pkparty.html?sala=${encodeURIComponent(room.code)}`;
  });
  qsa("[data-join-room]").forEach((button) => {
    button.addEventListener("click", () => {
      const room = store.getRoom(button.dataset.joinRoom);
      if (room) location.href = `pkparty.html?sala=${encodeURIComponent(room.code)}`;
    });
  });
}

function openCreateRoom() {
  const user = store.getUser();
  const content = `
    <button class="modal-close" data-close-modal type="button" aria-label="Fechar"><i class="fa-solid fa-xmark"></i></button>
    <div class="auth-head"><div class="brand-mark">${escapeHTML("PK")}</div><h2>Criar watch party</h2><p>Escolha um título e defina quem pode entrar.</p></div>
    <form class="auth-body" id="create-room-form">
      <div class="field"><label for="room-name">Nome da sala</label><input class="input" id="room-name" name="name" maxlength="32" placeholder="Ex.: Noite de terror" required></div>
      <div class="field"><label for="room-movie">Título</label><select class="select" id="room-movie" name="movieId" required>${CATALOG.map((item) => `<option value="${item.id}">${escapeHTML(item.title)} · ${item.type === "series" ? "série" : "filme"}</option>`).join("")}</select></div>
      <label class="row-between tiny" style="gap:12px"><span>Sala privada (entrar só com código)</span><input type="checkbox" name="isPrivate" id="room-private"></label>
      <div class="panel panel-pad" style="background:rgba(106,90,205,.08)"><div class="row"><i class="fa-solid fa-circle-info" style="color:var(--accent-bright)"></i><span class="tiny muted">Você será o anfitrião. O vídeo é uma prévia Creative Commons.</span></div></div>
      <button class="btn btn-primary btn-block" type="submit"><i class="fa-solid fa-tower-broadcast"></i>Criar sala</button>
    </form>`;

  openModal(content, { className: "modal-sm", label: "Criar sala", onMount: () => {
    qs("#create-room-form")?.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const code = `PK-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      const room = {
        code,
        name: String(data.get("name") || "").trim() || `Sala de ${user.name}`,
        movieId: data.get("movieId"),
        host: user.name,
        hostId: user.id,
        isPrivate: Boolean(data.get("isPrivate")),
        participants: [user.id],
        createdAt: Date.now()
      };
      store.saveRoom(room);
      closeModal();
      location.href = `pkparty.html?sala=${encodeURIComponent(code)}`;
    });
  }});
}

function participantsFor(room, currentUser) {
  const map = new Map();
  map.set(currentUser.id, currentUser);
  room.participants.forEach((id) => {
    if (!map.has(id)) map.set(id, roomUser(id, id === room.hostId ? room.host : "Convidado"));
  });
  if (room.hostId && !map.has(room.hostId)) map.set(room.hostId, { id: room.hostId, name: room.host, color: "#fbbf24", status: "online" });
  return [...map.values()];
}

function renderRoom(room) {
  const user = store.getUser();
  const movie = byId(room.movieId) || CATALOG[0] || MISSING_MOVIE;
  const isHost = room.hostId === user.id;
  const participants = participantsFor(room, user);
  const chat = store.getChat(room.code);

  qs("#page-content").innerHTML = `
    <div class="party-room">
      <div>
        <div class="party-stage">
          <div class="party-stage-head">
            <span class="badge badge-live"><i class="fa-solid fa-circle"></i> ${isHost ? "você é o anfitrião" : "sessão ao vivo"}</span>
            <div class="grow"><h2 id="party-movie-title">${escapeHTML(movie.title)}</h2><div class="meta"><span>${escapeHTML(room.name)}</span><span class="dot"></span><span class="tiny">${isHost ? "Controles sincronizados" : "Sincronizado com o anfitrião"}</span></div></div>
            <span class="badge badge-soft"><i class="fa-solid fa-users"></i> ${participants.length}</span>
          </div>
          <video id="party-video" controls playsinline preload="metadata"></video>
          <div class="party-stage-foot">
            <div class="grow"><strong>${escapeHTML(room.host)}</strong><span>Anfitrião · ${room.isPrivate ? "sala privada" : "sala pública"}</span></div>
            ${isHost ? '<button class="btn btn-sm btn-ghost" data-change-media type="button"><i class="fa-solid fa-film"></i>Trocar título</button>' : ""}
            <button class="btn btn-sm btn-ghost" data-sync-room type="button"><i class="fa-solid fa-rotate"></i>Sincronizar</button>
            <button class="btn btn-sm btn-ghost" data-copy-party-code type="button"><i class="fa-solid fa-copy"></i><span class="hide-xs">${escapeHTML(room.code)}</span></button>
            <a class="btn btn-sm btn-danger" href="pkparty.html"><i class="fa-solid fa-right-from-bracket"></i>Sair</a>
          </div>
        </div>
        <div class="panel panel-pad" style="margin-top:12px">
          <div class="row-between"><div><div class="section-kicker"><i class="fa-solid fa-circle-info"></i> Sobre a sessão</div><h3>${escapeHTML(movie.title)}</h3></div><span class="badge badge-soft">${escapeHTML(movie.age)} · ${formatDuration(movie.duration)}</span></div>
          <p class="small" style="margin-top:8px">${escapeHTML(movie.synopsis)}</p>
          <div class="row wrap" style="margin-top:12px">${movie.genres.map((genre) => `<span class="chip">${escapeHTML(genre)}</span>`).join("")}</div>
          <div class="row" style="margin-top:14px"><button class="btn btn-primary btn-sm" data-play="${escapeHTML(movie.id)}" type="button"><i class="fa-solid fa-play"></i>Abrir no player</button><span class="tiny muted"><i class="fa-solid fa-shield-halved"></i> Vídeo de demonstração</span></div>
        </div>
      </div>

      <aside class="party-side">
        <div class="party-chat">
          <div class="party-chat-head"><h3><i class="fa-solid fa-comments"></i> Chat da sala</h3><span>${participants.length} na sala</span></div>
          <div class="party-chat-log" id="party-chat-log">${chat.map(chatMarkup(user)).join("")}</div>
          <form class="party-chat-form" id="party-chat-form">
            <input id="party-chat-input" maxlength="240" placeholder="Escreva uma mensagem..." autocomplete="off" aria-label="Mensagem do chat">
            <button type="submit" aria-label="Enviar mensagem"><i class="fa-solid fa-paper-plane"></i></button>
          </form>
        </div>

        <div class="participants">
          <div class="participants-head"><i class="fa-solid fa-users"></i> Participantes</div>
          <div class="participants-list">${participants.map((person) => `<div class="participant">${avatar(person, "xs")}<strong>${escapeHTML(person.name)}</strong><span>${person.id === room.hostId ? '<i class="fa-solid fa-crown" style="color:var(--gold)"></i>' : "online"}</span></div>`).join("")}</div>
        </div>

        <div class="panel panel-pad">
          <div class="section-kicker"><i class="fa-solid fa-link"></i> Convite</div>
          <p class="tiny" style="margin-top:6px">Código: <strong>${escapeHTML(room.code)}</strong>. Abra outra aba neste navegador e entre com o código para testar a sincronização.</p>
          <button class="btn btn-ghost btn-sm btn-block" data-copy-party-code type="button" style="margin-top:10px"><i class="fa-solid fa-copy"></i>Copiar código</button>
        </div>
      </aside>
    </div>`;

  mountRoom(room, movie, user, isHost);
}

function chatMarkup(user) {
  return (message) => {
    if (message.system) return `<div class="chat-msg system"><p>${escapeHTML(message.text)}</p></div>`;
    const self = message.senderId === user.id;
    return `<div class="chat-msg ${self ? "self" : ""}">${avatar({ name: message.senderName, color: message.senderColor }, "xs")}<div class="chat-msg-body"><strong>${escapeHTML(self ? "Você" : message.senderName)}</strong><p>${escapeHTML(message.text)}</p></div></div>`;
  };
}

function scrollChat() {
  const log = qs("#party-chat-log");
  if (log) log.scrollTop = log.scrollHeight;
}

function refreshChat(room, user) {
  const log = qs("#party-chat-log");
  if (!log) return;
  log.innerHTML = store.getChat(room.code).map(chatMarkup(user)).join("");
  scrollChat();
}

function mountRoom(room, movie, user, isHost) {
  const video = qs("#party-video");
  if (!video) return;
  video.src = movie.stream;
  const channel = "BroadcastChannel" in window ? new BroadcastChannel(`pkparty-${room.code}`) : null;
  activeChannel = channel;
  let applyingRemote = false;

  const broadcast = (payload) => channel?.postMessage({ ...payload, senderId: user.id, at: Date.now() });

  const applySync = (data) => {
    if (data.senderId === user.id) return;
    applyingRemote = true;
    if (data.action === "play") {
      if (Number.isFinite(data.time)) video.currentTime = Math.max(0, data.time + (Date.now() - data.at) / 1000);
      video.play().catch(() => {});
    } else if (data.action === "pause") {
      if (Number.isFinite(data.time)) video.currentTime = data.time;
      video.pause();
    } else if (data.action === "seek") {
      if (Number.isFinite(data.time)) video.currentTime = data.time;
    }
    setTimeout(() => { applyingRemote = false; }, 180);
  };

  if (isHost) {
    video.addEventListener("play", () => { if (!applyingRemote) broadcast({ type: "sync", action: "play", time: video.currentTime }); });
    video.addEventListener("pause", () => { if (!applyingRemote) broadcast({ type: "sync", action: "pause", time: video.currentTime }); });
    video.addEventListener("seeked", () => { if (!applyingRemote) broadcast({ type: "sync", action: "seek", time: video.currentTime }); });
  }

  channel?.addEventListener("message", (event) => {
    const data = event.data || {};
    if (data.senderId === user.id) return;
    if (data.type === "sync") applySync(data);
    if (data.type === "chat") refreshChat(room, user);
    if (data.type === "movie" && data.movieId) {
      const next = byId(data.movieId);
      if (next) {
        video.src = next.stream;
        const title = qs("#party-movie-title");
        if (title) title.textContent = next.title;
        video.play().catch(() => {});
      }
    }
    if (data.type === "request-sync" && isHost) {
      broadcast({ type: "sync", action: video.paused ? "pause" : "play", time: video.currentTime });
    }
  });

  if (!isHost) channel?.postMessage({ type: "request-sync", senderId: user.id, at: Date.now() });

  const unsubscribe = store.onStoreChange((key) => {
    if (key === `chat.${room.code}`) refreshChat(room, user);
  });
  window.addEventListener("beforeunload", () => {
    unsubscribe();
    channel?.close();
    activeChannel = null;
  }, { once: true });

  qs("#party-chat-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const input = qs("#party-chat-input");
    const text = input.value.trim();
    if (!text) return;
    store.addChatMessage(room.code, { senderId: user.id, senderName: user.name, senderColor: user.color, text });
    input.value = "";
    refreshChat(room, user);
    broadcast({ type: "chat" });
    scrollChat();
  });

  qsa("[data-copy-party-code]").forEach((button) => {
    button.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(room.code); toast(`Código ${room.code} copiado.`, "success", "Convite"); }
      catch { toast(`Código: ${room.code}`, "info"); }
    });
  });

  qs("[data-sync-room]")?.addEventListener("click", () => {
    if (isHost) {
      broadcast({ type: "sync", action: video.paused ? "pause" : "play", time: video.currentTime });
      toast("Sincronização enviada para a sala.", "success", "PK Party");
    } else {
      channel?.postMessage({ type: "request-sync", senderId: user.id, at: Date.now() });
      toast("Pedido de sincronização enviado ao anfitrião.", "info");
    }
  });

  qs("[data-change-media]")?.addEventListener("click", () => openMediaPicker(room, movie, channel, user));

  scrollChat();
}

function openMediaPicker(room, currentMovie, channel, user) {
  const content = `
    <button class="modal-close" data-close-modal type="button" aria-label="Fechar"><i class="fa-solid fa-xmark"></i></button>
    <div class="auth-head"><div class="brand-mark">PK</div><h2>Trocar título da sala</h2><p>Somente o anfitrião pode alterar a mídia.</p></div>
    <div style="padding:20px 24px 26px"><div class="media-pick-grid">${CATALOG.map((item) => `<button class="media-pick" type="button" data-pick-media="${escapeHTML(item.id)}">
      <div class="poster" style="--c1:${item.colors[0]};--c2:${item.colors[1]}"><div class="poster-topline"><span class="poster-grade">${escapeHTML(item.age)}</span><span class="poster-type">${item.type === "series" ? "SÉRIE" : "FILME"}</span></div><div class="poster-ring"></div><span class="poster-title">${escapeHTML(item.title)}</span></div>
      <strong>${escapeHTML(item.title)}</strong><span>${item.year} · ${escapeHTML(item.genres[0])}</span>
    </button>`).join("")}</div></div>`;
  openModal(content, { className: "modal-lg", label: "Escolher mídia", onMount: () => {
    qsa("[data-pick-media]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        const next = byId(button.dataset.pickMedia);
        if (!next) return;
        store.updateRoom(room.code, { movieId: next.id });
        channel?.postMessage({ type: "movie", movieId: next.id, senderId: user.id, at: Date.now() });
        closeModal();
        location.href = `pkparty.html?sala=${encodeURIComponent(room.code)}`;
      });
    });
  }});
}
