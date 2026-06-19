import { Router } from "express";
import { db } from "../lib/db.js";
import { requirePerm } from "../lib/roles.js";
import { authGuard } from "../lib/guard.js";
import { logAdminAction } from "../lib/helpers.js";

let _promoTablesEnsured = false;

const CODE_RE = /^[A-Z0-9_]{2,64}$/;

function normalizeCode(v) {
  return String(v || "").trim().toUpperCase().replace(/[^A-Z0-9_]/g, "");
}

function clampInt(v, max) {
  return Math.max(0, Math.min(max, parseInt(v || 0, 10) || 0));
}

function normalizeDate(v) {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  const s = String(v).trim().replace("T", " ");
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(s)) return `${s}:00`;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)) return s;
  return s.slice(0, 32);
}

function isExpired(expirationDate) {
  if (!expirationDate) return false;
  const d = new Date(String(expirationDate).replace(" ", "T"));
  return !Number.isNaN(d.getTime()) && d.getTime() < Date.now();
}

async function columnExists(table, column) {
  const [rows] = await db().query(
    "SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1",
    [table, column]
  );
  return rows.length > 0;
}

async function addColumnIfMissing(table, column, ddl) {
  if (!await columnExists(table, column)) {
    await db().query(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
  }
}

async function addIndexIfMissing(table, indexName, ddl) {
  const [rows] = await db().query(
    "SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ? LIMIT 1",
    [table, indexName]
  );
  if (!rows.length) await db().query(`ALTER TABLE ${table} ADD ${ddl}`);
}

async function ensurePromoTables() {
  if (_promoTablesEnsured) return;

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
    UNIQUE KEY uq_code (code),
    KEY idx_active (is_active),
    KEY idx_expiration (expiration_date)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

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
    KEY idx_player (steamid64),
    KEY idx_used_at (used_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await addColumnIfMissing("panel_promocodes", "donate", "INT UNSIGNED NOT NULL DEFAULT 0");
  await addColumnIfMissing("panel_promocodes", "money", "INT UNSIGNED NOT NULL DEFAULT 0");
  await addColumnIfMissing("panel_promocodes", "max_uses", "INT UNSIGNED NOT NULL DEFAULT 0");
  await addColumnIfMissing("panel_promocodes", "expiration_date", "VARCHAR(32) DEFAULT NULL");
  await addColumnIfMissing("panel_promocodes", "is_active", "TINYINT(1) NOT NULL DEFAULT 1");
  await addColumnIfMissing("panel_promocodes", "created_by", "VARCHAR(64) NOT NULL DEFAULT ''");
  await addColumnIfMissing("panel_promo_usage", "steamid32", "VARCHAR(32) DEFAULT NULL");
  await addColumnIfMissing("panel_promo_usage", "nickname", "VARCHAR(64) DEFAULT NULL");

  await addIndexIfMissing("panel_promocodes", "uq_code", "UNIQUE KEY uq_code (code)").catch(() => {});
  await addIndexIfMissing("panel_promo_usage", "uq_usage", "UNIQUE KEY uq_usage (promo_id, steamid64)").catch(() => {});

  _promoTablesEnsured = true;
}

async function safeLog(req, action, target, details = "") {
  try {
    if (req.session?.user) {
      await logAdminAction(db(), req.session.user.steamid64, action, target, details);
    }
  } catch (e) {
    console.error("promo log error:", e.message);
  }
}

function selectListSql(where = "", having = "") {
  return `SELECT
      p.id, p.code, p.donate, p.money, p.max_uses, p.expiration_date, p.is_active,
      p.created_by, p.created_at, p.updated_at,
      COUNT(pu.id) AS used_count
    FROM panel_promocodes p
    LEFT JOIN panel_promo_usage pu ON pu.promo_id = p.id
    ${where}
    GROUP BY p.id, p.code, p.donate, p.money, p.max_uses, p.expiration_date, p.is_active,
      p.created_by, p.created_at, p.updated_at
    ${having}
    ORDER BY p.created_at DESC, p.id DESC`;
}

function promosRoutes() {
  const r = Router();

  // GET /api/promos — список всех промокодов
  r.get("/api/promos", authGuard, requirePerm("view_promos"), async (req, res) => {
    try {
      await ensurePromoTables();
      const [rows] = await db().query(selectListSql());
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
      const nick = String(req.session.user?.nickname || req.session.user?.role || "Site").slice(0, 64);

      if (action === "create") {
        const code = normalizeCode(data.code);
        if (!CODE_RE.test(code)) return res.status(400).json({ ok: false, error: "BAD_CODE" });
        const donate = clampInt(data.donate, 1000000);
        const money = clampInt(data.money, 100000000);
        if (donate === 0 && money === 0) return res.status(400).json({ ok: false, error: "BAD_REWARD" });
        const maxUses = clampInt(data.max_uses, 1000000);
        const expDate = normalizeDate(data.expiration_date);
        const isActive = data.is_active === false || data.is_active === 0 || data.is_active === "0" ? 0 : 1;

        try {
          await db().query(
            `INSERT INTO panel_promocodes (code, donate, money, max_uses, expiration_date, is_active, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [code, donate, money, maxUses, expDate, isActive, nick]
          );
        } catch (e) {
          if (e.code === "ER_DUP_ENTRY") return res.status(409).json({ ok: false, error: "DUPLICATE_CODE" });
          throw e;
        }
        await safeLog(req, "PROMO_CREATE", code, `donate:${donate} money:${money} max_uses:${maxUses}`);
        return res.json({ ok: true });
      }

      if (action === "update") {
        const id = parseInt(data.id || 0, 10);
        if (!id) return res.status(400).json({ ok: false, error: "BAD_ID" });
        const donate = clampInt(data.donate, 1000000);
        const money = clampInt(data.money, 100000000);
        if (donate === 0 && money === 0) return res.status(400).json({ ok: false, error: "BAD_REWARD" });
        const maxUses = clampInt(data.max_uses, 1000000);
        const expDate = data.expiration_date !== undefined ? normalizeDate(data.expiration_date) : undefined;
        const isActive = data.is_active !== undefined ? (data.is_active === false || data.is_active === 0 || data.is_active === "0" ? 0 : 1) : undefined;

        let sql = "UPDATE panel_promocodes SET donate=?, money=?, max_uses=?";
        const params = [donate, money, maxUses];
        if (expDate !== undefined) { sql += ", expiration_date=?"; params.push(expDate); }
        if (isActive !== undefined) { sql += ", is_active=?"; params.push(isActive); }
        sql += " WHERE id=? LIMIT 1";
        params.push(id);

        const [result] = await db().query(sql, params);
        if (!result.affectedRows) return res.status(404).json({ ok: false, error: "NOT_FOUND" });
        await safeLog(req, "PROMO_UPDATE", String(id), `donate:${donate} money:${money} max_uses:${maxUses}`);
        return res.json({ ok: true });
      }

      if (action === "toggle") {
        const id = parseInt(data.id || 0, 10);
        if (!id) return res.status(400).json({ ok: false, error: "BAD_ID" });
        const [result] = await db().query("UPDATE panel_promocodes SET is_active = IF(is_active = 1, 0, 1) WHERE id=? LIMIT 1", [id]);
        if (!result.affectedRows) return res.status(404).json({ ok: false, error: "NOT_FOUND" });
        await safeLog(req, "PROMO_TOGGLE", String(id), "");
        return res.json({ ok: true });
      }

      if (action === "delete") {
        const id = parseInt(data.id || 0, 10);
        if (!id) return res.status(400).json({ ok: false, error: "BAD_ID" });
        await db().query("DELETE FROM panel_promo_usage WHERE promo_id=?", [id]);
        const [result] = await db().query("DELETE FROM panel_promocodes WHERE id=? LIMIT 1", [id]);
        if (!result.affectedRows) return res.status(404).json({ ok: false, error: "NOT_FOUND" });
        await safeLog(req, "PROMO_DELETE", String(id), "");
        return res.json({ ok: true });
      }

      if (action === "reset_usage") {
        const id = parseInt(data.id || 0, 10);
        if (!id) return res.status(400).json({ ok: false, error: "BAD_ID" });
        await db().query("DELETE FROM panel_promo_usage WHERE promo_id=?", [id]);
        await safeLog(req, "PROMO_RESET_USAGE", String(id), "");
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

export { ensurePromoTables, isExpired, normalizeCode, promosRoutes as default };
