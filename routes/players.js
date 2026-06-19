import { Router } from "express";
import { db } from "../lib/db.js";
import { requirePerm } from "../lib/roles.js";
import { authGuard } from "../lib/guard.js";
import {
  steamid64ToSteamid,
  readOnlineMap,
  fixCrazyNick,
  decodeIfNeeded,
  isOnlineEntryFresh
} from "../lib/helpers.js";
function playersRoutes() {
  const r = Router();
  async function baPreferredSvId(pool) {
    try {
      const [rows] = await pool.query("SELECT sv_id, COUNT(*) AS c FROM ba_ranks GROUP BY sv_id ORDER BY c DESC LIMIT 1");
      return rows[0]?.sv_id || "NOT_SET";
    } catch {
      return "NOT_SET";
    }
  }
  r.get("/api/players", authGuard, requirePerm("view_players"), async (req, res) => {
    try {
      const pool = db();
      const online = readOnlineMap() || {};
      const svId = await baPreferredSvId(pool);
      let rows = [];
      try {
        const [r2] = await pool.query(`
          SELECT
            u.steamid,
            u.name,
            u.lastseen,
            u.playtime,
            pd.Money AS money,
            (SELECT 1 FROM chsp_list c WHERE c.steamid64 = u.steamid AND c.active = 1 LIMIT 1) AS chsp_active,
            (
              SELECT r.rank FROM ba_ranks r WHERE r.steamid = u.steamid
              ORDER BY CASE WHEN r.sv_id = ? THEN 0 ELSE 1 END ASC, r.expire_time DESC, r.rank DESC LIMIT 1
            ) AS rank_id
          FROM ba_users u
          LEFT JOIN player_data pd ON pd.SteamID = u.steamid
          ORDER BY u.lastseen DESC LIMIT 2000
        `, [svId]);
        rows = r2 || [];
      } catch (e) {
        console.error("main players query error:", e.message);
      }
      const list = [];
      const seen = new Set();
      for (const row of rows) {
        let sid64 = String(row.steamid || "");
        if (!/^\d+$/.test(sid64)) {
          const m = sid64.match(/^STEAM_\d+:(\d+):(\d+)$/);
          if (m) sid64 = String(76561197960265728n + BigInt(m[2]) * 2n + BigInt(m[1]));
          else continue;
        }
        if (!sid64) continue;
        seen.add(sid64);
        const onRaw = online[sid64];
        const fresh = isOnlineEntryFresh(onRaw);
        const on = fresh ? onRaw : null;
        const nick = on ? decodeIfNeeded(on.nick || "") || sid64 : fixCrazyNick(row.name || "") || sid64;
        const isOnline = on ? on.online !== void 0 ? Boolean(on.online) : true : false;
        list.push({
          steamid64: sid64,
          steamid: steamid64ToSteamid(sid64),
          nick,
          online: isOnline,
          ping: on ? parseInt(on.ping || 0, 10) : 0,
          rank: String(row.rank_id || ""),
          rank_id: String(row.rank_id || ""),
          money: parseInt(row.money || 0, 10),
          playtime: parseInt(row.playtime || 0, 10),
          lastseen: parseInt(row.lastseen || 0, 10),
          chsp: Boolean(row.chsp_active)
        });
      }
      for (const [sid64, on] of Object.entries(online)) {
        if (!/^\d+$/.test(sid64) || seen.has(sid64)) continue;
        if (!isOnlineEntryFresh(on)) continue;
        const isOnline = on.online !== void 0 ? Boolean(on.online) : true;
        if (!isOnline) continue;
        list.push({
          steamid64: sid64,
          steamid: steamid64ToSteamid(sid64),
          nick: decodeIfNeeded(on.nick || "") || sid64,
          online: true,
          ping: parseInt(on.ping || 0, 10),
          rank: "",
          rank_id: "",
          money: 0,
          playtime: 0,
          lastseen: Math.floor(Date.now() / 1e3),
          chsp: false
        });
      }
      res.json({ ok: true, items: list });
    } catch (e) {
      console.error("players error:", e.message);
      res.status(500).json({ ok: false, error: "DB_QUERY_FAILED" });
    }
  });
  return r;
}
export {
  playersRoutes as default
};
