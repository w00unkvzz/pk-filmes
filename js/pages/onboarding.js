// Onboarding: three-step welcome flow, stored locally.
import { CONFIG } from "../config.js";
import * as store from "../store.js";
import { qs, escapeHTML, toast } from "../ui.js";

const steps = [
  {
    icon: "fa-clapperboard",
    eyebrow: "Bem-vindo ao PK Filmes",
    title: "Um catálogo feito para a sua noite.",
    text: "Explore filmes e séries fictícios, monte sua lista e retome de onde parou. Tudo funciona neste navegador, sem cadastro obrigatório.",
    list: ["Catálogo com filtros e busca tolerante a erros", "Minha lista e histórico com progresso", "Player de demonstração com vídeos Creative Commons"]
  },
  {
    icon: "fa-tower-broadcast",
    eyebrow: "Social & watch party",
    title: "Assista junto, mesmo à distância.",
    text: "Crie uma sala no PK Party, compartilhe o código e converse no chat. A sincronização de play, pause e seek funciona entre abas do mesmo navegador.",
    list: ["Salas públicas e privadas", "Chat em tempo real local", "Controles sincronizados pelo anfitrião"]
  },
  {
    icon: "fa-paw",
    eyebrow: "Seu companheiro",
    title: "Conheça o Faísca.",
    text: "Cuide do mascote, ganhe XP e desbloqueie níveis. O perfil guarda suas conquistas, preferências e o progresso do seu companheiro digital.",
    list: ["Quatro ações de cuidado com cooldown", "Níveis, XP e conquistas", "Perfil personalizável com cor e bio"]
  }
];

let current = 0;

export function renderOnboarding() {
  document.body.classList.add("onboarding-page");
  document.body.dataset.page = "onboarding";
  qs("#page-content").innerHTML = `
    <div class="onboarding-top">
      <a class="brand" href="index.html"><span class="brand-mark">${escapeHTML(CONFIG.brandShort)}</span><strong>${escapeHTML(CONFIG.brand)}</strong></a>
      <button class="skip" id="skip-onboarding" type="button">Pular introdução <i class="fa-solid fa-arrow-right"></i></button>
    </div>
    <div class="onboarding-main">
      <div class="onboarding-card">
        <div class="onboarding-visual">
          <div class="onboarding-icon" id="onboarding-icon"><i class="fa-solid ${steps[current].icon}"></i></div>
        </div>
        <div class="onboarding-content">
          <span class="onboarding-step" id="onboarding-step">Passo ${current + 1} de ${steps.length}</span>
          <h1 id="onboarding-title">${escapeHTML(steps[current].title)}</h1>
          <p id="onboarding-text">${escapeHTML(steps[current].text)}</p>
          <ul class="onboarding-list" id="onboarding-list">${steps[current].list.map((item) => `<li><i class="fa-solid fa-circle-check"></i>${escapeHTML(item)}</li>`).join("")}</ul>
          <div class="onboarding-controls">
            <div class="onboarding-dots" id="onboarding-dots">${steps.map((_, index) => `<span class="onboarding-dot ${index === current ? "active" : ""}"></span>`).join("")}</div>
            <div class="onboarding-actions">
              <button class="btn btn-ghost" id="onboarding-back" type="button" ${current === 0 ? "disabled" : ""}><i class="fa-solid fa-arrow-left"></i>Voltar</button>
              <button class="btn btn-primary" id="onboarding-next" type="button"><span id="onboarding-next-label">${current === steps.length - 1 ? "Começar agora" : "Próximo"}</span><i class="fa-solid fa-arrow-right"></i></button>
            </div>
          </div>
        </div>
      </div>
    </div>`;
  mountOnboarding();
}

function paint() {
  const step = steps[current];
  const icon = qs("#onboarding-icon");
  if (icon) icon.innerHTML = `<i class="fa-solid ${step.icon}"></i>`;
  qs("#onboarding-step").textContent = `Passo ${current + 1} de ${steps.length}`;
  qs("#onboarding-title").textContent = step.title;
  qs("#onboarding-text").textContent = step.text;
  qs("#onboarding-list").innerHTML = step.list.map((item) => `<li><i class="fa-solid fa-circle-check"></i>${escapeHTML(item)}</li>`).join("");
  qs("#onboarding-dots").innerHTML = steps.map((_, index) => `<span class="onboarding-dot ${index === current ? "active" : ""}"></span>`).join("");
  qs("#onboarding-back").disabled = current === 0;
  qs("#onboarding-next-label").textContent = current === steps.length - 1 ? "Começar agora" : "Próximo";
  const card = qs(".onboarding-card");
  if (card) {
    card.style.animation = "none";
    void card.offsetWidth;
    card.style.animation = "fadeUp .3s var(--ease)";
  }
}

function finish() {
  store.setOnboarded(true);
  location.href = "index.html";
}

function mountOnboarding() {
  qs("#onboarding-next")?.addEventListener("click", () => {
    if (current === steps.length - 1) { finish(); return; }
    current += 1;
    paint();
  });
  qs("#onboarding-back")?.addEventListener("click", () => {
    current = Math.max(0, current - 1);
    paint();
  });
  qs("#skip-onboarding")?.addEventListener("click", finish);
  document.addEventListener("keydown", (event) => {
    if (event.key === "ArrowRight") qs("#onboarding-next")?.click();
    if (event.key === "ArrowLeft") qs("#onboarding-back")?.click();
  });
}
