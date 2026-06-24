(function() {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const apiStatus = $("apiStatus");
  const msgList = $("msgList");
  const chatMessages = $("chatMessages");
  const input = $("chatInput");
  const sendBtn = $("sendBtn");
  const attachBtn = $("attachBtn");
  const fileInput = $("fileInput");
  const attachPreview = $("attachPreview");
  const replyPreview = $("replyPreview");
  const wsState = $("wsState");
  const loadMore = $("loadMore");
  const chatDrop = $("chatDrop");
  const lightbox = $("lightbox");
  const lightboxImg = $("lightboxImg");
  let me = null;
  let pending = [];
  let replyTo = null;
  let oldestId = null;
  let knownIds = new Set();
  let ws = null, wsTimer = null;
  let avatarCache = {};
  let avatarAsked = new Set();
  async function resolveAvatars(sids) {
    const need = [...new Set(sids)].filter((s) => /^\d{17}$/.test(s) && !avatarAsked.has(s));
    if (!need.length) return;
    need.forEach((s) => avatarAsked.add(s));
    try {
      const r = await fetch("./api/messenger/avatars", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sids: need })
      });
      const d = await r.json().catch(() => null);
      if (!d || !d.ok) return;
      Object.assign(avatarCache, d.items || {});
      for (const sid of Object.keys(d.items || {})) {
        const url = d.items[sid];
        msgList.querySelectorAll(`img.msgAvatar[data-avsid="${CSS.escape(sid)}"]`).forEach((img) => {
          if (img.src !== url) img.src = url;
        });
      }
    } catch {
    }
  }
  function esc(s) {
    return (s ?? "").toString().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }
  function fmtTime(ts) {
    const d = new Date((Number(ts) || 0) * 1e3);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const time = d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
    if (d >= today) return `Сегодня, ${time}`;
    if (d >= yesterday) return `Вчера, ${time}`;
    return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" }) + `, ${time}`;
  }
  function shortText(s) {
    s = String(s || "").replace(/\s+/g, " ").trim();
    return s.length > 95 ? s.slice(0, 95) + "…" : s;
  }
  function fmtBytes(n) {
    n = Number(n || 0);
    if (!n) return "";
    const u = ["Б", "КБ", "МБ", "ГБ"];
    let i = 0;
    while (n >= 1024 && i < u.length - 1) {
      n /= 1024;
      i++;
    }
    return (i === 0 ? Math.round(n) : n.toFixed(1)) + " " + u[i];
  }
  function roleColor(role) {
    const map = { "KP": "#06b6d4", "Управляющий": "#ef4444", "Команда Проекта": "#f97316", "Главный Куратор": "#eab308", "Куратор": "#3b82f6", "Главный Администратор": "#22c55e" };
    return map[role] || "#8b5cf6";
  }
  function attachmentHtml(a) {
    const url = esc(a.url);
    if (a.kind === "image") {
      return `<a class="att attImg" href="${url}" data-img="${url}"><img loading="lazy" src="${url}" alt="${esc(a.name)}"></a>`;
    }
    if (a.kind === "video") {
      return `<video class="att attVideo" src="${url}" controls preload="metadata"></video>`;
    }
    if (a.kind === "audio") {
      return `<audio class="att attAudio" src="${url}" controls preload="none"></audio>`;
    }
    return `<a class="att attFile" href="${url}" download target="_blank" rel="noopener">
      <span class="attFileIcon">📄</span>
      <span class="attFileMeta"><span class="attFileName">${esc(a.name)}</span><span class="attFileSize">${esc(fmtBytes(a.size))}</span></span>
    </a>`;
  }
  function messageHtml(m) {
    const mine = me && String(m.steamid64) === String(me.steamid64);
    const canDelete = mine || me && me.role === "KP";
    const fallback = window.UI && UI.initialsAvatar ? UI.initialsAvatar(m.nick, m.steamid64) : "/img/noavatar.png";
    const avatar = avatarCache[m.steamid64] || fallback;
    const atts = (m.attachments || []).map(attachmentHtml).join("");
    const reply = m.reply_to ? `<button class="msgReplyBox" data-jump="${esc(m.reply_to.id)}" type="button"><span>${esc(m.reply_to.nick || "Ответ")}</span><em>${esc(shortText(m.reply_to.text || "Сообщение"))}</em></button>` : "";
    return `<div class="msg ${mine ? "mine" : ""}" data-id="${esc(m.id)}" data-sid="${esc(m.steamid64)}" data-nick="${esc(m.nick)}">
      <img class="msgAvatar" src="${avatar}" data-avsid="${esc(m.steamid64)}" data-fallback="${esc(fallback)}" alt="">
      <div class="msgBody">
        <div class="msgHead">
          <span class="msgNick" style="color:${roleColor(m.role)}">${esc(m.nick)}</span>
          <span class="msgRole">${esc(m.role)}</span>
          <span class="msgTime">${esc(fmtTime(m.ts))}</span>
          <button class="msgReplyBtn" title="Ответить" data-reply="${esc(m.id)}" type="button">↩</button>
          ${canDelete ? `<button class="msgDel" title="Удалить" data-del="${esc(m.id)}">×</button>` : ""}
        </div>
        ${reply}
        ${m.text ? `<div class="msgText">${esc(m.text)}</div>` : ""}
        ${atts ? `<div class="msgAtts">${atts}</div>` : ""}
      </div>
    </div>`;
  }
  function nearBottom() {
    return chatMessages.scrollHeight - chatMessages.scrollTop - chatMessages.clientHeight < 120;
  }
  function scrollToBottom() {
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
  function appendMessage(m, atBottom) {
    if (knownIds.has(m.id)) return;
    knownIds.add(m.id);
    const wrap = document.createElement("div");
    wrap.innerHTML = messageHtml(m);
    const node = wrap.firstElementChild;
    msgList.appendChild(node);
    bindMsgEvents(node);
    resolveAvatars([m.steamid64]);
    if (atBottom) scrollToBottom();
  }
  function prependMessages(items) {
    const prevH = chatMessages.scrollHeight;
    const frag = document.createDocumentFragment();
    for (const m of items) {
      if (knownIds.has(m.id)) continue;
      knownIds.add(m.id);
      const wrap = document.createElement("div");
      wrap.innerHTML = messageHtml(m);
      const node = wrap.firstElementChild;
      frag.appendChild(node);
      bindMsgEvents(node);
    }
    msgList.insertBefore(frag, msgList.firstChild);
    chatMessages.scrollTop = chatMessages.scrollHeight - prevH;
    resolveAvatars(items.map((m) => m.steamid64));
  }
  function bindMsgEvents(node) {
    node.querySelectorAll("[data-img]").forEach((a) => {
      a.addEventListener("click", (e) => {
        e.preventDefault();
        lightboxImg.src = a.getAttribute("data-img");
        lightbox.classList.add("show");
      });
    });
    const reply = node.querySelector("[data-reply]");
    if (reply) reply.addEventListener("click", () => setReplyFromNode(node));
    node.querySelectorAll("[data-jump]").forEach((b) => b.addEventListener("click", () => jumpToMessage(b.getAttribute("data-jump"))));
    const del = node.querySelector("[data-del]");
    if (del) del.addEventListener("click", () => removeMessage(del.getAttribute("data-del")));
  }
  function renderReplyPreview() {
    if (!replyPreview) return;
    if (!replyTo) {
      replyPreview.style.display = "none";
      replyPreview.innerHTML = "";
      return;
    }
    replyPreview.style.display = "flex";
    replyPreview.innerHTML = `<div><strong>Ответ ${esc(replyTo.nick || "")}</strong><span>${esc(shortText(replyTo.text || "Сообщение"))}</span></div><button type="button" title="Отменить">×</button>`;
    replyPreview.querySelector("button").addEventListener("click", () => {
      replyTo = null;
      renderReplyPreview();
      input.focus();
    });
  }
  function setReplyFromNode(node) {
    if (!node) return;
    const id = node.dataset.id || "";
    const nick = node.dataset.nick || node.querySelector(".msgNick")?.textContent || "";
    const text = node.querySelector(".msgText")?.textContent || (node.querySelector(".msgAtts") ? "Вложение" : "Сообщение");
    replyTo = { id, nick, text };
    renderReplyPreview();
    input.focus();
  }
  function jumpToMessage(id) {
    const node = msgList.querySelector(`.msg[data-id="${CSS.escape(id)}"]`);
    if (!node) return;
    node.scrollIntoView({ block: "center", behavior: "smooth" });
    node.classList.add("msgFlash");
    setTimeout(() => node.classList.remove("msgFlash"), 1200);
  }
  lightbox.addEventListener("click", () => lightbox.classList.remove("show"));
  function applyUserUpdate(data) {
    const sid = String(data?.steamid64 || "");
    if (!/^\d{17}$/.test(sid)) return;
    const nick = String(data.nickname || sid);
    const role = String(data.role || "");
    if (me && String(me.steamid64) === sid) {
      me.nickname = nick;
      if (role) me.role = role;
    }
    const fallback = window.UI && UI.initialsAvatar ? UI.initialsAvatar(nick, sid) : "/img/noavatar.png";
    msgList.querySelectorAll(`.msg[data-sid="${CSS.escape(sid)}"]`).forEach((node) => {
      const nickEl = node.querySelector(".msgNick");
      const roleEl = node.querySelector(".msgRole");
      const avatar = node.querySelector(".msgAvatar");
      node.dataset.nick = nick;
      if (nickEl) nickEl.textContent = nick;
      if (roleEl) roleEl.textContent = role;
      if (nickEl && role) nickEl.style.color = roleColor(role);
      if (avatar) {
        avatar.dataset.fallback = fallback;
        if (!avatarCache[sid]) avatar.src = fallback;
      }
    });
  }
  async function loadHistory(before) {
    try {
      const qs = new URLSearchParams({ limit: "60" });
      if (before) qs.set("before", before);
      const r = await fetch("./api/messenger/history?" + qs, { cache: "no-store", credentials: "include" });
      if (r.status === 401) {
        location.href = "/login";
        return;
      }
      const d = await r.json();
      if (!d.ok) throw new Error(d.error || "err");
      if (before) {
        prependMessages(d.items);
      } else {
        msgList.innerHTML = "";
        knownIds.clear();
        for (const m of d.items) {
          knownIds.add(m.id);
          const w = document.createElement("div");
          w.innerHTML = messageHtml(m);
          const n = w.firstElementChild;
          msgList.appendChild(n);
          bindMsgEvents(n);
        }
        resolveAvatars(d.items.map((m) => m.steamid64));
        scrollToBottom();
      }
      if (d.items.length) {
        oldestId = d.items[0].id;
      }
      loadMore.style.display = d.hasMore ? "" : "none";
      apiStatus.textContent = "API: OK";
    } catch (e) {
      apiStatus.textContent = "API: ERROR";
      if (window.UI) UI.toast({ ok: false, text: "Не удалось загрузить историю" });
    }
  }
  function removePending(idx) {
    pending.splice(idx, 1);
    renderPending();
  }
  function renderPending() {
    attachPreview.innerHTML = "";
    if (!pending.length) {
      attachPreview.style.display = "none";
      return;
    }
    attachPreview.style.display = "flex";
    pending.forEach((f, i) => {
      const chip = document.createElement("div");
      chip.className = "attChip";
      const isImg = f.type.startsWith("image/");
      chip.innerHTML = (isImg ? `<img src="${URL.createObjectURL(f)}">` : `<span class="attChipIcon">📄</span>`) + `<span class="attChipName">${esc(f.name)}</span><span class="attChipSize">${esc(fmtBytes(f.size))}</span><button class="attChipDel" title="Убрать">×</button>`;
      chip.querySelector(".attChipDel").addEventListener("click", () => removePending(i));
      attachPreview.appendChild(chip);
    });
  }
  const MAX = 25 * 1024 * 1024;
  function addFiles(files) {
    for (const f of files) {
      if (f.size > MAX) {
        if (window.UI) UI.toast({ ok: false, text: `Файл «${f.name}» больше 25 МБ` });
        continue;
      }
      if (pending.length >= 5) {
        if (window.UI) UI.toast({ ok: false, text: "Максимум 5 файлов за раз" });
        break;
      }
      pending.push(f);
    }
    renderPending();
  }
  async function send() {
    const text = input.value.trim();
    if (!text && !pending.length) return;
    sendBtn.disabled = true;
    try {
      const fd = new FormData();
      fd.append("text", text);
      if (replyTo?.id) fd.append("reply_to", replyTo.id);
      for (const f of pending) fd.append("files", f);
      const r = await fetch("./api/messenger/send", { method: "POST", body: fd, credentials: "include" });
      const d = await r.json().catch(() => null);
      if (!r.ok || !d || !d.ok) {
        if (d && d.error === "FILE_TOO_LARGE") throw new Error("Файл больше 25 МБ");
        if (d && d.error === "FILE_TYPE_NOT_ALLOWED") throw new Error("Тип файла не поддерживается: " + (d.rejected || []).join(", "));
        throw new Error(d && d.error || "HTTP " + r.status);
      }
      if (d.rejected && d.rejected.length && window.UI) {
        UI.toast({ ok: false, title: "Часть файлов не отправлена", text: "Не поддерживается: " + d.rejected.join(", ") });
      }
      input.value = "";
      autoGrow();
      pending = [];
      renderPending();
      replyTo = null;
      renderReplyPreview();
      appendMessage(d.message, true);
    } catch (e) {
      if (window.UI) UI.toast({ ok: false, text: e.message || "Ошибка отправки" });
    } finally {
      sendBtn.disabled = false;
      input.focus();
    }
  }
  async function removeMessage(id) {
    const ok = window.UI && UI.confirm ? await UI.confirm({ title: "Удалить сообщение?", text: "Это действие нельзя отменить.", okText: "Удалить", danger: true, icon: "🗑️" }) : confirm("Удалить сообщение?");
    if (!ok) return;
    try {
      const r = await fetch("./api/messenger/message?id=" + encodeURIComponent(id), { method: "DELETE", credentials: "include" });
      const d = await r.json().catch(() => null);
      if (!r.ok || !d || !d.ok) throw new Error(d && d.error || "err");
      const el = msgList.querySelector(`.msg[data-id="${CSS.escape(id)}"]`);
      if (el) el.remove();
    } catch (e) {
      if (window.UI) UI.toast({ ok: false, text: "Не удалось удалить" });
    }
  }
  function setActiveCount(count) {
    const n = Number(count || 0);
    if (wsState) wsState.textContent = n > 0 ? `● на сайте: ${n}` : "● онлайн";
    if (wsState) wsState.className = "wsState on";
  }
  function connectWS() {
    try {
      const proto = location.protocol === "https:" ? "wss" : "ws";
      ws = new WebSocket(`${proto}://${location.host}/ws/messenger`);
      ws.onopen = () => {
        wsState.textContent = "● подключено";
        wsState.className = "wsState on";
      };
      ws.onmessage = (ev) => {
        let d;
        try {
          d = JSON.parse(ev.data);
        } catch {
          return;
        }
        if (d.type === "message") {
          const atB = nearBottom();
          appendMessage(d.message, atB);
        } else if (d.type === "delete") {
          const el = msgList.querySelector(`.msg[data-id="${CSS.escape(d.id)}"]`);
          if (el) el.remove();
        } else if (d.type === "user_update") {
          applyUserUpdate(d);
        } else if (d.type === "active_count") {
          setActiveCount(d.count);
        } else if (d.type === "hello") {
          me = me || d.user;
          if (d.active_count !== void 0) setActiveCount(d.active_count);
        }
      };
      ws.onclose = () => {
        wsState.textContent = "● переподключение…";
        wsState.className = "wsState off";
        scheduleReconnect();
      };
      ws.onerror = () => {
        try {
          ws.close();
        } catch {
        }
      };
    } catch {
      scheduleReconnect();
    }
  }
  function scheduleReconnect() {
    clearTimeout(wsTimer);
    wsTimer = setTimeout(connectWS, 3e3);
  }
  function autoGrow() {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 160) + "px";
  }
  sendBtn.addEventListener("click", send);
  input.addEventListener("input", autoGrow);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  });
  attachBtn.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => {
    addFiles(fileInput.files);
    fileInput.value = "";
  });
  loadMore.querySelector("button").addEventListener("click", () => loadHistory(oldestId));
  input.addEventListener("paste", (e) => {
    const items = e.clipboardData && e.clipboardData.files;
    if (items && items.length) {
      addFiles(items);
      e.preventDefault();
    }
  });
  ["dragenter", "dragover"].forEach((ev) => document.addEventListener(ev, (e) => {
    e.preventDefault();
    chatDrop.classList.add("show");
  }));
  ["dragleave", "drop"].forEach((ev) => document.addEventListener(ev, (e) => {
    e.preventDefault();
    if (ev === "drop" || e.relatedTarget === null) chatDrop.classList.remove("show");
  }));
  document.addEventListener("drop", (e) => {
    if (e.dataTransfer && e.dataTransfer.files.length) {
      addFiles(e.dataTransfer.files);
    }
  });
  document.addEventListener("DOMContentLoaded", async () => {
    if (typeof requireAuth === "function") {
      try {
        await requireAuth();
      } catch {
        return;
      }
    }
    try {
      const r = await fetch("./api/me", { cache: "no-store", credentials: "include" });
      const d = await r.json();
      me = d.user || null;
    } catch {
    }
    await loadHistory();
    connectWS();
    autoGrow();
  });
})();
