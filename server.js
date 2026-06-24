import "dotenv/config";
import express from "express";
import session from "express-session";
import helmet from "helmet";
import compression from "compression";
import rateLimit from "express-rate-limit";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { initPool, ensurePanelSchema } from "./lib/db.js";
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
import messengerRoutes from "./routes/messenger.js";
import zbtAccessRoutes from "./routes/zbt_access.js";
import promosRoutes from "./routes/promos.js";
import locksRoutes from "./routes/locks.js";
import moneyLogsRoutes from "./routes/money_logs.js";
import techGangsRoutes from "./routes/tech_gangs.js";
import { WebSocketServer } from "ws";
import { hasPerm } from "./lib/roles.js";
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
app.set("trust proxy", (ip) => {
  // In production, you should configure this more strictly (e.g., list of known proxy IPs)
  if (process.env.NODE_ENV === "production") {
    return TRUSTED_PROXIES.some((fn) => fn === ip || require("proxy-addr").compile(fn)(ip));
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
  ["/messenger.html", "/messenger"],
  ["/manage.html", "/manage"],
  ["/tech_money.html", "/tech/money"],
  ["/tech_gangs.html", "/tech/gangs"],
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
  ["/messenger", "messenger.html"],
  ["/manage", "manage.html"],
  ["/manage/users", "add_user.html"],
  ["/manage/locks", "locks.html"],
  ["/manage/permissions", "permissions.html"],
  ["/tech/money", "tech_money.html"],
  ["/tech/gangs", "tech_gangs.html"],
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
app.use(messengerRoutes());
app.use(zbtAccessRoutes());
app.use(promosRoutes());
app.use(serverSyncRoutes(cfg));
app.use(locksRoutes());
app.use(moneyLogsRoutes());
app.use(techGangsRoutes());

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

async function start() {
  try {
    initPool(cfg);
    await ensurePanelSchema();
    console.log("DB connected");
  } catch (e) {
    console.error("DB init error:", e.message);
    process.exit(1);
  }

  const server = app.listen(cfg.PORT, () => {
    console.log(`VibeRP Panel running on port ${cfg.PORT}`);
  });

  const wss = new WebSocketServer({ noServer: true });
  const wsClients = new Set();

  app.locals.broadcastMessenger = (payload) => {
    const data = JSON.stringify(payload);
    for (const ws of wsClients) {
      if (ws.readyState === 1) {
        try {
          ws.send(data);
        } catch {
        }
      }
    }
  };

  const broadcastActiveCount = () => {
    app.locals.broadcastMessenger({ type: "active_count", count: activeSiteCount() });
  };

  server.on("upgrade", (req, socket, head) => {
    if (!req.url || !req.url.startsWith("/ws/messenger")) {
      socket.destroy();
      return;
    }

    // FIX: Check Origin header to prevent CSWSH (Cross-Site WebSocket Hijacking)
    const origin = req.headers["origin"] || req.headers["sec-websocket-origin"] || "";
    if (origin) {
      try {
        const originUrl = new URL(origin);
        const host = req.headers["host"] || "";
        // Allow same-origin and configured BASE_URL
        const allowedOrigins = [host, cfg.BASE_URL ? new URL(cfg.BASE_URL).host : null].filter(Boolean);
        if (!allowedOrigins.some((a) => originUrl.host === a)) {
          console.warn(`[WS] Rejected connection from origin: ${origin}`);
          socket.destroy();
          return;
        }
      } catch {
        socket.destroy();
        return;
      }
    }

    sessionMiddleware(req, {}, () => {
      const user = req.session && req.session.user;
      if (!user || !hasPerm(user.role, "messenger")) {
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => {
        touchActiveUser(user);
        ws._user = { steamid64: user.steamid64, nick: user.nickname, role: user.role };
        wsClients.add(ws);
        ws.on("close", () => {
          wsClients.delete(ws);
          broadcastActiveCount();
        });
        ws.on("error", () => {
          wsClients.delete(ws);
          broadcastActiveCount();
        });
        try {
          ws.send(JSON.stringify({ type: "hello", user: ws._user, active_count: activeSiteCount() }));
        } catch {
        }
        broadcastActiveCount();
      });
    });
  });

  const wsPing = setInterval(() => {
    for (const ws of wsClients) {
      if (ws.readyState === 1) {
        touchActiveUser(ws._user);
        try {
          ws.ping();
        } catch {
        }
      }
    }
    broadcastActiveCount();
  }, 3e4);
  wsPing.unref?.();

  // FIX: Prevent "hot reload" silent disconnects by broadcasting a reconnect signal on shutdown
  async function shutdown(signal) {
    console.log(`[WORKER] ${signal} received. Graceful shutdown…`);

    // Notify all messenger clients that server is going down
    try {
      app.locals.broadcastMessenger({ type: "server_shutdown", reason: "Сервер перезагружается. Переподключение через несколько секунд…" });
    } catch {}

    // Give clients a moment to process the notification
    await new Promise((r) => setTimeout(r, 500));

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