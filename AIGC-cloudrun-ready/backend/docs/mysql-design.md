# 自律者联盟 MySQL 设计说明

## 1. 设计原则

- 面向“用户目标 -> 任务推进 -> 双分辨率叙事 -> 树状记忆 -> 世界状态 -> 副本入口”闭环建模
- 静态角色/技能仍保留 Front-matter，只把动态状态落库
- 支持从当前 `session-store.json` 平滑迁移到 MySQL

## 2. 核心实体

- `users`：用户
- `goals`：阶段目标 / 赛季
- `tasks`：主线 / 支线任务
- `agents`：当前绑定的角色 Agent
- `agent_memories`：短记忆与时间线事件
- `story_entries`：用户可见剧情、章节终章、赛季史诗
- `season_archives`：L2 中期记忆
- `achievement_titles`：L3 永久称号
- `world_states`：返场实体 Key-Value
- `inventory_items`：装备 / 技能
- `shop_orders`：商店兑换记录
- `dungeon_runs`：副本记录

## 3. 表之间的关系

- 一个 `user` 可拥有多个 `goal`
- 一个 `goal` 对应多个 `task`
- 一个 `goal` 结束后会产生一条 `season_archives`
- 一个 `season_archives` 可产出多条 `achievement_titles`
- 一个 `task` 完成后会生成：
  - 一条 `story_entries`（`story_text`）
  - 一条 `agent_memories`（`memory_summary`）
  - 零到多条 `world_states` 更新

## 4. 关键字段建议

### 4.1 users

- `id`
- `nickname`
- `created_at`
- `updated_at`

### 4.2 agents

- `id`
- `user_id`
- `role_id`
- `agent_name`
- `story_tone`
- `speech_style`
- `personality`
- `current_chapter`
- `current_stage`
- `emotion`
- `arc_id`
- `arc_label`
- `memory_count`
- `identity_file_path`
- `memory_file_path`
- `status`
- `created_at`
- `updated_at`

### 4.3 goals

- `id`
- `user_id`
- `agent_id`
- `title`
- `deadline_text`
- `daily_available_time`
- `stage_no`
- `status`
- `prompt_required`
- `created_at`
- `updated_at`

### 4.4 tasks

- `id`
- `goal_id`
- `user_id`
- `agent_id`
- `task_type`
- `title`
- `estimate_minutes`
- `reward_growth`
- `reward_resource`
- `status`
- `completed_at`
- `created_at`
- `updated_at`

### 4.5 agent_memories

- `id`
- `user_id`
- `agent_id`
- `goal_id`
- `task_id`
- `memory_type`
- `title`
- `memory_summary`
- `story_entry_id`
- `reward_text`
- `created_at`

### 4.6 story_entries

- `id`
- `user_id`
- `agent_id`
- `goal_id`
- `task_id`
- `story_type`
- `title`
- `content`
- `llm_provider`
- `llm_model`
- `created_at`

### 4.7 season_archives

- `id`
- `user_id`
- `agent_id`
- `goal_id`
- `season_no`
- `title`
- `season_digest`
- `season_epic`
- `created_at`

### 4.8 achievement_titles

- `id`
- `user_id`
- `agent_id`
- `season_archive_id`
- `title_name`
- `title_description`
- `created_at`

### 4.9 world_states

- `id`
- `user_id`
- `agent_id`
- `entity_key`
- `entity_type`
- `entity_name`
- `status`
- `summary`
- `source_goal_id`
- `source_task_id`
- `appearance_count`
- `first_seen_at`
- `last_seen_at`

### 4.10 inventory_items

- `id`
- `user_id`
- `agent_id`
- `item_code`
- `item_name`
- `item_type`
- `effect_text`
- `equipped`
- `acquired_at`

### 4.11 dungeon_runs

- `id`
- `user_id`
- `agent_id`
- `goal_id`
- `open_date`
- `status`
- `entry_snapshot`
- `result_summary`
- `reward_summary`
- `created_at`
- `updated_at`

## 5. 索引建议

- `tasks(goal_id, status)`
- `tasks(user_id, created_at)`
- `agent_memories(agent_id, created_at desc)`
- `story_entries(agent_id, created_at desc)`
- `season_archives(agent_id, created_at desc)`
- `achievement_titles(user_id, created_at desc)`
- `world_states(agent_id, entity_key)`
- `goals(user_id, status)`
- `inventory_items(user_id, item_type)`

## 6. 从当前代码迁移到 MySQL 的建议

当前比赛版仍采用：
- `session-store.json`
- `IDENTITY.md`
- `MEMORY.md`

迁移路径建议：

1. 将 `sessionService` 的读写换成 Repository
2. 保留现有 API 不变
3. 将 `memoryTree` 映射为 `agent_memories + season_archives + achievement_titles`
4. 将 `worldState` 映射为 `world_states`
5. 将 `storyText / chapterFinale / seasonEpic` 映射为 `story_entries`
