import mysql from "mysql2/promise";
let pool = null;
function initPool(cfg) {
  pool = mysql.createPool({
    host: cfg.DB_HOST,
    user: cfg.DB_USER,
    password: cfg.DB_PASS,
    database: cfg.DB_NAME,
    charset: "utf8mb4",
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    connectTimeout: 2e4,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
    maxIdle: 10,
    idleTimeout: 6e4,
    supportBigNumbers: true,
    bigNumberStrings: true
  });
  return pool;
}
function db() {
  if (!pool) throw new Error("DB pool not initialized");
  return pool;
}
const _colCache = new Map();
function invalidateColumnCache() {
  _colCache.clear();
}
async function hasColumnCached(table, col) {
  const key = table + "." + col;
  if (_colCache.has(key)) return _colCache.get(key);
  let result = false;
  try {
    const [rows] = await db().query(
      "SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1",
      [table, col]
    );
    result = rows.length > 0;
    _colCache.set(key, result);
  } catch {
  }
  return result;
}
async function hasColumn(table, col) {
  const [rows] = await db().query(
    "SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1",
    [table, col]
  );
  return rows.length > 0;
}
async function ensurePanelSchema() {
  const conn = db();
  await conn.query(`CREATE TABLE IF NOT EXISTS web_users (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    steamid64 VARCHAR(20) NOT NULL,
    nickname VARCHAR(32) NULL DEFAULT '',
    role VARCHAR(64) NOT NULL DEFAULT 'Главный Администратор',
    password_hash VARCHAR(255) NOT NULL,
    added_at INT NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    UNIQUE KEY uq_web_users_steamid64 (steamid64)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`).catch(() => {
  });
  await conn.query(`CREATE TABLE IF NOT EXISTS chsp_list (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    steamid64 VARCHAR(20) NOT NULL,
    steamid VARCHAR(32) DEFAULT NULL,
    nickname VARCHAR(64) DEFAULT NULL,
    ip VARCHAR(45) DEFAULT NULL,
    reason VARCHAR(255) DEFAULT NULL,
    added_by VARCHAR(64) DEFAULT NULL,
    active TINYINT(1) NOT NULL DEFAULT 1,
    added_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_chsp_steamid64 (steamid64),
    KEY idx_chsp_active (active),
    KEY idx_chsp_ip (ip)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`).catch(() => {
  });
  if (!await hasColumn("web_users", "nickname")) {
    await conn.query("ALTER TABLE web_users ADD COLUMN nickname VARCHAR(32) NULL DEFAULT '' AFTER steamid64").catch(() => {
    });
  }
  await conn.query(`CREATE TABLE IF NOT EXISTS panel_models (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    name VARCHAR(255) NOT NULL DEFAULT '',
    model_path VARCHAR(255) NOT NULL,
    workshop_id BIGINT UNSIGNED DEFAULT NULL,
    icon_url VARCHAR(512) DEFAULT NULL,
    size_bytes BIGINT DEFAULT NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_by VARCHAR(64) DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    hidden_by VARCHAR(64) DEFAULT NULL,
    hidden_at TIMESTAMP NULL DEFAULT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_model_path (model_path)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`).catch(() => {
  });
  const modelCols = [
    ["panel_models", "name", "VARCHAR(255) NOT NULL DEFAULT '' AFTER id"],
    ["panel_models", "title", "VARCHAR(255) NOT NULL DEFAULT '' AFTER model_path"],
    ["panel_models", "workshop_id", "BIGINT UNSIGNED DEFAULT NULL AFTER title"],
    ["panel_models", "icon_url", "VARCHAR(512) DEFAULT NULL AFTER workshop_id"],
    ["panel_models", "size_bytes", "BIGINT DEFAULT NULL AFTER icon_url"],
    ["panel_models", "is_active", "TINYINT(1) NOT NULL DEFAULT 1 AFTER size_bytes"],
    ["panel_models", "created_by", "VARCHAR(64) DEFAULT NULL AFTER is_active"],
    ["panel_models", "hidden_by", "VARCHAR(64) DEFAULT NULL AFTER updated_at"],
    ["panel_models", "hidden_at", "TIMESTAMP NULL DEFAULT NULL AFTER hidden_by"]
  ];
  for (const [tbl, col, def] of modelCols) {
    if (!await hasColumn(tbl, col)) {
      await conn.query(`ALTER TABLE ${tbl} ADD COLUMN ${col} ${def}`).catch(() => {
      });
    }
  }
  await conn.query(`CREATE TABLE IF NOT EXISTS panel_player_models (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    steamid32 VARCHAR(32) NOT NULL,
    model_id INT UNSIGNED NOT NULL,
    issued_by VARCHAR(64) NOT NULL DEFAULT '',
    issued_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    given_by VARCHAR(64) DEFAULT NULL,
    given_at TIMESTAMP NULL DEFAULT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_player_model (steamid32, model_id),
    KEY idx_player (steamid32),
    KEY idx_model (model_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`).catch(() => {
  });
  const pmCols = [
    ["panel_player_models", "steamid32", "VARCHAR(32) NOT NULL"],
    ["panel_player_models", "model_id", "INT UNSIGNED NOT NULL"],
    ["panel_player_models", "issued_by", "VARCHAR(64) NOT NULL DEFAULT ''"],
    ["panel_player_models", "issued_at", "TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP"],
    ["panel_player_models", "given_by", "VARCHAR(64) DEFAULT NULL"],
    ["panel_player_models", "given_at", "TIMESTAMP NULL DEFAULT NULL"]
  ];
  for (const [tbl, col, def] of pmCols) {
    if (!await hasColumn(tbl, col)) {
      await conn.query(`ALTER TABLE ${tbl} ADD COLUMN ${col} ${def}`).catch(() => {
      });
    }
  }
  await conn.query(`CREATE TABLE IF NOT EXISTS admin_logs (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    admin_steamid64 VARCHAR(20) NOT NULL,
    action VARCHAR(64) NOT NULL,
    target VARCHAR(255) DEFAULT NULL,
    details TEXT DEFAULT NULL,
    timestamp INT NOT NULL,
    PRIMARY KEY (id),
    KEY idx_admin (admin_steamid64),
    KEY idx_ts (timestamp)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`).catch(() => {
  });
  await conn.query(`CREATE TABLE IF NOT EXISTS panel_weapons (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    name VARCHAR(255) NOT NULL DEFAULT '',
    weapon_class VARCHAR(255) NOT NULL,
    workshop_id BIGINT UNSIGNED DEFAULT NULL,
    icon_url VARCHAR(512) DEFAULT NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_by VARCHAR(64) DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_weapon_class (weapon_class)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`).catch(() => {
  });
  await conn.query(`CREATE TABLE IF NOT EXISTS panel_player_weapons (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    steamid32 VARCHAR(32) NOT NULL,
    weapon_id INT UNSIGNED NOT NULL,
    issued_by VARCHAR(64) NOT NULL DEFAULT '',
    issued_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_player_weapon (steamid32, weapon_id),
    KEY idx_player (steamid32),
    KEY idx_weapon (weapon_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`).catch(() => {
  });
  await conn.query(`CREATE TABLE IF NOT EXISTS chsp_ip_list (
    id INT NOT NULL AUTO_INCREMENT,
    ip VARCHAR(45) NOT NULL,
    reason VARCHAR(255) DEFAULT NULL,
    added_by VARCHAR(32) DEFAULT NULL,
    added_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    active TINYINT(1) NOT NULL DEFAULT 1,
    PRIMARY KEY (id),
    UNIQUE KEY ip (ip)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`).catch(() => {
  });

  
  await conn.query(`CREATE TABLE IF NOT EXISTS panel_jobs (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    name VARCHAR(255) NOT NULL DEFAULT '',
    job_command VARCHAR(255) NOT NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_by VARCHAR(64) DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_job_command (job_command)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`).catch(() => {
  });

  await conn.query(`CREATE TABLE IF NOT EXISTS panel_player_jobs (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    steamid32 VARCHAR(32) NOT NULL,
    job_id INT UNSIGNED NOT NULL,
    given_by VARCHAR(64) NOT NULL DEFAULT '',
    given_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_player_job (steamid32, job_id),
    KEY idx_player (steamid32),
    KEY idx_job (job_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`).catch(() => {
  });

  await conn.query(`CREATE TABLE IF NOT EXISTS panel_player_qmenu (
    steamid32 VARCHAR(32) NOT NULL,
    access_type VARCHAR(32) NOT NULL,
    issued_by VARCHAR(64) NOT NULL DEFAULT '',
    issued_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (steamid32, access_type),
    KEY idx_player (steamid32)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`).catch(() => {
  });

  invalidateColumnCache();
}
export {
  db,
  ensurePanelSchema,
  hasColumnCached,
  initPool,
  invalidateColumnCache
};
