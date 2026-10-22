// VIP page: demo plan selection with local activation.
import { CONFIG } from "../config.js";
import * as store from "../store.js";
import { qs, avatar, escapeHTML, toast, refreshShell } from "../ui.js";

export function renderVip() {
  const user = store.getUser();
  const current = CONFIG.plans.find((plan) => plan.id === user.planId) || CONFIG.plans[0];
  qs("#page-content").innerHTML = `
    <div class="vip-page">
      <section class="vip-hero">
        <div class="crown"><i class="fa-solid fa-crown"></i></div>
        <div class="section-kicker" style="justify-content:center"><i class="fa-solid fa-sparkles"></i> PK Filmes VIP</div>
        <h1 class="text-gradient">Sua sessão, no próximo nível.</h1>
        <p>Planos demonstrativos com ativação local. Nenhuma cobrança é feita e nenhum dado de pagamento é solicitado.</p>
        <div class="row" style="justify-content:center;margin-top:16px"><span class="badge ${user.planId !== "free" ? "badge-vip" : "badge-soft"}"><i class="fa-solid fa-circle-check"></i> Plano atual: ${escapeHTML(current.name)}</span><button class="btn btn-sm btn-ghost" id="reset-plan" type="button"><i class="fa-solid fa-rotate-left"></i>Voltar ao grátis</button></div>
      </section>

      <div class="vip-plans">
        ${CONFIG.plans.map((plan) => `
          <article class="vip-plan ${plan.featured ? "featured" : ""}">
            ${plan.featured ? '<span class="plan-flag">Mais popular</span>' : ""}
            <h3>${escapeHTML(plan.name)}</h3>
            <div class="price"><strong>${escapeHTML(plan.price)}</strong><span>${escapeHTML(plan.period)}</span></div>
            <p class="plan-sub">${escapeHTML(plan.sub)}</p>
            <ul>${plan.features.map((feature) => `<li class="${feature.on ? "" : "off"}"><i class="fa-solid ${feature.on ? "fa-check" : "fa-xmark"}"></i>${escapeHTML(feature.text)}</li>`).join("")}</ul>
            <button class="btn ${plan.featured ? "btn-primary" : "btn-ghost"} btn-block" data-plan-id="${plan.id}" type="button" ${plan.id === user.planId ? "disabled" : ""}>
              <i class="fa-solid ${plan.id === user.planId ? "fa-check" : plan.featured ? "fa-crown" : "fa-arrow-right"}"></i>${plan.id === user.planId ? "Plano atual" : plan.cta}
            </button>
          </article>`).join("")}
      </div>

      <p class="vip-note"><i class="fa-solid fa-circle-info"></i> Demonstração: a ativação altera apenas o estado local do perfil. Não há gateway de pagamento, assinatura ou cobrança.</p>

      <section class="vip-preview">
        <div class="section-head"><div><div class="section-kicker"><i class="fa-solid fa-id-card"></i> Prévia</div><h2>Como fica o seu perfil VIP</h2></div><span class="badge badge-vip">demonstração</span></div>
        <div class="vip-preview-card">
          ${avatar({ name: user.name, color: "#fbbf24" }, "xl", "ring")}
          <div><h3>${escapeHTML(user.name)} <i class="fa-solid fa-circle-check" style="color:var(--gold);font-size:13px"></i></h3><div class="meta"><span class="badge badge-vip"><i class="fa-solid fa-crown"></i> ${escapeHTML(user.planId !== "free" ? user.plan : "Membro VIP")}</span><span class="dot"></span><span>Borda dourada</span><span class="dot"></span><span>Acesso a salas privadas</span></div><p class="small" style="margin-top:8px">Bordas, fundos e conquistas exclusivas aparecem no perfil e nas salas do PK Party.</p></div>
        </div>
      </section>

      <section class="page-section" style="max-width:900px;margin:0 auto">
        <div class="section-head"><div><div class="section-kicker"><i class="fa-solid fa-circle-question"></i> Perguntas rápidas</div><h2>Como funciona a demo</h2></div></div>
        <div class="stack">
          <div class="panel panel-pad"><h3>O plano é real?</h3><p class="small" style="margin-top:5px">Não. É uma simulação de interface. O botão ativa um estado local para você testar badges, bordas e permissões visuais.</p></div>
          <div class="panel panel-pad"><h3>Preciso informar cartão?</h3><p class="small" style="margin-top:5px">Não. Nenhum formulário de pagamento existe neste projeto. O foco é o fluxo de produto e a experiência de navegação.</p></div>
          <div class="panel panel-pad"><h3>Onde ficam meus dados?</h3><p class="small" style="margin-top:5px">No localStorage do seu navegador. Você pode voltar ao plano grátis a qualquer momento nesta página.</p></div>
        </div>
      </section>
    </div>`;

  mountVip();
}

function mountVip() {
  document.querySelectorAll("[data-plan-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const plan = CONFIG.plans.find((entry) => entry.id === button.dataset.planId);
      if (!plan) return;
      store.activatePlan(plan.id);
      refreshShell();
      renderVip();
      toast(`Plano ${plan.name} ativado no modo demonstração.`, "gold", "VIP demo");
      window.dispatchEvent(new CustomEvent("pk:plan-changed"));
    });
  });
  qs("#reset-plan")?.addEventListener("click", () => {
    store.activatePlan("free");
    refreshShell();
    renderVip();
    toast("Você voltou ao plano grátis.", "info");
  });
}
