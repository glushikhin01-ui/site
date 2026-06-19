import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");
const LOCKS_FILE = join(DATA_DIR, "locks.json");

export const LOCKABLE_PAGES = [
  { key: "index.html",      label: "Игроки",                perm: "view_players" },
  { key: "bans.html",       label: "Баны",                  perm: "view_bans" },
  { key: "stats.html",      label: "Статистика",            perm: "view_stats" },
  { key: "admin_logs.html", label: "Логи админов",          perm: "view_admin_logs" },
  { key: "blacklist.html",  label: "Чёрный список проекта", perm: "view_blacklist" },
  { key: "promos.html",     label: "Промокоды",             perm: "view_promos" },
  { key: "zbt_access.html", label: "Доступ ЗБТ",            perm: "manage_zbt_access" },
  { key: "add_user.html",   label: "Пользователи",          perm: "manage_users" },
  { key: "permissions.html",label: "Права рангов",          perm: "manage_permissions" },
  { key: "messenger.html",  label: "Мессенджер",            perm: "messenger" },
  { key: "player.html",     label: "Профиль игрока",        perm: "view_profile" },
  { key: "emoji.html",      label: "Эмодзи",                perm: null },
  { key: "locks.html",      label: "Блокировки (KP)",       perm: null }
];

export const API_ACTION_MAP = [
  { method: "POST",   test: /^\/api\/bans\/?$/i,                perm: "ban" },
  { method: "POST",   test: /^\/api\/bans\/unban/i,             perm: "unban" },
  { method: "DELETE", test: /^\/api\/bans\/?$/i,                perm: "unban" },
  { method: "POST",   test: /^\/api\/kick\/?$/i,                perm: "kick" },
  { method: "POST",   test: /^\/api\/adminmode\/?$/i,           perm: "adminmode" },
  { method: "POST",   test: /^\/api\/give_money\/?$/i,          perm: "give_money" },
  { method: "POST",   test: /^\/api\/set_rank\/?$/i,            perm: "set_rank" },
  { method: "POST",   test: /^\/api\/chsp_action\/?$/i,         perm: "manage_blacklist" },
  { method: "POST",   test: /^\/api\/blacklist\/?$/i,           perm: "manage_blacklist" },
  { method: "PUT",    test: /^\/api\/blacklist\/?$/i,           perm: "manage_blacklist" },
  { method: "DELETE", test: /^\/api\/blacklist\/?$/i,           perm: "manage_blacklist" },
  { method: "POST",   test: /^\/api\/players\/[^/]+\/model\/?$/i,   perm: "give_model" },
  { method: "DELETE", test: /^\/api\/players\/[^/]+\/model\/?$/i,   perm: "manage_models" },
  { method: "POST",   test: /^\/api\/players\/[^/]+\/weapon\/?$/i,  perm: "give_weapon" },
  { method: "DELETE", test: /^\/api\/players\/[^/]+\/weapon\/?$/i,  perm: "manage_weapons" },
  { method: "POST",   test: /^\/api\/players\/[^/]+\/job\/?$/i,     perm: "give_job" },
  { method: "DELETE", test: /^\/api\/players\/[^/]+\/job\/?$/i,     perm: "manage_jobs" },
  { method: "POST",   test: /^\/api\/players\/[^/]+\/qmenu\/?$/i,   perm: "give_qmenu" },
  { method: "POST",   test: /^\/api\/players\/[^/]+\/kick\/?$/i,   perm: "kick" },
  { method: "POST",   test: /^\/api\/players\/[^/]+\/ban\/?$/i,    perm: "ban" },
  { method: "POST",   test: /^\/api\/players\/[^/]+\/unban\/?$/i,  perm: "unban" },
  { method: "POST",   test: /^\/api\/models\/?$/i,              perm: "manage_models" },
  { method: "PUT",    test: /^\/api\/models\/?$/i,              perm: "manage_models" },
  { method: "DELETE", test: /^\/api\/models\/?$/i,              perm: "manage_models" },
  { method: "POST",   test: /^\/api\/weapons\/?$/i,             perm: "manage_weapons" },
  { method: "PUT",    test: /^\/api\/weapons\/?$/i,             perm: "manage_weapons" },
  { method: "DELETE", test: /^\/api\/weapons\/?$/i,             perm: "manage_weapons" },
  { method: "POST",   test: /^\/api\/jobs\/?$/i,                perm: "manage_jobs" },
  { method: "PUT",    test: /^\/api\/jobs\/?$/i,                perm: "manage_jobs" },
  { method: "DELETE", test: /^\/api\/jobs\/?$/i,                perm: "manage_jobs" },
  { method: "POST",   test: /^\/api\/commands\/?$/i,            perm: "manage_commands" },
  { method: "POST",   test: /^\/api\/users\/?$/i,               perm: "manage_users" },
  { method: "PUT",    test: /^\/api\/users\/?$/i,               perm: "manage_users" },
  { method: "DELETE", test: /^\/api\/users\/?$/i,               perm: "manage_users" },
  { method: "POST",   test: /^\/api\/player_access\/?$/i,       perm: "give_access" },
  { method: "POST",   test: /^\/api\/zbt_access\/?$/i,          perm: "manage_zbt_access" },
  { method: "PUT",    test: /^\/api\/zbt_access\/?$/i,          perm: "manage_zbt_access" },
  { method: "DELETE", test: /^\/api\/zbt_access\/?$/i,          perm: "manage_zbt_access" },
  { method: "POST",   test: /^\/api\/promos\/?$/i,              perm: "manage_promos" },
  { method: "PUT",    test: /^\/api\/promos\/?$/i,              perm: "manage_promos" },
  { method: "DELETE", test: /^\/api\/promos\/?$/i,              perm: "manage_promos" },
  { method: "POST",   test: /^\/api\/permissions\/?$/i,         perm: "manage_permissions" },
  { method: "PUT",    test: /^\/api\/permissions\/?$/i,         perm: "manage_permissions" },
  { method: "POST",   test: /^\/api\/messenger\/?$/i,           perm: "messenger" },
  { method: "POST",   test: /^\/api\/emojis\/?$/i,              perm: "manage_emojis" }
];

