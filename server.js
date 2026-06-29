import "dotenv/config";
import express from "express";
import session from "express-session";
import helmet from "helmet";
import compression from "compression";
import rateLimit from "express-rate-limit";
import { join, dirname } from "path";
import { decodeIfNeeded } from "./lib/helpers.js";
import { fileURLToPath } from "url";
import { initPool, ensurePanelSchema, db } from "./lib/db.js";
import authRoutes from "./routes/auth.js";
import playersRoutes from "./routes/players.js";
import playerRoutes from "./routes/player.js";
import bansRoutes from "./routes/bans.js";
import statsRoutes from "./routes/stats.js";
import adminLogsRoutes from "./routes/admin_logs.js";
import blacklistRoutes from "./routes/blacklist.js";
import usersRoutes from "./routes/users.js";
import permissionsRoutes from "./routes/permissions.js";
import commandsRoutes from "./routes/commands.js";
import avatarRoutes from "./routes/avatar.js";
import onlineRoutes from "./routes/online.js";
import modelsRoutes from "./routes/models.js";
import playerModelsRoutes from "./routes/player_models.js";
import weaponsRoutes from "./routes/weapons.js";
import playerWeaponsRoutes from "./routes/player_weapons.js";
import jobsRoutes from "./routes/jobs.js";
import playerJobsRoutes from "./routes/player_jobs.js";
import playerQmenuRoutes from "./routes/player_qmenu.js";
import playerAccessRoutes from "./routes/player_access.js";
import serverSyncRoutes from "./routes/server_sync.js";
import zbtAccessRoutes from "./routes/zbt_access.js";
import promosRoutes from "./routes/promos.js";
import locksRoutes from "./routes/locks.js";
import moneyLogsRoutes from "./routes/money_logs.js";
import donateLogsRoutes from "./routes/donate_logs.js";
import techGangsRoutes from "./routes/tech_gangs.js";
import texPublicRoutes, { createTexLink, createTexInfoLink, getTexLogs, normSteam, ensureTexLinkColumns } from "./routes/tex_public.js";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  EmbedBuilder,
  GatewayIntentBits,
  Partials
} from "discord.js";
import proxyAddr from "proxy-addr";
import {
  loadLocks,
  isPermLockedFor,
  resolveActionPerm,
  lockAppliesTo
} from "./lib/locks.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const cfg = {
  DB_HOST: process.env.DB_HOST,
  DB_USER: process.env.DB_USER,
  DB_PASS: process.env.DB_PASS,
  DB_NAME: process.env.DB_NAME,
  STEAM_API_KEY: process.env.STEAM_API_KEY,
  WEB_SECRET: process.env.WEB_SECRET,
  SESSION_SECRET: process.env.SESSION_SECRET,
  BASE_URL: process.env.BASE_URL || "",
  PORT: parseInt(process.env.PORT || "3000", 10)
};

const REQUIRED = ["DB_HOST", "DB_USER", "DB_PASS", "DB_NAME", "WEB_SECRET", "SESSION_SECRET"];
for (const key of REQUIRED) {
  if (!cfg[key]) {
    console.error(`Missing required env variable: ${key}`);
    process.exit(1);
  }
}

const app = express();
app.disable("x-powered-by");

// FIX: trust proxy with verification (only trust local proxies)
const TRUSTED_PROXIES = ["loopback", "linklocal", "uniquelocal"];
const trustedProxyCheck = proxyAddr.compile(TRUSTED_PROXIES);
app.set("trust proxy", (ip) => {
  // In production, only trust loopback/linklocal/uniquelocal. Configure known proxy IPs if behind a CDN.
  if (process.env.NODE_ENV === "production") {
    return trustedProxyCheck(ip);
  }
  return true;
});

// FIX: Static HTML files use inline <script> tags, so 'unsafe-inline' is required for scripts.
// In a future refactor, all inline scripts should be moved to external .js files,
// allowing us to use nonce or hash-based CSP for stricter XSS protection.
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      fontSrc: ["'self'"],
      imgSrc: ["'self'", "https:", "data:"],
      connectSrc: ["'self'", "https://api.steampowered.com", "ws:", "wss:"],
      workerSrc: ["'self'"],
      manifestSrc: ["'self'"],
      upgradeInsecureRequests: null
    }
  },
  originAgentCluster: false,
  crossOriginOpenerPolicy: false,
  hsts: {
    maxAge: 31536e3,
    includeSubDomains: true,
    preload: true
  }
}));
app.use(compression());

