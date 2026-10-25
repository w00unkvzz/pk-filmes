// Central configuration for w00filmes.
export const CONFIG = {
  brand: "w00filmes",
  brandShort: "w00",
  tagline: "cinema sem limites",
  version: "2.0.0",
  storagePrefix: "w00filmes.",
  nav: [
    { page: "home", href: "/", label: "Início", icon: "fa-house", section: "Explorar" },
    { page: "catalogo", href: "/catalogo", label: "Catálogo", icon: "fa-clapperboard", section: "Explorar" },
    { page: "cartaz", href: "/em-breve", label: "Em breve", icon: "fa-calendar-days", section: "Explorar" },
    { page: "pkparty", href: "/party", label: "w00 Party", icon: "fa-tower-broadcast", section: "Social", badge: "invites" },
    { page: "amigos", href: "/amigos", label: "Amigos", icon: "fa-user-group", section: "Social", badge: "requests" },
    { page: "perfil", href: "/perfil", label: "Perfil", icon: "fa-user", section: "Conta" }
  ],
  mobileNav: [
    { page: "home", href: "/", label: "Início", icon: "fa-house" },
    { page: "catalogo", href: "/catalogo", label: "Catálogo", icon: "fa-clapperboard" },
    { page: "pkparty", href: "/party", label: "Party", icon: "fa-tower-broadcast" },
    { page: "perfil", href: "/perfil", label: "Perfil", icon: "fa-user" }
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
    { name: "Romance", icon: "fa-heart", colors: ["#4c1d95", "#a78bfa"] },
    { name: "Suspense", icon: "fa-eye", colors: ["#111827", "#7c3aed"] },
    { name: "Terror", icon: "fa-ghost", colors: ["#0a0a0a", "#991b1b"] },
    { name: "Tecnologia", icon: "fa-microchip", colors: ["#022c22", "#10b981"] }
  ]
};
