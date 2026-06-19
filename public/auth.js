const PAGE_LABELS = {
 "index.html": "Игроки",
 "bans.html": "Баны",
 "stats.html": "Статистика",
 "admin_logs.html": "Логи админов",
 "blacklist.html": "Чёрный список проекта",
 "zbt_access.html": "Доступ ЗБТ",
 "add_user.html": "Пользователи",
 "permissions.html": "Права рангов",
 "messenger.html": "Мессенджер",
 "player.html": "Профиль игрока",
 "locks.html": "Блокировки"
};
function pageLabel(key) {
 return PAGE_LABELS[key] || (key || "").replace(/\.html$/i, "");
}
(function initRoleClasses() {
 try {
 const root = document.documentElement;
 if (!root.classList.contains("role-loading")) root.classList.add("role-loading");
 } catch (e) {}
})();
(function applyCachedPermsEarly() {
 try {
 const cachedRole = sessionStorage.getItem("arizona_role");
 const cachedPerms = sessionStorage.getItem("arizona_perms");
 if (cachedRole) {
 try {
 window.__EARLY_ROLE = cachedRole;
 } catch (e) {}
 }
 if (cachedPerms) {
 window.__PERMS = JSON.parse(cachedPerms) || {};
 }
 } catch (e) {}
})();
function roleSlug(role) {
 role = (role || "").toString();
 if (role === "KP") return "KP";
 return "r_" + encodeURIComponent(role).replace(/%/g, "_").replace(/[^a-zA-Z0-9_]/g, "_");
}
function applyRoleClass(role) {
 try {
 const root = document.documentElement;
 [...root.classList].forEach((c) => {
 if (c.startsWith("role-")) root.classList.remove(c);
 });
 root.classList.remove("role-loading");
 const slug = roleSlug(role || "");
 if (slug) root.classList.add("role-" + slug);
 } catch (e) {}
}
function applyPerms(perms) {
 try {
 const root = document.documentElement;
 root.classList.remove("perms-loading");
 window.__PERMS = perms || {};
 const permAllowed = (v) => {
 if (v === true) return true;
 if (v === 1 || v === "1") return true;
 if (typeof v === "string") {
 const s = v.trim().toLowerCase();
 if (s === "true" || s === "yes" || s === "y") return true;
 if (s === "false" || s === "0" || s === "no" || s === "") return false;
 }
 return false;
 };
 document.querySelectorAll("[data-perm]").forEach((el) => {
 const key = el.getAttribute("data-perm");
 const allowed = permAllowed(perms && perms[key]);
 el.style.display = allowed ? "" : "none";
 });
 document.querySelectorAll("[data-perm-disable]").forEach((el) => {
 const key = el.getAttribute("data-perm-disable");
 const allowed = permAllowed(perms && perms[key]);
 if (!el.dataset.origText) {
 el.dataset.origText = (el.textContent || "").trim();
 }
 el.disabled = !allowed;
 if (!allowed) {
 el.style.opacity = "0.55";
 el.style.cursor = "not-allowed";
 const noTxt = el.getAttribute("data-no-perm-text");
 if (noTxt) el.textContent = noTxt;
 } else {
 el.style.opacity = "";
 el.style.cursor = "";
 if (el.dataset.origText) el.textContent = el.dataset.origText;
 }
 });
 const role = (window.__ME && window.__ME.role) || (window.__EARLY_ROLE || "");
 document.querySelectorAll("[data-role-only]").forEach((el) => {
 const need = el.getAttribute("data-role-only");
 el.style.display = (need && need === role) ? "" : "none";
 });
 try {
 window.dispatchEvent(new CustomEvent("perms:updated", { detail: perms || {} }));
 } catch (e) {}
 } catch (e) {}
}
function hasPerm(key) {
 const perms = window.__PERMS || {};
 const v = perms ? perms[key] : false;
 if (v === true) return true;
 if (v === 1 || v === "1") return true;
 if (typeof v === "string") {
 const s = v.trim().toLowerCase();
 if (s === "true" || s === "yes" || s === "y") return true;
 return false;
 }
 return false;
}
async function requireAuth() {
 const r = await fetch("./api/me", { cache: "no-store", credentials: "include" });
 if (!r.ok) {
 const next = encodeURIComponent(location.pathname.replace(/^\//, "") + location.search);
 location.href = `login.html?next=${next}`;
 throw new Error("NOT_AUTH");
 }
 return r.json();
}
async function doLogout() {
 try {
 sessionStorage.removeItem("arizona_role");
 sessionStorage.removeItem("arizona_perms");
 } catch (e) {}
 await fetch("./api/logout", { method: "POST", cache: "no-store", credentials: "include" }).catch(() => {});
 location.href = "login.html";
}
document.addEventListener("click", (e) => {
 const t = e.target;
 if (t && t.id === "logoutBtn") {
 e.preventDefault();
 doLogout();
 }
});
async function checkUserRole() {
 try {
 const r = await fetch("./api/me", { cache: "no-store", credentials: "include" });
 if (!r.ok) return null;
 const data = await r.json();
 if (!data.ok) return null;
 const role = data.user?.role || "user";
 window.__ME = data.user || {};
 try {
 sessionStorage.setItem("arizona_role", role);
 sessionStorage.setItem("arizona_perms", JSON.stringify(data.perms || {}));
 } catch (e) {}
 applyRoleClass(role);
 applyPerms(data.perms || {});
 return role;
 } catch (error) {
 return null;
 }
}
async function checkPageAccess(requiredPerm) {
 const role = await checkUserRole();
 if (!role) {
 location.href = "login.html";
 return false;
 }
 if (!hasPerm(requiredPerm)) {
 location.href = "index.html";
 return false;
 }
 return true;
}
document.addEventListener("DOMContentLoaded", async () => {
 const path = window.location.pathname || "";
 try {
 if (window.__EARLY_ROLE) applyRoleClass(window.__EARLY_ROLE);
 if (window.__PERMS) applyPerms(window.__PERMS);
 } catch (e) {}
 const me = await checkUserRole();
 if (!me) return;
 const deny = () => {
 if (path.includes("index.html") || path === "/" || path === "") {
 location.href = "login.html";
 } else {
 location.href = "index.html";
 }
 };
 if ((path.includes("index.html") || path === "/" || path === "") && !hasPerm("view_players")) return deny();
 if (path.includes("add_user.html") && !hasPerm("manage_users")) return deny();
 if (path.includes("zbt_access.html") && !hasPerm("manage_zbt_access")) return deny();
 if (path.includes("admin_logs.html") && !hasPerm("view_admin_logs")) return deny();
 if (path.includes("blacklist.html") && !hasPerm("view_blacklist")) return deny();
 if (path.includes("permissions.html") && !hasPerm("manage_permissions")) return deny();
 if (path.includes("messenger.html") && !hasPerm("messenger")) return deny();
 if (path.includes("bans.html") && !hasPerm("view_bans")) return deny();
 if (path.includes("stats.html") && !hasPerm("view_stats")) return deny();
 if (path.includes("player.html") && !hasPerm("view_profile")) return deny();
 if (path.includes("locks.html")) {
 const role = (window.__ME && window.__ME.role) || me;
 if (role !== "KP") return deny();
 }

 if (path.includes(".html") && !path.includes("login.html")) {
 try {
 const r = await fetch("/api/locks/state", { cache: "no-store", credentials: "include" });
 if (r.ok) {
 const state = await r.json();
 if (state && state.ok && state.applies_to_me && state.pages) {
 const pageFile = (path.split("/").pop() || "").toLowerCase();
 if (state.pages[pageFile]) {
 try {
 if (window.UI && window.UI.toast) {
 window.UI.toast({
 title: "Заблокировано KP",
 text: "Раздел «" + pageLabel(pageFile) + "» сейчас в активном редактировании.",
 icon: "🔒",
 duration: 4500
 });
 }
 } catch (e) {}
 setTimeout(() => { location.href = "index.html"; }, 800);
 return;
 }
 }
 }
 } catch (e) {}
 }
});
