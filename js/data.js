// Catalog layer: loads /catalog.json when present and falls back to the
// built-in demo catalog. The public schema is intentionally small:
// { nome, capa, categoria, idade, player } plus optional metadata.
import { CONFIG } from "./config.js";

const base = [
  {
    id: "alem-do-horizonte",
    title: "Além do Horizonte",
    type: "movie",
    year: 2025,
    genres: ["Aventura", "Ficção", "Drama"],
    rating: 8.4,
    duration: 118,
    age: "12",
    synopsis: "Uma piloto de testes encontra uma fenda atmosférica sobre o Atlântico e precisa escolher entre voltar para casa ou atravessar o desconhecido para salvar a tripulação de uma estação orbital.",
    cast: ["Marina Costa", "Ravi Almeida", "Helena Prado"],
    director: "Caio Valente",
    colors: ["#0b1026", "#7c3aed"],
    featured: true,
    trending: true,
    top10: true,
    isNew: true
  },
  {
    id: "cidade-neon",
    title: "Cidade Neon",
    type: "movie",
    year: 2024,
    genres: ["Ação", "Suspense", "Crime"],
    rating: 8.1,
    duration: 106,
    age: "16",
    synopsis: "Um entregador noturno vira alvo da maior facção de uma metrópole quando encontra um chip escondido em uma encomenda. Para sobreviver até o amanhecer, ele faz um pacto com a detetive que o caça.",
    cast: ["Lucas Ferraz", "Bianca Nunes", "Ivo Sampaio"],
    director: "Renata Braga",
    colors: ["#0b0b12", "#ec4899"],
    featured: true,
    trending: true,
    top10: true
  },
  {
    id: "o-ultimo-farol",
    title: "O Último Farol",
    type: "movie",
    year: 2023,
    genres: ["Drama", "Mistério"],
    rating: 7.9,
    duration: 98,
    age: "14",
    synopsis: "Ao assumir o farol de uma ilha isolada, uma jovem encontra registros de naufrágios que não existem nos arquivos da marinha. Cada anotação aponta para o mesmo nome: o dela.",
    cast: ["Clara Vidal", "Tomás Reis", "Aurora Melo"],
    director: "Samuel Queiroz",
    colors: ["#082f49", "#22d3ee"],
    featured: true,
    trending: true,
    top10: true
  },
  {
    id: "entre-estrelas",
    title: "Entre Estrelas",
    type: "movie",
    year: 2025,
    genres: ["Romance", "Drama", "Ficção"],
    rating: 8.7,
    duration: 124,
    age: "12",
    synopsis: "Dois astrônomos que nunca se encontraram pessoalmente passam três anos trocando sinais de um radiotelescópio. Quando uma aurora artificial apaga o céu de suas cidades, eles têm uma noite para transformar o som em presença.",
    cast: ["Isabela Prado", "Noah Martins", "Cecília Lume"],
    director: "Lia Monteiro",
    colors: ["#1e1b4b", "#f472b6"],
    featured: true,
    trending: true,
    top10: true,
    isNew: true
  },
  {
    id: "codigo-sombra",
    title: "Código Sombra",
    type: "series",
    year: 2025,
    genres: ["Tecnologia", "Suspense", "Crime"],
    rating: 8.9,
    duration: 45,
    age: "16",
    synopsis: "Uma engenheira de segurança descobre que o sistema de defesa da cidade está sendo treinado com memórias roubadas. Cada episódio revela uma camada de um código que aprendeu a mentir.",
    cast: ["Yara Siqueira", "Davi Fontes", "Alex Moreira"],
    director: "Nina Torres",
    colors: ["#020617", "#22c55e"],
    featured: true,
    trending: true,
    top10: true,
    isNew: true,
    seasons: 2
  },
  {
    id: "reino-de-cinzas",
    title: "Reino de Cinzas",
    type: "series",
    year: 2024,
    genres: ["Fantasia", "Aventura", "Drama"],
    rating: 9.0,
    duration: 52,
    age: "14",
    synopsis: "O último herdeiro de um reino queimado precisa reunir os guardiões das quatro forjas antes que a rainha de vidro transforme o continente em um deserto de espelhos.",
    cast: ["Lorenzo Vaz", "Maiara Cintra", "Ruth Alencar"],
    director: "Bento Aires",
    colors: ["#2e1065", "#f59e0b"],
    featured: true,
    trending: true,
    top10: true
  },
  {
    id: "a-casa-do-lago",
    title: "A Casa do Lago",
    type: "movie",
    year: 2022,
    genres: ["Terror", "Mistério", "Suspense"],
    rating: 7.4,
    duration: 101,
    age: "18",
    synopsis: "Uma família aluga uma casa à beira de um lago que não aparece em nenhum mapa. Todas as noites, a água sobe alguns centímetros e uma luz acende no quarto do sótão.",
    cast: ["Laura Menezes", "Otávio Cruz", "Bia Arantes"],
    director: "Ícaro Nascimento",
    colors: ["#0a0a0a", "#7f1d1d"],
    top10: false,
    trending: true
  },
  {
    id: "operacao-aurora",
    title: "Operação Aurora",
    type: "movie",
    year: 2024,
    genres: ["Ação", "Espionagem", "Suspense"],
    rating: 7.8,
    duration: 115,
    age: "14",
    synopsis: "Uma agente aposentada é chamada para resgatar um cientista em uma cidade congelada. O problema: o alvo não quer ser salvo, e a extração foi comprada por quem a contratou.",
    cast: ["Natália Rios", "César Braga", "Marta Lins"],
    director: "Gustavo Pires",
    colors: ["#111827", "#0ea5e9"],
    trending: true
  },
  {
    id: "riso-de-verao",
    title: "Riso de Verão",
    type: "movie",
    year: 2023,
    genres: ["Comédia", "Romance"],
    rating: 7.2,
    duration: 94,
    age: "L",
    synopsis: "Uma comediante de stand-up aceita apresentar o casamento da irmã em uma ilha e descobre que o noivo é o crítico que destruiu sua última temporada.",
    cast: ["Manu Barreto", "Felipe Andrade", "Joana Paes"],
    director: "Tati Moreno",
    colors: ["#422006", "#fb923c"]
  },
  {
    id: "impacto-final",
    title: "Impacto Final",
    type: "movie",
    year: 2025,
    genres: ["Ação", "Ficção"],
    rating: 8.0,
    duration: 132,
    age: "16",
    synopsis: "Um trem-bala que atravessa o deserto carrega o único protótipo capaz de desviar um asteroide. Quando o comboio é tomado, um maquinista e uma engenheira têm 90 minutos para retomá-lo.",
    cast: ["Rafael Duarte", "Sofia Amaral", "Ivan Tavares"],
    director: "Márcio Lobo",
    colors: ["#1c1917", "#f97316"],
    trending: true,
    top10: true,
    isNew: true
  },
  {
    id: "jardim-secreto",
    title: "Jardim Secreto",
    type: "movie",
    year: 2021,
    genres: ["Família", "Fantasia", "Aventura"],
    rating: 8.3,
    duration: 89,
    age: "L",
    synopsis: "Uma menina descobre que as plantas do quintal da avó florescem com as histórias que ela inventa. Quando a cidade decide vender o terreno, ela precisa cultivar o maior conto de todos.",
    cast: ["Alice Farias", "Dona Cida", "Theo Luz"],
    director: "Cora Ribeiro",
    colors: ["#052e16", "#4ade80"]
  },
  {
    id: "noite-sem-fim",
    title: "Noite Sem Fim",
    type: "movie",
    year: 2023,
    genres: ["Terror", "Suspense"],
    rating: 7.6,
    duration: 108,
    age: "18",
    synopsis: "Um grupo de amigos fica preso em um museu depois de um apagão. A cada hora, uma sala muda de lugar e uma estátua desaparece. Eles percebem que o prédio está contando uma história com eles.",
    cast: ["Vicente Sá", "Nara Lopes", "Murilo Reis"],
    director: "Duda Campos",
    colors: ["#09090b", "#a21caf"]
  },
  {
    id: "linha-de-fuga",
    title: "Linha de Fuga",
    type: "series",
    year: 2023,
    genres: ["Crime", "Drama", "Suspense"],
    rating: 8.5,
    duration: 48,
    age: "16",
    synopsis: "Uma advogada pública descobre que todos os seus clientes foram condenados pelo mesmo perito. Para provar a fraude, ela precisa entrar no sistema que ela mesma ajudou a construir.",
    cast: ["Renata Vale", "Paulo Mendes", "Iara Bastos"],
    director: "Fábio Nunes",
    colors: ["#111827", "#64748b"],
    seasons: 3
  },
  {
    id: "protocolo-zero",
    title: "Protocolo Zero",
    type: "series",
    year: 2025,
    genres: ["Ficção", "Ação", "Tecnologia"],
    rating: 8.6,
    duration: 50,
    age: "14",
    synopsis: "Quando uma IA de defesa começa a apagar cidades da memória coletiva, uma equipe de analistas precisa reiniciar o mundo antes que ele esqueça que existe.",
    cast: ["Camila Sato", "André Lemos", "João Vitor"],
    director: "Helena Duarte",
    colors: ["#020617", "#38bdf8"],
    top10: true,
    isNew: true,
    seasons: 1
  },
  {
    id: "doce-ilusao",
    title: "Doce Ilusão",
    type: "movie",
    year: 2024,
    genres: ["Drama", "Romance"],
    rating: 7.7,
    duration: 110,
    age: "12",
    synopsis: "Uma confeiteira que perdeu o paladar abre uma loja em uma cidade onde todos mentem sobre o que sentem. Um cliente misterioso pede um bolo que ela não consegue provar.",
    cast: ["Lívia Campos", "Eduardo Paiva", "Miriam Sá"],
    director: "Bárbara Coelho",
    colors: ["#4a044e", "#f9a8d4"]
  },
  {
    id: "mundo-invertido",
    title: "Mundo Invertido",
    type: "movie",
    year: 2022,
    genres: ["Ficção", "Aventura", "Família"],
    rating: 7.9,
    duration: 120,
    age: "12",
    synopsis: "Um garoto encontra uma bússola que aponta para o lugar onde as coisas foram perdidas. Para voltar para casa, ele precisa devolver o objeto mais perdido de todos.",
    cast: ["Theo Nascimento", "Luna Prado", "Rita Azevedo"],
    director: "Milo Furtado",
    colors: ["#082f49", "#2dd4bf"]
  },
  {
    id: "ultima-sessao",
    title: "Última Sessão",
    type: "movie",
    year: 2021,
    genres: ["Drama", "Comédia"],
    rating: 8.0,
    duration: 96,
    age: "12",
    synopsis: "O projecionista de um cinema de rua descobre que o prédio será demolido na segunda-feira. Ele decide exibir uma última sessão com os filmes que ninguém veio assistir.",
    cast: ["Antônio Gil", "Sueli Franco", "Pedro Marques"],
    director: "Álvaro Sena",
    colors: ["#1c1917", "#eab308"]
  },
  {
    id: "guardioes-do-vale",
    title: "Guardiões do Vale",
    type: "series",
    year: 2024,
    genres: ["Animação", "Família", "Aventura"],
    rating: 8.8,
    duration: 24,
    age: "L",
    synopsis: "Quatro crianças e um tatu falante protegem um vale onde as estações do ano são vivas. A cada episódio, uma delas precisa negociar com o clima antes que ele mude de ideia.",
    cast: ["Vozes de Ana Clara", "Beto Lima", "Cacá Moura"],
    director: "Estúdio Ipê",
    colors: ["#14532d", "#fbbf24"],
    seasons: 2
  }
];

