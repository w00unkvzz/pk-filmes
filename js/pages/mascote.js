// Mascote: local pet care loop with XP, cooldowns, stats and activity log.
import * as store from "../store.js";
import { qs, qsa, petSVG, escapeHTML, openModal, closeModal, toast } from "../ui.js";

let cooldownTimer = null;

function mood(pet) {
  if (pet.hunger < 30) return "Faísca está com fome. Um petisco resolve.";
  if (pet.energy < 30) return "Faísca está com sono. Que tal um descanso?";
  if (pet.happiness > 80) return "Faísca está radiante com a sua companhia.";
  if (pet.happiness > 50) return "Faísca está tranquilo e quer brincar.";
  return "Faísca está um pouco entediado. Que tal um carinho?";
}

function statRow(label, value, icon, cls = "") {
  return `<div class="pet-stat"><div class="pet-stat-head"><span><i class="fa-solid ${icon}"></i> ${label}</span><strong>${value}%</strong></div><div class="progress ${cls}"><span style="width:${value}%"></span></div></div>`;
}

export function renderMascote() {
  const pet = store.getPet();
  const cooldowns = store.careCooldowns(pet);
  const levelProgress = store.petLevelProgress(pet);
  const log = pet.log || [];
  qs("#page-content").innerHTML = `
    <div class="pet-page">
      <div class="page-hero" style="padding:0 0 18px">
        <div class="section-kicker"><i class="fa-solid fa-paw"></i> Companheiro digital</div>
        <div class="row-between wrap"><div><h1 style="font-size:clamp(1.8rem,4vw,3rem)">Cuide do Faísca.</h1><p>Alimente, brinque e descanse com o mascote do w00filmes. Cada ação rende XP e desbloqueia níveis.</p></div><span class="badge badge-accent"><i class="fa-solid fa-star"></i> Nível ${pet.level}</span></div>
      </div>

      <div class="pet-layout">
        <section class="pet-stage">
          <div class="pet-name-row"><h1>${escapeHTML(pet.name)}</h1><button id="rename-pet" type="button" title="Renomear mascote" aria-label="Renomear mascote"><i class="fa-solid fa-pen"></i></button></div>
          <span class="pet-level"><i class="fa-solid fa-bolt"></i> Nível ${pet.level} · ${pet.xp}/${pet.xpNext} XP</span>
          <div class="pet-mini">${petSVG("mascot-main")}</div>
          <p class="pet-mood">${escapeHTML(mood(pet))}</p>
          <div class="pet-actions">
            <button class="pet-action" data-care="feed" data-label="Alimentar" type="button" ${cooldowns.feed ? "disabled" : ""}><i class="fa-solid fa-bowl-food"></i><span>${cooldowns.feed ? `${cooldowns.feed}s` : "Alimentar"}</span></button>
            <button class="pet-action" data-care="love" data-label="Carinho" type="button" ${cooldowns.love ? "disabled" : ""}><i class="fa-solid fa-heart"></i><span>${cooldowns.love ? `${cooldowns.love}s` : "Carinho"}</span></button>
            <button class="pet-action" data-care="play" data-label="Brincar" type="button" ${cooldowns.play ? "disabled" : ""}><i class="fa-solid fa-baseball"></i><span>${cooldowns.play ? `${cooldowns.play}s` : "Brincar"}</span></button>
            <button class="pet-action" data-care="rest" data-label="Descansar" type="button" ${cooldowns.rest ? "disabled" : ""}><i class="fa-solid fa-moon"></i><span>${cooldowns.rest ? `${cooldowns.rest}s` : "Descansar"}</span></button>
          </div>
          <div class="pet-stats">
            ${statRow("Fome", pet.hunger, "fa-bowl-food", "gold")}
            ${statRow("Felicidade", pet.happiness, "fa-heart")}
            ${statRow("Energia", pet.energy, "fa-bolt", "green")}
          </div>
          <div style="position:relative;z-index:2;width:100%;margin-top:14px"><div class="row-between tiny muted"><span>Progresso do nível</span><span>${levelProgress}%</span></div><div class="progress" style="margin-top:6px"><span style="width:${levelProgress}%"></span></div></div>
        </section>

        <aside class="pet-side">
          <div class="pet-care-card">
            <div class="row-between"><h3>Rotina de cuidado</h3><span class="badge badge-soft">local</span></div>
            <div class="pet-care-row"><i class="fa-solid fa-bowl-food"></i><div class="grow"><strong>Alimentar</strong><span>+18 fome · +4 felicidade</span></div><span class="tiny muted">45s</span></div>
            <div class="pet-care-row"><i class="fa-solid fa-heart"></i><div class="grow"><strong>Carinho</strong><span>+14 felicidade · +2 energia</span></div><span class="tiny muted">20s</span></div>
            <div class="pet-care-row"><i class="fa-solid fa-baseball"></i><div class="grow"><strong>Brincar</strong><span>+18 felicidade · −12 energia</span></div><span class="tiny muted">60s</span></div>
            <div class="pet-care-row"><i class="fa-solid fa-moon"></i><div class="grow"><strong>Descansar</strong><span>+26 energia · +3 felicidade</span></div><span class="tiny muted">90s</span></div>
          </div>

          <div class="pet-care-card">
            <div class="row-between"><h3>Atividade recente</h3><i class="fa-solid fa-clock-rotate-left muted"></i></div>
            <div class="pet-log" style="margin-top:10px">${log.length ? log.map((entry) => `<p><span>${new Date(entry.at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>${escapeHTML(entry.text)}</p>`).join("") : '<p class="tiny muted">Nenhuma atividade ainda. Faça carinho no Faísca!</p>'}</div>
          </div>

          <div class="pet-care-card">
            <div class="section-kicker"><i class="fa-solid fa-wand-magic-sparkles"></i> Personalização</div>
            <p class="tiny" style="margin-top:7px">Dê um nome novo ao mascote. O nome aparece no perfil e nas atividades.</p>
            <button class="btn btn-ghost btn-sm btn-block" id="rename-pet-2" type="button" style="margin-top:10px"><i class="fa-solid fa-pen"></i>Renomear</button>
          </div>

          <div class="panel panel-pad">
            <div class="section-kicker"><i class="fa-solid fa-shield-halved"></i> Sobre</div>
            <p class="tiny" style="margin-top:7px">O mascote é uma simulação local. Os níveis, a fome e o humor ficam salvos no seu navegador.</p>
          </div>
        </aside>
      </div>
    </div>`;

  mountMascote();
}

function mountMascote() {
  clearInterval(cooldownTimer);
  const pet = store.getPet();

  qsa("[data-care]").forEach((button) => {
    button.addEventListener("click", () => {
      const action = button.dataset.care;
      const result = store.carePet(action);
      if (!result.ok) { toast(result.reason, "info", "Calma lá"); return; }
      toast(`+${result.rule.xp} XP · ${result.rule.label} concluído.`, "success", "Faísca");
      renderMascote();
    });
  });

  qs("#rename-pet")?.addEventListener("click", openRename);
  qs("#rename-pet-2")?.addEventListener("click", openRename);

  cooldownTimer = setInterval(() => {
    const cooldowns = store.careCooldowns(store.getPet());
    qsa("[data-care]").forEach((button) => {
      const seconds = cooldowns[button.dataset.care] || 0;
      const label = button.dataset.label;
      button.disabled = seconds > 0;
      const span = button.querySelector("span");
      if (span) span.textContent = seconds > 0 ? `${seconds}s` : label;
    });
  }, 1000);

}

function openRename() {
  const pet = store.getPet();
  const content = `
    <button class="modal-close" data-close-modal type="button" aria-label="Fechar"><i class="fa-solid fa-xmark"></i></button>
    <div class="auth-head"><div class="brand-mark">w00</div><h2>Renomear mascote</h2><p>Escolha um nome de até 18 caracteres.</p></div>
    <form class="auth-body" id="rename-form">
      <div class="field"><label for="pet-name">Nome do mascote</label><input class="input" id="pet-name" name="name" maxlength="18" required value="${escapeHTML(pet.name)}"></div>
      <button class="btn btn-primary btn-block" type="submit"><i class="fa-solid fa-check"></i>Salvar nome</button>
    </form>`;
  openModal(content, { className: "modal-sm", label: "Renomear mascote", onMount: () => {
    qs("#rename-form")?.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      store.renamePet(data.get("name"));
      closeModal();
      renderMascote();
      toast("Nome atualizado.", "success", "Faísca");
    });
  }});
}