function ensureDir(p) {
  const d = dirname(p);
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
}

function defaults() {
  return {
    mode: "all",
    permissions: {},
    pages: {},
    note: "",
    updated_at: 0,
    updated_by: ""
  };
}

let _cache = null;
let _cacheTime = 0;
const CACHE_TTL = 1500;

function locksPaths() {
  return [LOCKS_FILE];
}

function readFromDisk() {
  for (const p of locksPaths()) {
    try {
      if (!existsSync(p)) continue;
      const raw = readFileSync(p, "utf8") || "{}";
      const j = JSON.parse(raw);
      return normalize(j);
    } catch (e) {}
  }
  return defaults();
}

function normalize(j) {
  const out = defaults();
  if (!j || typeof j !== "object") return out;
  if (j.mode === "others") out.mode = "others";
  else out.mode = "all";
  if (j.permissions && typeof j.permissions === "object") {
    for (const [k, v] of Object.entries(j.permissions)) {
      out.permissions[String(k)] = !!v;
    }
  }
  if (j.pages && typeof j.pages === "object") {
    for (const [k, v] of Object.entries(j.pages)) {
      out.pages[String(k)] = !!v;
    }
  }
  out.note = String(j.note || "").slice(0, 200);
  out.updated_at = parseInt(j.updated_at || 0, 10) || 0;
  out.updated_by = String(j.updated_by || "").slice(0, 64);
  return out;
}

function writeToDisk(data) {
  const out = normalize(data);
  let written = false;
  for (const p of locksPaths()) {
    try {
      ensureDir(p);
      writeFileSync(p, JSON.stringify(out, null, 2), "utf8");
      written = true;
      break;
    } catch (e) {}
  }
  if (written) {
    _cache = out;
    _cacheTime = Date.now();
  }
  return written;
}

export function loadLocks() {
  const now = Date.now();
  if (_cache && now - _cacheTime < CACHE_TTL) return _cache;
  _cache = readFromDisk();
  _cacheTime = now;
  return _cache;
}

export function saveLocks(data) {
  return writeToDisk(data);
}

export function isPermLocked(permKey) {
  if (!permKey) return false;
  const l = loadLocks();
  return !!l.permissions[permKey];
}

export function isPageLocked(pageKey) {
  if (!pageKey) return false;
  const l = loadLocks();
  return !!l.pages[pageKey];
}

export function getMode() {
  return loadLocks().mode === "others" ? "others" : "all";
}

export function lockAppliesTo(user) {
  const mode = getMode();
  if (mode === "all") return true;
  return !(user && user.role === "KP");
}

const COMMAND_PATTERNS = [
  { perm: "kick",             pattern: /^ba kick\b/ },
  { perm: "ban",              pattern: /^ba (ban|perma)\b/ },
  { perm: "unban",            pattern: /^ba unban\b/ },
  { perm: "adminmode",        pattern: /^ba setadminmode\b/ },
  { perm: "give_money",       pattern: /^ba addmoney\b/ },
  { perm: "set_rank",         pattern: /^ba setgroup\b/ },
  { perm: "manage_blacklist", pattern: /^blacklist_(add|addip|remove|removeip)\b/ },
  { perm: "give_model",       pattern: /^(addmodel|removemodel)\b/ },
  { perm: "give_weapon",      pattern: /^(giveweapon|removeweapon)\b/ },
  { perm: "give_job",         pattern: /^(givejob|removejob)\b/ },
  { perm: "give_qmenu",       pattern: /^(giveqmenu|removeqmenu)\b/ },
  { perm: "give_access",      pattern: /^(panel_setprops|panel_setmodelaccess)\b/ },
  { perm: "give_job",         pattern: /^ba adddonate\b/ },
  { perm: "give_job",         pattern: /^ba (removedonate|takedonate|del_donate)\b/ }
];

function resolveCommandTextPerm(text) {
  const t = String(text || "").replace(/\s+/g, " ").toLowerCase().trim();
  for (const { perm, pattern } of COMMAND_PATTERNS) {
    if (pattern.test(t)) return perm;
  }
  return null;
}

export function resolveActionPerm(method, path, body) {
  const m = String(method || "").toUpperCase();
  if (m === "POST" && /^\/api\/command\/?$/i.test(path || "")) {
    return resolveCommandTextPerm(body && body.text);
  }
  for (const rule of API_ACTION_MAP) {
    if (rule.method !== m) continue;
    if (rule.test.test(path)) return rule.perm;
  }
  return null;
}

export function publicLocksSnapshot(user) {
  const l = loadLocks();
  return {
    ok: true,
    mode: l.mode,
    note: l.note,
    updated_at: l.updated_at,
    updated_by: l.updated_by,
    permissions: l.permissions,
    pages: l.pages,
    applies_to_me: lockAppliesTo(user),
    i_am_kp: !!(user && user.role === "KP")
  };
}
