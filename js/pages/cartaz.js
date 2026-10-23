// Em breve: upcoming releases, month filter and live countdowns.
import { UPCOMING, byId } from "../data.js";
import * as store from "../store.js";
import { qs, qsa, escapeHTML, formatMonth, formatDate, toast } from "../ui.js";

let countdownTimer = null;

function countdownMarkup(date) {
  const diff = Math.max(0, new Date(date).getTime() - Date.now());
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);
  return `<div class="release-countdown" data-countdown="${escapeHTML(date)}">
    <div class="countdown-cell"><strong>${days}</strong><span>dias</span></div>
    <div class="countdown-cell"><strong>${String(hours).padStart(2, "0")}</strong><span>horas</span></div>
    <div class="countdown-cell"><strong>${String(minutes).padStart(2, "0")}</strong><span>min</span></div>
    <div class="countdown-cell"><strong>${String(seconds).padStart(2, "0")}</strong><span>seg</span></div>
  </div>`;
}

function releaseCard(item) {
  const inList = store.isInWatchlist(item.id);
  return `<article class="release-card" data-release-month="${item.releaseDate.slice(0, 7)}" data-open-details="${escapeHTML(item.id)}">
    <div class="release-poster"><div class="poster" style="--c1:${item.colors[0]};--c2:${item.colors[1]}"><div class="poster-ring"></div><span class="poster-title">${escapeHTML(item.title)}</span></div></div>
    <div class="release-info">
      <div class="row-between"><h3>${escapeHTML(item.title)}</h3><span class="badge badge-accent"><i class="fa-solid fa-calendar"></i> ${formatDate(item.releaseDate)}</span></div>
      <p>${escapeHTML(item.genres.join(" · "))} · ${item.type === "series" ? "Série" : "Filme"}</p>
      ${countdownMarkup(item.releaseDate)}
      <div class="row-between" style="gap:8px;margin-top:auto">
        <span class="tiny muted"><i class="fa-solid fa-clock"></i> Estreia em ${formatMonth(item.releaseDate)}</span>
        <button class="btn btn-sm ${inList ? "btn-primary" : "btn-ghost"}" data-watchlist-detail="${escapeHTML(item.id)}" type="button"><i class="fa-solid ${inList ? "fa-check" : "fa-plus"}"></i>${inList ? "Na lista" : "Lembrar-me"}</button>
      </div>
    </div>
  </article>`;
}

export function renderCartaz() {
  const months = [...new Set(UPCOMING.map((item) => item.releaseDate.slice(0, 7)))].sort();
  qs("#page-content").innerHTML = `
    <div class="cartaz-hero">
      <div class="section-kicker"><i class="fa-solid fa-calendar-days"></i> Agenda de estreias</div>
      <h1>O que vem por aí.</h1>
      <p>Cadastre seus lançamentos com data de estreia para ativar a contagem regressiva ao vivo.</p>
      <div class="month-strip" id="month-strip">
        <button class="chip active" data-month-filter="all" type="button"><i class="fa-solid fa-layer-group"></i>Todos</button>
        ${months.map((month) => `<button class="chip" data-month-filter="${month}" type="button"><i class="fa-regular fa-calendar"></i>${formatMonth(month + "-15")}</button>`).join("")}
      </div>
    </div>
    <div class="cartaz-grid" id="cartaz-grid">${UPCOMING.map(releaseCard).join("")}</div>
    <div id="cartaz-empty" class="empty-state ${UPCOMING.length ? "hidden" : ""}" style="margin:20px clamp(18px,3.2vw,46px)">${"<i class=\"fa-solid fa-calendar-xmark\"></i><h3>Nenhum lançamento cadastrado</h3><p>Adicione títulos e datas para montar a agenda de estreias.</p>"}</div>`;

  mountCartaz();
}

function mountCartaz() {
  let activeMonth = "all";
  const apply = () => {
    let visible = 0;
    qsa("[data-release-month]").forEach((card) => {
      const match = activeMonth === "all" || card.dataset.releaseMonth === activeMonth;
      card.classList.toggle("hidden", !match);
      if (match) visible += 1;
    });
    qs("#cartaz-empty")?.classList.toggle("hidden", visible > 0);
  };

  qsa("[data-month-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      activeMonth = button.dataset.monthFilter;
      qsa("[data-month-filter]").forEach((entry) => entry.classList.toggle("active", entry === button));
      apply();
    });
  });

  const update = () => {
    qsa("[data-countdown]").forEach((el) => {
      const date = el.dataset.countdown;
      const diff = Math.max(0, new Date(date).getTime() - Date.now());
      const days = Math.floor(diff / 86400000);
      const hours = Math.floor((diff % 86400000) / 3600000);
      const minutes = Math.floor((diff % 3600000) / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      const cells = el.querySelectorAll(".countdown-cell strong");
      if (cells[0]) cells[0].textContent = days;
      if (cells[1]) cells[1].textContent = String(hours).padStart(2, "0");
      if (cells[2]) cells[2].textContent = String(minutes).padStart(2, "0");
      if (cells[3]) cells[3].textContent = String(seconds).padStart(2, "0");
    });
  };
  clearInterval(countdownTimer);
  countdownTimer = setInterval(update, 1000);
  update();
}
