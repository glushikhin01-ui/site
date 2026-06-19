import { Router } from "express";
import { db } from "../lib/db.js";
import { requirePerm } from "../lib/roles.js";
import { authGuard } from "../lib/guard.js";
import { logAdminAction } from "../lib/helpers.js";

let _promoTableEnsured = false;
let _promoUsageTableEnsured = false;

async function ensurePromoTables() {
  try {
    if (!_promoTableEnsured) {
      await db().query(`CREATE TABLE IF NOT EXISTS panel_promocodes (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT,
        code VARCHAR(64) NOT NULL,
        donate INT UNSIGNED NOT NULL DEFAULT 0,
        money INT UNSIGNED NOT NULL DEFAULT 0,
        max_uses INT UNSIGNED NOT NULL DEFAULT 0,
        expiration_date VARCHAR(32) DEFAULT NULL,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        created_by VARCHAR(64) NOT NULL DEFAULT '',
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_code (code)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
      _promoTableEnsured = true;
    }
    if (!_promoUsageTableEnsured) {
      await db().query(`CREATE TABLE IF NOT EXISTS panel_promo_usage (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        promo_id INT UNSIGNED NOT NULL,
        steamid64 VARCHAR(20) NOT NULL,
        steamid32 VARCHAR(32) DEFAULT NULL,
        nickname VARCHAR(64) DEFAULT NULL,
        used_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_usage (promo_id, steamid64),
        KEY idx_promo (promo_id),
        KEY idx_player (steamid64)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
      _promoUsageTableEnsured = true;
    }
  } catch (e) {
    console.error("ensurePromoTables failed:", e.message);
  }
}

function promosRoutes() {
  const r = Router();

  // GET /api/promos — список всех промокодов
  r.get("/api/promos", authGuard, requirePerm("view_promos"), async (req, res) => {
    try {
      await ensurePromoTables();
      const [rows] = await db().query(
        `SELECT p.*, COUNT(pu.id) AS used_count
         FROM panel_promocodes p
         LEFT JOIN panel_promo_usage pu ON pu.promo_id = p.id
         GROUP BY p.id
         ORDER BY p.created_at DESC`
      );
      res.json({ ok: true, items: rows });
    } catch (e) {
      console.error("promos get error:", e.message);
      res.status(500).json({ ok: false, error: "DB_ERROR" });
    }
  });

  // GET /api/promos/usage — кто активировал конкретный промокод
  r.get("/api/promos/usage", authGuard, requirePerm("view_promos"), async (req, res) => {
    try {
      await ensurePromoTables();
      const promoId = parseInt(req.query.promo_id || 0, 10);
      if (!promoId) return res.json({ ok: true, items: [] });
      const [rows] = await db().query(
        `SELECT steamid64, steamid32, nickname, UNIX_TIMESTAMP(used_at) AS used_at
         FROM panel_promo_usage WHERE promo_id = ? ORDER BY used_at DESC`,
        [promoId]
      );
      res.json({ ok: true, items: rows });
    } catch (e) {
      console.error("promos usage error:", e.message);
      res.status(500).json({ ok: false, error: "DB_ERROR" });
    }
  });

  // POST /api/promos — CRUD
  r.post("/api/promos", authGuard, requirePerm("manage_promos"), async (req, res) => {
    try {
      await ensurePromoTables();
      const data = req.body || {};
      const action = String(data.action || "").trim();
      const nick = req.session.user?.nickname || "Site";

      if (action === "create") {
        const code = String(data.code || "").trim().toUpperCase().replace(/[^A-Z0-9_]/g, "");
        if (!code || code.length < 2 || code.length > 64) return res.status(400).json({ ok: false, error: "BAD_CODE" });
        const donate = Math.max(0, Math.min(1000000, parseInt(data.donate || 0, 10) || 0));
        const money = Math.max(0, Math.min(100000000, parseInt(data.money || 0, 10) || 0));
        const maxUses = Math.max(0, Math.min(1000000, parseInt(data.max_uses || 0, 10) || 0));
        const expDate = data.expiration_date ? String(data.expiration_date).trim() || null : null;
        const isActive = data.is_active !== false ? 1 : 0;

        await db().query(
          `INSERT INTO panel_promocodes (code, donate, money, max_uses, expiration_date, is_active, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE donate=VALUES(donate), money=VALUES(money), max_uses=VALUES(max_uses),
           expiration_date=VALUES(expiration_date), is_active=VALUES(is_active), updated_at=CURRENT_TIMESTAMP`,
          [code, donate, money, maxUses, expDate, isActive, nick]
        );
        if (req.session.user) {
          await logAdminAction(db(), req.session.user.steamid64, "PROMO_CREATE", code, `donate:${donate} money:${money}`);
        }
        return res.json({ ok: true });
      }

      if (action === "update") {
        const id = parseInt(data.id || 0, 10);
        if (!id) return res.status(400).json({ ok: false, error: "BAD_ID" });
        const donate = Math.max(0, Math.min(1000000, parseInt(data.donate || 0, 10) || 0));
        const money = Math.max(0, Math.min(100000000, parseInt(data.money || 0, 10) || 0));
        const maxUses = Math.max(0, Math.min(1000000, parseInt(data.max_uses || 0, 10) || 0));
        const expDate = data.expiration_date !== undefined ? (String(data.expiration_date).trim() || null) : undefined;
        const isActive = data.is_active !== undefined ? (data.is_active ? 1 : 0) : undefined;

        let sql = "UPDATE panel_promocodes SET donate=?, money=?, max_uses=?";
        const params = [donate, money, maxUses];
        if (expDate !== undefined) { sql += ", expiration_date=?"; params.push(expDate); }
        if (isActive !== undefined) { sql += ", is_active=?"; params.push(isActive); }
        sql += " WHERE id=? LIMIT 1";
        params.push(id);

        await db().query(sql, params);
        if (req.session.user) {
          await logAdminAction(db(), req.session.user.steamid64, "PROMO_UPDATE", String(id), `donate:${donate} money:${money}`);
        }
        return res.json({ ok: true });
      }

      if (action === "toggle") {
        const id = parseInt(data.id || 0, 10);
        if (!id) return res.status(400).json({ ok: false, error: "BAD_ID" });
        await db().query("UPDATE panel_promocodes SET is_active = NOT is_active WHERE id=? LIMIT 1", [id]);
        return res.json({ ok: true });
      }

      if (action === "delete") {
        const id = parseInt(data.id || 0, 10);
        if (!id) return res.status(400).json({ ok: false, error: "BAD_ID" });
        await db().query("DELETE FROM panel_promo_usage WHERE promo_id=?", [id]);
        await db().query("DELETE FROM panel_promocodes WHERE id=? LIMIT 1", [id]);
        if (req.session.user) {
          await logAdminAction(db(), req.session.user.steamid64, "PROMO_DELETE", String(id), "");
        }
        return res.json({ ok: true });
      }

      if (action === "reset_usage") {
        const id = parseInt(data.id || 0, 10);
        if (!id) return res.status(400).json({ ok: false, error: "BAD_ID" });
        await db().query("DELETE FROM panel_promo_usage WHERE promo_id=?", [id]);
        if (req.session.user) {
          await logAdminAction(db(), req.session.user.steamid64, "PROMO_RESET_USAGE", String(id), "");
        }
        return res.json({ ok: true });
      }

      return res.status(400).json({ ok: false, error: "UNKNOWN_ACTION" });
    } catch (e) {
      console.error("promos post error:", e.message);
      res.status(500).json({ ok: false, error: "DB_ERROR" });
    }
  });

  return r;
}

export { promosRoutes as default };
