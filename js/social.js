// Supabase social layer: friends, watch-party rooms, chat and avatars.
import { getClient, cloudEnabled } from "./supabase.js";
import * as store from "./store.js";

function client() {
  const sb = getClient();
  if (!sb) throw new Error("Recurso indisponível no momento.");
  return sb;
}

function throwIf(error) {
  if (error) throw new Error(error.message || "Não foi possível concluir a ação.");
}

/* ---------------------------------------------------------------------------
 * Friends
 * ------------------------------------------------------------------------ */
export async function fetchFriendsState() {
  const { data, error } = await client().rpc("friends_state");
  throwIf(error);
  return data || [];
}

export async function searchProfiles(query = "") {
  const { data, error } = await client().rpc("search_profiles", { p_query: query });
  throwIf(error);
  return data || [];
}

export async function sendFriendRequest(userId) {
  const { data, error } = await client().rpc("send_friend_request", { p_addressee: userId });
  throwIf(error);
  return data;
}

export async function respondFriendRequest(id, accept) {
  const { data, error } = await client().rpc("respond_friend_request", {
    p_id: id,
    p_accept: Boolean(accept)
  });
  throwIf(error);
  return data;
}

export async function removeFriendship(id) {
  const { data, error } = await client().rpc("remove_friendship", { p_id: id });
  throwIf(error);
  return data;
}

export function mapFriend(row) {
  return {
    id: row.other_id,
    friendshipId: row.friendship_id,
    name: row.name || "Usuário",
    avatar_url: row.avatar_url || "",
    favoriteGenre: row.favorite_genre || "",
    status: row.status,
    direction: row.direction,
    since: row.created_at ? String(row.created_at).slice(0, 10) : ""
  };
}

let socialChannel = null;
let socialChannelUserId = "";
let socialPollTimer = null;
let lastSocialSignature = "";
let lastRoomInviteIds = new Set();
let roomInvitesFirst = true;

function socialSignature(friends, requests) {
  const f = friends.map((row) => `${row.id}:${row.status}:${row.name}`).sort();
  const r = requests.map((row) => `${row.id}:${row.name}`).sort();
  return JSON.stringify({ f, r });
}

function stopSocialPolling() {
  if (socialPollTimer) clearInterval(socialPollTimer);
  socialPollTimer = null;
}

function startSocialPolling() {
  stopSocialPolling();
  socialPollTimer = setInterval(() => {
    if (document.visibilityState !== "visible") return;
    syncSocialCache().catch(() => {});
    syncRoomInvites().catch(() => {});
  }, 20000);
}

/** Drop the global friendships feed (logout / troca de conta). */
export function stopSocialRealtime() {
  stopSocialPolling();
  if (socialChannel) {
    try { getClient()?.removeChannel(socialChannel); } catch {}
  }
  socialChannel = null;
  socialChannelUserId = "";
  lastSocialSignature = "";
  lastRoomInviteIds = new Set();
  roomInvitesFirst = true;
  store.setRoomInvites([]);
}

/**
 * Global friendships feed. Fica ativo em qualquer página, não só em /amigos.
 * Usa Realtime quando a tabela está publicada e um polling leve como rede de
 * segurança para o convite aparecer sem recarregar a página.
 */
