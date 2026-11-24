// First-run experience: cinema preloader, account gate and the Netflix-style
// profile studio. The site keeps rendering behind the overlay, so after the
// gate closes the current route is already painted.
import { CONFIG } from "./config.js";
import { CATALOG, DEFAULT_USER } from "./data.js";
import * as store from "./store.js";
import { authEnabled } from "./auth.js";
import {
  signIn,
  signUp,
  signInWithGoogle,
  sendPasswordReset,
  appUserFromSession
} from "./supabase.js";
import { updateProfile } from "./social.js";

const P = CONFIG.storagePrefix;
const PRELOADER_KEY = `${P}preloader.seen`;
const PENDING_KEY = `${P}profile.pending`;
const GATE_ID = "w00-auth-gate";
const PRELOADER_ID = "w00-preloader";
const STUDIO_ID = "w00-profile-studio";

const AVATARS = [
  { id: "nova", label: "Nova", url: "https://api.dicebear.com/9.x/adventurer/svg?seed=Nova&backgroundColor=7c3aed&radius=50" },
  { id: "rio", label: "Rio", url: "https://api.dicebear.com/9.x/adventurer/svg?seed=Rio&backgroundColor=0891b2&radius=50" },
  { id: "luna", label: "Luna", url: "https://api.dicebear.com/9.x/micah/svg?seed=Luna&backgroundColor=db2777&radius=50" },
  { id: "moss", label: "Moss", url: "https://api.dicebear.com/9.x/adventurer/svg?seed=Moss&backgroundColor=059669&radius=50" },
  { id: "sol", label: "Sol", url: "https://api.dicebear.com/9.x/micah/svg?seed=Sol&backgroundColor=d97706&radius=50" },
  { id: "bolt", label: "Bolt", url: "https://api.dicebear.com/9.x/bottts/svg?seed=Bolt&backgroundColor=2563eb&radius=50" },
  { id: "zed", label: "Zed", url: "https://api.dicebear.com/9.x/fun-emoji/svg?seed=Zed&backgroundColor=a855f7&radius=50" },
  { id: "ash", label: "Ash", url: "https://api.dicebear.com/9.x/micah/svg?seed=Ash&backgroundColor=334155&radius=50" }
];

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

function lockBody() {
  document.body.classList.add("w00-onboarding-active");
}

function unlockBodyIfIdle() {
  if (document.getElementById(GATE_ID) || document.getElementById(STUDIO_ID) || document.getElementById(PRELOADER_ID)) return;
  document.body.classList.remove("w00-onboarding-active");
}

