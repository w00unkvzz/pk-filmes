// Local-first persistence. No external backend: everything lives in localStorage.
import { CONFIG } from "./config.js";
import { DEFAULT_USER, DEFAULT_PET, DEMO_FRIENDS, DEMO_REQUESTS, DEMO_ROOMS, byId } from "./data.js";

const P = CONFIG.storagePrefix;
const bus = new EventTarget();
const listeners = new Set();

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(P + key);
    if (raw === null) return structuredClone(fallback);
    return JSON.parse(raw);
  } catch {
    return structuredClone(fallback);
  }
}

function write(key, value, silent = false) {
  localStorage.setItem(P + key, JSON.stringify(value));
  if (!silent) {
    bus.dispatchEvent(new CustomEvent("change", { detail: { key, value } }));
    listeners.forEach((fn) => fn(key, value));
  }
  return value;
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function onStoreChange(fn) {
  const handler = (event) => {
    if (event.key && event.key.startsWith(P)) fn(event.key.slice(P.length), safeParse(event.newValue));
  };
  window.addEventListener("storage", handler);
  return () => window.removeEventListener("storage", handler);
}

function safeParse(value) {
  try { return JSON.parse(value); } catch { return value; }
}

/* User */
export function getUser() {
  const user = read("user", { ...DEFAULT_USER, authed: false });
  return { ...DEFAULT_USER, authed: false, ...user };
}

export function saveUser(patch) {
  const next = { ...getUser(), ...patch };
  return write("user", next);
}

export function login(name, email) {
  const current = getUser();
  return saveUser({
    ...current,
    name: (name || "").trim() || "Visitante",
    email: (email || "").trim() || "visitante@demo.local",
    authed: true,
    color: current.color || CONFIG.defaultAvatarColors[0]
  });
}

export function logout() {
  const watchlist = getWatchlist();
  const history = getHistory();
  write("user", { ...DEFAULT_USER, authed: false });
  write("watchlist", watchlist);
  write("history", history);
}

export function isLoggedIn() {
  return Boolean(getUser().authed);
}

export function activatePlan(planId) {
  const plan = CONFIG.plans.find((item) => item.id === planId);
  if (!plan) return getUser();
  return saveUser({ plan: plan.name, planId: plan.id });
}

/* Watchlist */
export function getWatchlist() {
  return read("watchlist", []);
}

export function isInWatchlist(id) {
  return getWatchlist().includes(id);
}

export function toggleWatchlist(id) {
  const list = getWatchlist();
  const exists = list.includes(id);
  const next = exists ? list.filter((item) => item !== id) : [id, ...list];
  write("watchlist", next);
  return { added: !exists, list: next };
}

/* History / continue watching */
export function getHistory() {
  const raw = read("history", {});
  return Object.values(raw)
    .filter((item) => byId(item.id))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getHistoryEntry(id) {
  const raw = read("history", {});
  return raw[id] || null;
}

export function addHistory(item, progress = 0, duration = null, extra = {}) {
  if (!item) return null;
  const raw = read("history", {});
  const total = duration || (item.duration ? item.duration * 60 : 0);
  const previous = raw[item.id] || {};
  const entry = {
    id: item.id,
    progress: Math.max(0, Number(progress) || 0),
    duration: total || previous.duration || 0,
    updatedAt: Date.now(),
    episode: extra.episode || previous.episode || null,
    title: item.title,
    type: item.type,
    ...extra
  };
  raw[item.id] = entry;
  write("history", raw);
  return entry;
}

export function updateProgress(id, progress, duration) {
  const raw = read("history", {});
  if (!raw[id]) return;
  raw[id].progress = Math.max(0, Number(progress) || 0);
  if (duration) raw[id].duration = duration;
  raw[id].updatedAt = Date.now();
  write("history", raw);
}

export function removeHistory(id) {
  const raw = read("history", {});
  delete raw[id];
  write("history", raw);
}

export function clearHistory() {
  write("history", {});
}

export function progressPercent(entry) {
  if (!entry || !entry.duration) return 0;
  return Math.min(100, Math.round((entry.progress / entry.duration) * 100));
}

/* Friends */
export function getFriends() {
  return read("friends", DEMO_FRIENDS);
}

export function getFriendRequests() {
  return read("requests", DEMO_REQUESTS);
}

export function addFriend(user) {
  const friends = getFriends();
  if (friends.some((friend) => friend.id === user.id || friend.email === user.email)) {
    return { added: false, friends };
  }
  const friend = {
    id: user.id || `friend-${Date.now()}`,
    name: user.name || "Novo amigo",
    email: user.email || "",
    color: user.color || CONFIG.defaultAvatarColors[Math.floor(Math.random() * CONFIG.defaultAvatarColors.length)],
    status: user.status || "offline",
    since: String(new Date().getFullYear())
  };
  const next = [friend, ...friends];
  write("friends", next);
  return { added: true, friend, friends: next };
}

export function acceptRequest(id) {
  const requests = getFriendRequests();
  const request = requests.find((item) => item.id === id);
  if (!request) return getFriends();
  const nextRequests = requests.filter((item) => item.id !== id);
  write("requests", nextRequests);
  const { added, friends } = addFriend(request);
  return added ? friends : friends;
}

export function rejectRequest(id) {
  const requests = getFriendRequests().filter((item) => item.id !== id);
  return write("requests", requests);
}

export function removeFriend(id) {
  return write("friends", getFriends().filter((friend) => friend.id !== id));
}

/* Rooms and chat */
export function getCustomRooms() {
  return read("rooms", []);
}

export function getRooms() {
  return [...getCustomRooms(), ...DEMO_ROOMS];
}

export function getRoom(code) {
  return getRooms().find((room) => room.code.toUpperCase() === String(code || "").toUpperCase()) || null;
}

export function saveRoom(room) {
  const rooms = getCustomRooms().filter((item) => item.code !== room.code);
  return write("rooms", [{ ...room, createdAt: room.createdAt || Date.now() }, ...rooms]);
}

export function updateRoom(code, patch) {
  const rooms = getCustomRooms();
  const index = rooms.findIndex((item) => item.code === code);
  if (index < 0) return null;
  rooms[index] = { ...rooms[index], ...patch };
  write("rooms", rooms);
  return rooms[index];
}

export function removeRoom(code) {
  return write("rooms", getCustomRooms().filter((item) => item.code !== code));
}

export function getChat(code) {
  return read(`chat.${code}`, [
    { id: "system-1", system: true, text: "Sala criada. Envie uma mensagem para começar.", at: Date.now() }
  ]);
}

export function addChatMessage(code, message) {
  const chat = getChat(code);
  const next = [...chat, { ...message, id: message.id || `msg-${Date.now()}-${Math.random().toString(16).slice(2)}`, at: Date.now() }].slice(-120);
  write(`chat.${code}`, next);
  return next;
}

export function clearChat(code) {
  write(`chat.${code}`, [
    { id: "system-2", system: true, text: "O histórico da conversa foi limpo.", at: Date.now() }
  ]);
}

/* Pet */
export function getPet() {
  return { ...structuredClone(DEFAULT_PET), ...read("pet", {}) };
}

export function savePet(patch) {
  return write("pet", { ...getPet(), ...patch });
}

export function petLevelProgress(pet) {
  const span = pet.xpNext || 400;
  return Math.min(100, Math.round((pet.xp / span) * 100));
}

const careRules = {
  feed: { label: "Alimentar", cooldown: 45, hunger: 18, happiness: 4, energy: 3, xp: 18 },
  love: { label: "Carinho", cooldown: 20, hunger: 0, happiness: 14, energy: 2, xp: 12 },
  play: { label: "Brincar", cooldown: 60, hunger: -4, happiness: 18, energy: -12, xp: 24 },
  rest: { label: "Descansar", cooldown: 90, hunger: -2, happiness: 3, energy: 26, xp: 10 }
};

export function carePet(action) {
  const rule = careRules[action];
  if (!rule) return { ok: false, reason: "Ação inválida." };
  const pet = getPet();
  const last = pet.lastCare?.[action] || 0;
  const remaining = Math.ceil((last + rule.cooldown * 1000 - Date.now()) / 1000);
  if (remaining > 0) return { ok: false, reason: `Aguarde ${remaining}s para repetir.` };

  const clamp = (value) => Math.max(0, Math.min(100, Math.round(value)));
  let xp = pet.xp + rule.xp;
  let level = pet.level;
  let xpNext = pet.xpNext;
  while (xp >= xpNext) {
    xp -= xpNext;
    level += 1;
    xpNext = Math.round(xpNext * 1.22);
  }
  const next = {
    ...pet,
    level,
    xp,
    xpNext,
    hunger: clamp(pet.hunger + rule.hunger),
    happiness: clamp(pet.happiness + rule.happiness),
    energy: clamp(pet.energy + rule.energy),
    lastCare: { ...pet.lastCare, [action]: Date.now() },
    log: [
      { at: Date.now(), text: `Você usou ${rule.label.toLowerCase()}. Faísca ganhou +${rule.xp} XP.` },
      ...(pet.log || [])
    ].slice(0, 20)
  };
  savePet(next);
  return { ok: true, pet: next, rule };
}

export function renamePet(name) {
  const clean = String(name || "").trim().slice(0, 18);
  if (!clean) return getPet();
  return savePet({ name: clean, log: [{ at: Date.now(), text: `O mascote agora se chama ${clean}.` }, ...(getPet().log || [])].slice(0, 20) });
}

export function careCooldowns(pet = getPet()) {
  const now = Date.now();
  const result = {};
  for (const [key, rule] of Object.entries(careRules)) {
    const last = pet.lastCare?.[key] || 0;
    result[key] = Math.max(0, Math.ceil((last + rule.cooldown * 1000 - now) / 1000));
  }
  return result;
}

/* Search history */
export function getSearchHistory() {
  return read("searchHistory", []);
}

export function addSearchHistory(term) {
  const clean = String(term || "").trim();
  if (!clean) return getSearchHistory();
  const history = getSearchHistory().filter((item) => item.toLowerCase() !== clean.toLowerCase());
  const next = [clean, ...history].slice(0, 8);
  return write("searchHistory", next);
}

export function clearSearchHistory() {
  return write("searchHistory", []);
}

/* Onboarding and settings */
export function hasOnboarded() {
  return Boolean(read("onboarded", false));
}

export function setOnboarded(value = true) {
  return write("onboarded", value);
}

export function getSettings() {
  return read("settings", { autoSkipIntro: false, reduceMotion: false, notifications: true });
}

export function saveSettings(patch) {
  return write("settings", { ...getSettings(), ...patch });
}