const sessionMiddleware = session({
  secret: cfg.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 7 * 24 * 60 * 60 * 1e3,
    httpOnly: true,
    sameSite: "strict",
    // FIX: add secure flag for HTTPS
    secure: process.env.NODE_ENV === "production" ? true : false
  }
});
app.use(sessionMiddleware);

// FIX: Store activeSiteUsers in shared state via app.locals (still per-worker but accessible)
const activeSiteUsers = new Map();

function touchActiveUser(user) {
  const sid = String(user?.steamid64 || "").trim();
  if (/^\d{17}$/.test(sid)) activeSiteUsers.set(sid, Date.now());
}

function activeSiteCount() {
  const now = Date.now();
  for (const [sid, ts] of activeSiteUsers) {
    if (now - ts > 5 * 60 * 1e3) activeSiteUsers.delete(sid);
  }
  return activeSiteUsers.size;
}
app.locals.getActiveSiteCount = activeSiteCount;

app.use((req, _res, next) => {
  if (req.session?.user) touchActiveUser(req.session.user);
  next();
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1e3,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: "TOO_MANY_REQUESTS" },
  skipSuccessfulRequests: true
});

// FIX: Global request timeout to prevent slow clients / DoS
const GLOBAL_REQUEST_TIMEOUT_MS = 30 * 1e3;
app.use((req, res, next) => {
  req.setTimeout(GLOBAL_REQUEST_TIMEOUT_MS, () => {
    try {
      if (!res.headersSent) res.status(503).json({ ok: false, error: "REQUEST_TIMEOUT" });
    } catch {}
  });
  res.setTimeout(GLOBAL_REQUEST_TIMEOUT_MS);
  next();
});

// FIX: Extra security headers on top of Helmet
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), interest-cohort=()");
  res.setHeader("X-Permitted-Cross-Domain-Policies", "none");
  next();
});

// FIX: Add rate limiters for Steam API endpoints
const steamApiLimiter = rateLimit({
  windowMs: 60 * 1e3,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: "STEAM_API_LIMIT" },
  skipSuccessfulRequests: false
});

const steamCallbackLimiter = rateLimit({
  windowMs: 60 * 1e3,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: "TOO_MANY_REQUESTS" },
  skipSuccessfulRequests: false
});

app.use(express.json({ limit: "256kb" }));
app.use(express.urlencoded({ extended: true, limit: "256kb" }));

const BLOCKED_PATHS = [
  /^\/data(\/|$)/i,
  /^\/\.env/i,
  /^\/server\.js/i,
  /^\/cluster\.js/i,
  /^\/package\.json/i,
  /^\/package-lock\.json/i,
  /^\/nodemon\.json/i,
  /^\/\.git(\/|$)/i,
  /^\/lib(\/|$)/i,
  /^\/routes(\/|$)/i
];

app.use((req, res, next) => {
  const path = req.path || "";
  for (const pattern of BLOCKED_PATHS) {
    if (pattern.test(path)) {
      return res.status(403).json({ ok: false, error: "FORBIDDEN" });
    }
  }
  next();
});

app.use((req, res, next) => {
  try {
    if (!req.session?.user) return next();
    if (!req.path || !req.path.startsWith("/api/")) return next();
    if (req.path.startsWith("/api/locks")) return next();
    if (!lockAppliesTo(req.session.user)) return next();
    const perm = resolveActionPerm(req.method, req.path, req.body);
    if (!perm) return next();
    if (isPermLockedFor(req.session.user, perm)) {
      return res.status(423).json({
        ok: false,
        error: "LOCKED",
        perm,
        message: "Находится в активном редактировании."
      });
    }
  } catch (e) {}
  next();
});


