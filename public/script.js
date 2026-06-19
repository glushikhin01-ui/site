const API_BASE = "";
const grid = document.getElementById("grid");
const err = document.getElementById("err");
const qIn = document.getElementById("q");
const fil = document.getElementById("filter");
const ref = document.getElementById("refresh");
const countLine = document.getElementById("countLine");
const apiStatus = document.getElementById("apiStatus");
const perPageSel = document.getElementById("perPage");
const pager = document.getElementById("pager");
const prevPageBtn = document.getElementById("prevPage");
const nextPageBtn = document.getElementById("nextPage");
const pageInfo = document.getElementById("pageInfo");
let allPlayers = [];
let page = 1;
let perPage = parseInt(perPageSel.value, 10) || 20;
let loading = false;
let _lastHash = 0;
let _avatarBatchTimer = null;
const _avatarBatchQueue = new Set();

const RANK_ID_TO_NAME = {
  1: "User",
  2: "vip",
  3: "d-moderator",
  4: "d-admin",
  5: "superadmin",
  6: "owner",
  7: "inter",
  8: "helper",
  9: "moderator",
  10: "admin",
  11: "head-admin",
  12: "curator",
  13: "head-curator",
  14: "vice-manager",
  15: "manager",
  16: "project-team",
  17: "arizona-team",
  18: "zamuprav",
  19: "uprav",
  20: "co*",
  21: "*"
};
const RANK_COLORS = {
  "*": "#ef4444",
  "co*": "#ef4444",
  "uprav": "#ef4444",
  "zamuprav": "#f97316",
  "arizona-team": "#f97316",
  "project-team": "#f97316",
  "manager": "#eab308",
  "vice-manager": "#eab308",
  "head-curator": "#06b6d4",
  "curator": "#06b6d4",
  "head-admin": "#3b82f6",
  "admin": "#3b82f6",
  "moderator": "#ec4899",
  "helper": "#ec4899",
  "inter": "#ec4899",
  "owner": "#8b5cf6",
  "superadmin": "#8b5cf6",
  "d-admin": "#94a3b8",
  "d-moderator": "#94a3b8",
  "vip": "#f59e0b",
  "VIP": "#f59e0b",
  "User": "#10b981",
  "user": "#10b981"
};
function safeText(s) {
  return (s ?? "").toString();
}
function fmtPlaytime(sec) {
  sec = parseInt(sec || 0, 10);
  const h = Math.floor(sec / 3600);
  const m = Math.floor(sec % 3600 / 60);
  return `${h}ч ${m}м`;
}
function resolveRank(p) {
  const raw = (p && (p.rank ?? p.rank_id)) ?? "";
  if (raw === null || raw === void 0) return "user";
  if (typeof raw === "number") return RANK_ID_TO_NAME[raw] || "user";
  const s = raw.toString().trim();
  if (!s) return "user";
  if (/^\d+$/.test(s)) {
    const n = parseInt(s, 10);
    return RANK_ID_TO_NAME[n] || s;
  }
  return s;
}
function computeHash(items) {
  let h = 0;
  for (let i = 0; i < items.length; i++) {
    const p = items[i];
    const sid = String(p.steamid64 || "");
    const tail = sid.slice(-6);
    let x = 0;
    for (let j = 0; j < tail.length; j++) x = x * 31 + tail.charCodeAt(j) | 0;
    x ^= (p.online ? 1 : 0) << 1;
    x ^= (p.nick ? p.nick.length : 0) << 3;
    h = h * 31 + x | 0;
  }
  return h;
}
function scheduleAvatarBatch() {
  if (_avatarBatchTimer) return;
  _avatarBatchTimer = setTimeout(flushAvatarBatch, 120);
}
async function flushAvatarBatch() {
  _avatarBatchTimer = null;
  const sids = [..._avatarBatchQueue];
  _avatarBatchQueue.clear();
  if (!sids.length) return;
  try {
    const r = await fetch(`./api/avatars`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sids }),
      cache: "no-store",
      credentials: "include"
    });
    const j = await r.json().catch(() => null);
    if (j && j.ok && j.items) {
      document.querySelectorAll("img[data-sid]").forEach((img) => {
        const sid = img.getAttribute("data-sid");
        if (j.items[sid] && img.src !== j.items[sid]) img.src = j.items[sid];
      });
    }
  } catch {
  }
}
function enqueueAvatar(sid64, imgEl) {
  _avatarBatchQueue.add(sid64);
  scheduleAvatarBatch();
}
function makeCard(p) {
  const card = document.createElement("div");
  card.className = "card playerCard";
  card.setAttribute("data-sid64", p.steamid64);
  if (p.chsp || p.chsp_active) card.classList.add("chsp");
  const wrap = document.createElement("div");
  wrap.className = "avatarWrap";
  const img = document.createElement("img");
  img.className = "avatar";
  img.setAttribute("data-sid", p.steamid64);
  img.loading = "lazy";
  img.decoding = "async";
  img.width = 64;
  img.height = 64;
  const fallback = window.UI && UI.initialsAvatar ? UI.initialsAvatar(p.nick, p.steamid64) : "/img/noavatar.png";
  img.src = fallback;
  img.onerror = () => {
    img.src = fallback;
  };
  enqueueAvatar(p.steamid64, img);
  wrap.appendChild(img);
  if (p.chsp || p.chsp_active) {
    const chspLabel = document.createElement("div");
    chspLabel.className = "cardChspOverlay";
    chspLabel.textContent = "IN BLACKLISTED";
    wrap.appendChild(chspLabel);
  }
  const box = document.createElement("div");
  const name = document.createElement("div");
  name.className = "pName";
  name.textContent = safeText(p.nick) || "Unknown";
  const sub = document.createElement("div");
  sub.className = "pSub";
  sub.textContent = safeText(p.steamid) || safeText(p.steamid64);
  const badges = document.createElement("div");
  badges.className = "badges";
  const bOn = document.createElement("span");
  bOn.className = "badge " + (p.online ? "on" : "");
  bOn.textContent = p.online ? "Онлайн" : "Оффлайн";
  const bRank = document.createElement("span");
  bRank.className = "badge rank";
  const rankName = resolveRank(p);
  bRank.textContent = rankName;
  const c = RANK_COLORS[rankName] || RANK_COLORS[rankName.toLowerCase()];
  if (c) {
    bRank.style.borderColor = c;
    bRank.style.color = c;
  }
  const bTime = document.createElement("span");
  bTime.className = "badge";
  bTime.textContent = fmtPlaytime(p.playtime);
  badges.appendChild(bOn);
  if (p.chsp || p.chsp_active) {
    const bChsp = document.createElement("span");
    bChsp.className = "badge chsp";
    bChsp.textContent = "ЧСП";
    badges.appendChild(bChsp);
  }
  badges.appendChild(bRank);
  badges.appendChild(bTime);
  box.appendChild(name);
  box.appendChild(sub);
  box.appendChild(badges);
  card.appendChild(wrap);
  card.appendChild(box);
  card.addEventListener("click", () => {
    location.href = `player.html?sid=${encodeURIComponent(p.steamid64)}`;
  });
  return card;
}
function updateCard(el, p) {
  const sid64 = p.steamid64;
  const nameEl = el.querySelector(".pName");
  if (nameEl && nameEl.textContent !== (safeText(p.nick) || "Unknown")) {
    nameEl.textContent = safeText(p.nick) || "Unknown";
  }
  const onBadge = el.querySelector(".badge.on, .badge:not(.rank):not(.chsp)");
  if (onBadge) {
    const isOn = p.online;
    const newClass = "badge " + (isOn ? "on" : "");
    if (onBadge.className !== newClass) onBadge.className = newClass;
    const newText = isOn ? "Онлайн" : "Оффлайн";
    if (onBadge.textContent !== newText) onBadge.textContent = newText;
  }
  const rankName = resolveRank(p);
  const bRank = el.querySelector(".badge.rank");
  if (bRank) {
    if (bRank.textContent !== rankName) {
      bRank.textContent = rankName;
      const c = RANK_COLORS[rankName] || RANK_COLORS[rankName.toLowerCase()];
      if (c) {
        bRank.style.borderColor = c;
        bRank.style.color = c;
      } else {
        bRank.style.borderColor = "";
        bRank.style.color = "";
      }
    }
  }
  const bTime = el.querySelector(".badge:not(.on):not(.rank):not(.chsp)");
  const newTime = fmtPlaytime(p.playtime);
  if (bTime && bTime.textContent !== newTime && !bTime.classList.contains("rank") && !bTime.classList.contains("on")) {
    bTime.textContent = newTime;
  }
  const img = el.querySelector("img[data-sid]");
  if (img && (img.src.startsWith("data:") || img.src.indexOf("/img/noavatar.png") !== -1)) {
    enqueueAvatar(sid64, img);
  }
}
function getFiltered() {
  const query = (qIn.value || "").toLowerCase().trim();
  const mode = fil.value;
  let list = allPlayers.slice();
  if (mode === "online") list = list.filter((p) => p.online);
  if (query) {
    list = list.filter(
      (p) => (p.nick || "").toLowerCase().includes(query) || (p.steamid || "").toLowerCase().includes(query) || (p.steamid64 || "").toLowerCase().includes(query) || resolveRank(p).toLowerCase().includes(query)
    );
  }
  list.sort((a, b) => {
    const ao = a.online ? 1 : 0;
    const bo = b.online ? 1 : 0;
    if (ao !== bo) return bo - ao;
    return (a.nick || "").localeCompare(b.nick || "", "ru");
  });
  return list;
}
function render() {
  err.style.display = "none";
  perPage = parseInt(perPageSel.value, 10) || 20;
  const list = getFiltered();
  const total = list.length;
  const pages = Math.max(1, Math.ceil(total / perPage));
  if (page > pages) page = pages;
  if (page < 1) page = 1;
  const start = (page - 1) * perPage;
  const slice = list.slice(start, start + perPage);
  countLine.textContent = `Игроков в базе: ${allPlayers.length} • Показано: ${total} • На странице: ${slice.length} • Страница ${page}/${pages}`;
  grid.querySelectorAll(".skeletonCard").forEach((s) => s.remove());
  const existing = new Map();
  grid.querySelectorAll(".playerCard[data-sid64]").forEach((card) => {
    existing.set(card.getAttribute("data-sid64"), card);
  });
  const used = new Set();
  const frag = document.createDocumentFragment();
  let prevNode = null;
  for (let i = 0; i < slice.length; i++) {
    const p = slice[i];
    let card = existing.get(p.steamid64);
    if (card) {
      updateCard(card, p);
      used.add(p.steamid64);
      if (prevNode ? prevNode.nextSibling !== card : grid.firstChild !== card) {
        grid.insertBefore(card, prevNode ? prevNode.nextSibling : grid.firstChild);
      }
      prevNode = card;
    } else {
      card = makeCard(p);
      grid.insertBefore(card, prevNode ? prevNode.nextSibling : null);
      prevNode = card;
    }
  }
  for (const [sid, node] of existing) {
    if (!used.has(sid)) node.remove();
  }
  void frag;
  pager.style.display = pages > 1 ? "flex" : "none";
  pageInfo.textContent = `Страница ${page}/${pages}`;
  prevPageBtn.disabled = page <= 1;
  nextPageBtn.disabled = page >= pages;
}
async function load() {
  if (loading) return;
  loading = true;
  apiStatus.textContent = "API: загрузка...";
  if (!allPlayers.length && window.UI) UI.skeletonCards(grid, 10);
  try {
    const r = await fetch(`./api/players?_=${Date.now()}`, {
      cache: "no-store",
      credentials: "include",
      headers: { "X-Requested-With": "XMLHttpRequest" }
    });
    if (r.status === 401) {
      loading = false;
      const next = encodeURIComponent(location.pathname.replace(/^\//, "") + location.search);
      location.href = `login.html?next=${next}`;
      return;
    }
    const data = await r.json().catch(() => null);
    if (!r.ok) throw new Error(data?.error ? data.error : "HTTP " + r.status);
    let items = null;
    if (Array.isArray(data)) items = data;
    else if (data && data.ok && Array.isArray(data.items)) items = data.items;
    if (!items) throw new Error(data?.error || "bad json");
    const hash = computeHash(items);
    if (hash === _lastHash && allPlayers.length > 0) {
      apiStatus.textContent = "API: OK";
      loading = false;
      return;
    }
    _lastHash = hash;
    allPlayers = items;
    apiStatus.textContent = "API: OK";
    err.style.display = "none";
    render();
  } catch (e) {
    apiStatus.textContent = "API: ERROR";
    err.style.display = "block";
    err.textContent = `Ошибка загрузки: ${e.message}`;
    if (!allPlayers.length) {
      grid.innerHTML = "";
      pager.style.display = "none";
    }
  } finally {
    loading = false;
  }
}
let _filterTimer = null;
qIn.addEventListener("input", () => {
  clearTimeout(_filterTimer);
  _filterTimer = setTimeout(() => {
    page = 1;
    render();
  }, 200);
});
fil.addEventListener("change", () => {
  page = 1;
  render();
});
ref.addEventListener("click", load);
perPageSel.addEventListener("change", () => {
  page = 1;
  render();
});
prevPageBtn.addEventListener("click", () => {
  page--;
  render();
});
nextPageBtn.addEventListener("click", () => {
  page++;
  render();
});
load();
setInterval(load, 3e4);