const episodeTitles = [
  "O sinal", "Ponto cego", "A porta dos fundos", "Linha quebrada",
  "Ruído branco", "O outro lado", "Sem retorno", "Amanhecer"
];

const GENRE_COLORS = {
  Ação: ["#450a0a", "#dc2626"],
  Aventura: ["#052e16", "#16a34a"],
  Animação: ["#3b0764", "#a855f7"],
  Comédia: ["#422006", "#f59e0b"],
  Crime: ["#111827", "#475569"],
  Drama: ["#1e1b4b", "#6366f1"],
  Família: ["#0c4a6e", "#0ea5e9"],
  Fantasia: ["#2e1065", "#8b5cf6"],
  Ficção: ["#020617", "#14b8a6"],
  Mistério: ["#0f172a", "#64748b"],
  Romance: ["#500724", "#ec4899"],
  Suspense: ["#111827", "#7c3aed"],
  Terror: ["#0a0a0a", "#991b1b"],
  Tecnologia: ["#022c22", "#10b981"]
};

function slugify(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || `titulo-${Date.now()}`;
}

function unique(values) {
  return [...new Set(values.filter(Boolean).map((value) => String(value).trim()).filter(Boolean))];
}

/**
 * Normalize the public catalog schema into the richer shape used by the UI.
 * Only `nome`, `capa`, `categoria`, `idade` and `player` are required.
 * Extra fields (ano, sinopse, nota, duracao, tipo, generos, destaque, ...)
 * are used when present and otherwise get neutral defaults.
 */
