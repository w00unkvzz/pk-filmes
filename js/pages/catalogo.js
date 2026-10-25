// Catalog page: compact header (type pills, genre/year dropdowns, search) and
// incremental grid. Series are shown once per show, not once per episode.
import { catalogTitles, allGenres } from "../data.js";
import { qs, posterCard, emptyState, escapeHTML } from "../ui.js";

const PAGE_SIZE = 18;

const state = {
  type: "",
  genre: "",
  year: "",
  query: "",
  visible: PAGE_SIZE,
  rendered: 0
};

function readParams() {
  const params = new URLSearchParams(location.search);
  state.type = params.get("tipo") || "";
  state.genre = params.get("genero") || "";
  state.year = params.get("ano") || "";
  state.query = params.get("q") || "";
}

function availableYears() {
  return [...new Set(catalogTitles.map((item) => Number(item.year)).filter((year) => year >= 1900))]
    .sort((a, b) => b - a);
}

function filtered() {
  const q = state.query ? state.query.toLowerCase() : "";
  const list = catalogTitles.filter((item) => {
    if (state.type && item.type !== state.type) return false;
    if (state.genre && !item.genres.includes(state.genre)) return false;
    if (state.year && String(item.year) !== String(state.year)) return false;
    if (q) {
      const hay = item._hay || `${item.title} ${item.genres.join(" ")} ${item.synopsis} ${(item.cast || []).join(" ")}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  return list.sort((a, b) =>
    (b.featured ? 1 : 0) - (a.featured ? 1 : 0)
    || (b.rating || 0) - (a.rating || 0)
    || (b.year || 0) - (a.year || 0)
    || a.title.localeCompare(b.title, "pt-BR"));
}

function dropdown(id, label, options, current, allLabel) {
  return `<div class="catalog-dropdown" data-catalog-dropdown>
    <button class="catalog-select" id="${id}-button" type="button" aria-expanded="false" aria-haspopup="listbox">
      <span id="${id}-label">${escapeHTML(current || label)}</span>
      <i class="fa-solid fa-chevron-down"></i>
    </button>
    <div class="catalog-menu" id="${id}-menu" role="listbox" aria-label="${label}">
      <button class="catalog-menu-item ${current ? "" : "active"}" type="button" data-value="" role="option">${allLabel}</button>
      ${options.map((option) => `<button class="catalog-menu-item ${String(current) === String(option.value) ? "active" : ""}" type="button" data-value="${escapeHTML(String(option.value))}" role="option">${escapeHTML(option.label)}</button>`).join("")}
    </div>
  </div>`;
}

function controls() {
  const genreOptions = allGenres.map((genre) => ({ value: genre, label: genre }));
  const yearOptions = availableYears().map((year) => ({ value: year, label: String(year) }));
  const genreLabel = state.genre || "Gêneros";
  const yearLabel = state.year || "Anos";
  return `<div class="catalog-controls">
    <div class="type-pills" role="tablist" aria-label="Tipo de título">
      <button class="type-pill ${state.type === "" ? "active" : ""}" type="button" data-type-filter="" role="tab" aria-selected="${state.type === ""}">Todos</button>
      <button class="type-pill ${state.type === "movie" ? "active" : ""}" type="button" data-type-filter="movie" role="tab" aria-selected="${state.type === "movie"}">Filmes</button>
      <button class="type-pill ${state.type === "series" ? "active" : ""}" type="button" data-type-filter="series" role="tab" aria-selected="${state.type === "series"}">Séries</button>
    </div>
    <div class="catalog-filter-row">
      ${dropdown("genre", "Gêneros", genreOptions, genreLabel === "Gêneros" ? "" : genreLabel, "Todos os gêneros")}
      ${dropdown("year", "Anos", yearOptions, yearLabel === "Anos" ? "" : yearLabel, "Todos os anos")}
      <button class="catalog-clear ${state.type || state.genre || state.year || state.query ? "" : "hidden"}" id="clear-filters" type="button"><i class="fa-solid fa-xmark"></i>Limpar</button>
    </div>
    <label class="catalog-search" for="catalog-query">
      <i class="fa-solid fa-magnifying-glass"></i>
      <input id="catalog-query" type="search" placeholder="Buscar no catálogo" value="${escapeHTML(state.query)}" autocomplete="off">
    </label>
  </div>`;
}

function activeFilters() {
  const items = [];
  if (state.type) items.push({ key: "type", label: state.type === "series" ? "Séries" : "Filmes" });
  if (state.genre) items.push({ key: "genre", label: state.genre });
  if (state.year) items.push({ key: "year", label: state.year });
  if (state.query) items.push({ key: "query", label: `“${state.query}”` });
  return items.map((item) => `<span class="active-filter">${escapeHTML(item.label)}<button data-remove-filter="${item.key}" type="button" aria-label="Remover filtro"><i class="fa-solid fa-xmark"></i></button></span>`).join("");
}

export function renderCatalogo() {
  readParams();
  qs("#page-content").innerHTML = `
    <section class="catalog-head">
      <div>
        <span class="catalog-kicker"><i class="fa-solid fa-clapperboard"></i> Catálogo</span>
        <h1>Encontre sua próxima sessão.</h1>
        <p>Filmes, séries e histórias para assistir quando quiser.</p>
      </div>
      <span class="catalog-total"><strong>${catalogTitles.length}</strong> títulos</span>
    </section>
    ${controls()}
    <div class="active-filters" id="active-filters">${activeFilters()}</div>
    <div class="catalog-results">
      <div class="catalog-results-head">
        <span id="result-count" class="result-count"></span>
      </div>
      <div class="card-grid catalog-grid" id="catalog-grid"></div>
      <div class="load-more-wrap"><button class="btn btn-ghost" id="load-more" type="button"><i class="fa-solid fa-plus"></i>Carregar mais</button></div>
    </div>`;
  updateResults();
  mountCatalogo();
}

function updateResults(reset = true) {
  const list = filtered();
  const total = Math.min(state.visible, list.length);
  const grid = qs("#catalog-grid");
  const count = qs("#result-count");
  const active = qs("#active-filters");
  const more = qs("#load-more");
  if (!grid) return;

  if (count) count.textContent = `${list.length} título${list.length === 1 ? "" : "s"}`;
  if (active) active.innerHTML = activeFilters();
  syncClearButton();

  if (reset) {
    grid.innerHTML = list.length
      ? list.slice(0, total).map((item) => posterCard(item)).join("")
      : emptyState("fa-film", "Nenhum título encontrado", "Ajuste os filtros ou limpe a busca para ver o catálogo completo.");
    state.rendered = total;
  } else {
    const next = list.slice(state.rendered, total);
    if (next.length) grid.insertAdjacentHTML("beforeend", next.map((item) => posterCard(item)).join(""));
    state.rendered = total;
  }
  if (more) more.style.display = list.length > state.visible ? "inline-flex" : "none";
  updateUrl();
}

function syncClearButton() {
  const clear = qs("#clear-filters");
  if (!clear) return;
  clear.classList.toggle("hidden", !(state.type || state.genre || state.year || state.query));
  qsaActivePill();
}

function qsaActivePill() {
  document.querySelectorAll("[data-type-filter]").forEach((button) => {
    const active = (button.dataset.typeFilter || "") === state.type;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
}

function updateUrl() {
  const params = new URLSearchParams();
  if (state.type) params.set("tipo", state.type);
  if (state.genre) params.set("genero", state.genre);
  if (state.year) params.set("ano", state.year);
  if (state.query) params.set("q", state.query);
  const query = params.toString();
  history.replaceState(history.state || {}, "", `${location.pathname}${query ? `?${query}` : ""}`);
}

function setDropdownLabel(kind, value) {
  const label = qs(`#${kind}-label`);
  if (!label) return;
  label.textContent = value || (kind === "genre" ? "Gêneros" : "Anos");
}

function closeMenus(except = null) {
  document.querySelectorAll("[data-catalog-dropdown]").forEach((dropdown) => {
    if (dropdown === except) return;
    dropdown.classList.remove("open");
    dropdown.querySelector(".catalog-select")?.setAttribute("aria-expanded", "false");
  });
}

function mountCatalogo() {
  let debounceTimer = null;
  const refresh = () => {
    state.visible = PAGE_SIZE;
    updateResults();
  };

  document.querySelectorAll("[data-type-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.type = button.dataset.typeFilter || "";
      refresh();
    });
  });

  document.querySelectorAll("[data-catalog-dropdown]").forEach((dropdown) => {
    const trigger = dropdown.querySelector(".catalog-select");
    trigger?.addEventListener("click", (event) => {
      event.stopPropagation();
      const open = !dropdown.classList.contains("open");
      closeMenus();
      if (open) {
        // Size the menu to the space actually available on screen and flip it
        // upwards near the bottom edge so the year list is never clipped.
        const rect = trigger.getBoundingClientRect();
        const gap = 16;
        const spaceBelow = window.innerHeight - rect.bottom - gap;
        const spaceAbove = rect.top - gap;
        const openUp = spaceBelow < 260 && spaceAbove > spaceBelow;
        dropdown.classList.toggle("drop-up", openUp);
        const menu = dropdown.querySelector(".catalog-menu");
        if (menu) {
          const available = openUp ? spaceAbove : spaceBelow;
          menu.style.maxHeight = `${Math.max(160, Math.min(420, Math.round(available)))}px`;
          if (window.innerWidth <= 760) {
            // On phones the trigger can sit close to the right edge, so a
            // left-aligned 210px menu used to be cut by the screen. Centre the
            // menu on the viewport and cap its width to the usable area.
            const width = Math.min(window.innerWidth - 28, 340);
            menu.style.width = `${width}px`;
            menu.style.left = `${Math.round((window.innerWidth - width) / 2 - rect.left)}px`;
          } else {
            menu.style.width = "";
            menu.style.left = "";
          }
        }
      }
      dropdown.classList.toggle("open", open);
      trigger.setAttribute("aria-expanded", String(open));
    });
    dropdown.querySelectorAll(".catalog-menu-item").forEach((item) => {
      item.addEventListener("click", () => {
        const kind = dropdown.querySelector(".catalog-select")?.id.replace("-button", "") || "genre";
        const value = item.dataset.value || "";
        if (kind === "genre") state.genre = value;
        else state.year = value;
        setDropdownLabel(kind, value);
        dropdown.querySelectorAll(".catalog-menu-item").forEach((entry) => entry.classList.toggle("active", entry === item));
        dropdown.classList.remove("open");
        dropdown.querySelector(".catalog-select")?.setAttribute("aria-expanded", "false");
        refresh();
      });
    });
  });

  if (!window.__w00CatalogClickBound) {
    window.__w00CatalogClickBound = true;
    document.addEventListener("click", () => closeMenus());
  }

  if (!window.__w00CatalogResizeBound) {
    window.__w00CatalogResizeBound = true;
    // Rotating the phone or resizing the window would leave an open menu at
    // its old coordinates, often half outside the screen. Close it instead.
    window.addEventListener("resize", () => closeMenus(), { passive: true });
    window.addEventListener("orientationchange", () => closeMenus(), { passive: true });
  }

  qs("#catalog-query")?.addEventListener("input", (event) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      state.query = event.target.value.trim();
      refresh();
    }, 180);
  });

  qs("#clear-filters")?.addEventListener("click", () => {
    Object.assign(state, { type: "", genre: "", year: "", query: "", visible: PAGE_SIZE });
    const input = qs("#catalog-query");
    if (input) input.value = "";
    setDropdownLabel("genre", "");
    setDropdownLabel("year", "");
    document.querySelectorAll("[data-catalog-dropdown]").forEach((dropdown) => dropdown.classList.remove("open"));
    refresh();
  });

  qs("#active-filters")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove-filter]");
    if (!button) return;
    const key = button.dataset.removeFilter;
    state[key] = "";
    if (key === "query") {
      const input = qs("#catalog-query");
      if (input) input.value = "";
    }
    if (key === "genre") setDropdownLabel("genre", "");
    if (key === "year") setDropdownLabel("year", "");
    refresh();
  });

  qs("#load-more")?.addEventListener("click", () => {
    state.visible += PAGE_SIZE;
    updateResults(false);
  });
}
