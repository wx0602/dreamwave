const env = require("../config/env");

let pool = null;

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS aigc_accounts (
    user_id VARCHAR(64) PRIMARY KEY,
    account VARCHAR(191) NOT NULL UNIQUE,
    nickname VARCHAR(64) NOT NULL DEFAULT '',
    password_hash VARCHAR(255) NOT NULL,
    password_salt VARCHAR(128) NOT NULL,
    password_scheme VARCHAR(32) NOT NULL DEFAULT 'scrypt-v1',
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    last_login_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS aigc_auth_sessions (
    token_hash CHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL,
    expires_at DATETIME(3) NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    last_seen_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX idx_aigc_auth_user (user_id),
    INDEX idx_aigc_auth_expires (expires_at),
    CONSTRAINT fk_aigc_auth_user FOREIGN KEY (user_id) REFERENCES aigc_accounts(user_id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS aigc_user_states (
    user_id VARCHAR(64) PRIMARY KEY,
    version BIGINT UNSIGNED NOT NULL DEFAULT 1,
    state_json LONGTEXT NOT NULL,
    api_key TEXT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    CONSTRAINT fk_aigc_state_user FOREIGN KEY (user_id) REFERENCES aigc_accounts(user_id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS aigc_goal_drafts (
    draft_id CHAR(36) PRIMARY KEY,
    owner_user_id VARCHAR(64) NULL,
    owner_client_id VARCHAR(191) NOT NULL,
    revision INT UNSIGNED NOT NULL,
    status VARCHAR(32) NOT NULL,
    draft_json LONGTEXT NOT NULL,
    expires_at DATETIME(3) NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    INDEX idx_aigc_draft_owner_user (owner_user_id),
    INDEX idx_aigc_draft_owner_client (owner_client_id),
    INDEX idx_aigc_draft_expires (expires_at),
    CONSTRAINT fk_aigc_draft_user FOREIGN KEY (owner_user_id) REFERENCES aigc_accounts(user_id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
];

function connectionOptions() {
  if (env.mysql.url) {
    const parsed = new URL(env.mysql.url);
    return {
      host: parsed.hostname,
      port: Number(parsed.port || 3306),
      user: decodeURIComponent(parsed.username),
      password: decodeURIComponent(parsed.password),
      database: decodeURIComponent(parsed.pathname.replace(/^\//, "")) || "tcb",
    };
  }
  return {
    host: env.mysql.host,
    port: env.mysql.port,
    user: env.mysql.user,
    password: env.mysql.password,
    database: env.mysql.database,
  };
}

function getPool() {
  if (!env.persistence.isMysql) return null;
  if (!pool) {
    // Loaded lazily so local file-mode tests do not require a live database.
    const mysql = require("mysql2/promise");
    pool = mysql.createPool({
      ...connectionOptions(),
      waitForConnections: true,
      connectionLimit: env.mysql.connectionLimit,
      maxIdle: env.mysql.connectionLimit,
      idleTimeout: 60000,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0,
      charset: "utf8mb4",
    });
  }
  return pool;
}

async function initializeMysql() {
  if (!env.persistence.isMysql) return;
  const connection = await getPool().getConnection();
  try {
    await connection.query("SELECT 1");
    if (env.mysql.autoMigrate) {
      for (const statement of SCHEMA_STATEMENTS) await connection.query(statement);
    }
  } finally {
    connection.release();
  }
}

async function closeMysql() {
  if (!pool) return;
  const current = pool;
  pool = null;
  await current.end();
}

module.exports = {
  SCHEMA_STATEMENTS,
  getPool,
  initializeMysql,
  closeMysql,
};
