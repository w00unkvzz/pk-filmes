// First-run experience: cinema preloader, account gate and the Netflix-style
// profile studio. The site keeps rendering behind the overlay, so after the
// gate closes the current route is already painted.
import { CONFIG } from "./config.js";
import { DEFAULT_USER } from "./data.js";
import * as store from "./store.js";
import { authEnabled } from "./auth.js";
import {
  signIn,
  signUp,
  signInWithGoogle,
  sendPasswordReset,
  appUserFromSession,
  upsertProfile
} from "./supabase.js";
import { updateProfile, uploadAvatar } from "./social.js";

const P = CONFIG.storagePrefix;
const PRELOADER_KEY = `${P}preloader.seen`;
const PENDING_KEY = `${P}profile.pending`;
const GATE_ID = "w00-auth-gate";
const PRELOADER_ID = "w00-preloader";
const STUDIO_ID = "w00-profile-studio";
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const LOCAL_IMAGE_BYTES = 2 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

const esc = (value = "") => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

let gateAuthListener = null;
let studioOnDone = null;
let studioMode = "manage";
let studioEditing = false;
let studioAvatar = "";
let studioAvatarFile = null;
let studioPreviewUrl = "";

function readPendingProfile() {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : { email: String(raw) };
  } catch {
    return null;
  }
}

function markProfilePending(email) {
  try { localStorage.setItem(PENDING_KEY, JSON.stringify({ email: String(email || "").toLowerCase() })); } catch {}
}

function clearProfilePending() {
  try { localStorage.removeItem(PENDING_KEY); } catch {}
}

function pendingProfileFor(user) {
  const pending = readPendingProfile();
  if (!pending) return false;
  const email = String(user?.email || "").toLowerCase();
  return !pending.email || !email || pending.email === email;
}

function openPendingProfileIfAny(user) {
  const pending = readPendingProfile();
  if (pending && !pendingProfileFor(user)) clearProfilePending();
  if (!pendingProfileFor(user)) return false;
  openProfileStudio({ mode: "onboarding" });
  return true;
}

function initials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "W";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

function photoMarkup(src, name) {
  if (!src) return `<span class="ps-photo-fallback" aria-hidden="true">${esc(initials(name))}</span>`;
  return `<img src="${esc(src)}" alt="" loading="eager" decoding="async">`;
}

function revokePreview() {
  if (studioPreviewUrl.startsWith("blob:")) URL.revokeObjectURL(studioPreviewUrl);
  studioPreviewUrl = "";
}

function previewSource(user) {
  return studioPreviewUrl || studioAvatar || user?.avatar_url || "";
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Não foi possível ler a imagem."));
    reader.readAsDataURL(file);
  });
}

function lockBody() {
  document.body.classList.add("w00-onboarding-active");
}

function unlockBodyIfIdle() {
  if (document.getElementById(GATE_ID) || document.getElementById(STUDIO_ID) || document.getElementById(PRELOADER_ID)) return;
  document.body.classList.remove("w00-onboarding-active");
}

/* --------------------------------------------------------------------------
   Preloader
   ------------------------------------------------------------------------ */
function showPreloader() {
  if (document.getElementById(PRELOADER_ID)) return document.getElementById(PRELOADER_ID);
  const el = document.createElement("div");
  el.id = PRELOADER_ID;
  el.className = "w00-preloader";
  el.setAttribute("role", "status");
  el.setAttribute("aria-label", "Abrindo w00filmes");
  el.innerHTML = `
    <div class="preloader-core">
      <div class="preloader-brand" aria-hidden="true"><span>w00</span>filmes</div>
      <div class="preloader-line" aria-hidden="true"><i></i></div>
    </div>`;
  document.body.appendChild(el);
  return el;
}

async function hidePreloader(el) {
  if (!el) return;
  el.classList.add("is-leaving");
  await wait(reducedMotion() ? 80 : 280);
  el.remove();
  unlockBodyIfIdle();
}

/* --------------------------------------------------------------------------
   Account gate
   ------------------------------------------------------------------------ */