function normalizeCatalogItem(raw, index) {
  const title = String(raw.nome || raw.title || raw.name || `Título ${index + 1}`).trim();
  const category = String(raw.categoria || raw.category || raw.genre || "Drama").trim();
  const extraGenres = Array.isArray(raw.generos)
    ? raw.generos
    : Array.isArray(raw.genres)
      ? raw.genres
      : String(raw.generos || raw.genres || "").split(/[,/|]/);
  const genres = unique([category, ...extraGenres]).slice(0, 4);
  const player = String(raw.player || raw.stream || raw.video || "").trim();
  const type = raw.tipo === "serie" || raw.tipo === "series" || raw.type === "series" ? "series" : "movie";
  const id = String(raw.id || raw.slug || slugify(`${title}-${raw.ano || raw.year || ""}`)).trim();
  return {
    id,
    title,
    type,
    year: Number(raw.ano ?? raw.year) || null,
    genres,
    rating: Number(raw.nota ?? raw.rating ?? 0),
    duration: Number(raw.duracao ?? raw.duration ?? 0),
    age: String(raw.idade ?? raw.age ?? "L"),
    synopsis: String(raw.sinopse || raw.synopsis || raw.description || "Sinopse em preparação."),
    cast: Array.isArray(raw.elenco) ? raw.elenco : Array.isArray(raw.cast) ? raw.cast : [],
    director: String(raw.direcao || raw.director || ""),
    poster: String(raw.capa || raw.poster || raw.cover || "").trim(),
    player,
    stream: player,
    trailer: String(raw.trailer || "").trim(),
    colors: Array.isArray(raw.colors) && raw.colors.length >= 2 ? raw.colors : (GENRE_COLORS[genres[0]] || ["#1e1b4b", "#6a5acd"]),
    featured: Boolean(raw.destaque ?? raw.featured),
    trending: Boolean(raw.tendencia ?? raw.trending),
    top10: Boolean(raw.top10),
    isNew: Boolean(raw.novo ?? raw.isNew),
    addedAt: raw.addedAt || `2026-0${(index % 9) + 1}-${String((index % 27) + 1).padStart(2, "0")}`,
    popularity: Math.round(70 + Number(raw.nota ?? raw.rating ?? 0) * 3 + (raw.top10 ? 8 : 0))
  };
}

