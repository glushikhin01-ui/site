(async () => {
  const $ = (id) => document.getElementById(id);
  const apiStatus = $("apiStatus"), tbody = $("tbody"), err = $("err");
  const qInput = $("q"), refreshBtn = $("refresh"), addPromoBtn = $("addPromoBtn");
  const statsRow = $("statsRow"), totalPromos = $("totalPromos"), activePromos = $("activePromos"), totalUses = $("totalUses");
  const usageModal = $("usageModal"), usageCode = $("usageCode"), usageTbody = $("usageTbody"), usageClose = $("usageClose");

  let allItems = [];

  function toast(ok, title, text) {
    if (window.UI && UI.toast) { UI.toast({ ok, title, text }); return; }
    const wrap = $("toastWrap"), el = document.createElement("div");
    el.className = "toast " + (ok ? "ok" : "bad");
    el.innerHTML = `<div class="toastTitle">${title}</div><div class="toastText">${text}</div>`;
    wrap.appendChild(el); setTimeout(() => el.remove(), 3000);
  }

  function modal({ title, body, onOk }) {
    const ov = document.createElement("div"); ov.className = "modalOverlay";
    const card = document.createElement("div"); card.className = "modalCard";
    card.innerHTML = `<div class="modalTitle">${title}</div><div class="modalBody"></div><div class="modalActions"><button class="btn" id="mCancel">Отмена</button><button class="btn blue" id="mOk">OK</button></div>`;
    card.querySelector(".modalBody").appendChild(body); ov.appendChild(card); document.body.appendChild(ov);
    card.querySelector("#mCancel").onclick = () => ov.remove();
    card.querySelector("#mOk").onclick = async () => { try { await onOk(); ov.remove(); } catch (e) { toast(false, "Ошибка", e.message || "Ошибка"); } };
  }

  function esc(s) { return (s ?? "").toString().replaceAll("&", "&").replaceAll("<", "<").replaceAll(">", ">").replaceAll('"', """).replaceAll("'", "'"); }

  async function apiJson(url, opts) {
    const r = await fetch(url, Object.assign({ cache: "no-store", credentials: "include", headers: { "X-Requested-With": "XMLHttpRequest" } }, opts || {}));
    const j = await r.json().catch(() => null);
    if (!r.ok || !j || !j.ok) throw new Error(j?.error || "HTTP " + r.status);
    return j;
  }

  function fmtDate(s) {
    if (!s) return "—";
    if (typeof s === "number") return new Date(s * 1000).toLocaleString("ru-RU");
    return String(s);
  }

  function renderReward(item) {
    const parts = [];
    if (item.donate > 0) parts.push(`<span style="color:#f59e0b">💎 ${Number(item.donate).toLocaleString("ru-RU")}</span>`);
    if (item.money > 0) parts.push(`<span style="color:#22c55e">💰 ${Number(item.money).toLocaleString("ru-RU")}</span>`);
    return parts.join(" + ") || "—";
  }

  function isExpired(dateStr) {
    if (!dateStr) return false;
    return new Date(dateStr) < new Date();
  }

  function render(items) {
    const filter = (qInput.value || "").toLowerCase().trim();
    let filtered = items;
    if (filter) filtered = items.filter(p => (p.code || "").toLowerCase().includes(filter));

    if (!filtered.length) {
      tbody.innerHTML = `<tr><td colspan="7" class="banEmpty">Нет промокодов</td></tr>`;
      return;
    }

    tbody.innerHTML = "";
    for (const p of filtered) {
      const tr = document.createElement("tr");
      const expired = isExpired(p.expiration_date);
      const active = !!p.is_active && !expired;
      const usedCount = parseInt(p.used_count || 0, 10);
      const limitText = p.max_uses > 0 ? `${usedCount} / ${p.max_uses}` : "∞";
      const statusHtml = expired
        ? `<span style="color:#ef4444">⏰ Истёк</span>`
        : active
          ? `<span style="color:#22c55e">✅ Активен</span>`
          : `<span style="color:#6b7280">⏸ Выключен</span>`;
      const expText = p.expiration_date ? fmtDate(p.expiration_date) : "Бессрочный";

      tr.innerHTML = `
        <td><code style="font-size:15px;font-weight:700;color:var(--accent)">${esc(p.code)}</code><div class="muted" style="font-size:11px">Создал: ${esc(p.created_by || "—")}</div></td>
        <td>${renderReward(p)}</td>
        <td>${limitText}</td>
        <td>${expText}</td>
        <td><strong>${usedCount}</strong></td>
        <td>${statusHtml}</td>
        <td class="nowrap"></td>
      `;

      const actions = tr.querySelector("td:last-child");

      // Кнопка "Подробнее"
      const infoBtn = document.createElement("button");
      infoBtn.className = "btn small";
      infoBtn.textContent = "📊";
      infoBtn.title = "Кто активировал";
      infoBtn.onclick = () => showUsage(p);
      actions.appendChild(infoBtn);

      // Кнопка "Вкл/Выкл"
      const toggleBtn = document.createElement("button");
      toggleBtn.className = "btn small";
      toggleBtn.textContent = active ? "⏸" : "▶️";
      toggleBtn.title = active ? "Выключить" : "Включить";
      toggleBtn.onclick = async () => {
        await apiJson("./api/promos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "toggle", id: p.id }) });
        toast(true, "OK", active ? "Промокод выключен" : "Промокод включён");
        await load();
      };
      actions.appendChild(toggleBtn);

      // Кнопка "Редактировать"
      const editBtn = document.createElement("button");
      editBtn.className = "btn small";
      editBtn.textContent = "✏️";
      editBtn.title = "Редактировать";
      editBtn.onclick = () => showEditModal(p);
      actions.appendChild(editBtn);

      // Кнопка "Сбросить использования"
      const resetBtn = document.createElement("button");
      resetBtn.className = "btn small";
      resetBtn.textContent = "🔄";
      resetBtn.title = "Сбросить использования";
      resetBtn.onclick = async () => {
        await apiJson("./api/promos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "reset_usage", id: p.id }) });
        toast(true, "OK", "Использования сброшены");
        await load();
      };
      actions.appendChild(resetBtn);

      // Кнопка "Удалить"
      const delBtn = document.createElement("button");
      delBtn.className = "btn small danger";
      delBtn.textContent = "🗑️";
      delBtn.title = "Удалить";
      delBtn.onclick = () => {
        modal({
          title: "Удалить промокод",
          body: Object.assign(document.createElement("div"), { innerHTML: `Удалить промокод <strong>${esc(p.code)}</strong>? Все данные об активациях тоже удалятся.` }),
          onOk: async () => {
            await apiJson("./api/promos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete", id: p.id }) });
            toast(true, "OK", "Промокод удалён");
            await load();
          }
        });
      };
      actions.appendChild(delBtn);

      tbody.appendChild(tr);
    }
  }

  function updateStats(items) {
    const total = items.length;
    const active = items.filter(p => p.is_active && !isExpired(p.expiration_date)).length;
    const uses = items.reduce((s, p) => s + parseInt(p.used_count || 0, 10), 0);
    totalPromos.textContent = total;
    activePromos.textContent = active;
    totalUses.textContent = uses;
    statsRow.style.display = "";
  }

  async function load() {
    apiStatus.textContent = "API: загрузка...";
    err.style.display = "none";
    try {
      const j = await apiJson("./api/promos");
      allItems = j.items || [];
      render(allItems);
      updateStats(allItems);
      apiStatus.textContent = "API: OK";
    } catch (e) {
      apiStatus.textContent = "API: ERROR";
      err.textContent = e.message || "Ошибка загрузки";
      err.style.display = "";
      toast(false, "Ошибка", "Не удалось загрузить промокоды");
    }
  }

  function showEditModal(p) {
    const wrap = document.createElement("div");
    wrap.innerHTML = `
      <div class="muted" style="margin-bottom:12px">Редактирование: <strong>${esc(p.code)}</strong></div>
      <label style="display:block;margin-bottom:8px"><span class="muted">Донат-рубли</span>
        <input class="modalInput" id="eDonate" type="number" min="0" value="${p.donate || 0}" /></label>
      <label style="display:block;margin-bottom:8px"><span class="muted">Игровые деньги</span>
        <input class="modalInput" id="eMoney" type="number" min="0" value="${p.money || 0}" /></label>
      <label style="display:block;margin-bottom:8px"><span class="muted">Макс. активаций (0 = без лимита)</span>
        <input class="modalInput" id="eMaxUses" type="number" min="0" value="${p.max_uses || 0}" /></label>
      <label style="display:block;margin-bottom:8px"><span class="muted">Дата истечения (пусто = бессрочный)</span>
        <input class="modalInput" id="eExpDate" type="datetime-local" value="${p.expiration_date ? p.expiration_date.replace(' ', 'T').slice(0, 16) : ''}" /></label>
    `;
    modal({
      title: "Редактировать промокод",
      body: wrap,
      onOk: async () => {
        const donate = parseInt(wrap.querySelector("#eDonate").value, 10) || 0;
        const money = parseInt(wrap.querySelector("#eMoney").value, 10) || 0;
        const maxUses = parseInt(wrap.querySelector("#eMaxUses").value, 10) || 0;
        const expRaw = wrap.querySelector("#eExpDate").value;
        const expDate = expRaw ? expRaw.replace("T", " ") + ":00" : null;
        await apiJson("./api/promos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "update", id: p.id, donate, money, max_uses: maxUses, expiration_date: expDate }) });
        toast(true, "OK", "Промокод обновлён");
        await load();
      }
    });
  }

  async function showUsage(p) {
    usageCode.textContent = p.code;
    usageTbody.innerHTML = `<tr><td colspan="3" class="banEmpty">Загрузка...</td></tr>`;
    usageModal.style.display = "flex";
    try {
      const j = await apiJson(`./api/promos/usage?promo_id=${p.id}`);
      const items = j.items || [];
      if (!items.length) {
        usageTbody.innerHTML = `<tr><td colspan="3" class="banEmpty">Никто ещё не активировал</td></tr>`;
        return;
      }
      usageTbody.innerHTML = "";
      for (const u of items) {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${esc(u.nickname || "—")}</td><td><code>${esc(u.steamid64 || u.steamid32 || "—")}</code></td><td>${fmtDate(u.used_at)}</td>`;
        usageTbody.appendChild(tr);
      }
    } catch {
      usageTbody.innerHTML = `<tr><td colspan="3" class="banEmpty">Ошибка загрузки</td></tr>`;
    }
  }

  usageClose.onclick = () => { usageModal.style.display = "none"; };
  usageModal.onclick = (e) => { if (e.target === usageModal) usageModal.style.display = "none"; };

  addPromoBtn.onclick = () => {
    const wrap = document.createElement("div");
    wrap.innerHTML = `
      <label style="display:block;margin-bottom:8px"><span class="muted">Код промокода (A-Z, 0-9, _)</span>
        <input class="modalInput" id="pCode" placeholder="SUMMER2026" style="text-transform:uppercase" /></label>
      <label style="display:block;margin-bottom:8px"><span class="muted">Донат-рубли</span>
        <input class="modalInput" id="pDonate" type="number" min="0" value="0" /></label>
      <label style="display:block;margin-bottom:8px"><span class="muted">Игровые деньги</span>
        <input class="modalInput" id="pMoney" type="number" min="0" value="0" /></label>
      <label style="display:block;margin-bottom:8px"><span class="muted">Макс. активаций (0 = без лимита)</span>
        <input class="modalInput" id="pMaxUses" type="number" min="0" value="0" /></label>
      <label style="display:block;margin-bottom:8px"><span class="muted">Дата истечения (пусто = бессрочный)</span>
        <input class="modalInput" id="pExpDate" type="datetime-local" /></label>
    `;
    modal({
      title: "Создать промокод",
      body: wrap,
      onOk: async () => {
        const code = (wrap.querySelector("#pCode").value || "").trim().toUpperCase().replace(/[^A-Z0-9_]/g, "");
        if (!code || code.length < 2) throw new Error("Укажите код (мин. 2 символа)");
        const donate = parseInt(wrap.querySelector("#pDonate").value, 10) || 0;
        const money = parseInt(wrap.querySelector("#pMoney").value, 10) || 0;
        if (donate === 0 && money === 0) throw new Error("Укажите хотя бы одну награду");
        const maxUses = parseInt(wrap.querySelector("#pMaxUses").value, 10) || 0;
        const expRaw = wrap.querySelector("#pExpDate").value;
        const expDate = expRaw ? expRaw.replace("T", " ") + ":00" : null;
        await apiJson("./api/promos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create", code, donate, money, max_uses: maxUses, expiration_date: expDate }) });
        toast(true, "OK", `Промокод ${code} создан!`);
        await load();
      }
    });
  };

  refreshBtn.onclick = () => { load(); toast(true, "Обновление", "Данные обновлены"); };

  let searchTimer = null;
  qInput.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => render(allItems), 200);
  });

  await load();
})();