function gateMarkup() {
  return `
    <div class="gate-bg" aria-hidden="true"></div>
    <div class="gate-shell">
      <header class="gate-top">
        <a class="gate-brand" href="/" aria-label="w00filmes"><span>w00</span>filmes</a>
      </header>
      <main class="gate-main">
        <section class="gate-panel" aria-label="Entrar ou criar conta">
          <h1 class="gate-title" data-gate-title>Informe seus dados<br>para entrar</h1>
          <p class="gate-subtitle">
            <span data-gate-copy="login">Ou <button class="gate-switch" data-gate-tab="signup" type="button">crie uma conta</button>.</span>
            <span data-gate-copy="signup" hidden>Já tem uma conta? <button class="gate-switch" data-gate-tab="login" type="button">Entrar</button>.</span>
          </p>

          <form class="gate-form" id="gate-login-form" novalidate>
            <input class="gate-input" id="gate-login-email" name="email" type="email" autocomplete="email" placeholder="E-mail" aria-label="E-mail" required>
            <input class="gate-input" id="gate-login-password" name="password" type="password" autocomplete="current-password" placeholder="Senha" aria-label="Senha" required>
            <p class="gate-msg" data-gate-msg></p>
            <button class="gate-submit" type="submit"><span>Continuar</span><i class="fa-solid fa-arrow-right"></i></button>
            <button class="gate-forgot" data-gate-forgot type="button">Esqueci minha senha</button>
          </form>

          <form class="gate-form" id="gate-signup-form" hidden novalidate>
            <input class="gate-input" id="gate-name" name="name" autocomplete="name" maxlength="40" placeholder="Nome" aria-label="Nome" required>
            <input class="gate-input" id="gate-signup-email" name="email" type="email" autocomplete="email" placeholder="E-mail" aria-label="E-mail" required>
            <input class="gate-input" id="gate-signup-password" name="password" type="password" autocomplete="new-password" minlength="6" placeholder="Senha (mínimo 6 caracteres)" aria-label="Senha" required>
            <p class="gate-msg" data-gate-msg></p>
            <button class="gate-submit" type="submit"><span>Criar conta</span><i class="fa-solid fa-arrow-right"></i></button>
          </form>

          <button class="gate-social" data-gate-google type="button"><i class="fa-brands fa-google"></i> Continuar com Google</button>
        </section>
      </main>
    </div>`;
}

function gateMessage(root, text, type = "error") {
  const forms = [...(root?.querySelectorAll(".gate-form") || [])].filter((form) => !form.hidden);
  const el = forms[0]?.querySelector("[data-gate-msg]") || root?.querySelector("[data-gate-msg]");
  if (!el) return;
  el.textContent = text || "";
  el.className = `gate-msg${text ? ` is-${type}` : ""}`;
}

function setFormBusy(form, busy, label) {
  if (!form) return;
  const button = form.querySelector("button[type=submit]");
  if (!button) return;
  if (busy) {
    button.dataset.label = button.querySelector("span")?.textContent || "";
    button.disabled = true;
    button.classList.add("is-loading");
    const span = button.querySelector("span");
    if (span) span.textContent = label || "Aguarde...";
  } else {
    button.disabled = false;
    button.classList.remove("is-loading");
    const span = button.querySelector("span");
    if (span && button.dataset.label) span.textContent = button.dataset.label;
  }
}

