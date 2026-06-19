import { Router } from "express";
import { db } from "../lib/db.js";
import { requirePerm } from "../lib/roles.js";
import { authGuard } from "../lib/guard.js";
import { steamid64ToSteamid, decodeIfNeeded, stripPort, logAdminAction } from "../lib/helpers.js";
function blacklistRoutes() {
  const r = Router();
  function sessionNickname(session) {
    const u = session?.user;
    return u?.nickname?.trim() || "Site";
  }
  r.get("/api/blacklist", authGuard, requirePerm("view_blacklist"), async (req, res) => {
    try {
      const pool = db();
      const [rows] = await pool.query(
        `SELECT steamid64, steamid, nickname, ip, reason, added_by, active,
         UNIX_TIMESTAMP(added_at) AS added_at_ts,
         UNIX_TIMESTAMP(updated_at) AS updated_at_ts
         FROM chsp_list ORDER BY COALESCE(updated_at, added_at) DESC`
      );
      const items = [];
      for (const row of rows) {
        const sid64 = String(row.steamid64 || "");
        let sid = String(row.steamid || "");
        if (!sid && sid64 && /^\d+$/.test(sid64)) sid = steamid64ToSteamid(sid64);
        let nick = decodeIfNeeded(row.nickname || "");
        if (!nick || /^неизвестный игрок$/iu.test(nick.trim())) {
          try {
            const [nr] = await pool.query("SELECT name FROM ba_users WHERE steamid = ? LIMIT 1", [sid64]);
            if (nr[0]?.name) nick = decodeIfNeeded(nr[0].name);
          } catch {
          }
        }
        let ipVal = stripPort(row.ip || "");
        if (!ipVal && sid64 && /^\d+$/.test(sid64)) {
          try {
            const [ir] = await pool.query("SELECT ip FROM ba_iplog WHERE steamid = ? ORDER BY lastseen DESC LIMIT 1", [sid64]);
            if (ir[0]) ipVal = stripPort(ir[0].ip);
          } catch {
          }
          if (!ipVal) {
            try {
              const [ir2] = await pool.query("SELECT ip FROM ba_bans WHERE steamid = ? AND ip <> '0' ORDER BY ban_time DESC LIMIT 1", [sid64]);
              if (ir2[0]) ipVal = stripPort(ir2[0].ip);
            } catch {
            }
          }
        }
        items.push({
          steamid64: sid64,
          steamid: sid,
          nickname: nick,
          ip: ipVal,
          reason: decodeIfNeeded(row.reason || ""),
          added_by: decodeIfNeeded(row.added_by || ""),
          active: parseInt(row.active ?? 1, 10),
          added_at: parseInt(row.added_at_ts || 0, 10),
          updated_at: parseInt(row.updated_at_ts || 0, 10)
        });
      }
      res.json({ ok: true, items });
    } catch (e) {
      console.error("blacklist error:", e.message);
      res.status(500).json({ ok: false, error: "DB_ERROR" });
    }
  });
  r.post("/api/chsp_action", authGuard, requirePerm("manage_blacklist"), async (req, res) => {
    try {
      const pool = db();
      const action = String(req.body.action || "").trim();
      const steamid64 = String(req.body.steamid64 || "").trim();
      let ip = stripPort(req.body.ip || "");
      const nickname = String(req.body.nickname || "").trim();
      const reason = String(req.body.reason || "").trim();
      const addedBy = sessionNickname(req.session);
      if (!action) return res.status(400).json({ ok: false, error: "NO_ACTION" });
      if (action === "add") {
        if (!steamid64 || !/^\d{17}$/.test(steamid64)) return res.status(400).json({ ok: false, error: "BAD_STEAMID64" });
        const steamid = steamid64ToSteamid(steamid64);
        await pool.query(
          `INSERT INTO chsp_list (steamid64, steamid, nickname, ip, reason, added_by, active)
           VALUES (?, ?, ?, ?, ?, ?, 1)
           ON DUPLICATE KEY UPDATE steamid=VALUES(steamid), nickname=VALUES(nickname), ip=VALUES(ip),
           reason=VALUES(reason), added_by=VALUES(added_by), active=1, updated_at=CURRENT_TIMESTAMP`,
          [steamid64, steamid, nickname, ip, reason, addedBy]
        );
        if (ip) {
          await pool.query(
            `INSERT INTO chsp_ip_list (ip, reason, added_by, active) VALUES (?, ?, ?, 1)
             ON DUPLICATE KEY UPDATE reason=VALUES(reason), added_by=VALUES(added_by), active=1`,
            [ip, reason, addedBy]
          ).catch(() => {
          });
        }
        if (req.session.user) {
          await logAdminAction(pool, req.session.user.steamid64, "BLACKLIST_ADD", steamid64, reason).catch(() => {
          });
        }
        return res.json({ ok: true });
      }
      if (action === "remove") {
        if (!steamid64 || !/^\d{17}$/.test(steamid64)) return res.status(400).json({ ok: false, error: "BAD_STEAMID64" });
        await pool.query("DELETE FROM chsp_list WHERE steamid64 = ? LIMIT 1", [steamid64]);
        if (ip) await pool.query("DELETE FROM chsp_ip_list WHERE ip = ? LIMIT 1", [ip]).catch(() => {
        });
        if (req.session.user) {
          await logAdminAction(pool, req.session.user.steamid64, "BLACKLIST_REMOVE", steamid64, "").catch(() => {
          });
        }
        return res.json({ ok: true });
      }
      if (action === "remove_ip") {
        if (!ip) return res.status(400).json({ ok: false, error: "NO_IP" });
        await pool.query("DELETE FROM chsp_ip_list WHERE ip = ? LIMIT 1", [ip]);
        return res.json({ ok: true });
      }
      return res.status(400).json({ ok: false, error: "UNKNOWN_ACTION" });
    } catch (e) {
      console.error("chsp_action error:", e.message);
      res.status(500).json({ ok: false, error: "DB_ERROR" });
    }
  });
  return r;
}
export {
  blacklistRoutes as default
};
