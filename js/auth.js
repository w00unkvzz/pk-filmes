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
  getSession
} from "./supabase.js";
import { syncSocialCache } from "./social.js";

let started = false;

export function authEnabled() {
  return cloudEnabled();
}

export async function initAuth() {
  if (!cloudEnabled()) return false;
  if (started) return true;
  started = true;
  return initCloudSession((session, profile) => {
    if (!session?.user) {
      const current = store.getUser();
      if (current.cloud) store.logout();
      window.dispatchEvent(new CustomEvent("pk:auth-changed"));
      return;
    }
    const user = appUserFromSession(session, profile);
    store.saveUser(user);
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