function showGate() {
  if (document.getElementById(GATE_ID)) return document.getElementById(GATE_ID);
  lockBody();
  const root = document.createElement("div");
  root.id = GATE_ID;
  root.className = "w00-auth-gate";
  root.innerHTML = gateMarkup();
  document.body.appendChild(root);
  requestAnimationFrame(() => root.classList.add("is-open"));

  const tabButtons = [...root.querySelectorAll("[data-gate-tab]")];
  const signupForm = root.querySelector("#gate-signup-form");
  const loginForm = root.querySelector("#gate-login-form");
  const gateTitle = root.querySelector("[data-gate-title]");
  const copyBlocks = [...root.querySelectorAll("[data-gate-copy]")];

  function switchTab(tab) {
    const signup = tab === "signup";
    if (signupForm) signupForm.hidden = !signup;
    if (loginForm) loginForm.hidden = signup;
    if (gateTitle) gateTitle.innerHTML = signup ? "Crie sua conta" : "Informe seus dados<br>para entrar";
    copyBlocks.forEach((block) => { block.hidden = block.dataset.gateCopy !== tab; });
    gateMessage(root, "");
    requestAnimationFrame(() => {
      const input = root.querySelector(signup ? "#gate-name" : "#gate-login-email");
      input?.focus({ preventScroll: true });
    });
  }

  tabButtons.forEach((button) => button.addEventListener("click", () => switchTab(button.dataset.gateTab)));

  signupForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(signupForm);
    const name = String(data.get("name") || "").trim();
    const email = String(data.get("email") || "").trim();
    const password = String(data.get("password") || "");
    if (name.length < 2) return gateMessage(root, "Escreva seu nome para continuar.");
    if (!email.includes("@")) return gateMessage(root, "Informe um e-mail válido.");
    if (password.length < 6) return gateMessage(root, "A senha precisa ter pelo menos 6 caracteres.");
    gateMessage(root, "");
    setFormBusy(signupForm, true, "Criando...");
    try {
      if (!authEnabled()) {
        const local = store.login(name, email);
        store.saveUser({ ...local, name });
        markProfilePending(email);
        window.dispatchEvent(new CustomEvent("pk:auth-changed"));
        hideGate();
        openProfileStudio({ mode: "onboarding" });
        return;
      }
      const { session } = await signUp({ name, email, password });
      if (!session?.user) {
        markProfilePending(email);
        gateMessage(root, "Conta criada. Confirme o e-mail e depois entre para continuar.", "success");
        setFormBusy(signupForm, false);
        return;
      }
      const user = appUserFromSession(session);
      store.saveUser({ ...user, name });
      markProfilePending(email);
      window.dispatchEvent(new CustomEvent("pk:auth-changed"));
      hideGate();
      openProfileStudio({ mode: "onboarding" });
    } catch (error) {
      gateMessage(root, error.message || "Não foi possível criar a conta.");
      setFormBusy(signupForm, false);
    }
  });

  loginForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(loginForm);
    const email = String(data.get("email") || "").trim();
    const password = String(data.get("password") || "");
    if (!email.includes("@")) return gateMessage(root, "Informe um e-mail válido.");
    if (!password) return gateMessage(root, "Digite sua senha.");
    gateMessage(root, "");
    setFormBusy(loginForm, true, "Entrando...");
    try {
      if (!authEnabled()) {
        const current = store.getUser();
        const next = store.login(current.name || email.split("@")[0], email);
        window.dispatchEvent(new CustomEvent("pk:auth-changed"));
        hideGate();
        openPendingProfileIfAny(next);
        return;
      }
      const { session } = await signIn({ email, password });
      if (!session?.user) throw new Error("Sessão não iniciada. Tente novamente.");
      const next = appUserFromSession(session);
      store.saveUser(next);
      window.dispatchEvent(new CustomEvent("pk:auth-changed"));
      hideGate();
      openPendingProfileIfAny(next);
    } catch (error) {
      gateMessage(root, error.message || "E-mail ou senha incorretos.");
      setFormBusy(loginForm, false);
    }
  });

  root.querySelector("[data-gate-forgot]")?.addEventListener("click", async () => {
    const email = String(root.querySelector("#gate-login-email")?.value || "").trim();
    if (!email.includes("@")) return gateMessage(root, "Digite seu e-mail para receber o link de recuperação.");
    if (!authEnabled()) return gateMessage(root, "Recuperação de senha indisponível no modo local.", "success");
    try {
      await sendPasswordReset(email);
      gateMessage(root, "Link enviado. Confira seu e-mail para criar uma nova senha.", "success");
    } catch (error) {
      gateMessage(root, error.message || "Não foi possível enviar o link.");
    }
  });

  root.querySelector("[data-gate-google]")?.addEventListener("click", async () => {
    try {
      if (!authEnabled()) return gateMessage(root, "Login com Google indisponível no modo local.");
      await signInWithGoogle();
    } catch (error) {
      gateMessage(root, error.message || "Não foi possível abrir o login do Google.");
    }
  });

  gateAuthListener = () => {
    if (!store.getUser().authed) return;
    window.removeEventListener("pk:auth-changed", gateAuthListener);
    gateAuthListener = null;
    hideGate();
  };
  window.addEventListener("pk:auth-changed", gateAuthListener);
  setTimeout(() => root.querySelector("#gate-login-email")?.focus({ preventScroll: true }), 180);
  return root;
}

