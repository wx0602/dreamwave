# 自律者联盟 - API 接口规范

## 1. 通用约定

- Base URL: `http://127.0.0.1:3001/api`
- Content-Type: `application/json`
- 正式后端：Node.js
- 备选参考：`backend/fallback-python/app.py`

统一响应体：

```json
{
  "code": 200,
  "message": "success",
  "data": {},
  "success": true
}
```

## 2. 正式接口表

| 方法 | 路径 | 主要请求体 | 主要返回体 | 说明 |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/roles` | 无 | `List<CharacterDto>` | 角色列表 |
| `POST` | `/goal-drafts` | `mode` `goalProfile` | `GoalDraftDto` | 创建首次或并行目标草稿 |
| `GET` | `/goal-drafts/{draftId}` | 无 | `GoalDraftDto` | 恢复草稿 |
| `POST` | `/goal-drafts/{draftId}/source-searches` | `expectedRevision` `userSources?` | `GoalDraftDto` | 搜索并核验来源 |
| `POST` | `/goal-drafts/{draftId}/source-selections` | `expectedRevision` `bundleId` | `GoalDraftDto` | 确认来源组合 |
| `POST` | `/goal-drafts/{draftId}/plan-generations` | `expectedRevision` `adjustment?` | `GoalDraftDto` | 生成来源绑定计划 |
| `POST` | `/goal-drafts/{draftId}/confirmations` | `expectedRevision` `confirmationKey` `registration?` | `CommandResultDto` | 正式创建账号或目标 |
| `POST` | `/sessions` | 旧版输入 | 错误 | 已停用，返回 410 `GOAL_DRAFT_REQUIRED` |
| `POST` | `/session-logins` | `account` `password` | `CommandResultDto` | 登录已有账号并恢复最近一次状态 |
| `GET` | `/sessions/current` | 无 | `AppStateDto` | 获取当前全量状态 |
| `POST` | `/tasks` | `title` | `CommandResultDto` | 创建支线任务 |
| `POST` | `/tasks/{taskId}/completion` | 无 | `CommandResultDto` | 完成任务并结算剧情 |
| `POST` | `/goals` | 旧版输入 | 错误 | 已停用，返回 410 `GOAL_DRAFT_REQUIRED` |
| `POST` | `/goals/advance` | 旧版输入 | 错误 | 已停用，返回 410 `GOAL_DRAFT_REQUIRED` |
| `POST` | `/goals/{goalId}/priority` | `priority` | `CommandResultDto` | 设置主、次或暂停自动发布 |
| `GET` | `/dungeons/current/status` | `demo=1` 可选 | `DungeonStatusDto` | 查询副本开启状态 |
| `POST` | `/dungeons/current/start` | `demo` 可选 | `CommandResultDto` | 按当天学习快照进入副本 |
| `POST` | `/dungeons/current/events` | `choiceId` | `CommandResultDto` | 推进剧情分支，不即时发正式奖励 |
| `POST` | `/dungeons/current/settlement` | 无 | `CommandResultDto` | AI 生成结局并由后端执行每日一次结算 |
| `GET` | `/agents/current` | 无 | `AgentProfileDto` | 获取当前 Agent 档案 |
| `GET` | `/agents/current/memories` | 无 | `AgentMemoryDto` | 获取 Agent 记忆与树状快照 |
| `POST` | `/purchases` | `itemId` | `CommandResultDto` | 购买道具 |

## 3. 关键字段说明

### `AppStateDto`

- `user`: 用户与角色选择信息
- `progress`: 等级、成长值、资源点、连击天数
- `agent`: 当前 Agent 章节、情绪、技能等
- `tasks`: 当天执行任务；不会混入后续阶段任务
- `taskHistory`: 已归档的历史执行任务
- `goalPlan`: 长期目标、顺序阶段和稳定的阶段任务池
- `dailyPlan`: 当天计划、容量、任务引用和完成统计
- `dailyPlanHistory`: 最近 30 份每日计划摘要
- `diary`: 日记流
- `transition`: 仅在长期目标全部阶段完成后提示录入新目标
- `characterArc` `skillState` `dungeonProfile` `memoryTree` `worldState`: 扩展状态面板

### `DungeonStatusDto.run`

- `stageTitle` `nextStageTitle` `stageTheme`: 本轮冻结的学习阶段和主题
- `completionRoute` `routeLabel`: 整备、部分推进、今日全清或阶段突破路线
- `plannedTaskCount` `completedTaskCount`: 启动时的今日主线快照
- `rewardEligible` `rewardPreview`: 本轮是否可领取正式奖励及后端预计算值
- 演示模式和同一每日计划的重玩均返回不可领取；副本结算不会增加连击天数

### `CommandResultDto`

- `event.tag`: 机器可读事件名，当前统一为：
  - `session.created`
  - `session.logged_in`
  - `task.created`
  - `task.completed.main`
  - `task.completed.side`
  - `goal.advanced`
  - `purchase.created`
- `event.storyText`: 用户可见剧情
- `event.memorySummary`: 记忆摘要
- `event.rewardSummary`: 奖励文本
- `state`: 动作执行后的最新 `AppStateDto`

错误响应中的 `code` 是业务错误码，`statusCode` 是 HTTP 状态；`errorCode` 暂作为兼容别名。小程序应按业务码分支，不解析中文消息。

## 4. 联调约束

- 不再使用 `/api/init`、`/api/state`、`/api/tasks/custom`、`/api/goals/next`、`/api/shop/purchase` 等旧路径。
- Android 端路径常量以 [ApiRoutes.java](/Users/cheng/project/aigc/connected-android-alliance/app/src/main/java/com/aigc/alliance/network/api/ApiRoutes.java) 为准。
- Node 端路径常量以 [apiRoutes.js](/Users/cheng/project/aigc/backend/src/lib/apiRoutes.js) 为准。
- 登录接口统一走 `POST /session-logins`，不要再把登录塞进 `GET /sessions/current` 或重复新建其他认证路径。