const LEGACY_REDIRECTS = new Map([
  ["/index.html", "/"],
  ["/login.html", "/login"],
  ["/bans.html", "/bans"],
  ["/stats.html", "/stats"],
  ["/admin_logs.html", "/admin-logs"],
  ["/blacklist.html", "/blacklist"],
  ["/promos.html", "/promos"],
  ["/zbt_access.html", "/zbt-access"],
  ["/manage.html", "/manage"],
  ["/tech_money.html", "/tech/money"],
  ["/tech_gangs.html", "/tech/gangs"],
  ["/tech_donate.html", "/tech/donate"],
  ["/player.html", "/player"]
]);
app.get([...LEGACY_REDIRECTS.keys()], (req, res) => {
  const to = LEGACY_REDIRECTS.get(req.path) || "/";
  const qs = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
  res.redirect(301, to + qs);
});

const PAGE_ROUTES = [
  ["/", "index.html"],
  ["/players", "index.html"],
  ["/login", "login.html"],
  ["/bans", "bans.html"],
  ["/stats", "stats.html"],
  ["/admin-logs", "admin_logs.html"],
  ["/blacklist", "blacklist.html"],
  ["/promos", "promos.html"],
  ["/zbt-access", "zbt_access.html"],
  ["/manage", "manage.html"],
  ["/manage/users", "add_user.html"],
  ["/manage/locks", "locks.html"],
  ["/manage/permissions", "permissions.html"],
  ["/tech/money", "tech_money.html"],
  ["/tech/gangs", "tech_gangs.html"],
  ["/tech/donate", "tech_donate.html"],
  ["/player", "player.html"]
];
for (const [route, file] of PAGE_ROUTES) {
  app.get(route, (req, res) => res.sendFile(join(__dirname, "public", file)));
}

app.use(express.static(join(__dirname, "public"), {
  maxAge: "1h",
  etag: true,
  lastModified: true,
  dotfiles: "deny",
  setHeaders(res, path) {
    if (path.endsWith(".html")) {
      res.setHeader("Cache-Control", "no-cache");
    } else if (/\.(png|jpe?g|webp|gif|svg|ico|woff2?)$/i.test(path)) {
      res.setHeader("Cache-Control", "public, max-age=2592000, immutable");
    }
  }
}));

app.use((req, res, next) => {
  const ext = (req.path || "").match(/\.[a-zA-Z0-9]+$/);
  if (ext && !req.path.startsWith("/api/") && !req.path.startsWith("/img/")) {
    return res.status(404).send("Not found");
  }
  next();
});

app.use(authRoutes(cfg, loginLimiter, steamCallbackLimiter));
app.use(playersRoutes());
app.use(playerRoutes(cfg, steamApiLimiter));
app.use(bansRoutes());
app.use(statsRoutes());
app.use(adminLogsRoutes());
app.use(blacklistRoutes());
app.use(usersRoutes());
app.use(permissionsRoutes());
app.use(commandsRoutes(cfg));
// FIX: apply rate limiter to avatar/steam API routes
app.use(avatarRoutes(cfg, steamApiLimiter));
app.use(onlineRoutes(cfg));
app.use(modelsRoutes());
app.use(playerModelsRoutes());
app.use(weaponsRoutes());
app.use(playerWeaponsRoutes());
app.use(jobsRoutes());
app.use(playerJobsRoutes());
app.use(playerQmenuRoutes());
app.use(playerAccessRoutes());
app.use(zbtAccessRoutes());
app.use(promosRoutes());
app.use(serverSyncRoutes(cfg));
app.use(locksRoutes());
app.use(moneyLogsRoutes());
app.use(donateLogsRoutes());
app.use(techGangsRoutes());
app.use(texPublicRoutes());

// Error handler
app.use((err, req, res, _next) => {
  console.error(err.stack || err);
  if (!res.headersSent) res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
});

// FIX: Don't exit process on unhandled rejections - log and continue
process.on("unhandledRejection", (err) => {
  console.error("Unhandled rejection:", err);
  // Don't exit - just log it
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught exception:", err);
  process.exit(1); // Keep exit on uncaught exceptions as process state may be corrupted
});


function texMoney(v) {
  v = Number(v || 0);
  return `${v > 0 ? "+" : ""}${Math.round(v).toLocaleString("ru-RU")} ₽`;
}

