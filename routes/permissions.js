import { Router } from "express";
import {
  requirePerm,
  webRolesDef,
  isBuiltinRole,
  PERMISSION_KEYS,
  PERMISSION_GROUPS,
  PERMISSION_LABELS,
  loadPermissions,
  savePermissions,
  addRole,
  updateRole,
  deleteRole,
  webNormalizeRole
} from "../lib/roles.js";
import { authGuard } from "../lib/guard.js";
function permissionsRoutes() {
  const r = Router();
  function rolesPayload() {
    return Object.entries(webRolesDef()).map(([k, def]) => ({
      key: k,
      label: String(def.label),
      level: def.level,
      builtin: !!def.builtin
    }));
  }
  r.get("/api/permissions", authGuard, requirePerm("manage_permissions"), (req, res) => {
    res.json({
      ok: true,
      roles: rolesPayload(),
      keys: PERMISSION_KEYS,
      groups: PERMISSION_GROUPS,
      labels: PERMISSION_LABELS,
      perms: loadPermissions()
    });
  });
  r.post("/api/permissions", authGuard, requirePerm("manage_permissions"), (req, res) => {
    const data = req.body;
    if (!data?.perms || typeof data.perms !== "object") return res.status(400).json({ ok: false, error: "BAD_PAYLOAD" });
    const ok = savePermissions(data.perms);
    if (!ok) return res.status(500).json({ ok: false, error: "SAVE_FAILED" });
    res.json({ ok: true });
  });
  r.post("/api/roles", authGuard, requirePerm("manage_permissions"), (req, res) => {
    const { key, label, level } = req.body || {};
    const result = addRole({ key, label, level });
    if (!result.ok) return res.status(400).json(result);
    res.json({ ok: true, roles: rolesPayload(), perms: loadPermissions() });
  });
  r.put("/api/roles", authGuard, requirePerm("manage_permissions"), (req, res) => {
    const { key, label, level } = req.body || {};
    if (isBuiltinRole(String(key || "").trim())) return res.status(400).json({ ok: false, error: "ROLE_IS_BUILTIN" });
    const result = updateRole(key, { label, level });
    if (!result.ok) return res.status(400).json(result);
    res.json({ ok: true, roles: rolesPayload() });
  });
  r.delete("/api/roles", authGuard, requirePerm("manage_permissions"), (req, res) => {
    const key = String(req.query.key || req.body?.key || "").trim();
    if (isBuiltinRole(key)) return res.status(400).json({ ok: false, error: "ROLE_IS_BUILTIN" });
    if (webNormalizeRole(req.session.user?.role) === key) {
      return res.status(400).json({ ok: false, error: "CANNOT_DELETE_OWN_ROLE" });
    }
    const result = deleteRole(key);
    if (!result.ok) return res.status(400).json(result);
    res.json({ ok: true, roles: rolesPayload(), perms: loadPermissions() });
  });
  return r;
}
export {
  permissionsRoutes as default
};
