// Supabase project credentials.
// The anon key is public by design; Row Level Security protects the data.
// Fill both values from Supabase → Project Settings → API.
export const SUPABASE_CONFIG = {
  url: "https://jpeuyfjbxjqisxnbkonb.supabase.co",
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpwZXV5ZmpieGpxaXN4bmJrb25iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI2NDE5MTAsImV4cCI6MjEwODIxNzkxMH0.Yr7idZLyHTVAF5P8zaYPxaQe8vmNfnQ3NMe0Dx2TWr0",
  // Optional. Leave empty to redirect back to the current page.
  redirectTo: "",
  // Set true only after enabling the GitHub provider in Supabase.
  githubOAuth: false
};

export function isSupabaseConfigured() {
  return Boolean(
    SUPABASE_CONFIG.url &&
    SUPABASE_CONFIG.anonKey &&
    /^https:\/\/.+\.supabase\.co\/?$/.test(SUPABASE_CONFIG.url)
  );
}

export function authRedirectUrl(path = "") {
  if (SUPABASE_CONFIG.redirectTo) return SUPABASE_CONFIG.redirectTo;
  const base = `${location.origin}${location.pathname}`;
  return path ? new URL(path, base).toString() : base;
}
