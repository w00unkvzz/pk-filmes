// Local-first cache. Cloud-backed social data is mirrored by js/social.js.
import { CONFIG } from "./config.js";
import { DEFAULT_USER, byId } from "./data.js";

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
    _wlSet = null;
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
    email: (email || "").trim() || "",
    authed: true
  });
}

export function logout() {
  _wlSet = null;
  const watchlist = getWatchlist();
  const history = getHistory();
  write("user", { ...DEFAULT_USER, authed: false });
  write("watchlist", watchlist);
  write("history", history);
  setSocialCache([], []);
}

export function isLoggedIn() {
  return Boolean(getUser().authed);
}

/* Watchlist — Set memoizado para lookup O(1) e atualização atômica */
let _wlSet = null;

function _wlSync(list) {
  if (!_wlSet) _wlSet = new Set();
  _wlSet.clear();
  for (const id of list) _wlSet.add(id);
}

export function getWatchlist() {
  const raw = read("watchlist", []);
  _wlSync(raw);
  return raw;
}

export function isInWatchlist(id) {
  getWatchlist();
  return _wlSet.has(id);
}

export function toggleWatchlist(id) {
  const raw = read("watchlist", []);
  _wlSync(raw);
  const exists = _wlSet.has(id);
  const next = exists ? raw.filter((value) => value !== id) : [id, ...raw];
  _wlSync(next);
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

/* Friends (cached from Supabase by js/social.js) */
export function getFriends() {
  return read("friends", []);
}

export function getFriendRequests() {
  return read("requests", []);
}

export function setSocialCache(friends = [], requests = []) {
  write("friends", friends, true);
  write("requests", requests, true);
  listeners.forEach((fn) => fn("social", { friends, requests }));
  return { friends, requests };
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
  return getCustomRooms();
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

/* Settings */
export function getSettings() {
  return read("settings", { autoSkipIntro: false, reduceMotion: false, notifications: true });
}

export function saveSettings(patch) {
  return write("settings", { ...getSettings(), ...patch });
}