function hideGate() {
  const root = document.getElementById(GATE_ID);
  if (!root) return;
  root.classList.add("is-leaving");
  setTimeout(() => {
    root.remove();
    unlockBodyIfIdle();
  }, reducedMotion() ? 80 : 360);
}

/* --------------------------------------------------------------------------
   Profile studio (create + manage)
   ------------------------------------------------------------------------ */
function selectedAvatarUrl(user) {
  return user?.avatar_url || "";
}

function manageMarkup(user) {
  const photo = selectedAvatarUrl(user);
  return `
    <div class="ps-view ps-view-manage">
      <div class="ps-stage">
        <div class="ps-kicker">conta w00filmes</div>
        <h1 class="ps-title">Quem está assistindo?</h1>
        <p class="ps-subtitle">Gerencie seu perfil ou entre para continuar.</p>
        <div class="ps-profile-grid">
          <button class="ps-profile-card" data-ps-edit type="button" aria-label="Editar perfil ${esc(user.name)}">
            <span class="ps-profile-avatar">${photoMarkup(photo, user.name)}<span class="ps-profile-pencil"><i class="fa-solid fa-pen"></i></span></span>
            <span class="ps-profile-name">${esc(user.name)}</span>
          </button>
        </div>
        <div class="ps-manage-actions">
          <button class="ps-btn primary" data-ps-close type="button">Concluir</button>
        </div>
      </div>
    </div>`;
}

function editorMarkup(user) {
  const onboarding = studioMode === "onboarding";
  const displayName = user.name === DEFAULT_USER.name ? "Seu nome" : user.name;
  const preview = previewSource(user);
  return `
    <div class="ps-view ps-view-editor">
      <div class="ps-editor-head">
        ${onboarding ? "" : '<button class="ps-back" data-ps-back type="button" aria-label="Voltar"><i class="fa-solid fa-arrow-left"></i> Voltar</button>'}
        <div class="ps-kicker">${onboarding ? "primeiro acesso" : "editar perfil"}</div>
        <h1 class="ps-title">${onboarding ? "Crie seu perfil" : "Editar perfil"}</h1>
        <p class="ps-subtitle">${onboarding ? "Adicione uma foto ou GIF e escolha como você quer aparecer." : "Atualize sua foto, GIF ou nome do perfil."}</p>
      </div>
      <div class="ps-editor-card">
        <button class="ps-photo-picker" data-ps-photo type="button" aria-label="Alterar foto ou GIF">
          <span class="ps-photo-frame" data-ps-photo-frame>${photoMarkup(preview, displayName)}</span>
          <span class="ps-photo-action"><i class="fa-solid fa-camera"></i> ${preview ? "Trocar foto ou GIF" : "Adicionar foto ou GIF"}</span>
        </button>
        <input class="ps-file" id="ps-photo-file" type="file" accept="image/png,image/jpeg,image/webp,image/gif" tabindex="-1">
        <label class="ps-field" for="ps-name">
          <span class="ps-label">Nome do perfil</span>
          <input class="ps-input" id="ps-name" maxlength="30" autocomplete="nickname" value="${esc(user.name === DEFAULT_USER.name ? "" : user.name)}" placeholder="Como você quer ser chamado?">
        </label>
        <p class="ps-hint">JPG, PNG, WEBP ou GIF · até 10 MB</p>
        <p class="ps-msg" data-ps-msg></p>
        <div class="ps-actions">
          ${onboarding ? "" : '<button class="ps-btn ghost" data-ps-back type="button">Cancelar</button>'}
          <button class="ps-btn primary" data-ps-save type="button"><i class="fa-solid fa-check"></i> ${onboarding ? "Criar perfil e entrar" : "Salvar alterações"}</button>
        </div>
      </div>
    </div>`;
}

