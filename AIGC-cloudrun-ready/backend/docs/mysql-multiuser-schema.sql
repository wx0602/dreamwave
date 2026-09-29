CREATE TABLE IF NOT EXISTS aigc_accounts (
  user_id VARCHAR(64) PRIMARY KEY,
  account VARCHAR(191) NOT NULL UNIQUE,
  nickname VARCHAR(64) NOT NULL DEFAULT '',
  password_hash VARCHAR(255) NOT NULL,
  password_salt VARCHAR(128) NOT NULL,
  password_scheme VARCHAR(32) NOT NULL DEFAULT 'scrypt-v1',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  last_login_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS aigc_auth_sessions (
  token_hash CHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  last_seen_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_aigc_auth_user (user_id),
  INDEX idx_aigc_auth_expires (expires_at),
  CONSTRAINT fk_aigc_auth_user FOREIGN KEY (user_id) REFERENCES aigc_accounts(user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS aigc_user_states (
  user_id VARCHAR(64) PRIMARY KEY,
  version BIGINT UNSIGNED NOT NULL DEFAULT 1,
  state_json LONGTEXT NOT NULL,
  api_key TEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_aigc_state_user FOREIGN KEY (user_id) REFERENCES aigc_accounts(user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS aigc_goal_drafts (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
