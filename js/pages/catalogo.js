// Catalog page: type/genre/year filters, search and incremental rendering.
import { CATALOG, allGenres } from "../data.js";
import { qs, qsa, posterCard, pageTitle, emptyState, setupRowArrows, escapeHTML } from "../ui.js";

const PAGE_SIZE = 12;

const state = {
  type: "",
  genre: "",
  year: "",
  sort: "popular",
  query: "",
  visible: PAGE_SIZE
};

function readParams() {
  const params = new URLSearchParams(location.search);
  state.type = params.get("tipo") || "";
  state.genre = params.get("genero") || "";
  state.year = params.get("ano") || "";
  state.sort = params.get("ordenar") || "popular";
  state.query = params.get("q") || "";
}

function years() {
  return [...new Set(CATALOG.map((item) => item.year))].sort((a, b) => b - a);
}

function filtered() {
  const q = state.query ? state.query.toLowerCase() : "";
  let list = CATALOG.filter((item) => {
    if (state.type && item.type !== state.type) return false;
    if (state.genre && !item.genres.includes(state.genre)) return false;
    if (state.year && String(item.year) !== String(state.year)) return false;
    if (q) {
      const hay = item._hay || `${item.title} ${item.genres.join(" ")} ${item.synopsis} ${item.cast.join(" ")}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  if (state.sort === "rating") list = [...list].sort((a, b) => b.rating - a.rating);
  else if (state.sort === "year") list = [...list].sort((a, b) => b.year - a.year);
  else if (state.sort === "title") list = [...list].sort((a, b) => a.title.localeCompare(b.title, "pt-BR"));
  else list = [...list].sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
  return list;
}

function filterPanel() {
  return `<div class="filter-panel">
    <div class="filter-search"><i class="fa-solid fa-magnifying-glass"></i><input class="input" id="catalog-query" type="search" placeholder="Filtrar por título, elenco..." value="${escapeHTML(state.query)}" aria-label="Filtrar catálogo"></div>
    <select class="select" id="filter-type" aria-label="Tipo">
      <option value="">Todos os tipos</option>
      <option value="movie" ${state.type === "movie" ? "selected" : ""}>Filmes</option>
      <option value="series" ${state.type === "series" ? "selected" : ""}>Séries</option>
    </select>
    <select class="select" id="filter-genre" aria-label="Gênero">
      <option value="">Todos os gêneros</option>
      ${allGenres.map((genre) => `<option value="${genre}" ${state.genre === genre ? "selected" : ""}>${genre}</option>`).join("")}
    </select>
    <select class="select" id="filter-year" aria-label="Ano">
      <option value="">Todos os anos</option>
      ${years().map((year) => `<option value="${year}" ${String(state.year) === String(year) ? "selected" : ""}>${year}</option>`).join("")}
    </select>
    <select class="select" id="filter-sort" aria-label="Ordenar">
      <option value="popular" ${state.sort === "popular" ? "selected" : ""}>Mais populares</option>
      <option value="rating" ${state.sort === "rating" ? "selected" : ""}>Melhor avaliados</option>
      <option value="year" ${state.sort === "year" ? "selected" : ""}>Mais recentes</option>
      <option value="title" ${state.sort === "title" ? "selected" : ""}>A–Z</option>
    </select>
    <button class="chip" id="clear-filters" type="button"><i class="fa-solid fa-rotate-left"></i>Limpar</button>
  </div>
  <div class="active-filters" id="active-filters"></div>`;
}

function activeFilters() {
  const items = [];
  if (state.type) items.push({ key: "type", label: state.type === "series" ? "Séries" : "Filmes" });
  if (state.genre) items.push({ key: "genre", label: state.genre });
  if (state.year) items.push({ key: "year", label: state.year });
  if (state.query) items.push({ key: "query", label: `“${state.query}”` });
  return items.length ? items.map((item) => `<span class="active-filter">${item.label}<button data-remove-filter="${item.key}" type="button" aria-label="Remover filtro"><i class="fa-solid fa-xmark"></i></button></span>`).join("") : "";
}

export function renderCatalogo() {
  readParams();
  qs("#page-content").innerHTML = `
    <div class="catalog-header">
      <div class="eyebrow section-kicker"><i class="fa-solid fa-clapperboard"></i> Catálogo completo</div>
      <h1>Tudo o que você quer assistir.</h1>
      <p>Filtre por tipo, gênero, ano ou procure pelo elenco. Seu catálogo, seus títulos, sua sessão.</p>
    </div>
    ${filterPanel()}
    <div class="catalog-grid-wrap">
      <div class="row-between" style="margin-bottom:14px"><span class="result-count" id="result-count"></span><span class="badge badge-soft"><i class="fa-solid fa-database"></i> ${CATALOG.length} títulos</span></div>
      <div class="card-grid wide" id="catalog-grid"></div>
      <div class="load-more-wrap"><button class="btn btn-ghost" id="load-more" type="button"><i class="fa-solid fa-plus"></i>Carregar mais títulos</button></div>
    </div>`;
  updateResults();
  mountCatalogo();
  setupRowArrows();
}

function updateResults() {
  const list = filtered();
  const visible = list.slice(0, state.visible);
  const grid = qs("#catalog-grid");
  const count = qs("#result-count");
  const active = qs("#active-filters");
  const more = qs("#load-more");
  if (!grid) return;
  count.textContent = `${list.length} título${list.length === 1 ? "" : "s"} encontrado${list.length === 1 ? "" : "s"}`;
  active.innerHTML = activeFilters();
  grid.innerHTML = visible.length ? visible.map((item) => posterCard(item)).join("") : emptyState("fa-film", "Nenhum título encontrado", "Ajuste os filtros ou limpe a busca para ver o catálogo completo.");
  more.style.display = list.length > state.visible ? "inline-flex" : "none";
  updateUrl();
}

function updateUrl() {
  const params = new URLSearchParams();
  if (state.type) params.set("tipo", state.type);
  if (state.genre) params.set("genero", state.genre);
  if (state.year) params.set("ano", state.year);
  if (state.sort && state.sort !== "popular") params.set("ordenar", state.sort);
  if (state.query) params.set("q", state.query);
  const query = params.toString();
  history.replaceState(null, "", `${location.pathname}${query ? `?${query}` : ""}`);
}

function mountCatalogo() {
  let debounceTimer = null;
  const bind = (id, key, eventName = "change") => {
    qs(id)?.addEventListener(eventName, (event) => {
      state[key] = event.target.value;
      state.visible = PAGE_SIZE;
      if (key === "query") {
        // Debounce no input de busca para não filtrar a cada tecla.
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => updateResults(), 180);
      } else {
        updateResults();
      }
    });
  };
  bind("#filter-type", "type");
  bind("#filter-genre", "genre");
  bind("#filter-year", "year");
  bind("#filter-sort", "sort");
  bind("#catalog-query", "query", "input");

  qs("#clear-filters")?.addEventListener("click", () => {
    Object.assign(state, { type: "", genre: "", year: "", sort: "popular", query: "", visible: PAGE_SIZE });
    qs("#filter-type").value = "";
    qs("#filter-genre").value = "";
    qs("#filter-year").value = "";
    qs("#filter-sort").value = "popular";
    qs("#catalog-query").value = "";
    updateResults();
  });

  qs("#active-filters")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove-filter]");
    if (!button) return;
    const key = button.dataset.removeFilter;
    state[key] = key === "sort" ? "popular" : "";
    if (key === "query") state.query = "";
    const control = { type: "#filter-type", genre: "#filter-genre", year: "#filter-year", query: "#catalog-query" }[key];
    if (control) qs(control).value = state[key];
    state.visible = PAGE_SIZE;
    updateResults();
  });

  qs("#load-more")?.addEventListener("click", () => {
    state.visible += PAGE_SIZE;
    updateResults();
  });
}
