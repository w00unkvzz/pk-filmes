// Auth bridge between Supabase and the local-first store.
// Every page keeps working offline; when Supabase is configured, the session
// and profile become authoritative and are mirrored into localStorage.
import * as store from "./store.js";
import {
  cloudEnabled,
  initCloudSession,
  signOutCloud,
  appUserFromSession,
  upsertProfile,
  getSession,
  getClient
} from "./supabase.js";
import { syncSocialCache } from "./social.js";

let started = false;
let profileChannel = null;
let profileChannelUserId = "";

function unsubscribeProfileRealtime() {
  let sb = null;
  try { sb = getClient(); } catch { /* SDK ainda não carregou */ }
  if (profileChannel && sb) sb.removeChannel(profileChannel);
  profileChannel = null;
  profileChannelUserId = "";
}

function subscribeProfileRealtime(userId) {
  if (!cloudEnabled() || !userId) return;
  if (profileChannelUserId === userId) return;
  let sb = null;
  try { sb = getClient(); } catch { return; }
  if (!sb) return;
  if (profileChannel) sb.removeChannel(profileChannel);
  profileChannelUserId = userId;
  profileChannel = sb
    .channel(`w00-profile:${userId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "profiles", filter: `id=eq.${userId}` },
      ({ new: row }) => {
        const current = store.getUser();
        if (!current.authed || current.id !== userId || !row) return;
        store.saveUser({
          name: row.name || current.name,
          avatar_url: row.avatar_url ?? current.avatar_url,
          bio: row.bio || current.bio,
          favoriteGenre: row.favorite_genre || current.favoriteGenre,
          joined: row.joined || current.joined
        });
        window.dispatchEvent(new CustomEvent("pk:auth-changed"));
      }
    )
    .subscribe();
}

export function authEnabled() {
  return cloudEnabled();
}

export async function initAuth() {
  if (!cloudEnabled()) return false;
  if (started) return true;
  started = true;
  return initCloudSession((session, profile) => {
    if (!session?.user) {
      unsubscribeProfileRealtime();
      const current = store.getUser();
      if (current.cloud) store.logout();
      window.dispatchEvent(new CustomEvent("pk:auth-changed"));
      return;
    }
    const user = appUserFromSession(session, profile);
    store.saveUser(user);
    subscribeProfileRealtime(session.user.id);
    window.dispatchEvent(new CustomEvent("pk:auth-changed"));
    syncSocialCache();
  });
}

export async function logout() {
  try {
    if (cloudEnabled()) await signOutCloud();
  } catch (error) {
    console.warn("[auth] falha ao encerrar sessão remota:", error.message);
  }
  unsubscribeProfileRealtime();
  store.logout();
  window.dispatchEvent(new CustomEvent("pk:auth-changed"));
}

export async function saveCloudProfile(patch) {
  if (!cloudEnabled()) return null;
  const session = await getSession();
  if (!session?.user) return null;
  const profile = await upsertProfile(session.user, patch);
  if (profile) {
    store.saveUser(appUserFromSession(session, profile));
    window.dispatchEvent(new CustomEvent("pk:auth-changed"));
  }
  return profile;
}
