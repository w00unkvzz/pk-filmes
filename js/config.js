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
    { name: "Ação", icon: "fa-fire", colors: ["#2e1065", "#8b5cf6"] },
    { name: "Aventura", icon: "fa-compass", colors: ["#052e16", "#16a34a"] },
    { name: "Animação", icon: "fa-wand-magic-sparkles", colors: ["#3b1d0b", "#e8a13a"] },
    { name: "Comédia", icon: "fa-face-laugh", colors: ["#422006", "#f59e0b"] },
    { name: "Crime", icon: "fa-handcuffs", colors: ["#101012", "#6f6c66"] },
    { name: "Drama", icon: "fa-masks-theater", colors: ["#1c0f0a", "#ff5a36"] },
    { name: "Família", icon: "fa-people-roof", colors: ["#123a3a", "#7fd6c2"] },
    { name: "Fantasia", icon: "fa-dragon", colors: ["#2a0f1c", "#d95c8a"] },
    { name: "Ficção", icon: "fa-rocket", colors: ["#0a0a0b", "#5fc4b8"] },
    { name: "Mistério", icon: "fa-magnifying-glass", colors: ["#101012", "#8a857c"] },
    { name: "Romance", icon: "fa-heart", colors: ["#3a0f1a", "#d8b4fe"] },
    { name: "Suspense", icon: "fa-eye", colors: ["#101012", "#6d28d9"] },
    { name: "Terror", icon: "fa-ghost", colors: ["#0a0a0a", "#5b21b6"] },
    { name: "Tecnologia", icon: "fa-microchip", colors: ["#0b2a24", "#6fd6a8"] }
  ]
};