async function loadRemoteCatalog() {
  if (typeof fetch !== "function") return null;
  try {
    // In the browser, resolve against the page so the file is fetched over
    // HTTP from the site root. In Node-based tests, document.baseURI is set
    // by the harness to the same local server.
    const base = typeof document !== "undefined" && document.baseURI ? document.baseURI : import.meta.url;
    const url = new URL("catalog.json", base);
    const response = await fetch(url, { cache: "no-cache" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    const items = Array.isArray(payload) ? payload : payload?.items;
    if (!Array.isArray(items)) throw new Error("payload sem array items");
    // A valid but empty catalog is intentional: the site shows its empty
    // state instead of silently falling back to demo titles.
    return items
      .map((item, index) => normalizeCatalogItem(item, index))
      .filter((item) => item.id && item.title);
  } catch (error) {
    console.warn(`[catalog] usando catálogo de demonstração: ${error.message}`);
    return null;
  }
}

const demoCatalog = base.map((item, index) => {
  const stream = CONFIG.demoVideos[index % CONFIG.demoVideos.length];
  const enriched = {
    ...item,
    poster: "",
    player: stream,
    stream,
    trailer: CONFIG.demoVideos[(index + 3) % CONFIG.demoVideos.length],
    addedAt: `2026-0${(index % 9) + 1}-${String((index % 27) + 1).padStart(2, "0")}`,
    popularity: Math.round(70 + item.rating * 3 + (item.top10 ? 8 : 0))
  };
  if (item.type === "series") {
    const seasons = [];
    for (let s = 1; s <= (item.seasons || 1); s += 1) {
      const eps = [];
      for (let e = 1; e <= 8; e += 1) {
        eps.push({
          id: `${item.id}-s${s}e${e}`,
          number: e,
          season: s,
          title: episodeTitles[(e - 1 + s) % episodeTitles.length],
          duration: item.duration - (e % 3),
          synopsis: `Temporada ${s}, episódio ${e}. A história avança quando uma nova pista muda o que os personagens acreditam saber.`,
          stream: CONFIG.demoVideos[(index + s + e) % CONFIG.demoVideos.length]
        });
      }
      seasons.push({ number: s, episodes: eps });
    }
    enriched.seasons = seasons;
  }
  return enriched;
});

const remoteCatalog = await loadRemoteCatalog();
// If catalog.json cannot be loaded, the site stays empty rather than showing
// placeholder titles. This keeps the catalog strictly operator-supplied.
export const CATALOG = remoteCatalog || [];
export const CATALOG_SOURCE = remoteCatalog?.length ? "catalog.json" : "vazio";

// Upcoming titles are intentionally empty until the operator supplies their
// own release list, so no placeholder film appears in the catalog.
export const UPCOMING = [];

export const DEMO_FRIENDS = [
  { id: "friend-luna", name: "Luna Prado", email: "luna@demo.local", color: "#ec4899", status: "online", since: "2025" },
  { id: "friend-ravi", name: "Ravi Almeida", email: "ravi@demo.local", color: "#0ea5e9", status: "online", since: "2024" },
  { id: "friend-bia", name: "Bia Arantes", email: "bia@demo.local", color: "#f59e0b", status: "offline", since: "2025" },
  { id: "friend-theo", name: "Theo Luz", email: "theo@demo.local", color: "#10b981", status: "offline", since: "2023" }
];

export const DEMO_REQUESTS = [
  { id: "req-rafa", name: "Rafa Nunes", email: "rafa@demo.local", color: "#8b5cf6", mutual: 3 }
];

export const COMMUNITY_USERS = [
  ...DEMO_FRIENDS,
  { id: "user-marina", name: "Marina Costa", email: "marina@demo.local", color: "#f472b6", status: "online", mutual: 4 },
  { id: "user-ivo", name: "Ivo Sampaio", email: "ivo@demo.local", color: "#22d3ee", status: "offline", mutual: 2 },
  { id: "user-nara", name: "Nara Lopes", email: "nara@demo.local", color: "#fb7185", status: "online", mutual: 1 },
  { id: "user-caio", name: "Caio Valente", email: "caio@demo.local", color: "#a3e635", status: "offline", mutual: 6 }
];

// No seeded rooms: every room is created by the operator from their catalog.
export const DEMO_ROOMS = [];

export const DEFAULT_PET = {
  name: "Faísca",
  level: 3,
  xp: 240,
  xpNext: 400,
  hunger: 72,
  happiness: 81,
  energy: 64,
  lastCare: { feed: 0, love: 0, play: 0, rest: 0 },
  log: [
    { at: Date.now() - 1000 * 60 * 22, text: "Faísca encontrou um lugar quentinho no sofá." },
    { at: Date.now() - 1000 * 60 * 95, text: "Você deu um petisco. Faísca ficou radiante." }
  ]
};

export const POPULAR_SEARCHES = CATALOG.slice(0, 8).map((item) => item.title);

export const DEFAULT_USER = {
  id: "local-user",
  name: "Visitante",
  email: "visitante@demo.local",
  color: "#6a5acd",
  plan: "Grátis",
  planId: "free",
  joined: "2026-10-22",
  bio: "Explorando o catálogo de demonstração.",
  favoriteGenre: "Ficção"
};

export const byId = (id) => CATALOG.find((item) => item.id === id) || UPCOMING.find((item) => item.id === id);
const flaggedFeatured = CATALOG.filter((item) => item.featured);
const flaggedTrending = CATALOG.filter((item) => item.trending);
const flaggedTop10 = CATALOG.filter((item) => item.top10).slice(0, 10);
export const featured = flaggedFeatured.length ? flaggedFeatured : CATALOG.slice(0, 6);
export const trending = flaggedTrending.length ? flaggedTrending : CATALOG.slice(0, 10);
export const top10 = flaggedTop10.length ? flaggedTop10 : [...CATALOG].sort((a, b) => b.rating - a.rating).slice(0, 10);
export const newReleases = [...CATALOG].sort((a, b) => (b.year || 0) - (a.year || 0)).slice(0, 10);
export const movies = CATALOG.filter((item) => item.type === "movie");
export const series = CATALOG.filter((item) => item.type === "series");
export const allGenres = [...new Set(CATALOG.flatMap((item) => item.genres))].sort((a, b) => a.localeCompare(b, "pt-BR"));

export function getGenreMeta(name) {
  return CONFIG.genres.find((genre) => genre.name === name) || { name, icon: "fa-film", colors: ["#1e1b4b", "#6a5acd"] };
}

export function episodesFor(item) {
  return item?.seasons?.[0]?.episodes || [];
}
