// Supabase adapter: real email/password auth, OAuth and profile persistence.
// The client is loaded from js/vendor/supabase.js (UMD) so the static build
// works on GitHub Pages/Vercel without a bundler.
import { SUPABASE_CONFIG, isSupabaseConfigured, authRedirectUrl } from "./supabase-config.js";

let client = null;
let bootPromise = null;

export function cloudEnabled() {
  return isSupabaseConfigured();
}

function sdk() {
  if (!window.supabase?.createClient) {
    throw new Error("SDK do Supabase não carregou. Verifique js/vendor/supabase.js.");
  }
  return window.supabase;
}

export function getClient() {
  if (!cloudEnabled()) return null;
  if (!client) {
    client = sdk().createClient(SUPABASE_CONFIG.url.replace(/\/$/, ""), SUPABASE_CONFIG.anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: "pkce"
      }
    });
  }
  return client;
}

export async function getSession() {
  const sb = getClient();
  if (!sb) return null;
  const { data, error } = await sb.auth.getSession();
  if (error) throw error;
  return data.session || null;
}

export async function signUp({ name, email, password }) {
  const sb = getClient();
  if (!sb) throw new Error("Supabase não configurado.");
  const { data, error } = await sb.auth.signUp({
    email: String(email || "").trim(),
    password: String(password || ""),
    options: {
      data: { name: String(name || "").trim() },
      emailRedirectTo: authRedirectUrl()
    }
  });
  if (error) throw error;
  // When e-mail confirmation is enabled there is no session yet.
  if (data.session && data.user) {
    await upsertProfile(data.user, { name, email });
  }
  return data;
}

export async function signIn({ email, password }) {
  const sb = getClient();
  if (!sb) throw new Error("Supabase não configurado.");
  const { data, error } = await sb.auth.signInWithPassword({
    email: String(email || "").trim(),
    password: String(password || "")
  });
  if (error) throw error;
  return data;
}

export async function signInWithGitHub() {
  const sb = getClient();
  if (!sb) throw new Error("Supabase não configurado.");
  const { data, error } = await sb.auth.signInWithOAuth({
    provider: "github",
    options: { redirectTo: authRedirectUrl() }
  });
  if (error) throw error;
  return data;
}

export async function signInWithGoogle() {
  const sb = getClient();
  if (!sb) throw new Error("Supabase não configurado.");
  const { data, error } = await sb.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: authRedirectUrl() }
  });
  if (error) throw error;
  return data;
}

export async function sendPasswordReset(email) {
  const sb = getClient();
  if (!sb) throw new Error("Supabase não configurado.");
  const redirect = new URL(authRedirectUrl("/perfil.html"));
  redirect.searchParams.set("recovery", "1");
  const { error } = await sb.auth.resetPasswordForEmail(String(email || "").trim(), {
    redirectTo: redirect.toString()
  });
  if (error) throw error;
}

export async function updatePassword(password) {
  const sb = getClient();
  if (!sb) throw new Error("Supabase não configurado.");
  const { data, error } = await sb.auth.updateUser({ password: String(password || "") });
  if (error) throw error;
  return data;
}

export async function signOutCloud() {
  const sb = getClient();
  if (!sb) return;
  const { error } = await sb.auth.signOut();
  if (error) throw error;
}

export function onAuthChange(callback) {
  const sb = getClient();
  if (!sb) return () => {};
  const { data } = sb.auth.onAuthStateChange((event, session) => {
    callback(event, session);
  });
  return () => data.subscription.unsubscribe();
}

export async function fetchProfile(userId) {
  const sb = getClient();
  if (!sb || !userId) return null;
  const { data, error } = await sb
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    // A missing table must not block login; the app keeps the auth metadata.
    console.warn("[supabase] perfil indisponível:", error.message);
    return null;
  }
  return data;
}

export async function upsertProfile(authUser, patch = {}) {
  const sb = getClient();
  if (!sb || !authUser?.id) return null;
  const meta = authUser.user_metadata || {};
  const email = authUser.email || patch.email || "";
  const row = {
    id: authUser.id,
    name: String(patch.name || meta.name || email.split("@")[0] || "Visitante").slice(0, 80),
    email,
    color: patch.color || meta.color || "#6a5acd",
    plan: patch.plan || "Grátis",
    plan_id: patch.planId || "free",
    bio: patch.bio || "Explorando o catálogo.",
    favorite_genre: patch.favoriteGenre || "Ficção",
    joined: patch.joined || new Date().toISOString().slice(0, 10),
    updated_at: new Date().toISOString()
  };
  const { data, error } = await sb
    .from("profiles")
    .upsert(row, { onConflict: "id" })
    .select()
    .maybeSingle();
  if (error) {
    console.warn("[supabase] não foi possível salvar o perfil:", error.message);
    return null;
  }
  return data;
}

export function appUserFromSession(session, profile = null) {
  const authUser = session?.user;
  if (!authUser) return null;
  const meta = authUser.user_metadata || {};
  const email = authUser.email || "";
  return {
    id: authUser.id,
    name: profile?.name || meta.name || email.split("@")[0] || "Visitante",
    email,
    color: profile?.color || meta.color || "#6a5acd",
    plan: profile?.plan || "Grátis",
    planId: profile?.plan_id || "free",
    joined: profile?.joined || (authUser.created_at ? authUser.created_at.slice(0, 10) : ""),
    bio: profile?.bio || "Explorando o catálogo.",
    favoriteGenre: profile?.favorite_genre || "Ficção",
    authed: true,
    cloud: true
  };
}

/**
 * Restore the current session once and subscribe to auth changes.
 * Returns true when a cloud session is active.
 */
export async function initCloudSession(onUser) {
  if (!cloudEnabled()) return false;
  if (!bootPromise) {
    bootPromise = (async () => {
      const session = await getSession();
      if (session?.user) {
        const profile = await fetchProfile(session.user.id);
        onUser?.(session, profile);
      }
      onAuthChange(async (event, nextSession) => {
        if (event === "SIGNED_OUT" || !nextSession?.user) {
          onUser?.(null, null);
          return;
        }
        const profile = await fetchProfile(nextSession.user.id);
        onUser?.(nextSession, profile);
      });
      return Boolean(session?.user);
    })();
  }
  return bootPromise;
}