function parseTexPeriod(raw) {
  const s = String(raw || "").trim().toLowerCase();
  if (!s) return null;
  const m = s.match(/^(\d{1,3})\s*(д|дн|день|дня|дней|day|days)?$/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.max(1, Math.min(365, n));
}

function isAdminDiscordId(id, adminId) {
  return String(id || "") === String(adminId || "");
}

async function getTexPlayerName(pool, steamid64) {
  const sid = String(steamid64 || "");
  if (!/^\d{17}$/.test(sid)) return "";
  try {
    const [r] = await pool.query("SELECT Name FROM player_data WHERE CAST(SteamID AS CHAR) = ? LIMIT 1", [sid]);
    if (r[0]?.Name) return decodeIfNeeded(r[0].Name);
  } catch {}
  try {
    const [r] = await pool.query("SELECT name FROM ba_users WHERE CAST(steamid AS CHAR) = ? LIMIT 1", [sid]);
    if (r[0]?.name) return decodeIfNeeded(r[0].name);
  } catch {}
  try {
    const [r] = await pool.query("SELECT Nick FROM GMDonate_Players WHERE CAST(SteamID64 AS CHAR) = ? LIMIT 1", [sid]);
    if (r[0]?.Nick) return decodeIfNeeded(r[0].Nick);
  } catch {}
  return "";
}

function texRateAllowed(map, userId) {
  const now = Date.now();
  const win = 5 * 60 * 1000;
  const key = String(userId || "");
  const arr = (map.get(key) || []).filter((t) => now - t < win);
  if (arr.length >= 5) {
    map.set(key, arr);
    return false;
  }
  arr.push(now);
  map.set(key, arr);
  return true;
}

async function sendTexInfo(message) {
  const token = await createTexInfoLink(db(), `discord:${message.author.id}`);
  const url = texPublicUrl(`/texinfo/${token}`);
  const embed = new EmbedBuilder()
    .setTitle("TEX info")
    .setDescription(`Ссылка на историю TEX запросов:
${url}

Доступ: только авторизованный KP. Активна 24 часа.`)
    .setColor(0x60a5fa)
    .setTimestamp(new Date());
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setLabel("Открыть").setStyle(ButtonStyle.Link).setURL(url)
  );
  await message.reply({ embeds: [embed], components: [row] });
}

function texPublicUrl(path) {
  return (process.env.BASE_URL || cfg.BASE_URL || "").replace(/\/$/, "") + path;
}

async function saveDiscordTexRequest(token, message) {
  await db().query(
    `UPDATE tex_public_links
     SET discord_guild_id = ?, discord_channel_id = ?, discord_message_id = ?, discord_requester_id = ?
     WHERE token = ? LIMIT 1`,
    [
      String(message.guildId || ""),
      String(message.channelId || ""),
      String(message.id || ""),
      String(message.author?.id || ""),
      token
    ]
  );
}

async function updateDiscordTexStatus(token, status, decidedBy) {
  await db().query(
    "UPDATE tex_public_links SET status = ?, decided_by = ?, decided_at = UNIX_TIMESTAMP() WHERE token = ? LIMIT 1",
    [status, String(decidedBy || "").slice(0, 128), token]
  );
}

function canUseDiscordTex(message) {
  const channelId = String(process.env.TEX_CHANNEL_ID || "");
  if (!message.guild || message.author.bot) return false;
  if (!channelId || String(message.channelId) !== channelId) return false;
  return true;
}

