import { Router } from "express";
import { authGuard } from "../lib/guard.js";
import {
  loadLocks,
  saveLocks,
  publicLocksSnapshot,
  LOCKABLE_PAGES
} from "../lib/locks.js";
import { PERMISSION_KEYS, PERMISSION_GROUPS, PERMISSION_LABELS } from "../lib/roles.js";

function requireKP(req, res, next) {
  if (!req.session?.user) {
    return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  }
  if (req.session.user.role !== "KP") {
    return res.status(403).json({ ok: false, error: "KP_ONLY" });
  }
  next();
}

function locksRoutes() {
  const r = Router();

  r.get("/api/locks", authGuard, (req, res) => {
    const snap = publicLocksSnapshot(req.session.user);
    res.json({
      ...snap,
      keys: PERMISSION_KEYS,
      groups: PERMISSION_GROUPS,
      labels: PERMISSION_LABELS,
      pages: LOCKABLE_PAGES,
      pages_state: snap.pages
    });
  });

  r.get("/api/locks/state", authGuard, (req, res) => {
    res.json(publicLocksSnapshot(req.session.user));
  });

  r.post("/api/locks", authGuard, requireKP, (req, res) => {
    const body = req.body || {};
    const current = loadLocks();

    if (body.mode === "all" || body.mode === "others") {
      current.mode = body.mode;
    }
    if (body.permissions && typeof body.permissions === "object") {
      current.permissions = {};
      for (const k of PERMISSION_KEYS) {
        current.permissions[k] = !!body.permissions[k];
      }
    }
    if (body.pages && typeof body.pages === "object") {
      current.pages = {};
      for (const p of LOCKABLE_PAGES) {
        current.pages[p.key] = !!body.pages[p.key];
      }
    }
    if (typeof body.note === "string") {
      current.note = String(body.note).slice(0, 200);
    }
    current.updated_at = Math.floor(Date.now() / 1000);
    current.updated_by =
      req.session.user?.nickname || req.session.user?.steamid64 || "KP";

    const ok = saveLocks(current);
    if (!ok) return res.status(500).json({ ok: false, error: "SAVE_FAILED" });
    const snap = publicLocksSnapshot(req.session.user);
    res.json({
      ok: true,
      locks: Object.assign({}, snap, {
        pages: LOCKABLE_PAGES,
        pages_state: snap.pages
      })
    });
  });

  r.post("/api/locks/clear", authGuard, requireKP, (req, res) => {
    const current = loadLocks();
    current.permissions = {};
    current.pages = {};
    current.updated_at = Math.floor(Date.now() / 1000);
    current.updated_by =
      req.session.user?.nickname || req.session.user?.steamid64 || "KP";
    const ok = saveLocks(current);
    if (!ok) return res.status(500).json({ ok: false, error: "SAVE_FAILED" });
    const snap = publicLocksSnapshot(req.session.user);
    res.json({
      ok: true,
      locks: Object.assign({}, snap, {
        pages: LOCKABLE_PAGES,
        pages_state: snap.pages
      })
    });
  });

  return r;
}

export { locksRoutes as default };