export function startSocialRealtime(userId) {
  const user = store.getUser();
  const uid = userId || user?.id;
  if (!cloudEnabled() || !user?.cloud || !uid) {
    stopSocialRealtime();
    return;
  }
  if (socialChannel && socialChannelUserId === uid) {
    startSocialPolling();
    return;
  }
  let sb = null;
  try { sb = getClient(); } catch { return; }
  if (!sb) return;
  stopSocialRealtime();
  socialChannelUserId = uid;
  socialChannel = sb
    .channel(`w00-social:${uid}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "friendships" }, () => {
      syncSocialCache().catch(() => {});
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "room_invites", filter: `invitee=eq.${uid}` }, () => {
      syncRoomInvites().catch(() => {});
    })
    .subscribe();
  startSocialPolling();
  syncRoomInvites().catch(() => {});
}

if (typeof document !== "undefined" && !window.__w00SocialVisibilityBound) {
  window.__w00SocialVisibilityBound = true;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && store.getUser().cloud) {
      syncSocialCache().catch(() => {});
      syncRoomInvites().catch(() => {});
    }
  });
}

/** Refresh the local badge/list cache from Supabase. */
export async function syncSocialCache() {
  if (!cloudEnabled() || !store.getUser().cloud) {
    store.setSocialCache([], []);
    lastSocialSignature = "";
    return { friends: [], requests: [] };
  }
  try {
    const rows = await fetchFriendsState();
    const friends = rows.filter((row) => row.status === "accepted").map(mapFriend);
    const requests = rows
      .filter((row) => row.status === "pending" && row.direction === "received")
      .map(mapFriend);
    const firstSync = !lastSocialSignature;
    const previousIds = new Set(store.getFriendRequests().map((row) => row.id));
    store.setSocialCache(friends, requests);
    const signature = socialSignature(friends, requests);
    if (signature !== lastSocialSignature) {
      const addedRequests = firstSync ? [] : requests.filter((row) => !previousIds.has(row.id));
      lastSocialSignature = signature;
      window.dispatchEvent(new CustomEvent("pk:social-changed", {
        detail: { friends, requests, addedRequests }
      }));
    }
    return { friends, requests };
  } catch (error) {
    console.warn("[social] não foi possível atualizar amigos:", error.message);
    return { friends: [], requests: [] };
  }
}

/* ---------------------------------------------------------------------------
 * Room invites (global Supabase Realtime feed, any page)
 * ------------------------------------------------------------------------ */
/**
 * Mantém os convites de sala sincronizados em qualquer página. Quando um
 * convite novo chega, dispara `pk:room-invites-changed` para o app avisar e
 * para o lobby se atualizar sem recarregar nada.
 */
export async function syncRoomInvites() {
  if (!cloudEnabled() || !store.getUser().cloud) {
    lastRoomInviteIds = new Set();
    roomInvitesFirst = true;
    store.setRoomInvites([]);
    return [];
  }
  try {
    const invites = await myRoomInvites();
    const ids = new Set(invites.map((invite) => invite.id));
    const added = roomInvitesFirst
      ? []
      : invites.filter((invite) => !lastRoomInviteIds.has(invite.id));
    const changed =
      ids.size !== lastRoomInviteIds.size ||
      [...ids].some((id) => !lastRoomInviteIds.has(id));
    lastRoomInviteIds = ids;
    roomInvitesFirst = false;
    store.setRoomInvites(invites);
    if (changed) {
      window.dispatchEvent(new CustomEvent("pk:room-invites-changed", {
        detail: { invites, added }
      }));
    }
    return invites;
  } catch (error) {
    console.warn("[social] não foi possível atualizar convites:", error.message);
    return [];
  }
}

/* ---------------------------------------------------------------------------
 * Rooms
 * ------------------------------------------------------------------------ */
export async function listRooms() {
  const { data, error } = await client().rpc("list_rooms");
  throwIf(error);
  // Defense in depth: even if an older list_rooms RPC is still deployed,
  // private rooms must never leak into the public lobby.
  return (data || []).filter((room) => room.is_private !== true);
}

export async function createRoom({ name, movieId, isPrivate = false }) {
  const { data, error } = await client().rpc("create_room", {
    p_name: name,
    p_movie_id: movieId,
    p_is_private: Boolean(isPrivate)
  });
  throwIf(error);
  return data;
}

export async function joinRoom(code) {
  const { data, error } = await client().rpc("join_room", { p_code: code });
  throwIf(error);
  return data;
}

/**
 * A private-room invite is consumed when the guest joins. If that guest later
 * leaves (or the host reopens the room), the invite stays "accepted" while the
 * membership is gone. The old join_room RPC only looked for "pending", so the
 * guest saw "invite required" even though the invite existed. Reopen the exact
 * invite for this room code before retrying.
 */
export async function reopenRoomInvite(code) {
  const user = store.getUser();
  const normalized = String(code || "").trim().toUpperCase();
  if (!user?.id || !normalized) return null;

  const { data, error } = await client()
    .from("room_invites")
    .select("id,status,rooms!inner(code)")
    .eq("invitee", user.id)
    .eq("status", "accepted")
    .eq("rooms.code", normalized)
    .maybeSingle();
  throwIf(error);
  if (!data?.id) return null;

  const { error: updateError } = await client()
    .from("room_invites")
    .update({ status: "pending" })
    .eq("id", data.id)
    .eq("invitee", user.id);
  throwIf(updateError);
  return data.id;
}

/**
 * Private room links carry the room id as a share token. The RLS policy on
 * room_members already lets an authenticated user add their own seat, so a
 * guest with the link can enter even when the host shared only the URL and no
 * in-app invite exists. The path code is checked against the room id so a
 * mismatched/tampered link cannot add the guest to a different room.
 */
export async function joinRoomByLink(code, roomId) {
  const user = store.getUser();
  const normalized = String(code || "").trim().toUpperCase();
  if (!user?.id || !normalized || !roomId) throw new Error("invite required");

  const { error } = await client()
    .from("room_members")
    .insert({ room_id: roomId, user_id: user.id });
  const alreadyMember = error?.code === "23505";
  if (error && !alreadyMember) throw error;

  const room = await getRoom(roomId);
  if (!room || String(room.code || "").toUpperCase() !== normalized) {
    if (!alreadyMember) {
      try {
        await client()
          .from("room_members")
          .delete()
          .eq("room_id", roomId)
          .eq("user_id", user.id);
      } catch {}
    }
    throw new Error("room not found");
  }

  // If the host also sent an in-app invite, consume it so the lobby stops
  // showing a room the guest is already in.
  try {
    const { data } = await client()
      .from("room_invites")
      .select("id,rooms!inner(code)")
      .eq("invitee", user.id)
      .eq("status", "pending")
      .eq("rooms.code", normalized)
      .maybeSingle();
    if (data?.id) {
      await client().rpc("respond_room_invite", { p_id: data.id, p_accept: true });
    }
  } catch {}

  return room;
}

export async function joinRoomWithRepair(code, roomId = "") {
  try {
    return await joinRoom(code);
  } catch (error) {
    if (error?.message !== "invite required") throw error;

    let inviteId = null;
    try {
      inviteId = await reopenRoomInvite(code);
    } catch (repairError) {
      // The link fallback below is enough when the invite lookup fails.
      if (!roomId) throw repairError;
    }
    if (inviteId) {
      try {
        return await joinRoom(code);
      } catch (retryError) {
        const user = store.getUser();
        if (user?.id) {
          try {
            await client()
              .from("room_invites")
              .update({ status: "accepted" })
              .eq("id", inviteId)
              .eq("invitee", user.id);
          } catch {}
        }
        if (!roomId) throw retryError;
      }
    }

    if (roomId) return await joinRoomByLink(code, roomId);
    throw error;
  }
}

export async function leaveRoom(roomId) {
  const { data, error } = await client().rpc("leave_room", { p_room: roomId });
  throwIf(error);
  return data;
}

export async function getRoom(roomId) {
  const { data, error } = await client().from("rooms").select("*").eq("id", roomId).maybeSingle();
  throwIf(error);
  return data;
}

export async function getRoomByCode(code) {
  const { data, error } = await client()
    .from("rooms")
    .select("*")
    .eq("code", String(code || "").trim().toUpperCase())
    .maybeSingle();
  throwIf(error);
  return data;
}

export async function roomMembers(roomId) {
  const { data, error } = await client().rpc("room_members_view", { p_room: roomId });
  throwIf(error);
  return data || [];
}

export async function updateRoomMovie(roomId, movieId) {
  const { data, error } = await client()
    .from("rooms")
    .update({ movie_id: movieId })
    .eq("id", roomId)
    .select()
    .maybeSingle();
  throwIf(error);
  return data;
}

export async function savePlaybackState(roomId, state) {
  const { error } = await client()
    .from("rooms")
    .update({ playback_state: state })
    .eq("id", roomId);
  throwIf(error);
}

export async function loadMessages(roomId) {
  const { data, error } = await client()
    .from("room_messages")
    .select("*")
    .eq("room_id", roomId)
    .order("created_at", { ascending: true })
    .limit(120);
  throwIf(error);
  return data || [];
}

export async function sendMessage(roomId, body, clientId) {
  const user = store.getUser();
  const text = String(body || "").trim().slice(0, 1000);
  if (!text) throw new Error("Mensagem vazia.");
  const row = {
    room_id: roomId,
    user_id: user.id,
    body: text,
    client_id: clientId || crypto.randomUUID(),
    sender_name: user.name,
    sender_avatar: user.avatar_url || ""
  };
  const { data, error } = await client()
    .from("room_messages")
    .insert(row)
    .select()
    .single();
  throwIf(error);
  return data;
}

export async function myRoomInvites() {
  const { data, error } = await client().rpc("my_room_invites");
  throwIf(error);
  return data || [];
}

export async function respondRoomInvite(id, accept) {
  const { data, error } = await client().rpc("respond_room_invite", {
    p_id: id,
    p_accept: Boolean(accept)
  });
  throwIf(error);
  return data;
}

/* ---------------------------------------------------------------------------
 * Profile + avatar
 * ------------------------------------------------------------------------ */
export async function updateProfile(patch) {
  const user = store.getUser();
  if (!user.cloud) throw new Error("Entre na sua conta para salvar o perfil.");
  const row = {
    name: patch.name,
    bio: patch.bio,
    favorite_genre: patch.favoriteGenre,
    avatar_url: patch.avatar_url
  };
  Object.keys(row).forEach((key) => row[key] === undefined && delete row[key]);
  row.updated_at = new Date().toISOString();

  const { data, error } = await client()
    .from("profiles")
    .update(row)
    .eq("id", user.id)
    .select()
    .maybeSingle();
  throwIf(error);

  store.saveUser({
    name: data?.name ?? user.name,
    bio: data?.bio ?? user.bio,
    favoriteGenre: data?.favorite_genre ?? user.favoriteGenre,
    avatar_url: data?.avatar_url ?? user.avatar_url
  });
  window.dispatchEvent(new CustomEvent("pk:auth-changed"));
  return data;
}

const ALLOWED_AVATARS = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif"
};

export async function uploadAvatar(file) {
  const user = store.getUser();
  if (!user.cloud) throw new Error("Entre na sua conta para enviar uma foto.");
  if (!file) throw new Error("Escolha uma imagem ou GIF.");
  const ext = ALLOWED_AVATARS[file.type];
  if (!ext) throw new Error("Use JPG, PNG, WEBP ou GIF.");
  if (file.size > 10 * 1024 * 1024) throw new Error("A imagem deve ter no máximo 10 MB.");

  const previous = user.avatar_url || "";
  const path = `${user.id}/avatar-${Date.now()}.${ext}`;
  const bucket = client().storage.from("avatars");
  const { error: uploadError } = await bucket.upload(path, file, {
    cacheControl: "3600",
    contentType: file.type,
    upsert: false
  });
  throwIf(uploadError);

  const { data: publicData } = bucket.getPublicUrl(path);
  const avatarUrl = publicData.publicUrl;

  const { data, error } = await client()
    .from("profiles")
    .update({ avatar_url: avatarUrl, updated_at: new Date().toISOString() })
    .eq("id", user.id)
    .select()
    .maybeSingle();
  throwIf(error);

  store.saveUser({ avatar_url: avatarUrl });
  window.dispatchEvent(new CustomEvent("pk:auth-changed"));

  // Best effort cleanup of the previous avatar in the same folder.
  if (previous.includes("/object/public/avatars/")) {
    const oldPath = previous.split("/object/public/avatars/")[1]?.split("?")[0];
    if (oldPath?.startsWith(`${user.id}/`)) {
      bucket.remove([decodeURIComponent(oldPath)]).catch(() => {});
    }
  }

  return data?.avatar_url || avatarUrl;
}