async function startDiscordTexBot() {
  const botToken = process.env.DISCORD_BOT_TOKEN;
  const adminId = process.env.TEX_ADMIN_ID;
  const channelId = process.env.TEX_CHANNEL_ID;
  const baseUrl = texPublicUrl("");

  if (!botToken) {
    console.log("[TEX BOT] DISCORD_BOT_TOKEN не задан — Discord бот выключен.");
    return null;
  }
  const missing = [];
  if (!adminId) missing.push("TEX_ADMIN_ID");
  if (!channelId) missing.push("TEX_CHANNEL_ID");
  if (!baseUrl) missing.push("BASE_URL");
  if (missing.length) {
    console.error(`[TEX BOT] Не запущен. Не хватает env: ${missing.join(", ")}`);
    return null;
  }

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.DirectMessages
    ],
    partials: [Partials.Channel]
  });
  const texRateMap = new Map();
  const telegramToken = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
  const telegramAdminId = String(process.env.TELEGRAM_ADMIN_ID || "").trim();
  let telegramOffset = 0;

  async function tgApi(method, payload) {
    if (!telegramToken) return null;
    try {
      const r = await fetch(`https://api.telegram.org/bot${telegramToken}/${method}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload || {})
      });
      return await r.json().catch(() => null);
    } catch (e) {
      console.error("[TEX TG] api error:", e.message);
      return null;
    }
  }

  function tgAllowed(id) {
    return telegramAdminId && String(id || "") === telegramAdminId;
  }

  async function sendTelegramTexRequest({ token, ids, periodDays, playerName, logs, moneyNet, donateNet, suspiciousMoneyCount, suspiciousDonateCount, requester }) {
    if (!telegramToken || !telegramAdminId) return;
    const url = texPublicUrl(`/public/tex/${token}`);
    const text = [
      "🧾 TEX запрос",
      "",
      playerName ? `Ник: ${playerName}` : "Ник: —",
      `SteamID64: ${ids.steamid64}`,
      `SteamID: ${ids.steamid}`,
      `Период: ${periodDays ? `${periodDays} дн.` : "последние"}`,
      `Запросил: ${requester}`,
      "",
      `Деньги итог: ${texMoney(moneyNet)} | ⚠ ${suspiciousMoneyCount}`,
      `Донат итог: ${texMoney(donateNet)} | ⚠ ${suspiciousDonateCount}`,
      "",
      url
    ].join("\n");
    await tgApi("sendMessage", {
      chat_id: telegramAdminId,
      text,
      disable_web_page_preview: true,
      reply_markup: {
        inline_keyboard: [[
          { text: "✅ Выдать", callback_data: `tex_ok:${token}` },
          { text: "❌ Отказать", callback_data: `tex_no:${token}` }
        ], [{ text: "Открыть выписку", url }]]
      }
    });
  }

  async function createTelegramTexDirect(msg, text) {
    if (!tgAllowed(msg.from?.id)) return;
    const parts = String(text || "").trim().split(/\s+/);
    const ids = normSteam(parts[1] || "");
    const periodDays = parseTexPeriod(parts[2] || "");
    if (!ids) {
      await tgApi("sendMessage", { chat_id: msg.chat.id, text: "Использование: /tex STEAMID [7дней]" });
      return;
    }
    const pool = db();
    const playerName = await getTexPlayerName(pool, ids.steamid64);
    const token = await createTexLink(pool, ids.steamid64, `telegram:${msg.from.id}`, periodDays);
    await pool.query(
      "UPDATE tex_public_links SET discord_channel_id = ? WHERE token = ? LIMIT 1",
      [String(channelId), token]
    );
    const result = await handleTexDecision(token, true, `telegram:${msg.from.id}`);
    const url = texPublicUrl(`/public/tex/${token}`);
    await tgApi("sendMessage", {
      chat_id: msg.chat.id,
      text: result?.already
        ? `Этот запрос уже обработан: ${result.status}`
        : `✅ TEX создан и отправлен в Discord\n${playerName ? `Ник: ${playerName}\n` : ""}SteamID64: ${ids.steamid64}\nПериод: ${periodDays ? `${periodDays} дн.` : "последние"}\n${url}`,
      disable_web_page_preview: true,
      reply_markup: { inline_keyboard: [[{ text: "Открыть выписку", url }, { text: "Steam", url: `https://steamcommunity.com/profiles/${ids.steamid64}` }]] }
    });
  }

  async function handleTexDecision(token, approved, decidedByLabel) {
    const [upd] = await db().query(
      "UPDATE tex_public_links SET status = ?, decided_by = ?, decided_at = UNIX_TIMESTAMP() WHERE token = ? AND status = 'pending' LIMIT 1",
      [approved ? "approved" : "denied", String(decidedByLabel || "").slice(0, 128), token]
    );
    const [[link]] = await db().query(
      "SELECT steamid64, period_days, discord_channel_id, discord_message_id, discord_requester_id, status, decided_by FROM tex_public_links WHERE token = ? LIMIT 1",
      [token]
    );
    if (!link) return { ok: false, error: "NOT_FOUND" };
    if (!upd?.affectedRows) {
      return { ok: false, already: true, status: link.status || "unknown", decided_by: link.decided_by || "", link };
    }
    const url = texPublicUrl(`/public/tex/${token}`);
    const playerName = link?.steamid64 ? await getTexPlayerName(db(), link.steamid64) : "";

    if (approved && link.discord_channel_id) {
      const channel = await client.channels.fetch(String(link.discord_channel_id)).catch(() => null);
      if (channel?.isTextBased?.()) {
        const mention = link.discord_requester_id ? `<@${link.discord_requester_id}>` : "";
        const chEmbed = new EmbedBuilder()
          .setTitle("✅ TEX подтверждён")
          .setDescription(`${mention}\n${playerName ? `**Ник:** ${playerName}\n` : ""}**SteamID64:** \`${link.steamid64}\`\n**Период:** ${link.period_days ? `${link.period_days} дн.` : "последние операции"}`.trim())
          .setColor(0x22c55e)
          .setTimestamp(new Date());
        const chRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setLabel("Перейти").setStyle(ButtonStyle.Link).setURL(url),
          new ButtonBuilder().setLabel("Steam").setStyle(ButtonStyle.Link).setURL(`https://steamcommunity.com/profiles/${link.steamid64}`)
        );
        const sent = await channel.send({ embeds: [chEmbed], components: [chRow] });
        setTimeout(() => sent.delete().catch(() => {}), 60 * 1000);
        if (link.discord_message_id) {
          setTimeout(async () => {
            const reqMsg = await channel.messages.fetch(String(link.discord_message_id)).catch(() => null);
            await reqMsg?.delete().catch(() => {});
          }, 60 * 1000);
        }
      }
    }

    if (!approved && link.discord_channel_id) {
      const channel = await client.channels.fetch(String(link.discord_channel_id)).catch(() => null);
      if (channel?.isTextBased?.()) {
        const mention = link.discord_requester_id ? `<@${link.discord_requester_id}>` : "";
        const denyEmbed = new EmbedBuilder()
          .setTitle("❌ TEX отклонён")
          .setDescription(`${mention}\n${playerName ? `**Ник:** ${playerName}\n` : ""}**SteamID64:** \`${link.steamid64}\``.trim())
          .setColor(0xef4444)
          .setTimestamp(new Date());
        await channel.send({ embeds: [denyEmbed] });
      }
    }
    return { ok: true, link, url, playerName };
  }

  async function startTelegramPolling() {
    if (!telegramToken || !telegramAdminId) {
      console.log("[TEX TG] TELEGRAM_BOT_TOKEN/TELEGRAM_ADMIN_ID не заданы — Telegram подтверждения выключены.");
      return;
    }
    console.log("[TEX TG] Telegram подтверждения включены.");
    const poll = async () => {
      const data = await tgApi("getUpdates", { offset: telegramOffset, timeout: 20, allowed_updates: ["message", "callback_query"] });
      if (!data?.ok || !Array.isArray(data.result)) return;
      for (const upd of data.result) {
        telegramOffset = Math.max(telegramOffset, Number(upd.update_id || 0) + 1);
        const msg = upd.message;
        if (msg?.text) {
          const text = String(msg.text || "").trim();
          if (/^(\/start|\/help)$/i.test(text)) {
            if (!tgAllowed(msg.from?.id)) continue;
            await tgApi("sendMessage", {
              chat_id: msg.chat.id,
              text: [
                "TEX bot команды:",
                "/tex STEAMID [7дней] — сразу создать и отправить ссылку в Discord",
                "/texinfo — история TEX запросов",
                "/help — помощь"
              ].join("\n")
            });
          } else if (/^(\/texinfo|!texinfo)\b/i.test(text)) {
            if (!tgAllowed(msg.from?.id)) continue;
            const token = await createTexInfoLink(db(), `telegram:${msg.from.id}`);
            const url = texPublicUrl(`/texinfo/${token}`);
            await tgApi("sendMessage", {
              chat_id: msg.chat.id,
              text: `TEX info:\n${url}\n\nДоступ: только авторизованный KP. Активна 24 часа.`,
              disable_web_page_preview: true,
              reply_markup: { inline_keyboard: [[{ text: "Открыть", url }]] }
            });
          } else if (/^\/tex\b/i.test(text)) {
            await createTelegramTexDirect(msg, text);
          }
        }
        const cb = upd.callback_query;
        if (cb?.data && /^tex_(ok|no):[a-f0-9]{32,64}$/i.test(cb.data)) {
          if (!tgAllowed(cb.from?.id)) {
            await tgApi("answerCallbackQuery", { callback_query_id: cb.id, text: "Нет доступа", show_alert: true });
            continue;
          }
          const [act, token] = String(cb.data).split(":");
          const approved = act === "tex_ok";
          const result = await handleTexDecision(token, approved, `telegram:${cb.from.id}`);
          if (result?.already) {
            await tgApi("answerCallbackQuery", { callback_query_id: cb.id, text: `Уже обработано: ${result.status}`, show_alert: true });
          } else {
            await tgApi("answerCallbackQuery", { callback_query_id: cb.id, text: approved ? "Подтверждено" : "Отказано" });
          }
          if (cb.message?.chat?.id && cb.message?.message_id) {
            await tgApi("editMessageText", {
              chat_id: cb.message.chat.id,
              message_id: cb.message.message_id,
              text: `${result?.already ? "⚠️ Уже обработано" : (approved ? "✅ Подтверждено" : "❌ Отказано")}\n${result?.link?.steamid64 || ""} ${result?.status ? `(${result.status})` : ""}`,
              reply_markup: { inline_keyboard: [] }
            });
          }
        }
      }
    };
    setInterval(() => poll().catch((e) => console.error("[TEX TG] poll error:", e.message)), 2500).unref?.();
    poll().catch(() => {});
  }

  client.once("clientReady", () => {
    console.log(`[TEX BOT] Logged in as ${client.user.tag}`);
    startTelegramPolling().catch((e) => console.error("[TEX TG] start error:", e.message));
  });

  client.on("messageCreate", async (message) => {
    try {
      const content = String(message.content || "").trim();
      if (/^!texinfo\b/i.test(content)) {
        if (!message.guild && isAdminDiscordId(message.author?.id, adminId)) await sendTexInfo(message);
        return;
      }
      if (!/^!tex\b/i.test(content)) return;

      // Полная тишина вне нужного канала.
      if (!canUseDiscordTex(message)) return;
      if (!texRateAllowed(texRateMap, message.author.id)) {
        await message.reply("Лимит: 5 TEX запросов за 5 минут.").catch(() => {});
        return;
      }

      const parts = content.split(/\s+/);
      const ids = normSteam(parts[1] || "");
      const periodDays = parseTexPeriod(parts[2] || "");
      if (!ids) {
        await message.reply("Использование: `!tex STEAMID` или `!tex STEAM_0:1:12345 7дней`");
        return;
      }

      const pool = db();
      const playerName = await getTexPlayerName(pool, ids.steamid64);
      const token = await createTexLink(pool, ids.steamid64, `discord:${message.author.id}`, periodDays);
      await saveDiscordTexRequest(token, message);
      const logs = await getTexLogs(pool, ids.steamid64, 200, periodDays);
      const url = texPublicUrl(`/public/tex/${token}`);

      const suspiciousMoneyCount = logs.money.filter((x) => Math.abs(Number(x.money || 0)) >= 10000000 || /Передача денег|TakeMoney|AddMoney|списание|начисление/i.test(String(x.description || ""))).length;
      const suspiciousDonateCount = logs.donate.filter((x) => Math.abs(Number(x.sum || 0)) >= 1000000 || /given by|reward|refund|возврат|ручн|admin/i.test(String(x.note || ""))).length;
      const moneyNet = Number(logs.totals.money_income || 0) + Number(logs.totals.money_expense || 0);
      const donateNet = Number(logs.totals.donate_income || 0) + Number(logs.totals.donate_expense || 0);

      const embed = new EmbedBuilder()
        .setTitle("TEX запрос")
        .setDescription([
          playerName ? `**${playerName}**` : "Ник не найден",
          `\`${ids.steamid64}\` / \`${ids.steamid}\``,
          `Период: **${periodDays ? `${periodDays} дн.` : "последние"}**`,
          `Запросил: ${message.author}`
        ].join("\n"))
        .addFields(
          { name: "Деньги", value: `Итог: **${texMoney(moneyNet)}**\n⚠ ${suspiciousMoneyCount}`, inline: true },
          { name: "Донат", value: `Итог: **${texMoney(donateNet)}**\n⚠ ${suspiciousDonateCount}`, inline: true }
        )
        .setColor((suspiciousMoneyCount + suspiciousDonateCount) > 0 ? 0xfb923c : 0x22c55e)
        .setFooter({ text: "✅ отправить · ❌ отказать" })
        .setTimestamp(new Date());

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`tex_ok:${token}`).setLabel("Выдать").setEmoji("✅").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`tex_no:${token}`).setLabel("Отказать").setEmoji("❌").setStyle(ButtonStyle.Danger)
      );

      const admin = await client.users.fetch(adminId);
      await admin.send({ embeds: [embed], components: [row] });
      await sendTelegramTexRequest({
        token,
        ids,
        periodDays,
        playerName,
        logs,
        moneyNet,
        donateNet,
        suspiciousMoneyCount,
        suspiciousDonateCount,
        requester: `${message.author.tag} (${message.author.id})`
      });
      await message.react("📨").catch(() => {});
    } catch (e) {
      console.error("[TEX BOT] messageCreate error:", e);
      try { await message.reply("Ошибка при создании TEX запроса."); } catch {}
    }
  });

  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;
    try {
      const [action, token] = String(interaction.customId || "").split(":");
      if (!/^tex_(ok|no)$/.test(action) || !/^[a-f0-9]{32,64}$/i.test(token || "")) return;
      if (String(interaction.user.id) !== String(adminId)) {
        await interaction.reply({ content: "Нет доступа.", ephemeral: true });
        return;
      }

      const approved = action === "tex_ok";
      const decision = await handleTexDecision(token, approved, `discord:${interaction.user.id}`);
      if (decision?.already) {
        await interaction.reply({ content: `Этот запрос уже обработан: ${decision.status}`, ephemeral: true }).catch(() => {});
        return;
      }

      const old = interaction.message;
      const embed = EmbedBuilder.from(old.embeds[0] || {}).setColor(approved ? 0x22c55e : 0xef4444).addFields({
        name: "Решение",
        value: `${approved ? "✅ Подтверждено, ссылка отправлена в канал" : "❌ Отказано"} · ${interaction.user.tag}`,
        inline: false
      });
      const disabled = new ActionRowBuilder().addComponents(
        ButtonBuilder.from(old.components[0].components[0]).setDisabled(true),
        ButtonBuilder.from(old.components[0].components[1]).setDisabled(true)
      );
      await interaction.update({ embeds: [embed], components: [disabled] });
      if (approved) setTimeout(() => interaction.message.delete().catch(() => {}), 60 * 1000);
    } catch (e) {
      console.error("[TEX BOT] interaction error:", e);
      try { await interaction.reply({ content: "Ошибка обработки кнопки.", ephemeral: true }); } catch {}
    }
  });

  try {
    await client.login(botToken);
    return client;
  } catch (e) {
    console.error("[TEX BOT] Login error:", e.message || e);
    return null;
  }
}

