// Central configuration. Change brand, navigation and demo flags here.
export const CONFIG = {
  brand: "PK FILMES",
  brandShort: "PK",
  tagline: "O melhor do cinema",
  demo: true,
  version: "1.0.0",
  storagePrefix: "pkfilmes.demo.",
  defaultAvatarColors: ["#6a5acd", "#ec4899", "#0ea5e9", "#f59e0b", "#10b981", "#f43f5e"],
  nav: [
    { page: "home", href: "index.html", label: "Início", icon: "fa-house", section: "Explorar" },
    { page: "catalogo", href: "catalogo.html", label: "Catálogo", icon: "fa-clapperboard", section: "Explorar" },
    { page: "search", href: "search.html", label: "Buscar", icon: "fa-magnifying-glass", section: "Explorar" },
    { page: "cartaz", href: "cartaz.html", label: "Em breve", icon: "fa-calendar-days", section: "Explorar" },
    { page: "pkparty", href: "pkparty.html", label: "PK Party", icon: "fa-tower-broadcast", section: "Social" },
    { page: "amigos", href: "amigos.html", label: "Amigos", icon: "fa-user-group", section: "Social", badge: "requests" },
    { page: "vip", href: "vip.html", label: "VIP", icon: "fa-crown", section: "Social" },
    { page: "mascote", href: "mascote.html", label: "Faísca", icon: "fa-paw", section: "Social" },
    { page: "perfil", href: "perfil.html", label: "Perfil", icon: "fa-user", section: "Conta" }
  ],
  mobileNav: [
    { page: "home", href: "index.html", label: "Início", icon: "fa-house" },
    { page: "catalogo", href: "catalogo.html", label: "Catálogo", icon: "fa-clapperboard" },
    { page: "search", href: "search.html", label: "Buscar", icon: "fa-magnifying-glass" },
    { page: "pkparty", href: "pkparty.html", label: "Party", icon: "fa-tower-broadcast" },
    { page: "perfil", href: "perfil.html", label: "Perfil", icon: "fa-user" }
  ],
  genres: [
    { name: "Ação", icon: "fa-fire", colors: ["#450a0a", "#dc2626"] },
    { name: "Aventura", icon: "fa-compass", colors: ["#052e16", "#16a34a"] },
    { name: "Animação", icon: "fa-wand-magic-sparkles", colors: ["#3b0764", "#a855f7"] },
    { name: "Comédia", icon: "fa-face-laugh", colors: ["#422006", "#f59e0b"] },
    { name: "Crime", icon: "fa-handcuffs", colors: ["#111827", "#475569"] },
    { name: "Drama", icon: "fa-masks-theater", colors: ["#1e1b4b", "#6366f1"] },
    { name: "Família", icon: "fa-people-roof", colors: ["#0c4a6e", "#0ea5e9"] },
    { name: "Fantasia", icon: "fa-dragon", colors: ["#2e1065", "#8b5cf6"] },
    { name: "Ficção", icon: "fa-rocket", colors: ["#020617", "#14b8a6"] },
    { name: "Mistério", icon: "fa-magnifying-glass", colors: ["#0f172a", "#64748b"] },
    { name: "Romance", icon: "fa-heart", colors: ["#500724", "#ec4899"] },
    { name: "Suspense", icon: "fa-eye", colors: ["#111827", "#7c3aed"] },
    { name: "Terror", icon: "fa-ghost", colors: ["#0a0a0a", "#991b1b"] },
    { name: "Tecnologia", icon: "fa-microchip", colors: ["#022c22", "#10b981"] }
  ],
  plans: [
    {
      id: "free",
      name: "Grátis",
      price: "R$ 0",
      period: "para sempre",
      sub: "Comece a explorar",
      featured: false,
      cta: "Plano atual",
      features: [
        { text: "Catálogo completo em demonstração", on: true },
        { text: "Lista e histórico locais", on: true },
        { text: "PK Party com até 4 pessoas", on: true },
        { text: "Perfil com mascote", on: true },
        { text: "Qualidade 4K", on: false },
        { text: "Salas privadas ilimitadas", on: false }
      ]
    },
    {
      id: "vip",
      name: "VIP Individual",
      price: "R$ 14,90",
      period: "/mês",
      sub: "A experiência completa",
      featured: true,
      cta: "Ativar demo VIP",
      features: [
        { text: "Catálogo completo em demonstração", on: true },
        { text: "Lista e histórico locais", on: true },
        { text: "PK Party com até 8 pessoas", on: true },
        { text: "Perfil com mascote e bordas", on: true },
        { text: "Qualidade 4K simulada", on: true },
        { text: "Salas privadas ilimitadas", on: true }
      ]
    },
    {
      id: "duo",
      name: "VIP Duo",
      price: "R$ 24,90",
      period: "/mês",
      sub: "Para assistir junto",
      featured: false,
      cta: "Ativar demo Duo",
      features: [
        { text: "Tudo do VIP Individual", on: true },
        { text: "Dois perfis vinculados", on: true },
        { text: "PK Party com até 12 pessoas", on: true },
        { text: "Bordas e fundos exclusivos", on: true },
        { text: "Sessões do casal", on: true },
        { text: "Suporte prioritário demo", on: true }
      ]
    }
  ],
  demoVideos: [
    "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
    "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4",
    "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
    "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4",
    "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4",
    "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4",
    "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4",
    "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4",
    "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4"
  ]
};
