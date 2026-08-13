CREATE TABLE users (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  nickname VARCHAR(64) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE agents (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  role_id VARCHAR(32) NOT NULL,
  agent_name VARCHAR(64) NOT NULL,
  story_tone VARCHAR(128) NOT NULL,
  speech_style VARCHAR(128) NOT NULL,
  personality VARCHAR(255) NOT NULL,
  current_chapter VARCHAR(128) NOT NULL,
  current_stage VARCHAR(64) NOT NULL,
  emotion VARCHAR(64) NOT NULL,
  arc_id VARCHAR(32) NOT NULL,
  arc_label VARCHAR(32) NOT NULL,
  memory_count INT NOT NULL DEFAULT 0,
  identity_file_path VARCHAR(255),
  memory_file_path VARCHAR(255),
  status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_agents_user_id (user_id)
);

CREATE TABLE goals (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  agent_id BIGINT NOT NULL,
  title VARCHAR(255) NOT NULL,
  deadline_text VARCHAR(64) NOT NULL,
  daily_available_time VARCHAR(64) NOT NULL,
  stage_no INT NOT NULL DEFAULT 1,
  status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
  prompt_required TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_goals_user_status (user_id, status)
);

CREATE TABLE tasks (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  goal_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  agent_id BIGINT NOT NULL,
  task_type VARCHAR(32) NOT NULL,
  title VARCHAR(255) NOT NULL,
  estimate_minutes INT,
  reward_growth INT NOT NULL DEFAULT 0,
  reward_resource INT NOT NULL DEFAULT 0,
  status VARCHAR(32) NOT NULL DEFAULT 'TODO',
  completed_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_tasks_goal_status (goal_id, status),
  INDEX idx_tasks_user_created (user_id, created_at)
);

CREATE TABLE story_entries (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  agent_id BIGINT NOT NULL,
  goal_id BIGINT NULL,
  task_id BIGINT NULL,
  story_type VARCHAR(64) NOT NULL,
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  llm_provider VARCHAR(64),
  llm_model VARCHAR(64),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_story_agent_created (agent_id, created_at)
);

CREATE TABLE agent_memories (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  agent_id BIGINT NOT NULL,
  goal_id BIGINT NULL,
  task_id BIGINT NULL,
  story_entry_id BIGINT NULL,
  memory_type VARCHAR(64) NOT NULL,
  title VARCHAR(255) NOT NULL,
  memory_summary VARCHAR(255) NOT NULL,
  reward_text VARCHAR(255),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_memories_agent_created (agent_id, created_at)
);

CREATE TABLE season_archives (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  agent_id BIGINT NOT NULL,
  goal_id BIGINT NULL,
  season_no INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  season_digest VARCHAR(255) NOT NULL,
  season_epic TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_season_archives_agent_created (agent_id, created_at)
);

CREATE TABLE achievement_titles (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  agent_id BIGINT NOT NULL,
  season_archive_id BIGINT NULL,
  title_name VARCHAR(128) NOT NULL,
  title_description VARCHAR(255),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_titles_user_created (user_id, created_at)
);

CREATE TABLE world_states (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  agent_id BIGINT NOT NULL,
  entity_key VARCHAR(191) NOT NULL,
  entity_type VARCHAR(32) NOT NULL,
  entity_name VARCHAR(128) NOT NULL,
  status VARCHAR(64) NOT NULL,
  summary VARCHAR(255),
  source_goal_id BIGINT NULL,
  source_task_id BIGINT NULL,
  appearance_count INT NOT NULL DEFAULT 1,
  first_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_world_state_entity (agent_id, entity_key),
  INDEX idx_world_states_agent_seen (agent_id, last_seen_at)
);

CREATE TABLE inventory_items (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  agent_id BIGINT NOT NULL,
  item_code VARCHAR(64) NOT NULL,
  item_name VARCHAR(128) NOT NULL,
  item_type VARCHAR(32) NOT NULL,
  effect_text VARCHAR(255) NOT NULL,
  equipped TINYINT(1) NOT NULL DEFAULT 1,
  acquired_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_inventory_user_type (user_id, item_type)
);

CREATE TABLE shop_orders (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  agent_id BIGINT NOT NULL,
  item_code VARCHAR(64) NOT NULL,
  item_name VARCHAR(128) NOT NULL,
  cost_resource INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_shop_orders_user_created (user_id, created_at)
);

CREATE TABLE dungeon_runs (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  agent_id BIGINT NOT NULL,
  goal_id BIGINT NULL,
  open_date DATE NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'LOCKED',
  entry_snapshot JSON,
  result_summary TEXT,
  reward_summary VARCHAR(255),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_dungeon_user_open_date (user_id, open_date)
);