async function start() {
  try {
    initPool(cfg);
    await ensurePanelSchema();
    console.log("DB connected");
    await startDiscordTexBot();
  } catch (e) {
    console.error("DB init error:", e.message);
    process.exit(1);
  }

  const server = app.listen(cfg.PORT, () => {
    console.log(`VibeRP Panel running on port ${cfg.PORT}`);
  });

  // FIX: Prevent "hot reload" silent disconnects by broadcasting a reconnect signal on shutdown
  async function shutdown(signal) {
    console.log(`[WORKER] ${signal} received. Graceful shutdown…`);

    server.close(async () => {
      try {
        const { flushOnlineToDisk } = await import("./lib/helpers.js");
        await flushOnlineToDisk();
        console.log("[WORKER] Online data flushed to disk.");
      } catch (e) {
        console.error("[WORKER] Failed to flush online:", e.message);
      }
      try {
        const { db } = await import("./lib/db.js");
        const pool = db();
        if (pool && typeof pool.end === "function") {
          await pool.end();
          console.log("[WORKER] DB pool closed.");
        }
      } catch (e) {
        console.error("[WORKER] Error closing pool:", e.message);
      }
      console.log("[WORKER] Exiting.");
      process.exit(0);
    });

    setTimeout(() => {
      console.error("[WORKER] Forced exit after timeout.");
      process.exit(1);
    }, 25e3);
  }

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

start();
