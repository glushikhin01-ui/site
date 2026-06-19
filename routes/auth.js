import { Router } from "express";
import bcrypt from "bcryptjs";
import { db } from "../lib/db.js";
import { webNormalizeRole, webRoleLabel, getUserRole, loadPermissions, PERMISSION_KEYS, hasPerm } from "../lib/roles.js";
import { steamGetPersonaname } from "../lib/helpers.js";
const MAX_PASSWORD_LENGTH = 200;
function authRoutes(cfg, loginLimiter) {
  const r = Router();
  r.post("/api/login", loginLimiter, async (req, res) => {
    const { steamid64, password } = req.body || {};
    if (!steamid64 || !password) return res.status(400).json({ ok: false, error: "EMPTY_FIELDS" });
    const passwordStr = String(password).trim();
    if (passwordStr.length > MAX_PASSWORD_LENGTH) return res.status(400).json({ ok: false, error: "BAD_LOGIN" });
    const steamidStr = String(steamid64).trim();
    if (!/^\d{17}$/.test(steamidStr)) return res.status(400).json({ ok: false, error: "BAD_LOGIN" });
    try {
      const [rows] = await db().query(
        "SELECT id, steamid64, role, password_hash, COALESCE(nickname,'') AS nickname FROM web_users WHERE steamid64 = ? LIMIT 1",
        [steamidStr]
      );
      const user = rows[0];
      if (!user) {
        await bcrypt.hash("dummy_timing_protection", 10);
        return res.status(401).json({ ok: false, error: "BAD_LOGIN" });
      }
      const valid = await bcrypt.compare(passwordStr, user.password_hash);
      if (!valid) return res.status(401).json({ ok: false, error: "BAD_LOGIN" });
      let nickname = String(user.nickname || "").trim();
      if (!nickname) {
        const pn = await steamGetPersonaname(cfg.STEAM_API_KEY, user.steamid64);
        if (pn) {
          nickname = pn;
          await db().query("UPDATE web_users SET nickname = ? WHERE steamid64 = ? LIMIT 1", [nickname, user.steamid64]).catch(() => {
          });
        }
      }
      req.session.regenerate((err) => {
        if (err) return res.status(500).json({ ok: false, error: "SESSION_ERROR" });
        req.session.user = {
          id: user.id,
          steamid64: user.steamid64,
          role: webNormalizeRole(user.role),
          nickname,
          auth: "password",
          time: Math.floor(Date.now() / 1e3)
        };
        res.json({ ok: true });
      });
    } catch (e) {
      console.error("login error:", e.message);
      return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
    }
  });
  r.get("/api/steam_login", (req, res) => {
    let next = String(req.query.next || "").trim() || "index.html";
    if (!/^[a-zA-Z0-9_\-\.]+\.html$/.test(next)) next = "index.html";
    const baseUrl = cfg.BASE_URL || `${req.protocol}://${req.get("host")}`;
    const realm = baseUrl + "/";
    const returnTo = baseUrl + "/api/steam_callback?next=" + encodeURIComponent(next);
    const params = new URLSearchParams({
      "openid.ns": "http://specs.openid.net/auth/2.0",
      "openid.mode": "checkid_setup",
      "openid.return_to": returnTo,
      "openid.realm": realm,
      "openid.identity": "http://specs.openid.net/auth/2.0/identifier_select",
      "openid.claimed_id": "http://specs.openid.net/auth/2.0/identifier_select"
    });
    res.redirect("https://steamcommunity.com/openid/login?" + params.toString());
  });
  r.get("/api/steam_callback", async (req, res) => {
    const fail = (msg) => res.redirect("/login.html?e=" + encodeURIComponent(msg));
    const mode = req.query["openid.mode"] || req.query.openid_mode || "";
    if (mode !== "id_res") return fail("STEAM_AUTH_CANCEL");
    const claimed = req.query["openid.claimed_id"] || req.query.openid_claimed_id || "";
    const m = claimed.match(/https?:\/\/steamcommunity\.com\/openid\/id\/(\d{17})/);
    if (!m) return fail("STEAM_BAD_ID");
    const steamid64 = m[1];
    const check = { ...req.query };
    check["openid.mode"] = "check_authentication";
    try {
      const r2 = await fetch("https://steamcommunity.com/openid/login", {
        method: "POST",
        body: new URLSearchParams(check),
        signal: AbortSignal.timeout(8e3)
      });
      if (!r2.ok) return fail("STEAM_VERIFY_FAIL");
      const text = await r2.text();
      if (!text.includes("is_valid:true")) return fail("STEAM_INVALID");
    } catch {
      return fail("STEAM_VERIFY_FAIL");
    }
    try {
      const [rows] = await db().query(
        "SELECT id, role, COALESCE(nickname,'') AS nickname FROM web_users WHERE steamid64 = ? LIMIT 1",
        [steamid64]
      );
      if (!rows.length) return fail("NOT_ALLOWED");
      const { id, role, nickname: rawNick } = rows[0];
      let nickname = String(rawNick || "").trim();
      if (!nickname) {
        const pn = await steamGetPersonaname(cfg.STEAM_API_KEY, steamid64);
        if (pn) {
          nickname = pn;
          await db().query("UPDATE web_users SET nickname = ? WHERE steamid64 = ? LIMIT 1", [nickname, steamid64]).catch(() => {
          });
        }
      }
      req.session.regenerate((err) => {
        if (err) return fail("SESSION_ERROR");
        req.session.user = {
          id,
          steamid64,
          role: webNormalizeRole(role),
          nickname,
          auth: "steam",
          time: Math.floor(Date.now() / 1e3)
        };
        let next = String(req.query.next || "index.html").trim();
        if (!/^[a-zA-Z0-9_\-\.]+\.html$/.test(next)) next = "index.html";
        res.redirect("/" + next);
      });
    } catch (e) {
      console.error("steam_callback db error:", e.message);
      return fail("INTERNAL_ERROR");
    }
  });
  r.post("/api/logout", (req, res) => {
    req.session.destroy(() => {
      res.clearCookie("connect.sid");
      res.json({ ok: true });
    });
  });
  r.get("/api/me", async (req, res) => {
    if (!req.session?.user) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
    const u = req.session.user;
    let rows = [];
    let dbError = false;
    try {
      const [r2] = await db().query(
        "SELECT role, COALESCE(nickname,'') AS nickname FROM web_users WHERE steamid64 = ? LIMIT 1",
        [u.steamid64]
      );
      rows = r2;
    } catch (e) {
      console.error("/api/me db error:", e.message);
      dbError = true;
    }
    if (!dbError && !rows.length) {
      req.session.destroy(() => {
      });
      return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
    }
    if (!dbError && rows.length) {
      const freshRole = webNormalizeRole(rows[0].role);
      if (freshRole !== u.role) req.session.user.role = freshRole;
      const freshNick = String(rows[0].nickname || "").trim();
      if (freshNick && freshNick !== u.nickname) req.session.user.nickname = freshNick;
    }
    const freshUser = req.session.user;
    const role = freshUser.role;
    const allPerms = loadPermissions();
    const perms = {};
    for (const k of PERMISSION_KEYS) {
      perms[k] = role === "KP" ? true : Boolean(allPerms[role]?.[k]);
    }
    res.json({
      ok: true,
      user: {
        id: freshUser.id,
        steamid64: freshUser.steamid64,
        role: freshUser.role,
        nickname: freshUser.nickname || "",
        role_label: webRoleLabel(freshUser.role),
        auth: freshUser.auth || "unknown"
      },
      perms
    });
  });
  return r;
}
export {
  authRoutes as default
};
