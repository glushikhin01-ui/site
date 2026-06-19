import { Router } from "express";
import multer from "multer";
import { existsSync, createReadStream } from "fs";
import { join, extname } from "path";
import { randomUUID } from "crypto";
import { authGuard } from "../lib/guard.js";
import { requirePerm } from "../lib/roles.js";
import { steamGetAvatarBatch } from "../lib/helpers.js";
import { steamidToSteamid64 } from "../lib/helpers.js";
import { avatarCache } from "../lib/lru_cache.js";
import {
  AVATAR_DIR,
  getCustomAvatarUrl,
  getCustomAvatarFile,
  setCustomAvatar,
  removeCustomAvatar,
  listCustomAvatars
} from "../lib/avatars.js";
const AV_MAX = 8 * 1024 * 1024;
const AV_ALLOWED = new Map([
  ["image/jpeg", ".jpg"],
  ["image/jpg", ".jpg"],
  ["image/pjpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"]
]);
const AV_EXT = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const avStorage = multer.diskStorage({
  destination(req, file, cb) {
    if (!existsSync(AVATAR_DIR)) {
      import("fs").then((fs) => {
        fs.mkdirSync(AVATAR_DIR, { recursive: true });
        cb(null, AVATAR_DIR);
      });
    } else cb(null, AVATAR_DIR);
  },
  filename(req, file, cb) {
    const ext = AV_ALLOWED.get(file.mimetype) || extname(file.originalname).toLowerCase() || ".png";
    cb(null, randomUUID() + ext.replace(/[^a-z.]/gi, "").slice(0, 6));
  }
});
const avUpload = multer({
  storage: avStorage,
  limits: { fileSize: AV_MAX, files: 1 },
  fileFilter(req, file, cb) {
    const ext = extname(String(file.originalname || "")).toLowerCase();
    if (AV_ALLOWED.has(file.mimetype) || AV_EXT.has(ext)) cb(null, true);
    else cb(null, false);
  }
});
function normSid(v) {
  const raw = String(v || "").trim();
  if (/^\d{17}$/.test(raw)) return raw;
  return steamidToSteamid64(raw) || "";
}
function avatarRoutes(cfg) {
  const r = Router();
  r.get("/api/avatar", authGuard, async (req, res) => {
    const sid = String(req.query.sid || "").trim();
    if (!sid || !/^\d{17}$/.test(sid)) return res.json({ ok: true, url: "/img/noavatar.png" });
    if (!cfg.STEAM_API_KEY) return res.json({ ok: true, url: "/img/noavatar.png" });
    const cached = avatarCache.get(sid);
    if (cached !== void 0) return res.json({ ok: true, url: cached });
    try {
      const batch = await steamGetAvatarBatch(cfg.STEAM_API_KEY, [sid]);
      const url = batch[sid] || "/img/noavatar.png";
      return res.json({ ok: true, url });
    } catch {
      return res.json({ ok: true, url: "/img/noavatar.png" });
    }
  });
  r.post("/api/avatars", authGuard, async (req, res) => {
    const { sids } = req.body || {};
    if (!Array.isArray(sids) || !sids.length) {
      return res.status(400).json({ ok: false, error: "NO_SIDS" });
    }
    const clean = sids.map((s) => String(s).trim()).filter((s) => /^\d{17}$/.test(s)).slice(0, 100);
    if (!cfg.STEAM_API_KEY) {
      const fallback = Object.fromEntries(clean.map((s) => [s, "/img/noavatar.png"]));
      return res.json({ ok: true, items: fallback });
    }
    try {
      const batch = await steamGetAvatarBatch(cfg.STEAM_API_KEY, clean);
      return res.json({ ok: true, items: batch });
    } catch {
      return res.status(502).json({ ok: false, error: "STEAM_API_FAIL" });
    }
  });
  r.get("/api/custom_avatar/:name", authGuard, (req, res) => {
    const name = String(req.params.name || "");
    if (!/^[a-zA-Z0-9._-]+$/.test(name) || name.includes("..")) return res.status(400).end();
    const p = join(AVATAR_DIR, name);
    if (!p.startsWith(AVATAR_DIR) || !existsSync(p)) return res.status(404).end();
    res.setHeader("Cache-Control", "private, max-age=300");
    res.setHeader("X-Content-Type-Options", "nosniff");
    createReadStream(p).pipe(res);
  });
  r.post(
    "/api/custom_avatar",
    authGuard,
    requirePerm("manage_users"),
    (req, res, next) => {
      avUpload.single("avatar")(req, res, (err) => {
        if (err) {
          if (err.code === "LIMIT_FILE_SIZE") return res.status(413).json({ ok: false, error: "FILE_TOO_LARGE" });
          return res.status(400).json({ ok: false, error: "UPLOAD_ERROR" });
        }
        next();
      });
    },
    (req, res) => {
      const sid = normSid(req.body.steamid || req.body.steamid64 || req.body.sid);
      if (!sid) return res.status(400).json({ ok: false, error: "BAD_STEAMID" });
      if (!req.file) return res.status(400).json({ ok: false, error: "NO_FILE_OR_BAD_TYPE" });
      const by = req.session.user?.nickname || req.session.user?.steamid64 || "";
      setCustomAvatar(sid, req.file.filename, by);
      avatarCache.delete(sid);
      res.json({ ok: true, url: "/api/custom_avatar/" + req.file.filename, steamid64: sid });
    }
  );
  r.delete("/api/custom_avatar", authGuard, requirePerm("manage_users"), (req, res) => {
    const sid = normSid(req.query.steamid || req.query.sid || req.body?.steamid);
    if (!sid) return res.status(400).json({ ok: false, error: "BAD_STEAMID" });
    const ok = removeCustomAvatar(sid);
    avatarCache.delete(sid);
    res.json({ ok });
  });
  r.get("/api/custom_avatar_of", authGuard, requirePerm("manage_users"), (req, res) => {
    const sid = normSid(req.query.steamid || req.query.sid);
    if (!sid) return res.status(400).json({ ok: false, error: "BAD_STEAMID" });
    res.json({ ok: true, url: getCustomAvatarUrl(sid) || null });
  });
  r.get("/api/custom_avatars", authGuard, requirePerm("manage_users"), (req, res) => {
    const idx = listCustomAvatars();
    const items = Object.entries(idx).map(([sid, e]) => ({
      steamid64: sid,
      url: "/api/custom_avatar/" + e.file,
      by: e.by || "",
      ts: e.ts || 0
    })).sort((a, b) => b.ts - a.ts);
    res.json({ ok: true, items });
  });
  return r;
}
export {
  avatarRoutes as default
};
