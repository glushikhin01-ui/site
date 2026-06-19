import { Router } from "express";
import multer from "multer";
import { existsSync, mkdirSync, createReadStream, statSync } from "fs";
import { join, dirname, extname } from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";
import { requirePerm, getUserRole, webNormalizeRole, webRoleLabel } from "../lib/roles.js";
import { authGuard } from "../lib/guard.js";
import { appendMessage, readLastMessages, deleteMessage } from "../lib/messenger.js";
import { decodeIfNeeded } from "../lib/helpers.js";
import { getCustomAvatarUrl } from "../lib/avatars.js";
import { db } from "../lib/db.js";
const __dirname = dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = join(__dirname, "..", "data", "uploads");
function ensureUploads() {
  if (!existsSync(UPLOAD_DIR)) mkdirSync(UPLOAD_DIR, { recursive: true });
}
async function enrichMessageAuthors(items) {
  if (!Array.isArray(items) || !items.length) return items;
  const sids = [...new Set(items.flatMap((m) => [String(m?.steamid64 || "").trim(), String(m?.reply_to?.steamid64 || "").trim()]).filter((s) => /^\d{17}$/.test(s)))];
  if (!sids.length) return items;
  try {
    const placeholders = sids.map(() => "?").join(",");
    const [rows] = await db().query(`SELECT steamid64, COALESCE(nickname,'') AS nickname, COALESCE(role,'') AS role FROM web_users WHERE steamid64 IN (${placeholders})`, sids);
    const bySid = new Map();
    for (const row of rows) {
      const role = webNormalizeRole(row.role);
      bySid.set(String(row.steamid64), {
        nick: String(row.nickname || "").trim(),
        role: webRoleLabel(role)
      });
    }
    return items.map((m) => {
      const fresh = bySid.get(String(m?.steamid64 || ""));
      const replyFresh = bySid.get(String(m?.reply_to?.steamid64 || ""));
      if (!fresh && !replyFresh) return m;
      return {
        ...m,
        nick: fresh?.nick || m.nick || m.steamid64 || "—",
        role: fresh?.role || m.role || "",
        reply_to: m.reply_to ? {
          ...m.reply_to,
          nick: replyFresh?.nick || m.reply_to.nick || m.reply_to.steamid64 || "—"
        } : null
      };
    });
  } catch {
    return items;
  }
}
async function currentMessengerUser(sessionUser) {
  const sid = String(sessionUser?.steamid64 || "").trim();
  if (!/^\d{17}$/.test(sid)) {
    return { steamid64: sid, nick: sessionUser?.nickname || sid || "—", role: sessionUser?.role || "" };
  }
  try {
    const [rows] = await db().query("SELECT COALESCE(nickname,'') AS nickname, COALESCE(role,'') AS role FROM web_users WHERE steamid64 = ? LIMIT 1", [sid]);
    if (rows.length) {
      const role = webNormalizeRole(rows[0].role);
      const nick = String(rows[0].nickname || "").trim() || sid;
      if (sessionUser) {
        sessionUser.nickname = nick;
        sessionUser.role = role;
      }
      return { steamid64: sid, nick, role: webRoleLabel(role) };
    }
  } catch {
  }
  return { steamid64: sid, nick: sessionUser?.nickname || sid || "—", role: webRoleLabel(webNormalizeRole(sessionUser?.role)) };
}
const MAX_SIZE = 25 * 1024 * 1024;
const ALLOWED = new Map([
  ["image/jpeg", ".jpg"],
  ["image/jpg", ".jpg"],
  ["image/pjpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/gif", ".gif"],
  ["image/webp", ".webp"],
  ["image/bmp", ".bmp"],
  ["image/svg+xml", ".svg"],
  ["image/avif", ".avif"],
  ["image/heic", ".heic"],
  ["image/heif", ".heif"],
  ["image/tiff", ".tiff"],
  ["video/mp4", ".mp4"],
  ["video/webm", ".webm"],
  ["video/quicktime", ".mov"],
  ["video/x-matroska", ".mkv"],
  ["video/x-msvideo", ".avi"],
  ["video/3gpp", ".3gp"],
  ["video/mpeg", ".mpeg"],
  ["audio/mpeg", ".mp3"],
  ["audio/mp3", ".mp3"],
  ["audio/ogg", ".ogg"],
  ["audio/wav", ".wav"],
  ["audio/x-wav", ".wav"],
  ["audio/webm", ".weba"],
  ["audio/aac", ".aac"],
  ["audio/mp4", ".m4a"],
  ["audio/flac", ".flac"],
  ["application/pdf", ".pdf"],
  ["application/zip", ".zip"],
  ["application/x-zip-compressed", ".zip"],
  ["application/x-7z-compressed", ".7z"],
  ["application/x-rar-compressed", ".rar"],
  ["application/vnd.rar", ".rar"],
  ["application/gzip", ".gz"],
  ["application/x-tar", ".tar"],
  ["text/plain", ".txt"],
  ["text/csv", ".csv"],
  ["text/markdown", ".md"],
  ["application/rtf", ".rtf"],
  ["application/json", ".json"],
  ["application/xml", ".xml"],
  ["text/xml", ".xml"],
  ["application/msword", ".doc"],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", ".docx"],
  ["application/vnd.ms-excel", ".xls"],
  ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ".xlsx"],
  ["application/vnd.ms-powerpoint", ".ppt"],
  ["application/vnd.openxmlformats-officedocument.presentationml.presentation", ".pptx"]
]);
const ALLOWED_EXT = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp",
  ".bmp",
  ".svg",
  ".avif",
  ".heic",
  ".heif",
  ".tiff",
  ".mp4",
  ".webm",
  ".mov",
  ".mkv",
  ".avi",
  ".3gp",
  ".mpeg",
  ".mp3",
  ".ogg",
  ".wav",
  ".weba",
  ".aac",
  ".m4a",
  ".flac",
  ".pdf",
  ".zip",
  ".7z",
  ".rar",
  ".gz",
  ".tar",
  ".txt",
  ".csv",
  ".md",
  ".rtf",
  ".json",
  ".xml",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx"
]);
const BLOCKED_EXT = new Set([
  ".exe",
  ".bat",
  ".cmd",
  ".com",
  ".scr",
  ".msi",
  ".dll",
  ".sh",
  ".bash",
  ".ps1",
  ".vbs",
  ".js",
  ".mjs",
  ".jar",
  ".apk",
  ".app",
  ".deb",
  ".rpm",
  ".php",
  ".py",
  ".rb",
  ".pl",
  ".html",
  ".htm",
  ".svgz"
]);
function fileExt(name) {
  return extname(String(name || "")).toLowerCase() || "";
}
function isAllowedFile(file) {
  const ext = fileExt(file.originalname);
  if (BLOCKED_EXT.has(ext)) return false;
  if (ALLOWED.has(file.mimetype)) return true;
  if (ALLOWED_EXT.has(ext)) return true;
  if (file.mimetype === "application/octet-stream" && ext && ALLOWED_EXT.has(ext)) return true;
  return false;
}
const storage = multer.diskStorage({
  destination(req, file, cb) {
    ensureUploads();
    cb(null, UPLOAD_DIR);
  },
  filename(req, file, cb) {
    const ext = ALLOWED.get(file.mimetype) || fileExt(file.originalname) || ".bin";
    cb(null, randomUUID() + ext.replace(/[^a-z0-9.]/gi, "").slice(0, 8));
  }
});
const upload = multer({
  storage,
  limits: { fileSize: MAX_SIZE, files: 5 },
  fileFilter(req, file, cb) {
    if (isAllowedFile(file)) cb(null, true);
    else {
      req._rejectedFiles = req._rejectedFiles || [];
      req._rejectedFiles.push(file.originalname);
      cb(null, false);
    }
  }
});
function kindOf(mime, name) {
  const ext = fileExt(name);
  if (mime.startsWith("image/") || [".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg", ".avif", ".heic", ".tiff"].includes(ext)) return "image";
  if (mime.startsWith("video/") || [".mp4", ".webm", ".mov", ".mkv", ".avi", ".3gp"].includes(ext)) return "video";
  if (mime.startsWith("audio/") || [".mp3", ".ogg", ".wav", ".weba", ".aac", ".m4a", ".flac"].includes(ext)) return "audio";
  return "file";
}
function messengerRoutes() {
  const r = Router();
  r.get("/api/messenger/history", authGuard, requirePerm("messenger"), async (req, res) => {
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit || "60", 10)));
    const beforeId = req.query.before ? String(req.query.before) : null;
    const { items, hasMore } = readLastMessages(limit, beforeId);
    res.json({ ok: true, items: await enrichMessageAuthors(items), hasMore });
  });
  r.post(
    "/api/messenger/send",
    authGuard,
    requirePerm("messenger"),
    (req, res, next) => {
      upload.array("files", 5)(req, res, (err) => {
        if (err) {
          if (err.code === "LIMIT_FILE_SIZE") return res.status(413).json({ ok: false, error: "FILE_TOO_LARGE" });
          return res.status(400).json({ ok: false, error: "UPLOAD_ERROR" });
        }
        next();
      });
    },
    async (req, res) => {
      const text = String(req.body.text || "").trim().slice(0, 4e3);
      const files = Array.isArray(req.files) ? req.files : [];
      const rejected = Array.isArray(req._rejectedFiles) ? req._rejectedFiles : [];
      const replyId = String(req.body.reply_to || "").trim();
      if (!text && !files.length) {
        if (rejected.length) {
          return res.status(400).json({ ok: false, error: "FILE_TYPE_NOT_ALLOWED", rejected });
        }
        return res.status(400).json({ ok: false, error: "EMPTY" });
      }
      const attachments = files.map((f) => ({
        url: "/api/messenger/file/" + f.filename,
        name: decodeIfNeeded(f.originalname || f.filename),
        size: f.size,
        mime: f.mimetype,
        kind: kindOf(f.mimetype, f.originalname)
      }));
      let replyTo = null;
      if (replyId) {
        const target = readLastMessages(1e3).items.find((m) => String(m.id) === replyId);
        if (target) {
          replyTo = {
            id: target.id,
            steamid64: target.steamid64 || "",
            nick: target.nick || target.steamid64 || "—",
            text: target.text || (target.attachments?.length ? "Вложение" : "Сообщение")
          };
        }
      }
      const u = await currentMessengerUser(req.session.user || {});
      const msg = appendMessage({
        steamid64: u.steamid64 || "",
        nick: u.nick || u.steamid64 || "—",
        role: u.role || "",
        text,
        attachments,
        reply_to: replyTo
      });
      if (req.app.locals.broadcastMessenger) {
        req.app.locals.broadcastMessenger({ type: "message", message: msg });
      }
      res.json({ ok: true, message: msg, rejected: rejected.length ? rejected : void 0 });
    }
  );
  r.delete("/api/messenger/message", authGuard, requirePerm("messenger"), (req, res) => {
    const id = String(req.query.id || req.body?.id || "").trim();
    if (!id) return res.status(400).json({ ok: false, error: "NO_ID" });
    const u = req.session.user || {};
    const isKP = getUserRole(req.session) === "KP";
    let target = readLastMessages(100).items.find((m) => m.id === id);
    if (!target) target = readLastMessages(1e3).items.find((m) => m.id === id);
    if (!isKP) {
      if (!target || String(target.steamid64) !== String(u.steamid64)) {
        return res.status(403).json({ ok: false, error: "NOT_ALLOWED" });
      }
    }
    const result = deleteMessage(id);
    if (!result.ok) return res.status(404).json({ ok: false, error: "NOT_FOUND" });
    if (req.app.locals.broadcastMessenger) {
      req.app.locals.broadcastMessenger({ type: "delete", id });
    }
    res.json({ ok: true });
  });
  r.get("/api/messenger/file/:name", authGuard, requirePerm("messenger"), (req, res) => {
    const name = String(req.params.name || "");
    if (!/^[a-zA-Z0-9._-]+$/.test(name) || name.includes("..")) return res.status(400).end();
    const p = join(UPLOAD_DIR, name);
    if (!p.startsWith(UPLOAD_DIR) || !existsSync(p)) return res.status(404).end();
    res.setHeader("Cache-Control", "private, max-age=86400");
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (name.endsWith(".svg")) res.setHeader("Content-Disposition", "attachment");
    createReadStream(p).pipe(res);
  });
  r.post("/api/messenger/avatars", authGuard, requirePerm("messenger"), (req, res) => {
    const sids = Array.isArray(req.body?.sids) ? req.body.sids : [];
    const out = {};
    for (const s of sids.slice(0, 200)) {
      const sid = String(s || "").trim();
      if (!/^\d{17}$/.test(sid)) continue;
      const url = getCustomAvatarUrl(sid);
      if (url) out[sid] = url;
    }
    res.json({ ok: true, items: out });
  });
  return r;
}
export {
  messengerRoutes as default
};
