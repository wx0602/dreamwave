# 自律者联盟 - 后端架构说明

## 1. 设计哲学

项目当前采用 **“Front-matter 配置 + 状态中心 + 树状记忆 + Markdown 持久化”** 的架构。

- **静态配置层**: 角色人格、技能触发器、副本基础数值
- **状态中心**: 用户成长、技能触发、树状记忆、世界状态
- **叙事层**: 日常剧情、章节终章、赛季归档
- **运行时文件层**: `IDENTITY.md` 与 `MEMORY.md`

这样可以同时解决：
- 策划独立配置角色/技能
- 后端稳定读写数值与记忆
- 前端持续消费统一 API
- 长线剧情不因上下文爆炸而断裂

## 2. 技术栈

- **运行环境**: Node.js 16.x+
- **核心框架**: 原生 HTTP Server
- **静态配置层**: YAML Front-matter + Markdown
- **运行时存储层**: JSON + Markdown
- **AI 能力**: DeepSeek-V3，可自动降级

## 3. 核心模块

### 3.1 配置目录
- **位置**: `backend/config/agents/`
- **职责**:
  - `roles/*.md` 存角色元数据与 System Prompt
  - `skills/*.md` 存触发器、数值 Buff 与技能加戏 Prompt
  - `examples/*.md` 给策划参考格式

### 3.2 AgentCatalogService
- **位置**: `backend/src/services/agentCatalogService.js`
- **职责**:
  - 启动时扫描角色/技能目录
  - 解析 Front-matter
  - 校验角色/技能引用关系
  - 把 YAML 与 Markdown 正文缓存到内存

### 3.3 SkillEngineService
- **位置**: `backend/src/services/skillEngineService.js`
- **职责**:
  - 根据 `trigger.type` 做业务判定
  - 结算经验值、资源点和副本临时 Buff
  - 输出 `skillState` 与 `dungeonProfile`

### 3.4 Dual-Resolution Narrative Engine
- **位置**: `backend/src/services/narrativeService.js`
- **职责**:
  - 任务完成时生成结构化 JSON:
    - `story_text`
    - `memory_summary`
    - `world_entities`
  - 主线完成时生成 `chapterFinale`
  - 新阶段开启前生成 `seasonArchive`

### 3.5 Multi-Level Tree Memory
- **位置**: `backend/src/services/memoryTreeService.js`
- **职责**:
  - L1 最近短记忆缓存
  - L2 赛季史诗归档
  - L3 永久称号沉淀

### 3.6 Dynamic Character Arc
- **位置**: `backend/src/services/characterArcService.js`
- **职责**:
  - 根据当前等级切换角色弧光 Prompt
  - 输出前端可直接展示的 `characterArc`

### 3.7 World-State JSON DB
- **位置**: `backend/src/services/worldStateService.js`
- **职责**:
  - 以 Key-Value 结构维护返场实体
  - 支持道具购买和剧情生成共同写入
  - 在新赛季启动时回灌到 Prompt

### 3.8 状态中心
- **位置**: `backend/src/store/sessionStore.js`
- **职责**:
  - 管理会话状态
  - 同步到 `runtime/session-store.json`
  - 当前版本默认保留跨重启状态

### 3.9 Agent 工作空间
- **位置**: `backend/src/services/agentWorkspaceService.js`
- **职责**:
  - 写入 `IDENTITY.md`
  - 写入 `MEMORY.md`
  - 将角色弧光、L1/L2/L3 和记忆世界线一并落盘

## 4. 运行链路

1. **Boot**
   - 启动服务
   - 加载并缓存 `roles/*.md` 与 `skills/*.md`
   - 读取已有 `session-store.json`
2. **Init**
   - 前端提交 `roleId` 与目标
   - 后端建立 `activeSeason`
   - 初始化技能状态、副本基础面板和角色弧光
3. **Task Complete**
   - 前端调用 `POST /api/tasks/:id/completion`
   - 技能判定与数值结算
   - 生成 `storyText + memorySummary + worldEntities`
   - 更新 L1 记忆和世界实体库
   - 若主线完成，再生成 `chapterFinale`
4. **Next Goal**
   - 旧赛季生成 `seasonArchive`
   - 提炼永久称号
   - 启动下一季主线
5. **Dungeon**
   - 前端读取 `dungeonProfile` 或 `/api/dungeons/current/status.panel`
   - 用基础面板 + 临时 Buff 生成入口展示

## 5. 扩展方向

- **数据库迁移**: 可将 `memoryTree`、`worldState`、`story_entries` 等迁移到 MySQL，Front-matter 仍保持只读配置层。
- **技能解锁系统**: 当前仍以角色初始技能为主，后续可把技能解锁写入业务表。
- **副本战斗接口**: 当前已具备 `baseStats + temporaryBuffs + currentStats`，后续可直接扩展战斗与结算 API。
