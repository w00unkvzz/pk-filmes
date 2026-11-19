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

/* Room invites (cached from Supabase by js/social.js) */
export function getRoomInvites() {
  return read("roomInvites", []);
}

export function setRoomInvites(invites = []) {
  write("roomInvites", invites, true);
  listeners.forEach((fn) => fn("roomInvites", invites));
  return invites;
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

/* Settings */
export function getSettings() {
  return read("settings", { autoSkipIntro: false, reduceMotion: false, notifications: true });
}

export function saveSettings(patch) {
  return write("settings", { ...getSettings(), ...patch });
}

