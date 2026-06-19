(async () => {
    
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
  function resolveRank(p) {
    const raw = (p && (p.rank ?? p.rank_id)) ?? "";
    if (raw === null || raw === void 0) return "user";
    if (typeof raw === "number") return RANK_ID_TO_NAME[raw] || "user";
    const s = raw.toString().trim(); if (!s) return "user";
    if (/^\d+$/.test(s)) { const n = parseInt(s, 10); return RANK_ID_TO_NAME[n] || s; }
    return s;
  }
  const RANK_COLORS = {
    "*":"#ef4444","co*":"#ef4444","uprav":"#ef4444",
    "zamuprav":"#f97316","arizona-team":"#f97316","project-team":"#f97316",
    "manager":"#eab308","vice-manager":"#eab308",
    "head-curator":"#06b6d4","curator":"#06b6d4",
    "head-admin":"#3b82f6","admin":"#3b82f6",
    "moderator":"#ec4899","helper":"#ec4899","inter":"#ec4899",
    "owner":"#8b5cf6","superadmin":"#8b5cf6",
    "d-admin":"#94a3b8","d-moderator":"#94a3b8",
    "vip":"#f59e0b","VIP":"#f59e0b",
    "User":"#10b981","user":"#10b981"
  };
  const $ = (id) => document.getElementById(id);
  function toast(ok, title, text) {
    if (window.UI && UI.toast) { UI.toast({ ok, title, text }); return; }
    const wrap = $("toastWrap"); const el = document.createElement("div");
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
    card.querySelector("#mOk").onclick = async () => { try { await onOk(); ov.remove(); setTimeout(() => load(), 2000); } catch (error) { toast(false, "Ошибка", error.message || "Неизвестная ошибка"); } };
  }
  async function sendCommand(text) {
    const r = await fetch("./api/command", { method: "POST", body: JSON.stringify({ type: "console", text }), cache: "no-store", credentials: "include", headers: { "Content-Type": "application/json","X-Requested-With": "XMLHttpRequest" }});
    if (!r.ok) throw new Error("HTTP " + r.status);
    const j = await r.json(); if (!j || !j.ok) throw new Error(j.error || "API error"); return j;
  }
  function escapeArg(s){ return String(s||"").replace(/\\/g,"\\\\").replace(/"/g,'\\"'); }

  const apiStatus = $("apiStatus"), ava = $("ava"), dot = $("dot");
  const steamidEl=$("steamid"), steamid64El=$("steamid64"), nickEl=$("nick"), onlineEl=$("online"), lastseenEl=$("lastseen"), playtimeEl=$("playtime"), moneyEl=$("money"), rankEl=$("rank"), pingEl=$("ping");
  const banTbody=$("banTbody"), warnSummary=$("warnSummary"), warnInfoBtn=$("warnInfoBtn");
  const titleEl=$("title"), subtitleEl=$("subtitle");
  const kickBtn=$("kickBtn"), banBtn=$("banBtn"), unbanBtn=$("unbanBtn"), adminmodeBtn=$("adminmodeBtn"), cspBtn=$("cspBtn"), cspRemoveBtn=$("cspRemoveBtn"), blOverlay=$("blOverlay"), refreshProfileBtn=$("refreshProfileBtn");
  const moneyPlusInline=$("moneyPlusInline"), rankPlusInline=$("rankPlusInline");
  const sid = new URLSearchParams(location.search).get("sid");
  if (!sid) { alert("Не указан SteamID64"); location.href="index.html"; return; }
  let player=null, autoRefreshInterval=null;

  function showMoneyModal(){
    const inp=document.createElement("input"); inp.className="modalInput"; inp.placeholder="Сумма"; inp.type="number"; inp.min="1"; inp.value="1000";
    modal({ title:"Выдать деньги", body:inp, onOk: async()=>{ const amount=parseInt(inp.value,10); if(!amount||amount<=0) throw new Error("Введите корректную сумму"); await sendCommand(`ba addmoney ${player.steamid} ${amount}`); toast(true,"OK",`Выдано ${amount} денег`); }});
  }
  function showRankModal(){
    if(!player) return;
    let chosenValue=null;
    const currentCode=resolveRank(player);
    const RANK_TRANSLATIONS={
      "*":"Владелец",
      "co*":"Со-Владелец",
      "uprav":"Управляющий",
      "zamuprav":"Зам.Управляющего",
      "arizona-team":"Команда Проекта",
      "arizonateam":"Команда Проекта",
      "project-team":"Д-Команда",
      "manager":"Менеджер",
      "vice-manager":"Вице-Менеджер",
      "head-curator":"Главный Куратор",
      "headcurator":"Главный Куратор",
      "curator":"Куратор",
      "head-admin":"Главный Админ",
      "headadmin":"Главный Админ",
      "admin":"Админ",
      "moderator":"Модератор",
      "helper":"Хелпер",
      "inter":"Стажёр",
      "intern":"Стажёр",
      "owner":"Овнер",
      "superadmin":"Супер-Админ",
      "d-admin":"Д.Админ",
      "dadmin":"Д.Админ",
      "d-moderator":"Д.Модератор",
      "dmoderator":"Д.Модератор",
      "vip":"Вип",
      "VIP":"Вип",
      "User":"Игрок",
      "user":"Игрок"
    };
    const norm=(v)=>String(v||"").replace(/[-_\s]/g,"").toLowerCase();
    function rankName(code){
      const raw=String(code||"");
      if(RANK_TRANSLATIONS[raw]) return RANK_TRANSLATIONS[raw];
      const n=norm(raw);
      const key=Object.keys(RANK_TRANSLATIONS).find((k)=>norm(k)===n);
      return key?RANK_TRANSLATIONS[key]:raw||"Игрок";
    }
    const RANK_VALUES=["*","co*","uprav","zamuprav","arizona-team","project-team","manager","vice-manager","head-curator","curator","head-admin","admin","moderator","helper","inter","owner","superadmin","d-admin","d-moderator","vip","User"];
    const RANKS=RANK_VALUES.map((value)=>({value,label:rankName(value)}));
    const wrap=document.createElement("div");
    wrap.className="rankPanel compactRankPanel";
    const hero=document.createElement("div");
    hero.className="rankHero";
    hero.innerHTML=`<div><div class="rankHeroKicker">Выдача ранга</div><div class="rankHeroTitle">${escapeHtml(player.nick||"Игрок")}</div><div class="rankHeroSub">${escapeHtml(player.steamid||player.steamid64||"")}</div></div>`;
    const now=document.createElement("div");
    now.className="rankNow";
    now.innerHTML=`<span>Текущий ранг</span><b>${escapeHtml(rankName(currentCode))}</b><small>${escapeHtml(currentCode||"user")}</small>`;
    hero.appendChild(now);
    const searchWrap=document.createElement("div");
    searchWrap.className="rankSearchWrap";
    const search=document.createElement("input");
    search.className="rankSearch";
    search.placeholder="Поиск ранга";
    searchWrap.appendChild(search);
    const list=document.createElement("div");
    list.className="rankList";
    function colorForRank(r){ return RANK_COLORS[r.value]||RANK_COLORS[String(r.value).toLowerCase()]||"#94a3b8"; }
    function renderList(filterText=""){
      list.innerHTML="";
      const ft=(filterText||"").toLowerCase().trim();
      const items=RANKS.filter(r=>!ft||r.label.toLowerCase().includes(ft)||r.value.toLowerCase().includes(ft));
      if(!items.length){ list.innerHTML='<div class="rankEmpty">Ничего не найдено</div>'; return; }
      for(const r of items){
        const btn=document.createElement("button");
        btn.type="button";
        btn.className="rankItem";
        btn.dataset.value=r.value;
        btn.style.setProperty("--rank-color",colorForRank(r));
        const isActive=chosenValue?norm(chosenValue)===norm(r.value):norm(currentCode)===norm(r.value);
        if(isActive) btn.classList.add("active");
        btn.innerHTML=`<span class="rankItemMain"><b>${escapeHtml(r.label)}</b><small>${escapeHtml(r.value)}</small></span><span class="rankItemState">${isActive?"Выбран":""}</span>`;
        btn.addEventListener("click",()=>{
          chosenValue=r.value;
          now.innerHTML=`<span>Новый ранг</span><b>${escapeHtml(r.label)}</b><small>${escapeHtml(r.value)}</small>`;
          list.querySelectorAll(".rankItem").forEach(x=>{x.classList.remove("active"); const st=x.querySelector(".rankItemState"); if(st) st.textContent="";});
          btn.classList.add("active");
          const st=btn.querySelector(".rankItemState");
          if(st) st.textContent="Выбран";
        });
        list.appendChild(btn);
      }
    }
    renderList("");
    search.addEventListener("input",()=>renderList(search.value));
    wrap.appendChild(hero);
    wrap.appendChild(searchWrap);
    wrap.appendChild(list);
    modal({title:"Выдача ранга",body:wrap,okText:"Установить",onOk:async()=>{const fallback=RANKS.find(r=>norm(r.value)===norm(currentCode))?.value;const val=chosenValue||fallback;if(!val) throw new Error("Выберите ранг");await sendCommand(`ba setgroup ${player.steamid} ${val}`);const picked=RANKS.find(r=>r.value===val);toast(true,"OK",`Ранг "${picked?picked.label:val}" установлен`);setTimeout(()=>load(),800);}});
    setTimeout(()=>{try{search.focus()}catch(e){}},50);
  }

  async function checkVACBans(){
    if(!player||!player.steamid64) return;
    try{
      const response=await fetch(`./api/vac_check?sid=${encodeURIComponent(player.steamid64)}&_=${Date.now()}`,{cache:"no-store",credentials:"include"});
      if(response.ok){ const data=await response.json(); if(data.ok&&data.vac_info){ const vac=data.vac_info; const vacDiv=document.createElement("div"); vacDiv.className="cardIn vac-info"; vacDiv.style.setProperty("--cardin-accent", vac.VACBanned?"#ef4444":"#22c55e");
        let html=`<div class="h2">Steam информация</div>`; html+=`<div class="row"><div class="k">VAC баны</div><div class="v" style="color:${vac.VACBanned?"#ef4444":"#22c55e"}">${vac.VACBanned?`🔴 ${vac.NumberOfVACBans} бан(ов)`:"🟢 Нет банов"}</div></div>`;
        if(vac.NumberOfVACBans>0) html+=`<div class="row"><div class="k">Последний бан</div><div class="v">${vac.DaysSinceLastBan>0? vac.DaysSinceLastBan+" дней назад":"Недавно"}</div></div>`;
        html+=`<div class="row"><div class="k">Game баны</div><div class="v">${vac.NumberOfGameBans}</div></div>`;
        html+=`<div class="row"><div class="k">Экономический бан</div><div class="v" style="color:${vac.EconomyBan!=="none"?"#ef4444":"#22c55e"}">${vac.EconomyBan!=="none"?"🔴 Забанен":"🟢 Нет"}</div></div>`;
        vacDiv.innerHTML=html; const profileRight=document.querySelector(".profileRight"); if(profileRight){ const existingVac=profileRight.querySelector(".vac-info"); if(existingVac) existingVac.remove(); profileRight.appendChild(vacDiv); }
      }}
    }catch(e){ console.error("Ошибка проверки VAC:", e); }
  }

  async function load(){
    apiStatus.textContent="API: загрузка...";
    try{
      const r=await fetch(`./api/player?sid=${encodeURIComponent(sid)}&_=${Date.now()}`,{cache:"no-store",credentials:"include",headers:{"X-Requested-With":"XMLHttpRequest"}});
      if(r.status===401){ location.href="login.html?next="+encodeURIComponent(location.pathname.replace(/^\//,"")+location.search); return; }
      if(r.status===404){ apiStatus.textContent="API: OK"; toast(false,"Не найден","Игрок не найден в базе данных"); titleEl.textContent="Игрок не найден"; subtitleEl.textContent="SteamID64: "+sid; return; }
      if(!r.ok) throw new Error("HTTP "+r.status);
      const d=await r.json(); if(!d.ok) throw new Error(d.error||"API error");
      player=d;
      const banned=!!d.is_banned; unbanBtn.disabled=!banned; unbanBtn.classList.toggle("green",banned);
      const inChsp=!!d.chsp_active; if(blOverlay) blOverlay.style.display=inChsp?"flex":"none"; if(cspBtn) cspBtn.disabled=inChsp; if(cspRemoveBtn) cspRemoveBtn.disabled=!inChsp;
      apiStatus.textContent="API: OK";
      titleEl.textContent=`Профиль: ${d.nick||"Игрок"}`; subtitleEl.textContent=`SteamID: ${d.steamid}`;
      steamidEl.textContent=d.steamid; steamid64El.textContent=d.steamid64; nickEl.textContent=d.nick||"—";
      onlineEl.textContent=d.online?"✅ Онлайн":"❌ Оффлайн"; onlineEl.style.color=d.online?"#22c55e":"#ef4444";
      pingEl.textContent=d.online? (d.ping? `${d.ping} мс`:"—"):"—";
      if(kickBtn){ kickBtn.disabled=!d.online; kickBtn.style.opacity=d.online?"1":"0.55"; kickBtn.style.cursor=d.online?"pointer":"not-allowed"; }
      const pt=Number(d.playtime||0); playtimeEl.textContent=`${Math.floor(pt/3600)} ч ${Math.floor(pt%3600/60)} мин`;
      lastseenEl.textContent=d.lastseen? new Date(d.lastseen*1000).toLocaleString("ru-RU"):"—";
      moneyEl.textContent=(d.money||0).toLocaleString("ru-RU");
      const rankName=resolveRank(d); rankEl.textContent=rankName; rankEl.style.color=RANK_COLORS[rankName]||RANK_COLORS[rankName.toLowerCase()]||"#94a3b8"; rankEl.style.fontWeight="800";
      ava.src="./img/noavatar.png";
      fetch(`./api/avatar?sid=${encodeURIComponent(d.steamid64)}`,{cache:"no-store",credentials:"include",headers:{"X-Requested-With":"XMLHttpRequest"}}).then(r2=>r2.json()).then(j=>{ if(j.url) ava.src=j.url; }).catch(()=>{});
      ava.onerror=()=>{ ava.src="./img/noavatar.png"; };
      dot.classList.toggle("on",d.online);
      renderBans(d.bans||[]); renderWarns(d.warns||[]);
      checkVACBans();
      if(autoRefreshInterval) clearInterval(autoRefreshInterval);
      autoRefreshInterval=setInterval(()=>load(), d.online?10000:30000);
    }catch(e){ apiStatus.textContent="API: ERROR"; toast(false,"Ошибка","Не удалось загрузить данные игрока"); console.error(e); }
  }
  function renderBans(list){ banTbody.innerHTML=""; if(!list.length){ banTbody.innerHTML=`<tr><td colspan="5" class="banEmpty">Нет банов</td></tr>`; return; } for(const b of list){ const tr=document.createElement("tr"); const banPlayerName=escapeHtml(b.name||player?.nick||player?.steamid||"—"); let banLengthText="Перманентно"; if(b.ban_len>0){ const hours=Math.floor(b.ban_len/3600); const days=Math.floor(hours/24); if(days>0) banLengthText=`${days} дней`; else if(hours>0) banLengthText=`${hours} часов`; else { const minutes=Math.floor(b.ban_len/60); banLengthText=`${minutes} минут`; } } const banTime=b.ban_time? new Date(b.ban_time*1000).toLocaleString("ru-RU"):"—"; tr.innerHTML=`<td>${banPlayerName}</td><td>${escapeHtml(b.a_name||"—")}</td><td>${banTime}</td><td><div><strong>${banLengthText}</strong></div><div style="font-size:11px;color:var(--muted);margin-top:4px">${b.ban_len===0?"Перманентный бан":"Временный бан"}</div></td><td>${escapeHtml(b.reason||"—")}</td>`; banTbody.appendChild(tr);} }
  function fmtWarnDate(ts){ const n=Number(ts||0); if(!n) return "—"; return new Date(n*1000).toLocaleString("ru-RU"); }
  function renderWarns(list){ list=Array.isArray(list)?list:[]; const count=list.length; const limit=Number(player?.warns_limit||5)||5; if(warnSummary){ warnSummary.textContent= count>0? `${count}/${limit}`:`0/${limit} (нету)`; warnSummary.classList.toggle("hasWarns",count>0);} if(warnInfoBtn){ warnInfoBtn.style.display=count>0?"":"none"; warnInfoBtn.onclick=()=>showWarnsInfo(list,limit);} }
  function showWarnsInfo(list,limit){ const wrap=document.createElement("div"); wrap.className="warnInfoModal"; const count=Array.isArray(list)?list.length:0; wrap.innerHTML=`<div class="warnInfoSummary">Варны: <strong>${count}/${limit}</strong></div><div class="warnInfoList">${(list||[]).map((w,i)=>`<div class="warnInfoItem"><div class="warnInfoHead"><span class="warnBadge">WARN #${i+1}</span><span class="muted">${escapeHtml(fmtWarnDate(w.timestamp))}</span></div><div class="warnInfoRow"><span>Кто выдал:</span><strong>${escapeHtml(w.admin_name||w.admin_steamid||"—")}</strong></div><div class="warnInfoRow"><span>SteamID админа:</span><code>${escapeHtml(w.admin_steamid||"—")}</code></div><div class="warnInfoReason">${escapeHtml(w.reason||"Причина не указана")}</div></div>`).join("")}</div>`; modal({ title:"Информация по варнам", body:wrap, onOk: async()=>{} }); }
  function escapeHtml(text){ const div=document.createElement("div"); div.textContent=text; return div.innerHTML; }

  refreshProfileBtn.onclick=()=>{ load(); toast(true,"Обновление","Данные профиля обновлены"); };
  if(moneyPlusInline) moneyPlusInline.onclick=showMoneyModal;
  if(rankPlusInline) rankPlusInline.onclick=showRankModal;

  kickBtn.onclick=()=>{ if(!player||!player.online){ toast(false,"Нельзя","Кикнуть игрока можно только когда он онлайн на сервере"); return;} const inp=document.createElement("input"); inp.className="modalInput"; inp.placeholder="Причина кика"; inp.value=""; modal({ title:"Кик игрока", body:inp, onOk: async()=>{ const r=(inp.value||"").trim(); await sendCommand(`ba kick ${player.steamid} "${escapeArg(r||"web")}"`); toast(true,"OK","Игрок кикнут"); setTimeout(load,600);} }); };
  adminmodeBtn.onclick=()=>{ if(!player||!player.online){ toast(false,"Нельзя","Admin-Mode можно выдать/переключить только когда игрок онлайн на сервере"); return;} modal({ title:"AdminMode", body:Object.assign(document.createElement("div"),{textContent:`Переключить AdminMode для ${player.nick}?`}), onOk: async()=>{ await sendCommand(`ba setadminmode ${player.steamid}`); toast(true,"OK","AdminMode переключён"); } }); };
  banBtn.onclick=()=>{ const wrap=document.createElement("div"); wrap.innerHTML=`<label style="display:flex;align-items:center;gap:10px;margin-bottom:10px"><input type="checkbox" id="permBan"><div><strong>Забанить перманентно?</strong></div></label><div style="display:flex;gap:10px;align-items:center;margin-bottom:10px"><input class="modalInput" id="banTime" type="number" min="1" step="1" placeholder="30" style="flex:1"><select class="modalSelect" id="banUnit" style="width:120px;padding:12px 14px;border-radius:14px"><option value="mi">mi</option><option value="h">h</option><option value="d">d</option><option value="mo">mo</option></select></div><input class="modalInput" id="banReason" placeholder="Причина (можно оставить пусто)"><div class="muted" style="margin-top:8px">Впиши только число, а единицу выбери справа: mi / h / d / mo. Если поставить галочку, срок будет перманентным.</div>`; const perm=wrap.querySelector("#permBan"), time=wrap.querySelector("#banTime"), timeUnit=wrap.querySelector("#banUnit"), reason=wrap.querySelector("#banReason"); perm.addEventListener("change",()=>{ const p=perm.checked; time.disabled=p; timeUnit.disabled=p; if(p) time.value=""; }); modal({ title:"Бан игрока", body:wrap, onOk: async()=>{ const isPerm=!!perm.checked; const tRaw=(time.value||"").trim(); const tNum=parseInt(tRaw,10); const t=!Number.isNaN(tNum)&&tNum>0? `${tNum}${timeUnit.value||"mi"}`:""; const r=(reason.value||"").trim(); if(!isPerm&&!t) throw new Error("Укажите время бана или включите перманентный бан"); const cmdReason=r||"web"; const target=(player.steamid||"").toString().trim()||(player.steamid64||"").toString().trim(); if(!target) throw new Error("NO_STEAMID"); if(isPerm) await sendCommand(`ba perma ${target} "${escapeArg(cmdReason)}"`); else await sendCommand(`ba ban ${target} ${t} "${escapeArg(cmdReason)}"`); toast(true,"OK","Бан выдан"); setTimeout(load,600);} }); };
  unbanBtn.onclick=()=>{ const inp=document.createElement("input"); inp.className="modalInput"; inp.placeholder="Причина разбана (можно оставить пусто)"; inp.value=""; modal({ title:"Разбан игрока", body:inp, onOk: async()=>{ if(unbanBtn.disabled) return; const r=(inp.value||"").trim(); await sendCommand(`ba unban ${player.steamid} "${escapeArg(r||"web")}"`); toast(true,"OK","Игрок разбанен"); setTimeout(load,600);} }); };
  cspBtn.onclick=()=>{ if(cspBtn.disabled) return; const reasonBox=document.createElement("textarea"); reasonBox.className="modalTextarea"; reasonBox.placeholder="Причина занесения в ЧСП (можно оставить пусто)"; reasonBox.rows=4; modal({ title:"Занесение в ЧСП", body:reasonBox, onOk: async()=>{ const r=(reasonBox.value||"").trim(); const params=new URLSearchParams(); params.append("action","add"); params.append("steamid64",String(player.steamid64||"")); params.append("ip",String(player.ip||"")); params.append("nickname",String(player.nick||"")); params.append("reason",r); const rr=await fetch("./api/chsp_action",{method:"POST",headers:{"X-Requested-With":"XMLHttpRequest","Content-Type":"application/x-www-form-urlencoded"},body:params.toString(),cache:"no-store",credentials:"include"}); const jj=await rr.json().catch(()=>null); if(!rr.ok||!jj||!jj.ok) throw new Error(jj?.error||"HTTP "+rr.status); toast(true,"Успех","Игрок занесен в ЧСП"); }}); };
  cspRemoveBtn.onclick=()=>{ if(cspRemoveBtn.disabled) return; const div=document.createElement("div"); div.innerHTML=`<div class="muted">Подтвердите действие</div><div style="margin-top:10px"><div><strong>Игрок:</strong> ${escapeHtml(player.nick)}</div><div style="margin-top:6px"><strong>Вынести из ЧСП</strong></div></div>`; modal({ title:"Вынесение ЧСП", body:div, onOk: async()=>{ const params=new URLSearchParams(); params.append("action","remove"); params.append("steamid64",String(player.steamid64||"")); params.append("ip",String(player.ip||"")); const rr=await fetch("./api/chsp_action",{method:"POST",headers:{"X-Requested-With":"XMLHttpRequest","Content-Type":"application/x-www-form-urlencoded"},body:params.toString(),cache:"no-store",credentials:"include"}); const jj=await rr.json().catch(()=>null); if(!rr.ok||!jj||!jj.ok) throw new Error(jj?.error||"HTTP "+rr.status); toast(true,"OK","Игрок вынесен из ЧСП"); setTimeout(load,600);} }); };
  
  const tabProfile=document.getElementById("tabProfile"), tabModels=document.getElementById("tabModels"), tabWeapons=document.getElementById("tabWeapons"), tabJobs=document.getElementById("tabJobs"), tabAccess=document.getElementById("tabAccess"), tabQmenu=document.getElementById("tabQmenu");
  const panelProfile=document.getElementById("panelProfile"), panelModels=document.getElementById("panelModels"), panelWeapons=document.getElementById("panelWeapons"), panelJobs=document.getElementById("panelJobs"), panelAccess=document.getElementById("panelAccess"), panelQmenu=document.getElementById("panelQmenu");
  let modelsLoadedOnce=false, weaponsLoadedOnce=false, jobsLoadedOnce=false, accessLoadedOnce=false, qmenuLoadedOnce=false;
  const canSeeModelsNow=()=> hasPerm("give_model")||hasPerm("manage_models");
  const canSeeWeaponsNow=()=> hasPerm("give_weapon")||hasPerm("manage_weapons");
  const canSeeJobsNow=()=> hasPerm("give_job")||hasPerm("manage_jobs");
  const canSeeQmenuNow=()=> hasPerm("give_qmenu");
  const canSeeAccessNow=()=> hasPerm("give_access");
  function syncVisibility(){ const canM=canSeeModelsNow(); if(tabModels) tabModels.style.display=canM?"":"none"; if(panelModels) panelModels.style.display=canM?"":"none"; if(!canM && panelModels?.classList.contains("active")) setActiveTab("profile");
    const canW=canSeeWeaponsNow(); if(tabWeapons) tabWeapons.style.display=canW?"":"none"; if(panelWeapons) panelWeapons.style.display=canW?"":"none"; if(!canW && panelWeapons?.classList.contains("active")) setActiveTab("profile");
    const canJ=canSeeJobsNow(); if(tabJobs) tabJobs.style.display=canJ?"":"none"; if(panelJobs) panelJobs.style.display=canJ?"":"none"; if(!canJ && panelJobs?.classList.contains("active")) setActiveTab("profile");
    const canA=canSeeAccessNow(); if(tabAccess) tabAccess.style.display=canA?"":"none"; if(panelAccess) panelAccess.style.display=canA?"":"none"; if(!canA && panelAccess?.classList.contains("active")) setActiveTab("profile");
    const canQ=canSeeQmenuNow(); if(tabQmenu) tabQmenu.style.display=canQ?"":"none"; if(panelQmenu) panelQmenu.style.display=canQ?"":"none"; if(!canQ && panelQmenu?.classList.contains("active")) setActiveTab("profile");
  }
  window.addEventListener("perms:updated", syncVisibility);
  function setActiveTab(name){
    if(!tabProfile||!panelProfile) return;
    if(name==="models" && !canSeeModelsNow()) return;
    if(name==="weapons" && !canSeeWeaponsNow()) return;
    if(name==="jobs" && !canSeeJobsNow()) return;
    if(name==="qmenu" && !canSeeQmenuNow()) return;
    if(name==="access" && !canSeeAccessNow()) return;
    const isProfile=name==="profile", isModels=name==="models", isWeapons=name==="weapons", isJobs=name==="jobs", isAccess=name==="access", isQmenu=name==="qmenu";
    tabProfile.classList.toggle("active",isProfile);
    if(tabModels) tabModels.classList.toggle("active",isModels);
    if(tabWeapons) tabWeapons.classList.toggle("active",isWeapons);
    if(tabJobs) tabJobs.classList.toggle("active",isJobs);
    if(tabAccess) tabAccess.classList.toggle("active",isAccess);
    if(tabQmenu) tabQmenu.classList.toggle("active",isQmenu);
    panelProfile.classList.toggle("active",isProfile);
    if(panelModels) panelModels.classList.toggle("active",isModels);
    if(panelWeapons) panelWeapons.classList.toggle("active",isWeapons);
    if(panelJobs) panelJobs.classList.toggle("active",isJobs);
    if(panelAccess) panelAccess.classList.toggle("active",isAccess);
    if(panelQmenu) panelQmenu.classList.toggle("active",isQmenu);
    if(isModels && !modelsLoadedOnce){ modelsLoadedOnce=true; loadModelsTab().catch(()=>{}); }
    if(isWeapons && !weaponsLoadedOnce){ weaponsLoadedOnce=true; loadWeaponsTab().catch(()=>{}); }
    if(isJobs && !jobsLoadedOnce){ jobsLoadedOnce=true; loadJobsTab().catch(()=>{}); }
    if(isAccess && !accessLoadedOnce){ accessLoadedOnce=true; loadAccessTab().catch(()=>{}); }
    if(isQmenu && !qmenuLoadedOnce){ qmenuLoadedOnce=true; loadQmenuTab().catch(()=>{}); }
  }
  if(tabProfile) tabProfile.onclick=()=>setActiveTab("profile");
  if(tabModels) tabModels.onclick=()=>setActiveTab("models");
  if(tabWeapons) tabWeapons.onclick=()=>setActiveTab("weapons");
  if(tabJobs) tabJobs.onclick=()=>setActiveTab("jobs");
  if(tabAccess) tabAccess.onclick=()=>setActiveTab("access");
  if(tabQmenu) tabQmenu.onclick=()=>setActiveTab("qmenu");
  syncVisibility(); setTimeout(syncVisibility,0);
  function fmtBytes(n){ n=Number(n||0); if(!n) return "—"; const units=["B","KB","MB","GB"]; let i=0; while(n>=1024&&i<units.length-1){ n/=1024; i++; } return (i===0?Math.round(n):n.toFixed(1))+" "+units[i]; }
  function esc(s){ return (s??"").toString().replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;"); }
  async function apiJson(url,opts){ const r=await fetch(url, Object.assign({cache:"no-store",credentials:"include",headers:{"X-Requested-With":"XMLHttpRequest"}},opts||{})); const j=await r.json().catch(()=>null); if(!r.ok||!j||!j.ok) throw new Error(j?.error||"HTTP "+r.status); return j; }

  
  const modelSearch=document.getElementById("modelSearch"), showHiddenModels=document.getElementById("showHiddenModels"), addModelBtn=document.getElementById("addModelBtn"), modelsCatalogTbody=document.getElementById("modelsCatalogTbody"), playerModelsTbody=document.getElementById("playerModelsTbody");
  async function loadModelsTab(){ if(!player) return; const q=(modelSearch?.value||"").trim(); const includeHidden=!!(showHiddenModels&&showHiddenModels.checked&&hasPerm("manage_models")); const qs=new URLSearchParams(); if(q) qs.set("q",q); if(includeHidden) qs.set("include_hidden","1"); const cat=await apiJson("./api/models?"+qs.toString()); const pm=await apiJson("./api/player_models?steamid32="+encodeURIComponent(player.steamid||"")); renderCatalog(cat.items||[],pm.items||[]); renderPlayerModels(pm.items||[]); }
  function renderCatalog(items,playerItems){ if(!modelsCatalogTbody) return; const playerSet=new Set((playerItems||[]).map(x=>String(x.model_id))); if(!items.length){ modelsCatalogTbody.innerHTML=`<tr><td colspan="4" class="banEmpty">Нет моделей</td></tr>`; return;} modelsCatalogTbody.innerHTML=""; for(const m of items){ const tr=document.createElement("tr"); const isActive=!!m.is_active; const icon=m.icon_url||"./img/noavatar.png"; const title=m.title||m.model_path||"#"+m.id; const ws=m.workshop_id? `<a href="https://steamcommunity.com/sharedfiles/filedetails/?id=${encodeURIComponent(m.workshop_id)}" target="_blank" rel="noopener">${esc(m.workshop_id)}</a>`:"—"; const size=fmtBytes(m.size_bytes); const already=playerSet.has(String(m.id)); const giveBtn=`<button class="btn small blue" ${already?"disabled":""} data-mid="${m.id}">${already?"Выдано":"Выдать"}</button>`; const hideBtn=hasPerm("manage_models")? `<button class="btn small ${isActive?"danger":""}" data-hide="1" data-mid="${m.id}">${isActive?"Скрыть":"Показать"}</button>`:""; const editBtn=hasPerm("manage_models")? `<button class="btn small" data-edit="1" data-mid="${m.id}" title="Изменить">✏️</button>`:""; const delBtn=hasPerm("manage_models")? `<button class="btn small danger" data-del="1" data-mid="${m.id}" title="Удалить">🗑️</button>`:""; tr.innerHTML=`<td><div class="modelRow"><img class="modelIcon" src="${esc(icon)}" alt="icon" onerror="this.src='./img/noavatar.png'" /><div class="modelMeta"><div class="modelTitle">${esc(title)}</div><div class="modelSub" title="${esc(m.model_path)}">${esc(m.model_path)}</div></div></div></td><td class="mono">${ws}</td><td>${esc(size)}</td><td><div class="modelActions">${giveBtn}${hideBtn}${editBtn}${delBtn}</div></td>`; tr.querySelector("button.btn.blue")?.addEventListener("click", async()=>{ if(!hasPerm("give_model")) return toast(false,"Ошибка","Нет прав"); await apiJson("./api/player_models",{method:"POST",headers:{"Content-Type":"application/json","X-Requested-With":"XMLHttpRequest"},body:JSON.stringify({action:"give",steamid32:player.steamid,model_id:m.id})}); toast(true,"OK","Модель выдана"); await loadModelsTab(); }); tr.querySelector("button[data-hide]")?.addEventListener("click", async()=>{ if(!hasPerm("manage_models")) return toast(false,"Ошибка","Нет прав"); await apiJson("./api/models",{method:"POST",headers:{"Content-Type":"application/json","X-Requested-With":"XMLHttpRequest"},body:JSON.stringify({action:"toggle",id:m.id,is_active:isActive?0:1})}); toast(true,"OK",isActive?"Скрыто":"Показано"); await loadModelsTab(); }); tr.querySelector("button[data-edit]")?.addEventListener("click", ()=>{ if(!hasPerm("manage_models")) return toast(false,"Ошибка","Нет прав"); const wrap=document.createElement("div"); wrap.innerHTML=`<div class="muted" style="margin-bottom:10px">Можно изменить Workshop ID / Название / Путь модели.</div><input class="modalInput" id="mTitle" value="${esc(m.title||"")}" placeholder="Название" /><input class="modalInput" id="mModel" value="${esc(m.model_path||"")}" placeholder="Модель (например models/xxx.mdl)" style="margin-top:10px" /><input class="modalInput" id="mWs" value="${esc(m.workshop_id||"")}" placeholder="Workshop ID (опционально)" style="margin-top:10px" />`; modal({ title:"Изменить модель", body:wrap, onOk: async()=>{ const title=(wrap.querySelector("#mTitle")?.value||"").trim(); const model_path=(wrap.querySelector("#mModel")?.value||"").trim(); const workshop_id=(wrap.querySelector("#mWs")?.value||"").trim(); if(!model_path) throw new Error("Укажи путь модели"); await apiJson("./api/models",{method:"POST",headers:{"Content-Type":"application/json","X-Requested-With":"XMLHttpRequest"},body:JSON.stringify({action:"edit",id:m.id,title,model_path,workshop_id})}); toast(true,"OK","Модель изменена"); await loadModelsTab(); }}); }); tr.querySelector("button[data-del]")?.addEventListener("click", ()=>{ if(!hasPerm("manage_models")) return toast(false,"Ошибка","Нет прав"); modal({ title:"Удалить модель", body:Object.assign(document.createElement("div"),{textContent:`Удалить модель "${m.title||m.model_path}" из каталога? Выданные записи также удалятся.`}), onOk: async()=>{ await apiJson("./api/models",{method:"POST",headers:{"Content-Type":"application/json","X-Requested-With":"XMLHttpRequest"},body:JSON.stringify({action:"delete",id:m.id})}); toast(true,"OK","Модель удалена"); await loadModelsTab(); }}); }); modelsCatalogTbody.appendChild(tr);} }
  function renderPlayerModels(items){ if(!playerModelsTbody) return; if(!items.length){ playerModelsTbody.innerHTML=`<tr><td colspan="5" class="banEmpty">У игрока нет моделей</td></tr>`; return;} playerModelsTbody.innerHTML=""; for(const m of items){ const tr=document.createElement("tr"); const icon=m.icon_url||"./img/noavatar.png"; const title=m.title||m.model_path||"#"+m.model_id; const ws=m.workshop_id? `<a href="https://steamcommunity.com/sharedfiles/filedetails/?id=${encodeURIComponent(m.workshop_id)}" target="_blank" rel="noopener">${esc(m.workshop_id)}</a>`:"—"; const by=m.given_by||"—"; const when=m.given_at? new Date(m.given_at*1000).toLocaleString("ru-RU"):"—"; tr.innerHTML=`<td><div class="modelRow"><img class="modelIcon" src="${esc(icon)}" alt="icon" onerror="this.src='./img/noavatar.png'" /><div class="modelMeta"><div class="modelTitle">${esc(title)}</div><div class="modelSub" title="${esc(m.model_path)}">${esc(m.model_path)}</div></div></div></td><td class="mono">${ws}</td><td>${esc(by)}</td><td>${esc(when)}</td><td><button class="btn small danger" data-mid="${m.model_id}">Забрать</button></td>`; tr.querySelector("button")?.addEventListener("click", async()=>{ if(!hasPerm("give_model")) return toast(false,"Ошибка","Нет прав"); await apiJson("./api/player_models",{method:"POST",headers:{"Content-Type":"application/json","X-Requested-With":"XMLHttpRequest"},body:JSON.stringify({action:"revoke",steamid32:player.steamid,model_id:m.model_id})}); toast(true,"OK","Модель забрана"); await loadModelsTab(); }); playerModelsTbody.appendChild(tr);} }
  if(modelSearch){ let t=null; modelSearch.addEventListener("input",()=>{ clearTimeout(t); t=setTimeout(()=>{ if(panelModels&&panelModels.classList.contains("active")) loadModelsTab().catch(()=>{}); },250); }); }
  if(showHiddenModels) showHiddenModels.addEventListener("change",()=>{ if(panelModels&&panelModels.classList.contains("active")) loadModelsTab().catch(()=>{}); });
  if(addModelBtn) addModelBtn.addEventListener("click",()=>{ if(!hasPerm("manage_models")) return toast(false,"Ошибка","Нет прав"); const wrap=document.createElement("div"); wrap.innerHTML=`<div class="muted" style="margin-bottom:10px">Можно указать Workshop ID — название/иконка/размер подтянутся автоматически.</div><input class="modalInput" id="mTitle" placeholder="Название (можно оставить пустым)" /><input class="modalInput" id="mModel" placeholder="Модель (например models/xxx.mdl)" style="margin-top:10px" /><input class="modalInput" id="mWs" placeholder="Workshop ID (опционально)" style="margin-top:10px" />`; modal({ title:"Добавить модель", body:wrap, onOk: async()=>{ const title=(wrap.querySelector("#mTitle")?.value||"").trim(); const model_path=(wrap.querySelector("#mModel")?.value||"").trim(); const workshop_id=(wrap.querySelector("#mWs")?.value||"").trim(); if(!model_path) throw new Error("Укажи путь модели"); await apiJson("./api/models",{method:"POST",headers:{"Content-Type":"application/json","X-Requested-With":"XMLHttpRequest"},body:JSON.stringify({action:"add",title,model_path,workshop_id})}); toast(true,"OK","Модель добавлена"); await loadModelsTab(); }}); });
  
  const weaponSearch=document.getElementById("weaponSearch"), showHiddenWeapons=document.getElementById("showHiddenWeapons"), addWeaponBtn=document.getElementById("addWeaponBtn"), weaponsCatalogTbody=document.getElementById("weaponsCatalogTbody"), playerWeaponsTbody=document.getElementById("playerWeaponsTbody");
  async function loadWeaponsTab(){ if(!player) return; const q=(weaponSearch?.value||"").trim(); const includeHidden=!!(showHiddenWeapons&&showHiddenWeapons.checked&&hasPerm("manage_weapons")); const qs=new URLSearchParams(); if(q) qs.set("q",q); if(includeHidden) qs.set("include_hidden","1"); const cat=await apiJson("./api/weapons?"+qs.toString()); const pw=await apiJson("./api/player_weapons?steamid32="+encodeURIComponent(player.steamid||"")); renderWeaponsCatalog(cat.items||[],pw.items||[]); renderPlayerWeapons(pw.items||[]); }
  function renderWeaponsCatalog(items,playerItems){ if(!weaponsCatalogTbody) return; const playerSet=new Set((playerItems||[]).map(x=>String(x.weapon_id))); if(!items.length){ weaponsCatalogTbody.innerHTML=`<tr><td colspan="2" class="banEmpty">Нет оружия</td></tr>`; return;} weaponsCatalogTbody.innerHTML=""; for(const w of items){ const tr=document.createElement("tr"); const isActive=!!w.is_active; const title=w.title||w.weapon_class||"#"+w.id; const already=playerSet.has(String(w.id)); const giveBtn=`<button class="btn small blue" ${already?"disabled":""} data-wid="${w.id}">${already?"Выдано":"Выдать"}</button>`; const hideBtn=hasPerm("manage_weapons")? `<button class="btn small ${isActive?"danger":""}" data-hide="1" data-wid="${w.id}">${isActive?"Скрыть":"Показать"}</button>`:""; const editBtn=hasPerm("manage_weapons")? `<button class="btn small" data-edit="1" data-wid="${w.id}" title="Изменить">✏️</button>`:""; const delBtn=hasPerm("manage_weapons")? `<button class="btn small danger" data-del="1" data-wid="${w.id}" title="Удалить">🗑️</button>`:""; tr.innerHTML=`<td><div class="modelMeta"><div class="modelTitle">${esc(title)}</div><div class="modelSub" title="${esc(w.weapon_class)}">${esc(w.weapon_class)}</div></div></td><td><div class="modelActions">${giveBtn}${hideBtn}${editBtn}${delBtn}</div></td>`; tr.querySelector("button.btn.blue")?.addEventListener("click", async()=>{ if(!hasPerm("give_weapon")) return toast(false,"Ошибка","Нет прав"); await apiJson("./api/player_weapons",{method:"POST",headers:{"Content-Type":"application/json","X-Requested-With":"XMLHttpRequest"},body:JSON.stringify({action:"give",steamid32:player.steamid,weapon_id:w.id})}); toast(true,"OK","Оружие выдано"); await loadWeaponsTab(); }); tr.querySelector("button[data-hide]")?.addEventListener("click", async()=>{ if(!hasPerm("manage_weapons")) return toast(false,"Ошибка","Нет прав"); await apiJson("./api/weapons",{method:"POST",headers:{"Content-Type":"application/json","X-Requested-With":"XMLHttpRequest"},body:JSON.stringify({action:"toggle",id:w.id,is_active:isActive?0:1})}); toast(true,"OK",isActive?"Скрыто":"Показано"); await loadWeaponsTab(); }); tr.querySelector("button[data-edit]")?.addEventListener("click", ()=>{ if(!hasPerm("manage_weapons")) return toast(false,"Ошибка","Нет прав"); const wrap=document.createElement("div"); wrap.innerHTML=`<input class="modalInput" id="wTitle" value="${esc(w.title||"")}" placeholder="Название" /><input class="modalInput" id="wClass" value="${esc(w.weapon_class||"")}" placeholder="Класс оружия" style="margin-top:10px" />`; modal({ title:"Изменить оружие", body:wrap, onOk: async()=>{ const title=(wrap.querySelector("#wTitle")?.value||"").trim(); const weapon_class=(wrap.querySelector("#wClass")?.value||"").trim(); if(!weapon_class) throw new Error("Укажи класс оружия"); await apiJson("./api/weapons",{method:"POST",headers:{"Content-Type":"application/json","X-Requested-With":"XMLHttpRequest"},body:JSON.stringify({action:"edit",id:w.id,title,weapon_class})}); toast(true,"OK","Оружие изменено"); await loadWeaponsTab(); }}); }); tr.querySelector("button[data-del]")?.addEventListener("click", ()=>{ if(!hasPerm("manage_weapons")) return toast(false,"Ошибка","Нет прав"); modal({ title:"Удалить оружие", body:Object.assign(document.createElement("div"),{textContent:`Удалить оружие "${w.title||w.weapon_class}" из каталога? Выданные записи также удалятся.`}), onOk: async()=>{ await apiJson("./api/weapons",{method:"POST",headers:{"Content-Type":"application/json","X-Requested-With":"XMLHttpRequest"},body:JSON.stringify({action:"delete",id:w.id})}); toast(true,"OK","Оружие удалено"); await loadWeaponsTab(); }}); }); weaponsCatalogTbody.appendChild(tr);} }
  function renderPlayerWeapons(items){ if(!playerWeaponsTbody) return; if(!items.length){ playerWeaponsTbody.innerHTML=`<tr><td colspan="4" class="banEmpty">У игрока нет оружия</td></tr>`; return;} playerWeaponsTbody.innerHTML=""; for(const w of items){ const tr=document.createElement("tr"); const title=w.title||w.weapon_class||"#"+w.weapon_id; const by=w.issued_by||"—"; const when=w.issued_at? new Date(w.issued_at*1000).toLocaleString("ru-RU"):"—"; tr.innerHTML=`<td><div class="modelMeta"><div class="modelTitle">${esc(title)}</div><div class="modelSub" title="${esc(w.weapon_class)}">${esc(w.weapon_class)}</div></div></td><td>${esc(by)}</td><td>${esc(when)}</td><td><button class="btn small danger" data-wid="${w.weapon_id}">Забрать</button></td>`; tr.querySelector("button")?.addEventListener("click", async()=>{ if(!hasPerm("give_weapon")) return toast(false,"Ошибка","Нет прав"); await apiJson("./api/player_weapons",{method:"POST",headers:{"Content-Type":"application/json","X-Requested-With":"XMLHttpRequest"},body:JSON.stringify({action:"revoke",steamid32:player.steamid,weapon_id:w.weapon_id})}); toast(true,"OK","Оружие забрано"); await loadWeaponsTab(); }); playerWeaponsTbody.appendChild(tr);} }
  if(weaponSearch){ let t=null; weaponSearch.addEventListener("input",()=>{ clearTimeout(t); t=setTimeout(()=>{ if(panelWeapons&&panelWeapons.classList.contains("active")) loadWeaponsTab().catch(()=>{}); },250); }); }
  if(showHiddenWeapons) showHiddenWeapons.addEventListener("change",()=>{ if(panelWeapons&&panelWeapons.classList.contains("active")) loadWeaponsTab().catch(()=>{}); });
  if(addWeaponBtn) addWeaponBtn.addEventListener("click",()=>{ if(!hasPerm("manage_weapons")) return toast(false,"Ошибка","Нет прав"); const wrap=document.createElement("div"); wrap.innerHTML=`<input class="modalInput" id="wTitle" placeholder="Название (можно оставить пустым)" /><input class="modalInput" id="wClass" placeholder="Класс оружия (например weapon_fists)" style="margin-top:10px" />`; modal({ title:"Добавить оружие", body:wrap, onOk: async()=>{ const title=(wrap.querySelector("#wTitle")?.value||"").trim(); const weapon_class=(wrap.querySelector("#wClass")?.value||"").trim(); if(!weapon_class) throw new Error("Укажи класс оружия"); await apiJson("./api/weapons",{method:"POST",headers:{"Content-Type":"application/json","X-Requested-With":"XMLHttpRequest"},body:JSON.stringify({action:"add",title,weapon_class})}); toast(true,"OK","Оружие добавлено"); await loadWeaponsTab(); }}); });
  
  const jobSearch=document.getElementById("jobSearch"), showHiddenJobs=document.getElementById("showHiddenJobs"), addJobBtn=document.getElementById("addJobBtn"), jobsCatalogTbody=document.getElementById("jobsCatalogTbody"), playerJobsTbody=document.getElementById("playerJobsTbody");
  async function loadJobsTab(){ if(!player) return; const q=(jobSearch?.value||"").trim(); const includeHidden=!!(showHiddenJobs&&showHiddenJobs.checked&&hasPerm("manage_jobs")); const qs=new URLSearchParams(); if(q) qs.set("q",q); if(includeHidden) qs.set("include_hidden","1"); const cat=await apiJson("./api/jobs?"+qs.toString()); const pj=await apiJson("./api/player_jobs?steamid32="+encodeURIComponent(player.steamid||"")); renderJobsCatalog(cat.items||[],pj.items||[]); renderPlayerJobs(pj.items||[]); }
  function renderJobsCatalog(items,playerItems){ if(!jobsCatalogTbody) return; const playerSet=new Set((playerItems||[]).map(x=>String(x.job_id))); if(!items.length){ jobsCatalogTbody.innerHTML=`<tr><td colspan="2" class="banEmpty">Нет профессий</td></tr>`; return;} jobsCatalogTbody.innerHTML=""; for(const j of items){ const tr=document.createElement("tr"); const isActive=!!j.is_active; const title=j.title||j.job_command||"#"+j.id; const already=playerSet.has(String(j.id)); const giveBtn=`<button class="btn small blue" ${already?"disabled":""} data-jid="${j.id}">${already?"Выдано":"Выдать"}</button>`; const hideBtn=hasPerm("manage_jobs")? `<button class="btn small ${isActive?"danger":""}" data-hide="1" data-jid="${j.id}">${isActive?"Скрыть":"Показать"}</button>`:""; const editBtn=hasPerm("manage_jobs")? `<button class="btn small" data-edit="1" data-jid="${j.id}" title="Изменить">✏️</button>`:""; const delBtn=hasPerm("manage_jobs")? `<button class="btn small danger" data-del="1" data-jid="${j.id}" title="Удалить">🗑️</button>`:""; tr.innerHTML=`<td><div class="modelMeta"><div class="modelTitle">${esc(title)}</div><div class="modelSub" title="${esc(j.job_command)}">${esc(j.job_command)}</div></div></td><td><div class="modelActions">${giveBtn}${hideBtn}${editBtn}${delBtn}</div></td>`; tr.querySelector("button.btn.blue")?.addEventListener("click", async()=>{ if(!hasPerm("give_job")) return toast(false,"Ошибка","Нет прав"); await apiJson("./api/player_jobs",{method:"POST",headers:{"Content-Type":"application/json","X-Requested-With":"XMLHttpRequest"},body:JSON.stringify({action:"give",steamid32:player.steamid,job_id:j.id})}); toast(true,"OK","Профессия выдана"); await loadJobsTab(); }); tr.querySelector("button[data-hide]")?.addEventListener("click", async()=>{ if(!hasPerm("manage_jobs")) return toast(false,"Ошибка","Нет прав"); await apiJson("./api/jobs",{method:"POST",headers:{"Content-Type":"application/json","X-Requested-With":"XMLHttpRequest"},body:JSON.stringify({action:"toggle",id:j.id,is_active:isActive?0:1})}); toast(true,"OK",isActive?"Скрыто":"Показано"); await loadJobsTab(); }); tr.querySelector("button[data-edit]")?.addEventListener("click", ()=>{ if(!hasPerm("manage_jobs")) return toast(false,"Ошибка","Нет прав"); const wrap=document.createElement("div"); wrap.innerHTML=`<input class="modalInput" id="jTitle" value="${esc(j.title||"")}" placeholder="Название профессии" /><input class="modalInput" id="jCmd" value="${esc(j.job_command||"")}" placeholder="Команда профессии" style="margin-top:10px" />`; modal({ title:"Изменить профессию", body:wrap, onOk: async()=>{ const title=(wrap.querySelector("#jTitle")?.value||"").trim(); const job_command=(wrap.querySelector("#jCmd")?.value||"").trim(); if(!job_command) throw new Error("Укажи команду профессии"); await apiJson("./api/jobs",{method:"POST",headers:{"Content-Type":"application/json","X-Requested-With":"XMLHttpRequest"},body:JSON.stringify({action:"edit",id:j.id,title,job_command})}); toast(true,"OK","Профессия изменена"); await loadJobsTab(); }}); }); tr.querySelector("button[data-del]")?.addEventListener("click", ()=>{ if(!hasPerm("manage_jobs")) return toast(false,"Ошибка","Нет прав"); modal({ title:"Удалить профессию", body:Object.assign(document.createElement("div"),{textContent:`Удалить профессию "${j.title||j.job_command}" из каталога? Выданные записи также удалятся.`}), onOk: async()=>{ await apiJson("./api/jobs",{method:"POST",headers:{"Content-Type":"application/json","X-Requested-With":"XMLHttpRequest"},body:JSON.stringify({action:"delete",id:j.id})}); toast(true,"OK","Профессия удалена"); await loadJobsTab(); }}); }); jobsCatalogTbody.appendChild(tr);} }
  function renderPlayerJobs(items){ if(!playerJobsTbody) return; if(!items.length){ playerJobsTbody.innerHTML=`<tr><td colspan="4" class="banEmpty">У игрока нет профессий</td></tr>`; return;} playerJobsTbody.innerHTML=""; for(const j of items){ const tr=document.createElement("tr"); const title=j.title||j.job_command||"#"+j.job_id; const by=j.given_by||"—"; const when=j.given_at? new Date(j.given_at*1000).toLocaleString("ru-RU"):"—"; tr.innerHTML=`<td><div class="modelMeta"><div class="modelTitle">${esc(title)}</div><div class="modelSub" title="${esc(j.job_command)}">${esc(j.job_command)}</div></div></td><td>${esc(by)}</td><td>${esc(when)}</td><td><button class="btn small danger" data-jid="${j.job_id}">Забрать</button></td>`; tr.querySelector("button")?.addEventListener("click", async()=>{ if(!hasPerm("give_job")) return toast(false,"Ошибка","Нет прав"); await apiJson("./api/player_jobs",{method:"POST",headers:{"Content-Type":"application/json","X-Requested-With":"XMLHttpRequest"},body:JSON.stringify({action:"revoke",steamid32:player.steamid,job_id:j.job_id})}); toast(true,"OK","Профессия забрана"); await loadJobsTab(); }); playerJobsTbody.appendChild(tr);} }
  if(jobSearch){ let t=null; jobSearch.addEventListener("input",()=>{ clearTimeout(t); t=setTimeout(()=>{ if(panelJobs&&panelJobs.classList.contains("active")) loadJobsTab().catch(()=>{}); },250); }); }
  if(showHiddenJobs) showHiddenJobs.addEventListener("change",()=>{ if(panelJobs&&panelJobs.classList.contains("active")) loadJobsTab().catch(()=>{}); });
  if(addJobBtn) addJobBtn.addEventListener("click",()=>{ if(!hasPerm("manage_jobs")) return toast(false,"Ошибка","Нет прав"); const wrap=document.createElement("div"); wrap.innerHTML=`<input class="modalInput" id="jTitle" placeholder="Название профессии" /><input class="modalInput" id="jCmd" placeholder="Команда / UID профессии (например supervisor_job)" style="margin-top:10px" />`; modal({ title:"Добавить профессию", body:wrap, onOk: async()=>{ const title=(wrap.querySelector("#jTitle")?.value||"").trim(); const job_command=(wrap.querySelector("#jCmd")?.value||"").trim(); if(!job_command) throw new Error("Укажи команду профессии"); await apiJson("./api/jobs",{method:"POST",headers:{"Content-Type":"application/json","X-Requested-With":"XMLHttpRequest"},body:JSON.stringify({action:"add",title,job_command})}); toast(true,"OK","Профессия добавлена"); await loadJobsTab(); }}); });


  const accessPropsInput=document.getElementById("accessPropsInput"), accessSetmodelCheck=document.getElementById("accessSetmodelCheck"), saveAccessBtn=document.getElementById("saveAccessBtn"), clearAccessBtn=document.getElementById("clearAccessBtn"), playerAccessTbody=document.getElementById("playerAccessTbody");
  async function loadAccessTab(){ if(!player) return; const res=await apiJson("./api/player_access?steamid32="+encodeURIComponent(player.steamid||"")); renderPlayerAccess(res.item||{}); }
  function renderPlayerAccess(item){ if(accessPropsInput) accessPropsInput.value=String(parseInt(item.props_extra||0,10)||0); if(accessSetmodelCheck) accessSetmodelCheck.checked=!!item.setmodel; if(!playerAccessTbody) return; const props=parseInt(item.props_extra||0,10)||0; const sm=!!item.setmodel; const by=item.issued_by||"—"; const when=item.updated_at? new Date(item.updated_at*1000).toLocaleString("ru-RU"):"—"; playerAccessTbody.innerHTML=`<tr><td><strong>+${esc(props)}</strong></td><td>${sm?"✅ Разрешено":"—"}</td><td>${esc(by)}</td><td>${esc(when)}</td></tr>`; }
  if(saveAccessBtn) saveAccessBtn.onclick=async()=>{ if(!hasPerm("give_access")) return toast(false,"Ошибка","Нет прав"); const props_extra=Math.max(0,Math.min(100000,parseInt(accessPropsInput?.value||"0",10)||0)); const setmodel=!!(accessSetmodelCheck&&accessSetmodelCheck.checked); await apiJson("./api/player_access",{method:"POST",headers:{"Content-Type":"application/json","X-Requested-With":"XMLHttpRequest"},body:JSON.stringify({action:"save",steamid32:player.steamid,props_extra,setmodel})}); toast(true,"OK","Доступы сохранены"); await loadAccessTab(); };
  if(clearAccessBtn) clearAccessBtn.onclick=()=>{ if(!hasPerm("give_access")) return toast(false,"Ошибка","Нет прав"); modal({ title:"Сбросить доступы", body:Object.assign(document.createElement("div"),{textContent:"Сбросить дополнительные пропы и доступ к !setmodel у игрока?"}), onOk:async()=>{ await apiJson("./api/player_access",{method:"POST",headers:{"Content-Type":"application/json","X-Requested-With":"XMLHttpRequest"},body:JSON.stringify({action:"clear",steamid32:player.steamid})}); toast(true,"OK","Доступы сброшены"); await loadAccessTab(); }}); };

  const giveQmenuBtn=document.getElementById("giveQmenuBtn"), giveQmenuPlusBtn=document.getElementById("giveQmenuPlusBtn"), playerQmenuTbody=document.getElementById("playerQmenuTbody");
  async function loadQmenuTab(){ if(!player) return; const res = await apiJson("./api/player_qmenu?steamid32="+encodeURIComponent(player.steamid||"")); renderPlayerQmenu(res.items||[]); }
  function renderPlayerQmenu(items){ if(!playerQmenuTbody) return; if(!items.length){ playerQmenuTbody.innerHTML='<tr><td colspan="4" class="banEmpty">У игрока нет доступа Q-Menu</td></tr>'; return; } playerQmenuTbody.innerHTML=""; for(const item of items){ const tr=document.createElement("tr"); const typeStr = item.access_type === "qmenuplus" ? "Q-Menu+" : "Q-Menu"; const by = item.issued_by || "—"; const when = item.issued_at ? new Date(item.issued_at * 1e3).toLocaleString("ru-RU") : "—"; tr.innerHTML=`<td><strong>${esc(typeStr)}</strong></td><td>${esc(by)}</td><td>${esc(when)}</td><td><button class="btn small danger" data-type="${esc(item.access_type)}">Забрать</button></td>`; tr.querySelector("button")?.addEventListener("click", async () => { if(!hasPerm("give_qmenu")) return toast(false,"Ошибка","Нет прав"); await apiJson("./api/player_qmenu",{method:"POST",headers:{"Content-Type":"application/json","X-Requested-With":"XMLHttpRequest"},body:JSON.stringify({action:"revoke",steamid32:player.steamid,access_type:item.access_type})}); toast(true,"OK","Доступ отозван"); await loadQmenuTab(); }); playerQmenuTbody.appendChild(tr); } }
  if(giveQmenuBtn) giveQmenuBtn.onclick=async()=>{ if(!hasPerm("give_qmenu")) return toast(false,"Ошибка","Нет прав"); await apiJson("./api/player_qmenu",{method:"POST",headers:{"Content-Type":"application/json","X-Requested-With":"XMLHttpRequest"},body:JSON.stringify({action:"give",steamid32:player.steamid,access_type:"qmenu"})}); toast(true,"OK","Q-Menu выдано"); await loadQmenuTab(); };
  if(giveQmenuPlusBtn) giveQmenuPlusBtn.onclick=async()=>{ if(!hasPerm("give_qmenu")) return toast(false,"Ошибка","Нет прав"); await apiJson("./api/player_qmenu",{method:"POST",headers:{"Content-Type":"application/json","X-Requested-With":"XMLHttpRequest"},body:JSON.stringify({action:"give",steamid32:player.steamid,access_type:"qmenuplus"})}); toast(true,"OK","Q-Menu+ выдано"); await loadQmenuTab(); };
  await load();
})();
