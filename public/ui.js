(function() {
  "use strict";
  const THEME_KEY = "arizona_theme";
  function applyTheme(t) {
    const root = document.documentElement;
    if (t === "blue") root.setAttribute("data-theme", "blue");
    else root.removeAttribute("data-theme");
  }
  function getTheme() {
    try {
      const t = localStorage.getItem(THEME_KEY);
      return t === "blue" ? "blue" : "dark";
    } catch {
      return "dark";
    }
  }
  function toggleTheme() {
    const next = getTheme() === "blue" ? "dark" : "blue";
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
    }
    applyTheme(next);
    updateThemeBtn();
    return next;
  }
  function updateThemeBtn() {
    const b = document.getElementById("themeToggle");
    if (b) b.textContent = getTheme() === "blue" ? "🟡" : "🔵";
  }
  applyTheme(getTheme());
  try { if (window.self !== window.top) document.documentElement.classList.add("embeddedPage"); } catch { document.documentElement.classList.add("embeddedPage"); }
  function ensureToastWrap() {
    let w = document.getElementById("toastWrap");
    if (!w) {
      w = document.createElement("div");
      w.id = "toastWrap";
      w.className = "toastWrap";
      document.body.appendChild(w);
    }
    return w;
  }
  function uiToast(opts) {
    const o = typeof opts === "string" ? { text: opts } : opts || {};
    const ok = o.ok !== false && o.type !== "error";
    const wrap = ensureToastWrap();
    const el = document.createElement("div");
    el.className = "toast uiToast " + (ok ? "ok" : "bad");
    const icon = document.createElement("div");
    icon.className = "uiToastIcon";
    icon.textContent = o.icon || (ok ? "✓" : "✕");
    const body = document.createElement("div");
    body.className = "uiToastBody";
    const title = document.createElement("div");
    title.className = "toastTitle";
    title.textContent = o.title || (ok ? "Готово" : "Ошибка");
    const text = document.createElement("div");
    text.className = "toastText";
    text.textContent = o.text || "";
    body.appendChild(title);
    if (o.text) body.appendChild(text);
    const bar = document.createElement("div");
    bar.className = "uiToastBar";
    el.appendChild(icon);
    el.appendChild(body);
    el.appendChild(bar);
    wrap.appendChild(el);
    const dur = o.duration || 3200;
    bar.style.animationDuration = dur + "ms";
    const remove = () => {
      el.classList.add("leaving");
      setTimeout(() => el.remove(), 280);
    };
    el.addEventListener("click", remove);
    setTimeout(remove, dur);
    return el;
  }
  function skeletonCards(container, count) {
    if (!container) return;
    container.innerHTML = "";
    const frag = document.createDocumentFragment();
    for (let i = 0; i < (count || 8); i++) {
      const c = document.createElement("div");
      c.className = "skeletonCard";
      c.innerHTML = '<div class="skel skelAvatar"></div><div class="skelLines"><div class="skel skelLine w70"></div><div class="skel skelLine w40"></div><div class="skel skelChips"><span class="skel skelChip"></span><span class="skel skelChip"></span></div></div>';
      frag.appendChild(c);
    }
    container.appendChild(frag);
  }
  function skeletonRows(tbody, rows, cols) {
    if (!tbody) return;
    tbody.innerHTML = "";
    for (let i = 0; i < (rows || 8); i++) {
      const tr = document.createElement("tr");
      tr.className = "skeletonRow";
      for (let j = 0; j < (cols || 5); j++) {
        const td = document.createElement("td");
        td.innerHTML = '<div class="skel skelLine"></div>';
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
  }
  const AV_COLORS = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899", "#14b8a6", "#f59e0b"];
  function hashStr(s) {
    let h = 0;
    s = String(s || "");
    for (let i = 0; i < s.length; i++) h = h * 31 + s.charCodeAt(i) | 0;
    return Math.abs(h);
  }
  function initialsAvatar(name, sid) {
    const n = String(name || "").trim();
    let letters = "?";
    if (n) {
      const parts = n.replace(/[^\p{L}\p{N} ]/gu, "").split(/\s+/).filter(Boolean);
      letters = parts.length >= 2 ? parts[0][0] + parts[1][0] : n.slice(0, 2);
    }
    letters = letters.toUpperCase();
    const c1 = AV_COLORS[hashStr(sid || name) % AV_COLORS.length];
    const c2 = AV_COLORS[(hashStr(sid || name) + 4) % AV_COLORS.length];
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs><rect width="128" height="128" fill="url(#g)"/><text x="50%" y="52%" dy=".35em" text-anchor="middle" font-family="Inter,Arial,sans-serif" font-size="54" font-weight="800" fill="#fff">${letters}</text></svg>`;
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }
  function animateNumber(el, to, opts) {
    if (!el) return;
    to = Number(to) || 0;
    const o = opts || {};
    const dur = o.duration || 900;
    const from = Number(el.dataset.val || 0);
    if (from === to) {
      el.textContent = fmt(to);
      return;
    }
    const start = performance.now();
    function fmt(v) {
      return o.format ? o.format(v) : Math.round(v).toLocaleString("ru-RU");
    }
    function tick(now) {
      let p = Math.min(1, (now - start) / dur);
      p = 1 - Math.pow(1 - p, 3);
      const v = from + (to - from) * p;
      el.textContent = fmt(v);
      if (p < 1) requestAnimationFrame(tick);
      else {
        el.textContent = fmt(to);
        el.dataset.val = to;
      }
    }
    requestAnimationFrame(tick);
  }
  function ensureNetBanner() {
    let b = document.getElementById("netBanner");
    if (!b) {
      b = document.createElement("div");
      b.id = "netBanner";
      b.className = "netBanner";
      b.textContent = "⚠ Нет подключения к сети — данные могут устареть";
      document.body.appendChild(b);
    }
    return b;
  }
  function netUpdate() {
    const b = ensureNetBanner();
    b.classList.toggle("show", !navigator.onLine);
  }
  window.addEventListener("online", netUpdate);
  window.addEventListener("offline", netUpdate);
  function uiConfirm(opts) {
    const o = opts || {};
    return new Promise((resolve) => {
      const ov = document.createElement("div");
      ov.className = "confirmOverlay";
      ov.innerHTML = '<div class="confirmBox" role="dialog" aria-modal="true"><div class="confirmIcon ' + (o.danger ? "danger" : "") + '">' + (o.icon || (o.danger ? "🗑️" : "❓")) + '</div><div class="confirmTitle"></div><div class="confirmText"></div><div class="confirmActions"><button class="btn confirmCancel" type="button"></button><button class="btn ' + (o.danger ? "danger" : "blue") + ' confirmOk" type="button"></button></div></div>';
      ov.querySelector(".confirmTitle").textContent = o.title || "Подтверждение";
      ov.querySelector(".confirmText").textContent = o.text || "";
      const okBtn = ov.querySelector(".confirmOk");
      const cancelBtn = ov.querySelector(".confirmCancel");
      okBtn.textContent = o.okText || "Удалить";
      cancelBtn.textContent = o.cancelText || "Отмена";
      document.body.appendChild(ov);
      requestAnimationFrame(() => ov.classList.add("show"));
      const close = (val) => {
        ov.classList.remove("show");
        setTimeout(() => ov.remove(), 200);
        document.removeEventListener("keydown", onKey);
        resolve(val);
      };
      const onKey = (e) => {
        if (e.key === "Escape") close(false);
        if (e.key === "Enter") close(true);
      };
      document.addEventListener("keydown", onKey);
      okBtn.addEventListener("click", () => close(true));
      cancelBtn.addEventListener("click", () => close(false));
      ov.addEventListener("click", (e) => {
        if (e.target === ov) close(false);
      });
      setTimeout(() => okBtn.focus(), 60);
    });
  }
  window.UI = {
    toast: uiToast,
    confirm: uiConfirm,
    theme: { get: getTheme, toggle: toggleTheme, apply: applyTheme },
    skeletonCards,
    skeletonRows,
    initialsAvatar,
    animateNumber
  };
  document.addEventListener("DOMContentLoaded", () => {
    updateThemeBtn();
    netUpdate();
    enhanceNav();
    setupMobileNav();
    const tb = document.getElementById("themeToggle");
    if (tb) tb.addEventListener("click", toggleTheme);
  });
  const NAV_ITEMS = [
    { t: "Игроки", u: "/", i: "👥" },
    { t: "Баны", u: "/bans", i: "🔨" },
    { t: "Статистика", u: "/stats", i: "📊" },
    { t: "Логи админов", u: "/admin-logs", i: "📜" },
    { t: "Чёрный список", u: "/blacklist", i: "🚫" },
    { t: "Пользователи", u: "/manage/users", i: "🧑‍💼" },
    { t: "Права рангов", u: "/manage/permissions", i: "🛡️" },
    { t: "Управление", u: "/manage", i: "⚙️" },
    { t: "Тех.Раздел: деньги", u: "/tech/money", i: "💸" },
    { t: "Тех.Раздел: банды", u: "/tech/gangs", i: "🛡️" }
  ];
  let cmdOverlay = null;
  function buildPalette() {
    cmdOverlay = document.createElement("div");
    cmdOverlay.className = "cmdkOverlay";
    cmdOverlay.innerHTML = '<div class="cmdkBox" role="dialog" aria-modal="true"><input class="cmdkInput" type="text" placeholder="Поиск: страница или SteamID64 игрока…" autocomplete="off" /><div class="cmdkList"></div><div class="cmdkHint">↑↓ выбор • Enter открыть • Esc закрыть</div></div>';
    document.body.appendChild(cmdOverlay);
    const input = cmdOverlay.querySelector(".cmdkInput");
    const list = cmdOverlay.querySelector(".cmdkList");
    let items = [], sel = 0;
    function render() {
      const q = input.value.trim().toLowerCase();
      items = NAV_ITEMS.filter((n) => !q || n.t.toLowerCase().includes(q)).map((n) => ({ ...n }));
      if (/^\d{17}$/.test(input.value.trim())) {
        items.unshift({ t: "Открыть профиль " + input.value.trim(), u: "/player?sid=" + input.value.trim(), i: "🔎" });
      }
      list.innerHTML = "";
      items.forEach((it, idx) => {
        const row = document.createElement("button");
        row.type = "button";
        row.className = "cmdkItem" + (idx === sel ? " active" : "");
        row.innerHTML = '<span class="cmdkIcon">' + it.i + "</span><span></span>";
        row.querySelector("span:last-child").textContent = it.t;
        row.addEventListener("click", () => go(it));
        row.addEventListener("mousemove", () => {
          sel = idx;
          paint();
        });
        list.appendChild(row);
      });
    }
    function paint() {
      [...list.children].forEach((c, i) => c.classList.toggle("active", i === sel));
    }
    function go(it) {
      if (it) location.href = it.u;
    }
    input.addEventListener("input", () => {
      sel = 0;
      render();
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") {
        sel = Math.min(sel + 1, items.length - 1);
        paint();
        e.preventDefault();
      } else if (e.key === "ArrowUp") {
        sel = Math.max(sel - 1, 0);
        paint();
        e.preventDefault();
      } else if (e.key === "Enter") {
        go(items[sel]);
      } else if (e.key === "Escape") {
        closePalette();
      }
    });
    cmdOverlay.addEventListener("click", (e) => {
      if (e.target === cmdOverlay) closePalette();
    });
    render();
    requestAnimationFrame(() => {
      cmdOverlay.classList.add("show");
      input.focus();
    });
  }
  function closePalette() {
    if (!cmdOverlay) return;
    cmdOverlay.classList.remove("show");
    const o = cmdOverlay;
    cmdOverlay = null;
    setTimeout(() => o.remove(), 200);
  }
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K")) {
      e.preventDefault();
      if (cmdOverlay) closePalette();
      else buildPalette();
    }
  });

  function syncManagementLinks() {
    const role = (window.__ME && window.__ME.role) || window.__EARLY_ROLE || "";
    const canManage = role === "KP" || (typeof window.hasPerm === "function" && (window.hasPerm("manage_users") || window.hasPerm("manage_permissions")));
    document.querySelectorAll("[data-manage-hub]").forEach((el) => { el.style.display = canManage ? "" : "none"; });
  }
  function enhanceNav() {
    const nav = document.querySelector(".side .nav");
    if (!nav) return;
    const current = ((location.pathname || "/").replace(/\/+$/, "") || "/").toLowerCase();
    // Пользователи / Права рангов / Блокировки теперь живут внутри единой вкладки «Управление».
    nav.querySelectorAll('a[href="/manage/users"],a[href="/manage/permissions"],a[href="/manage/locks"]').forEach((a) => a.remove());
    // Пересобираем тех.раздел, чтобы заголовок не оказывался снизу под ссылками.
    nav.querySelectorAll('a[href="/tech/money"],a[href="/tech/gangs"],.navSectionTitle').forEach((el) => el.remove());
    const logout = nav.querySelector("#logoutBtn")?.closest(".navItem") || nav.querySelector("#logoutBtn");
    function addLink(id, text, href, attrs) {
      if (nav.querySelector(`[data-auto-nav="${id}"]`) || nav.querySelector(`a[href="${href}"]`)) return null;
      const a = document.createElement("a");
      a.className = "navItem" + (current === href.toLowerCase() ? " active" : "");
      a.href = href;
      a.textContent = text;
      a.dataset.autoNav = id;
      for (const [k, v] of Object.entries(attrs || {})) a.setAttribute(k, v);
      nav.insertBefore(a, logout || null);
      return a;
    }
    addLink("manage", "Управление", "/manage", { "data-manage-hub": "1", "data-lock-page": "/manage" });
    const title = document.createElement("div");
    title.className = "navSectionTitle techNavTitle";
    title.textContent = "Тех.Раздел";
    nav.insertBefore(title, logout || null);
    addLink("tech-money", "Операции с деньгами", "/tech/money", { "data-perm": "view_money_logs", "data-lock-page": "/tech/money" });
    addLink("tech-gangs", "Банды", "/tech/gangs", { "data-perm": "view_money_logs", "data-lock-page": "/tech/gangs" });
    syncManagementLinks();
  }
  window.addEventListener("perms:updated", syncManagementLinks);

  function setupMobileNav() {
    const side = document.querySelector(".side");
    const app = document.querySelector(".app");
    if (!side || !app) return;
    if (document.getElementById("mobileNavBtn")) return;
    const btn = document.createElement("button");
    btn.id = "mobileNavBtn";
    btn.className = "mobileNavBtn";
    btn.type = "button";
    btn.setAttribute("aria-label", "Меню");
    btn.innerHTML = "<span></span><span></span><span></span>";
    document.body.appendChild(btn);
    const backdrop = document.createElement("div");
    backdrop.id = "mobileNavBackdrop";
    backdrop.className = "mobileNavBackdrop";
    document.body.appendChild(backdrop);
    const open = () => {
      side.classList.add("open");
      backdrop.classList.add("show");
      btn.classList.add("active");
      document.body.style.overflow = "hidden";
    };
    const close = () => {
      side.classList.remove("open");
      backdrop.classList.remove("show");
      btn.classList.remove("active");
      document.body.style.overflow = "";
    };
    const toggle = () => {
      side.classList.contains("open") ? close() : open();
    };
    btn.addEventListener("click", toggle);
    backdrop.addEventListener("click", close);
    side.querySelectorAll(".navItem").forEach((a) => a.addEventListener("click", () => close()));
    window.addEventListener("resize", () => {
      if (window.innerWidth > 900) close();
    });
  }
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
      });
    });
  }
})();