function heroPosters() {
  const pool = CATALOG.filter((item) => item.backdrop && item.title).slice(0, 3);
  return pool.map((item, index) => `<figure class="gate-poster" style="--tilt:${index === 0 ? "-7deg" : index === 1 ? "2deg" : "8deg"}">
    <img src="${esc(item.backdrop)}" alt="" loading="eager" decoding="async">
    <figcaption>${esc(item.title)}</figcaption>
  </figure>`).join("");
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
    <div class="preloader-beam" aria-hidden="true"></div>
    <div class="preloader-core">
      <div class="preloader-word" aria-hidden="true"><span style="--i:0">w</span><span style="--i:1">0</span><span style="--i:2">0</span></div>
      <div class="preloader-sub">FILMES</div>
      <div class="preloader-line" aria-hidden="true"><i></i></div>
      <div class="preloader-caption">abrindo a sala de projeção</div>
    </div>`;
  document.body.appendChild(el);
  return el;
}

async function hidePreloader(el) {
  if (!el) return;
  el.classList.add("is-leaving");
  await wait(reducedMotion() ? 120 : 520);
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
        <span class="gate-secure"><i class="fa-solid fa-lock"></i> sessão segura</span>
      </header>
      <main class="gate-main">
        <section class="gate-copy">
          <div class="gate-kicker">Sua sessão começa aqui</div>
          <h1>Cinema sem limites.<br><em>Com gente do lado.</em></h1>
          <p>Filmes, séries, watchlist e salas sincronizadas. Crie sua conta para entrar no w00filmes.</p>
          <ul class="gate-points">
            <li><i class="fa-solid fa-circle-check"></i> Catálogo completo e atualizado</li>
            <li><i class="fa-solid fa-circle-check"></i> Watch Party com chat em tempo real</li>
            <li><i class="fa-solid fa-circle-check"></i> Seu perfil em qualquer dispositivo</li>
          </ul>
          <div class="gate-posters" aria-hidden="true">${heroPosters()}</div>
        </section>
        <section class="gate-panel" aria-label="Entrar ou criar conta">
          <div class="gate-tabs" role="tablist">
            <button class="gate-tab active" data-gate-tab="signup" type="button" role="tab">Criar conta</button>
            <button class="gate-tab" data-gate-tab="login" type="button" role="tab">Entrar</button>
          </div>

          <form class="gate-form" id="gate-signup-form" novalidate>
            <div class="gate-field">
              <label for="gate-name">Nome</label>
              <span class="gate-input-wrap"><i class="fa-solid fa-user"></i><input class="gate-input" id="gate-name" name="name" autocomplete="name" maxlength="40" placeholder="Como podemos te chamar?" required></span>
            </div>
            <div class="gate-field">
              <label for="gate-signup-email">E-mail</label>
              <span class="gate-input-wrap"><i class="fa-solid fa-envelope"></i><input class="gate-input" id="gate-signup-email" name="email" type="email" autocomplete="email" placeholder="voce@email.com" required></span>
            </div>
            <div class="gate-field">
              <label for="gate-signup-password">Senha</label>
              <span class="gate-input-wrap"><i class="fa-solid fa-key"></i><input class="gate-input" id="gate-signup-password" name="password" type="password" autocomplete="new-password" minlength="6" placeholder="Mínimo de 6 caracteres" required></span>
            </div>
            <p class="gate-msg" data-gate-msg></p>
            <button class="gate-submit" type="submit"><span>Criar conta</span><i class="fa-solid fa-arrow-right"></i></button>
          </form>

          <form class="gate-form" id="gate-login-form" hidden novalidate>
            <div class="gate-field">
              <label for="gate-login-email">E-mail</label>
              <span class="gate-input-wrap"><i class="fa-solid fa-envelope"></i><input class="gate-input" id="gate-login-email" name="email" type="email" autocomplete="email" placeholder="voce@email.com" required></span>
            </div>
            <div class="gate-field">
              <label for="gate-login-password">Senha</label>
              <span class="gate-input-wrap"><i class="fa-solid fa-key"></i><input class="gate-input" id="gate-login-password" name="password" type="password" autocomplete="current-password" placeholder="Sua senha" required></span>
            </div>
            <p class="gate-msg" data-gate-msg></p>
            <button class="gate-submit" type="submit"><span>Entrar</span><i class="fa-solid fa-arrow-right"></i></button>
            <button class="gate-forgot" data-gate-forgot type="button">Esqueci minha senha</button>
          </form>

          <div class="gate-divider"><span>ou</span></div>
          <button class="gate-social" data-gate-google type="button"><i class="fa-brands fa-google"></i> Continuar com Google</button>
          <p class="gate-legal">Ao continuar, você concorda em manter o respeito nas salas e no chat. Seus dados ficam ligados à sua conta.</p>
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

  const tabs = [...root.querySelectorAll("[data-gate-tab]")];
  const signupForm = root.querySelector("#gate-signup-form");
  const loginForm = root.querySelector("#gate-login-form");

  function switchTab(tab) {
    tabs.forEach((button) => button.classList.toggle("active", button.dataset.gateTab === tab));
    if (signupForm) signupForm.hidden = tab !== "signup";
    if (loginForm) loginForm.hidden = tab !== "login";
    gateMessage(root, "");
    requestAnimationFrame(() => {
      const input = root.querySelector(tab === "signup" ? "#gate-name" : "#gate-login-email");
      input?.focus({ preventScroll: true });
    });
  }

  tabs.forEach((button) => button.addEventListener("click", () => switchTab(button.dataset.gateTab)));

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
        sessionStorage.setItem(PENDING_KEY, "1");
        window.dispatchEvent(new CustomEvent("pk:auth-changed"));
        hideGate();
        openProfileStudio({ mode: "onboarding" });
        return;
      }
      const { session } = await signUp({ name, email, password });
      if (!session?.user) {
        gateMessage(root, "Conta criada. Confirme o e-mail e depois entre para continuar.", "success");
        setFormBusy(signupForm, false);
        return;
      }
      const user = appUserFromSession(session);
      store.saveUser({ ...user, name });
      sessionStorage.setItem(PENDING_KEY, "1");
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
        store.login(current.name || email.split("@")[0], email);
        window.dispatchEvent(new CustomEvent("pk:auth-changed"));
        hideGate();
        return;
      }
      const { session } = await signIn({ email, password });
      if (!session?.user) throw new Error("Sessão não iniciada. Tente novamente.");
      store.saveUser(appUserFromSession(session));
      window.dispatchEvent(new CustomEvent("pk:auth-changed"));
      hideGate();
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
  setTimeout(() => root.querySelector("#gate-name")?.focus({ preventScroll: true }), 180);
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
  return user.avatar_url || AVATARS[0].url;
}

function avatarOptionsMarkup() {
  return AVATARS.map((avatar) => `<button class="ps-avatar-option${avatar.url === studioAvatar ? " is-selected" : ""}" type="button" data-avatar-url="${esc(avatar.url)}" aria-label="Avatar ${esc(avatar.label)}" aria-pressed="${avatar.url === studioAvatar}">
    <img src="${esc(avatar.url)}" alt="" loading="lazy" decoding="async">
  </button>`).join("");
}

function manageMarkup(user) {
  const photo = selectedAvatarUrl(user);
  return `
    <div class="ps-view ps-view-manage">
      <div class="ps-head">
        <div>
          <div class="ps-kicker"><i class="fa-solid fa-users"></i> conta w00filmes</div>
          <h1>Gerenciar perfil</h1>
          <p>Este é o perfil que aparece no seu histórico, na watchlist e nas salas do Party.</p>
        </div>
        <button class="ps-close" data-ps-close type="button" aria-label="Fechar"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div class="ps-profiles">
        <button class="ps-profile-card" data-ps-edit type="button" aria-label="Editar perfil ${esc(user.name)}">
          <span class="ps-profile-avatar"><img src="${esc(photo)}" alt="" loading="lazy" decoding="async"><span class="ps-profile-pencil"><i class="fa-solid fa-pen"></i></span></span>
          <span class="ps-profile-name">${esc(user.name)}</span>
          <span class="ps-profile-caption">perfil principal</span>
        </button>
      </div>
      <div class="ps-manage-footer">
        <button class="ps-btn ghost" data-ps-edit type="button"><i class="fa-solid fa-pen"></i> Editar perfil</button>
        <button class="ps-btn primary" data-ps-close type="button">Concluir</button>
      </div>
    </div>`;
}

function editorMarkup(user) {
  const onboarding = studioMode === "onboarding";
  return `
    <div class="ps-view ps-view-create">
      <div class="ps-head">
        <div>
          <div class="ps-kicker">${onboarding ? '<i class="fa-solid fa-wand-magic-sparkles"></i> primeiro acesso' : '<i class="fa-solid fa-pen"></i> editar perfil'}</div>
          <h1>${onboarding ? "Crie seu perfil" : "Ajuste seu perfil"}</h1>
          <p>${onboarding ? "Escolha um avatar e um nome. É assim que você aparece no w00filmes." : "Troque o nome ou o avatar. O restante da conta continua igual."}</p>
        </div>
        ${onboarding ? "" : '<button class="ps-close" data-ps-back type="button" aria-label="Voltar"><i class="fa-solid fa-arrow-left"></i></button>'}
      </div>
      <div class="ps-create-layout">
        <div class="ps-preview">
          <span class="ps-preview-avatar"><img id="ps-preview-img" src="${esc(studioAvatar)}" alt="" loading="eager" decoding="async"></span>
          <span class="ps-preview-name" id="ps-preview-name">${esc(user.name === DEFAULT_USER.name ? "Seu nome" : user.name)}</span>
          <span class="ps-preview-tag">perfil principal</span>
        </div>
        <div class="ps-form">
          <label class="ps-field" for="ps-name">
            <span class="ps-label">Nome do perfil</span>
            <input class="ps-input" id="ps-name" maxlength="30" autocomplete="nickname" value="${esc(user.name === DEFAULT_USER.name ? "" : user.name)}" placeholder="Como você quer ser chamado?">
          </label>
          <div>
            <div class="ps-label">Escolha um avatar</div>
            <div class="ps-avatar-grid" role="group" aria-label="Avatares">${avatarOptionsMarkup()}</div>
          </div>
          <p class="ps-msg" data-ps-msg></p>
          <div class="ps-actions">
            ${onboarding ? "" : '<button class="ps-btn ghost" data-ps-back type="button">Cancelar</button>'}
            <button class="ps-btn primary" data-ps-save type="button"><i class="fa-solid fa-check"></i> ${onboarding ? "Criar perfil e entrar" : "Salvar alterações"}</button>
          </div>
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
    renderStudio();
  }));
  root.querySelectorAll("[data-ps-edit]").forEach((button) => button.addEventListener("click", () => {
    studioEditing = true;
    studioAvatar = selectedAvatarUrl(store.getUser());
    renderStudio();
    setTimeout(() => root.querySelector("#ps-name")?.focus({ preventScroll: true }), 80);
  }));

  const nameInput = root.querySelector("#ps-name");
  const previewName = root.querySelector("#ps-preview-name");
  nameInput?.addEventListener("input", () => {
    if (previewName) previewName.textContent = nameInput.value.trim() || "Seu nome";
  });

  root.querySelectorAll("[data-avatar-url]").forEach((button) => {
    button.addEventListener("click", () => {
      studioAvatar = button.dataset.avatarUrl;
      root.querySelectorAll("[data-avatar-url]").forEach((option) => {
        const active = option === button;
        option.classList.toggle("is-selected", active);
        option.setAttribute("aria-pressed", active ? "true" : "false");
      });
      const image = root.querySelector("#ps-preview-img");
      if (image) image.src = studioAvatar;
    });
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
    const patch = {
      name,
      avatar_url: studioAvatar || selectedAvatarUrl(current),
      bio: current.bio || "Explorando o catálogo.",
      favoriteGenre: current.favoriteGenre || "Ficção"
    };
    studioMessage(root, "");
    button.disabled = true;
    button.classList.add("is-loading");
    try {
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
      sessionStorage.removeItem(PENDING_KEY);
      window.dispatchEvent(new CustomEvent("pk:auth-changed"));
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
  try { seen = sessionStorage.getItem(PRELOADER_KEY) === "1"; } catch {}
  const preloader = seen ? null : showPreloader();
  const authPromise = Promise.resolve(authReady).catch(() => false);

  if (preloader) {
    await Promise.race([
      Promise.all([authPromise, wait(reducedMotion() ? 520 : 1950)]),
      wait(5200)
    ]);
    await hidePreloader(preloader);
  } else {
    await Promise.race([authPromise, wait(1900)]);
  }

  try { sessionStorage.setItem(PRELOADER_KEY, "1"); } catch {}

  const user = store.getUser();
  if (user.authed) {
    if (sessionStorage.getItem(PENDING_KEY) === "1") {
      openProfileStudio({ mode: "onboarding" });
      return true;
    }
    unlockBodyIfIdle();
    return true;
  }

  showGate();
  return false;
}

export function isOnboardingOpen() {
  return Boolean(document.getElementById(GATE_ID) || document.getElementById(STUDIO_ID) || document.getElementById(PRELOADER_ID));
}