function studioContent(user) {
  return studioEditing ? editorMarkup(user) : manageMarkup(user);
}

function renderStudio() {
  const root = document.getElementById(STUDIO_ID);
  if (!root) return;
  const user = store.getUser();
  root.innerHTML = `<div class="ps-bg" aria-hidden="true"></div><div class="ps-shell">
    <header class="ps-top">
      <a class="ps-brand" href="/" aria-label="w00filmes"><span>w00</span>filmes</a>
      <span class="ps-status"><i class="fa-solid fa-shield-halved"></i> ${studioMode === "onboarding" ? "configuração inicial" : "conta conectada"}</span>
    </header>
    ${studioContent(user)}
  </div>`;
  bindStudio(root, user);
}

function studioMessage(root, text, type = "error") {
  const el = root.querySelector("[data-ps-msg]");
  if (!el) return;
  el.textContent = text || "";
  el.className = `ps-msg${text ? ` is-${type}` : ""}`;
}

function bindStudio(root, user) {
  root.querySelectorAll("[data-ps-close]").forEach((button) => button.addEventListener("click", closeProfileStudio));
  root.querySelectorAll("[data-ps-back]").forEach((button) => button.addEventListener("click", () => {
    studioEditing = false;
    studioAvatarFile = null;
    revokePreview();
    studioAvatar = selectedAvatarUrl(store.getUser());
    renderStudio();
  }));
  root.querySelectorAll("[data-ps-edit]").forEach((button) => button.addEventListener("click", () => {
    studioEditing = true;
    studioAvatar = selectedAvatarUrl(store.getUser());
    studioAvatarFile = null;
    revokePreview();
    renderStudio();
    setTimeout(() => root.querySelector("#ps-name")?.focus({ preventScroll: true }), 80);
  }));

  const nameInput = root.querySelector("#ps-name");
  const photoInput = root.querySelector("#ps-photo-file");
  const photoFrame = root.querySelector("[data-ps-photo-frame]");

  function updatePhotoPreview() {
    if (!photoFrame) return;
    photoFrame.innerHTML = photoMarkup(previewSource(store.getUser()), nameInput?.value.trim() || user.name);
  }

  root.querySelector("[data-ps-photo]")?.addEventListener("click", () => photoInput?.click());

  photoInput?.addEventListener("change", () => {
    const file = photoInput.files?.[0];
    if (!file) return;
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      studioMessage(root, "Use JPG, PNG, WEBP ou GIF.");
      photoInput.value = "";
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      studioMessage(root, "A imagem deve ter no máximo 10 MB.");
      photoInput.value = "";
      return;
    }
    if (!store.getUser().cloud && file.size > LOCAL_IMAGE_BYTES) {
      studioMessage(root, "No modo local, use uma imagem de até 2 MB.");
      photoInput.value = "";
      return;
    }
    studioAvatarFile = file;
    revokePreview();
    studioPreviewUrl = URL.createObjectURL(file);
    updatePhotoPreview();
    studioMessage(root, "");
  });

  nameInput?.addEventListener("input", () => {
    if (studioPreviewUrl || studioAvatar) return;
    updatePhotoPreview();
  });

  root.querySelector("[data-ps-save]")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    const name = String(nameInput?.value || "").trim();
    if (name.length < 2) {
      studioMessage(root, "O nome do perfil precisa ter pelo menos 2 caracteres.");
      nameInput?.focus();
      return;
    }
    const current = store.getUser();
    const hasPhoto = Boolean(studioAvatarFile || studioAvatar || current.avatar_url);
    if (studioMode === "onboarding" && !hasPhoto) {
      studioMessage(root, "Adicione uma foto ou GIF para criar seu perfil.");
      return;
    }

    studioMessage(root, "");
    button.disabled = true;
    button.classList.add("is-loading");
    try {
      // Contas criadas com confirmação de e-mail podem não ter a linha em
      // `profiles` ainda. Garante a linha antes de subir a foto ou o nome.
      if (current.cloud && authEnabled()) {
        try {
          await upsertProfile(
            { id: current.id, email: current.email, user_metadata: { name: current.name } },
            {
              name,
              email: current.email,
              avatar_url: current.avatar_url || "",
              bio: current.bio,
              favoriteGenre: current.favoriteGenre,
              joined: current.joined
            }
          );
        } catch (error) {
          console.warn("[onboarding] não foi possível preparar o perfil remoto:", error.message);
        }
      }

      let avatarUrl = studioAvatar || current.avatar_url || "";
      if (studioAvatarFile) {
        if (current.cloud && authEnabled()) {
          avatarUrl = await uploadAvatar(studioAvatarFile);
        } else {
          avatarUrl = await fileToDataUrl(studioAvatarFile);
        }
      }

      const patch = {
        name,
        avatar_url: avatarUrl,
        bio: current.bio || "Explorando o catálogo.",
        favoriteGenre: current.favoriteGenre || "Ficção"
      };

      if (current.cloud && authEnabled()) {
        try {
          await updateProfile(patch);
        } catch (error) {
          console.warn("[onboarding] perfil local salvo; sincronização falhou:", error.message);
        }
      }
      // Mantém o espelho local sempre atualizado, mesmo se o Realtime atrasar
      // ou o update remoto falhar.
      store.saveUser(patch);
      try { localStorage.setItem(`${P}profile.ready`, "1"); } catch {}
      clearProfilePending();
      studioAvatarFile = null;
      revokePreview();
      try { window.dispatchEvent(new CustomEvent("pk:auth-changed")); } catch {}
      closeProfileStudio();
    } catch (error) {
      studioMessage(root, error.message || "Não foi possível salvar o perfil.");
      button.disabled = false;
      button.classList.remove("is-loading");
    }
  });
}

