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

/** Refresh the local badge/list cache from Supabase. */
export async function syncSocialCache() {
  if (!cloudEnabled() || !store.getUser().cloud) {
    store.setSocialCache([], []);
    return { friends: [], requests: [] };
  }
  try {
    const rows = await fetchFriendsState();
    const friends = rows.filter((row) => row.status === "accepted").map(mapFriend);
    const requests = rows
      .filter((row) => row.status === "pending" && row.direction === "received")
      .map(mapFriend);
    store.setSocialCache(friends, requests);
    window.dispatchEvent(new CustomEvent("pk:social-changed"));
    return { friends, requests };
  } catch (error) {
    console.warn("[social] não foi possível atualizar amigos:", error.message);
    return { friends: [], requests: [] };
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

export async function sendMessage(roomId, body) {
  const user = store.getUser();
  const text = String(body || "").trim().slice(0, 1000);
  if (!text) throw new Error("Mensagem vazia.");
  const clientId = crypto.randomUUID();
  const row = {
    room_id: roomId,
    user_id: user.id,
    body: text,
    client_id: clientId,
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
