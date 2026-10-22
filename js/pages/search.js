// Search page: fuzzy matching, history, popular terms and discovery.
import { CATALOG, POPULAR_SEARCHES, getGenreMeta } from "../data.js";
import { CONFIG } from "../config.js";
import * as store from "../store.js";
import { qs, escapeHTML, posterCard, emptyState, toast } from "../ui.js";

let debounceTimer = null;

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a, b) {
  const matrix = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j += 1) matrix[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return matrix[a.length][b.length];
}

function score(term, item) {
  const q = normalize(term);
  if (!q) return 0;
  const title = normalize(item.title);
  const genres = normalize(item.genres.join(" "));
  const cast = normalize((item.cast || []).join(" "));
  const synopsis = normalize(item.synopsis || "");
  if (title === q) return 100;
  if (title.startsWith(q)) return 90;
  if (title.includes(q)) return 80;
  if (genres.includes(q)) return 55;
  if (cast.includes(q)) return 45;
  if (synopsis.includes(q)) return 30;
  const words = title.split(" ");
  for (const word of words) {
    if (word.startsWith(q)) return 70;
    if (q.length > 3 && levenshtein(q, word) <= 2) return 35;
  }
  return 0;
}

function search(term) {
  const q = normalize(term);
  if (!q) return [];
  return CATALOG
    .map((item) => ({ item, score: score(term, item) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || b.item.rating - a.item.rating)
    .slice(0, 30)
    .map((entry) => entry.item);
}

function historyMarkup() {
  const history = store.getSearchHistory();
  if (!history.length) return "";
  return `<section class="page-section tight" id="history-section">
    <div class="row-between" style="margin-bottom:10px"><div class="section-kicker"><i class="fa-solid fa-clock-rotate-left"></i> Suas buscas</div><button class="section-link" id="clear-history" type="button">Limpar <i class="fa-solid fa-trash-can"></i></button></div>
    <div class="history-chips">${history.map((term) => `<button class="history-chip" data-history-term="${escapeHTML(term)}" type="button"><i class="fa-solid fa-clock-rotate-left"></i>${escapeHTML(term)}<span class="x" data-remove-history-term="${escapeHTML(term)}" role="button" aria-label="Remover">✕</span></button>`).join("")}</div>
  </section>`;
}

function popularMarkup() {
  return `<section class="page-section tight">
    <div class="section-head"><div><div class="section-kicker"><i class="fa-solid fa-fire"></i> Em alta</div><h2>Buscas populares</h2></div></div>
    <div class="popular-grid">${POPULAR_SEARCHES.map((term, index) => {
      const item = CATALOG.find((entry) => entry.title === term);
      return `<button class="popular-item" data-history-term="${escapeHTML(term)}" type="button"><span class="rank">${String(index + 1).padStart(2, "0")}</span><span><strong>${escapeHTML(term)}</strong><span>${item ? `${item.year} · ${item.genres[0]}` : "Catálogo"}</span></span></button>`;
    }).join("")}</div>
  </section>`;
}

function genresMarkup() {
  return `<section class="page-section tight">
    <div class="section-head"><div><div class="section-kicker"><i class="fa-solid fa-palette"></i> Descubra</div><h2>Explorar gêneros</h2></div><a class="section-link" href="catalogo.html">Catálogo <i class="fa-solid fa-arrow-right"></i></a></div>
    <div class="genre-explore">${CONFIG.genres.map((genre) => `<a class="genre-tile" style="--c1:${genre.colors[0]};--c2:${genre.colors[1]}" href="catalogo.html?genero=${encodeURIComponent(genre.name)}"><i class="fa-solid ${genre.icon}"></i><span>${escapeHTML(genre.name)}</span></a>`).join("")}</div>
  </section>`;
}

function recommendMarkup() {
  const recommended = [...CATALOG].sort((a, b) => b.rating - a.rating).slice(0, 12);
  return `<section class="page-section tight">
    <div class="section-head"><div><div class="section-kicker"><i class="fa-solid fa-wand-magic-sparkles"></i> Para você</div><h2>Recomendados</h2></div><span class="badge badge-soft">Baseado no catálogo demo</span></div>
    <div class="card-grid">${recommended.map((item) => posterCard(item)).join("")}</div>
  </section>`;
}

export function renderSearch() {
  const query = new URLSearchParams(location.search).get("q") || "";
  qs("#page-content").innerHTML = `
    <div class="search-hero">
      <div class="section-kicker"><i class="fa-solid fa-magnifying-glass"></i> Busca</div>
      <h1>Encontre seu próximo favorito.</h1>
      <p>Títulos, gêneros, elenco e sinopse. A busca tolera pequenos erros de digitação.</p>
      <form class="search-box" id="search-form" role="search">
        <i class="fa-solid fa-magnifying-glass"></i>
        <input id="search-input" name="q" type="search" placeholder="Ex.: reino, ficção, Marina Costa..." value="${escapeHTML(query)}" autocomplete="off" autofocus aria-label="Buscar títulos">
        <button class="search-clear ${query ? "" : "hidden"}" id="search-clear" type="button" aria-label="Limpar busca"><i class="fa-solid fa-xmark"></i></button>
      </form>
      <div class="row" style="margin-top:14px"><span class="tiny muted">Dica: pressione Enter para salvar a busca no histórico.</span></div>
    </div>

    <div id="search-discovery">
      ${historyMarkup()}
      ${popularMarkup()}
      ${genresMarkup()}
      ${recommendMarkup()}
    </div>

    <section class="page-section" id="search-results-section" hidden>
      <div class="search-results-head"><div><div class="section-kicker"><i class="fa-solid fa-list"></i> Resultados</div><h2 id="search-results-title">Resultados</h2></div><span id="search-results-count"></span></div>
      <div class="card-grid wide" id="search-results"></div>
    </section>`;

  mountSearch(query);
}

function setResults(term, save = false) {
  const clean = term.trim();
  const discovery = qs("#search-discovery");
  const section = qs("#search-results-section");
  const grid = qs("#search-results");
  const title = qs("#search-results-title");
  const count = qs("#search-results-count");
  const clear = qs("#search-clear");
  if (!clean) {
    discovery.hidden = false;
    section.hidden = true;
    clear?.classList.add("hidden");
    return;
  }
  discovery.hidden = true;
  section.hidden = false;
  clear?.classList.remove("hidden");
  const results = search(clean);
  title.textContent = `Resultados para “${clean}”`;
  count.textContent = `${results.length} título${results.length === 1 ? "" : "s"}`;
  grid.innerHTML = results.length ? results.map((item) => posterCard(item)).join("") : emptyState("fa-magnifying-glass", "Nada por aqui", "Tente outro termo, confira a ortografia ou explore os gêneros abaixo.");
  const url = new URL(location.href);
  if (clean) url.searchParams.set("q", clean); else url.searchParams.delete("q");
  history.replaceState(null, "", `${url.pathname}${url.search}`);
  if (save) store.addSearchHistory(clean);
}

function mountSearch(initialQuery) {
  const input = qs("#search-input");
  const form = qs("#search-form");
  if (!input || !form) return;

  if (initialQuery) setResults(initialQuery, false);

  input.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => setResults(input.value, false), 240);
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const value = input.value.trim();
    setResults(value, Boolean(value));
    if (value) toast(`Busca por “${value}” salva no histórico.`, "success", "Busca");
  });

  qs("#search-clear")?.addEventListener("click", () => {
    input.value = "";
    setResults("", false);
    input.focus();
  });

  document.addEventListener("click", (event) => {
    const removeTerm = event.target.closest("[data-remove-history-term]");
    if (removeTerm) {
      event.preventDefault(); event.stopPropagation();
      const term = removeTerm.dataset.removeHistoryTerm;
      const next = store.getSearchHistory().filter((entry) => entry !== term);
      localStorage.setItem(`${CONFIG.storagePrefix}searchHistory`, JSON.stringify(next));
      window.location.reload();
      return;
    }
    const historyTerm = event.target.closest("[data-history-term]");
    if (historyTerm) {
      event.preventDefault();
      input.value = historyTerm.dataset.historyTerm;
      setResults(input.value, true);
      qs("#search-results-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    if (event.target.closest("#clear-history")) {
      store.clearSearchHistory();
      window.location.reload();
    }
  }, { once: false });
}