export function openProfileStudio({ mode = "manage", onDone = null } = {}) {
  const existing = document.getElementById(STUDIO_ID);
  existing?.remove();
  studioMode = mode;
  studioEditing = mode === "onboarding";
  studioOnDone = onDone;
  studioAvatarFile = null;
  revokePreview();
  studioAvatar = selectedAvatarUrl(store.getUser());
  lockBody();

  const root = document.createElement("div");
  root.id = STUDIO_ID;
  root.className = "w00-profile-studio";
  document.body.appendChild(root);
  renderStudio();
  requestAnimationFrame(() => root.classList.add("is-open"));
  setTimeout(() => root.querySelector(studioEditing ? "#ps-name" : "[data-ps-edit]")?.focus({ preventScroll: true }), 160);
  return root;
}

function closeProfileStudio() {
  const root = document.getElementById(STUDIO_ID);
  if (!root) return;
  root.classList.add("is-leaving");
  setTimeout(() => {
    root.remove();
    studioAvatarFile = null;
    revokePreview();
    unlockBodyIfIdle();
    const callback = studioOnDone;
    studioOnDone = null;
    callback?.();
  }, reducedMotion() ? 80 : 320);
}

/* --------------------------------------------------------------------------
   Boot
   ------------------------------------------------------------------------ */
export async function startOnboarding({ authReady } = {}) {
  lockBody();
  let seen = false;
  try { seen = localStorage.getItem(PRELOADER_KEY) === "1"; } catch {}
  const preloader = seen ? null : showPreloader();
  const authPromise = Promise.resolve(authReady).catch(() => false);

  if (preloader) {
    await Promise.race([
      Promise.all([authPromise, wait(reducedMotion() ? 380 : 1050)]),
      wait(3600)
    ]);
    await hidePreloader(preloader);
  } else {
    await Promise.race([authPromise, wait(1600)]);
  }

  try { localStorage.setItem(PRELOADER_KEY, "1"); } catch {}

  const user = store.getUser();
  if (user.authed) {
    if (openPendingProfileIfAny(user)) return true;
    unlockBodyIfIdle();
    return true;
  }

  showGate();
  return false;
}

export function isOnboardingOpen() {
  return Boolean(document.getElementById(GATE_ID) || document.getElementById(STUDIO_ID) || document.getElementById(PRELOADER_ID));
}
