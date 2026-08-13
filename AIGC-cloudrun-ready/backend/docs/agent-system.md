# Agent 身份、记忆与叙事机制

## 1. 设计核心

当前 Agent 架构由四层协同组成：

- **静态人格层**: `roles/*.md` 与 `skills/*.md`
- **动态弧光层**: 随等级变化的角色状态机
- **树状记忆层**: L1/L2/L3 分层记忆
- **世界实体层**: 可返场的道具、NPC、地点

四层共同参与每一次 Prompt 组装。

## 2. 静态人格层

### 2.1 角色 Role
- YAML Front-matter:
  - 角色展示信息
  - 夜间副本基础数值:攻击，防御（是否想让BOSS进行攻击），生命值
  - 初始技能 ID
- Markdown 正文:
  - 身份设定
  - 世界观规则
  - 学习动作到奇幻动作的映射
  - 词汇限制

### 2.2 技能 Skill
- YAML Front-matter:
  - 唯一 ID
  - 归属角色或通用类型（攻击，回血，状态）
  - 触发条件
  - 数值效果
- Markdown 正文:
  - 技能触发后的“加戏指令”以及“数值”

## 3. 动态弧光层

后端依据 `stats.level` 自动选择当前角色弧光：

- `1-10`: 新手期，青涩、好奇、带敬畏感
- `11-30`: 进阶期，沉稳、坚定、熟练运用规则
- `31+`: 大师期，从容、老练、具传奇感

弧光状态既进入 Prompt，也通过 `characterArc` 返回给前端。

## 4. 树状记忆层

### 4.1 L1 短期记忆
- 内容: 最近 8 条 `memory_summary`
- 用途: 每次日常剧情生成都必带，保证即时连贯性

### 4.2 L2 剧集层
- 内容: 每季的 `seasonEpic` 与 `seasonDigest`
- 用途: 作为中期压缩记忆，避免上下文无限膨胀

### 4.3 L3 永久资产层
- 内容: `permanentTitles`
- 用途: 新赛季开启时继承历史成就，保持跨周期宿命感

## 5. 世界实体层

`worldState` 负责维护结构化实体：

- `item`
- `npc`
- `location`
- `artifact`
- `other`

实体既可来自模型结构化输出，也可来自商店购买等业务写入。

## 6. 双分辨率叙事

### 6.1 日常任务
任务完成时，模型返回结构化 JSON：

```json
{
  "story_text": "用户可见剧情",
  "memory_summary": "用户不可见的短摘要",
  "world_entities": []
}
```

其中：
- `story_text` 用于前端即时激励
- `memory_summary` 用于 L1 记忆树
- `world_entities` 用于世界状态持久化

### 6.2 章节终章
当一阶段全部主线完成时，后端收集该阶段的 `memory_summary`，生成 `chapterFinale`。

### 6.3 赛季归档
在用户输入下一阶段目标前，后端将上一季内容压缩为 `seasonArchive`，并提炼称号进入 L3。

## 7. 运行时文件

### 7.1 `IDENTITY.md`

包含：
- 基础身份
- 配置来源
- 当前角色弧光
- 技能装配状态
- 副本面板
- L1/L2/L3 记忆概览
- 世界线实体概览

### 7.2 `MEMORY.md`

包含：
- L1 短期记忆列表
- 当前赛季状态
- L2 剧集层摘要
- L3 永久称号
- 世界线实体库
- 时间线记忆明细

## 8. 前后端数据流

1. **初始化**
   - 前端调用 `POST /api/sessions`
   - 后端建立角色、技能、副本面板、弧光和 `activeSeason`
2. **执行任务**
   - 前端调用 `POST /api/tasks/:taskId/completion`
   - 后端写入 `storyText`、`memorySummary`、`worldEntities`
3. **主线完成**
   - 后端额外生成 `chapterFinale`
4. **新赛季开启**
   - 前端调用 `POST /api/goals/advance`
   - 后端归档 `seasonArchive` 并更新永久称号
5. **刷新状态**
   - 前端通过 `GET /api/sessions/current` 获取 `characterArc`、`memoryTree`、`worldState`

## 9. 状态管理原则

- `backend/config/agents/**/*.md` 只读，不写用户行为
- 动态状态全部写入运行时状态中心
- 当前版本 runtime 默认保留跨重启状态
- 若未来接数据库，静态配置仍保持 Front-matter，动态状态迁移至业务表
