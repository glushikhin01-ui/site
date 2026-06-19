import { Router } from "express";
import { requirePerm, hasPerm, getUserRole } from "../lib/roles.js";
import { authGuard } from "../lib/guard.js";
import { readQueueFile, writeQueueFile } from "../lib/helpers.js";
import { withQueueLock } from "../lib/queue_lock.js";
import { db } from "../lib/db.js";

const PLAYER_RANKS = new Set([
  "*",
  "co*",
  "uprav",
  "zamuprav",
  "arizona-team",
  "project-team",
  "manager",
  "vice-manager",
  "head-curator",
  "curator",
  "head-admin",
  "admin",
  "moderator",
  "helper",
  "inter",
  "owner",
  "superadmin",
  "d-admin",
  "d-moderator",
  "vip",
  "User"
]);
const ALLOWED_COMMANDS = [
  { perm: "kick", pattern: /^ba kick\b/ },
  { perm: "ban", pattern: /^ba (ban|perma)\b/ },
  { perm: "unban", pattern: /^ba unban\b/ },
  { perm: "adminmode", pattern: /^ba setadminmode\b/ },
  { perm: "give_money", pattern: /^ba addmoney\b/ },
  { perm: "set_rank", pattern: /^ba setgroup\b/ },
  { perm: "manage_blacklist", pattern: /^blacklist_(add|addip|remove|removeip)\b/ },
  { perm: "give_model", pattern: /^(addmodel|removemodel)\b/ },
  { perm: "give_weapon", pattern: /^(giveweapon|removeweapon)\b/ },
  { perm: "give_job", pattern: /^(givejob|removejob)\b/ },
  { perm: "give_qmenu", pattern: /^(giveqmenu|removeqmenu)\b/ },
  
  { perm: "give_job", pattern: /^ba adddonate\b/ },
  { perm: "give_job", pattern: /^ba (removedonate|takedonate|del_donate)\b/ }
];
function resolveCommandPerm(text) {
  const t = text.replace(/\s+/g, " ").toLowerCase().trim();
  for (const { perm, pattern } of ALLOWED_COMMANDS) {
    if (pattern.test(t)) return perm;
  }
  return "raw_console";
}
function commandsRoutes(cfg) {
  const r = Router();
  r.post("/api/command", authGuard, async (req, res) => {
    const type = String(req.body.type || "console").trim();
    const text = String(req.body.text || "").trim();
    if (!text) return res.status(400).json({ ok: false, error: "EMPTY_COMMAND" });
    if (text.length > 512) return res.status(400).json({ ok: false, error: "COMMAND_TOO_LONG" });
    if (type !== "console") return res.status(400).json({ ok: false, error: "BAD_TYPE" });
    const setGroupMatch = text.match(/^ba\s+setgroup\s+(\S+)\s+(\S+)\s*$/i);
    if (setGroupMatch && !PLAYER_RANKS.has(setGroupMatch[2])) {
      return res.status(400).json({ ok: false, error: "INVALID_PLAYER_RANK", rank: setGroupMatch[2] });
    }
    const role = getUserRole(req.session);
    const adminSid64 = String(req.session?.user?.steamid64 || "");
    const neededPerm = resolveCommandPerm(text);
    if (!hasPerm(role, neededPerm)) return res.status(403).json({ ok: false, error: "FORBIDDEN", perm: neededPerm });
    const id = await withQueueLock(async () => {
      const data = readQueueFile();
      const now = Math.floor(Date.now() / 1e3);
      let reuseId = null;
      const sgMatch = text.match(/^ba\s+setgroup\s+(\S+)\s+(\S+)\s*$/i);
      if (sgMatch) {
        const targetSteam = sgMatch[1].toUpperCase();
        for (let i = data.length - 1; i >= 0; i--) {
          const cmd = data[i];
          if (!cmd || cmd.type !== "console" || cmd.done) continue;
          const m2 = (cmd.text || "").match(/^ba\s+setgroup\s+(\S+)\s+(\S+)\s*$/i);
          if (m2 && m2[1].toUpperCase() === targetSteam) {
            data[i].text = text;
            data[i].admin_steamid64 = adminSid64;
            data[i].time = now;
            data[i].processing = false;
            data[i].processing_time = 0;
            reuseId = data[i].id || "";
            break;
          }
        }
      }
      let cmdId;
      if (!reuseId) {
        cmdId = "cmd_" + now + "_" + Math.floor(1e3 + Math.random() * 9e3);
        data.push({ id: cmdId, type, text, admin_steamid64: adminSid64, done: false, processing: false, time: now });
      } else {
        cmdId = reuseId;
      }
      writeQueueFile(data);
      return cmdId;
    });
    try {
      const parts = text.trim().split(/\s+/);
      const action = parts.slice(0, 2).join(" ");
      const target = parts[2] || "";
      await db().query(
        "INSERT INTO admin_logs (admin_steamid64, action, target, details, timestamp) VALUES (?, ?, ?, ?, ?)",
        [adminSid64, action, target, text, Math.floor(Date.now() / 1e3)]
      );
    } catch {
    }
    res.json({ ok: true, id });
  });
  function requirePassword(req, res) {
    const pass = String(req.body?.password || req.query?.password || req.headers["x-api-password"] || "").trim();
    if (!cfg.WEB_SECRET || pass !== cfg.WEB_SECRET) {
      res.status(403).json({ ok: false, error: "BAD_PASSWORD" });
      return false;
    }
    return true;
  }
  r.get("/api/get", async (req, res) => {
    if (!requirePassword(req, res)) return;
    try {
      const out = await withQueueLock(async () => {
        const data = readQueueFile();
        const now = Math.floor(Date.now() / 1e3);
        const timeout = 30;
        const limit = 25;
        const result = [];
        let changed = false;
        for (const cmd of data) {
          if (result.length >= limit) break;
          if (cmd.done) continue;
          const processing = Boolean(cmd.processing);
          const pt = parseInt(cmd.processing_time || 0, 10);
          if (processing && now - pt > timeout) {
            cmd.processing = false;
            cmd.processing_time = 0;
            cmd.tries = parseInt(cmd.tries || 0, 10) + 1;
            if (cmd.tries >= 10) {
              cmd.done = true;
              cmd.done_time = now;
              cmd.error = "TIMEOUT";
            }
            changed = true;
            continue;
          }
          if (processing) continue;
          cmd.processing = true;
          cmd.processing_time = now;
          changed = true;
          result.push(cmd);
        }
        if (changed) writeQueueFile(data);
        return result;
      });
      res.json(out);
    } catch (e) {
      console.error("get error:", e.message);
      res.status(500).json([]);
    }
  });
  r.post("/api/mark", async (req, res) => {
    if (!requirePassword(req, res)) return;
    try {
      const id = String(req.body.id || "").trim();
      if (!id) return res.status(400).json({ ok: false, error: "NO_ID" });
      const found = await withQueueLock(async () => {
        const data = readQueueFile();
        const now = Math.floor(Date.now() / 1e3);
        let f = false;
        for (const cmd of data) {
          if (cmd.id === id) {
            cmd.done = true;
            cmd.done_time = now;
            cmd.processing = false;
            cmd.processing_time = 0;
            f = true;
            break;
          }
        }
        if (f) writeQueueFile(data);
        return f;
      });
      if (!found) return res.status(404).json({ ok: false, error: "CMD_NOT_FOUND" });
      res.json({ ok: true });
    } catch (e) {
      console.error("mark error:", e.message);
      res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
    }
  });
  return r;
}
export {
  commandsRoutes as default
};
