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
| `POST` | `/sessions` | `account` `password` `name` `goal` `roleId` `apiKey` | `CommandResultDto` | 注册账号、创建会话与初始主线 |
| `POST` | `/session-logins` | `account` `password` | `CommandResultDto` | 登录已有账号并恢复最近一次状态 |
| `GET` | `/sessions/current` | 无 | `AppStateDto` | 获取当前全量状态 |
| `POST` | `/tasks` | `title` | `CommandResultDto` | 创建支线任务 |
| `POST` | `/tasks/{taskId}/completion` | 无 | `CommandResultDto` | 完成任务并结算剧情 |
| `POST` | `/goals/advance` | `goal` | `CommandResultDto` | 推进到下一阶段目标 |
| `GET` | `/dungeons/current/status` | `demo=1` 可选 | `DungeonStatusDto` | 查询副本开启状态 |
| `GET` | `/agents/current` | 无 | `AgentProfileDto` | 获取当前 Agent 档案 |
| `GET` | `/agents/current/memories` | 无 | `AgentMemoryDto` | 获取 Agent 记忆与树状快照 |
| `POST` | `/purchases` | `itemId` | `CommandResultDto` | 购买道具 |

## 3. 关键字段说明

### `AppStateDto`

- `user`: 用户与角色选择信息
- `progress`: 等级、成长值、资源点、连击天数
- `agent`: 当前 Agent 章节、情绪、技能等
- `tasks`: 前端主列表任务
- `diary`: 日记流
- `transition`: 是否需要录入下一阶段目标
- `characterArc` `skillState` `dungeonProfile` `memoryTree` `worldState`: 扩展状态面板

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

## 4. 联调约束

- 不再使用 `/api/init`、`/api/state`、`/api/tasks/custom`、`/api/goals/next`、`/api/shop/purchase` 等旧路径。
- Android 端路径常量以 [ApiRoutes.java](/Users/cheng/project/aigc/connected-android-alliance/app/src/main/java/com/aigc/alliance/network/api/ApiRoutes.java) 为准。
- Node 端路径常量以 [apiRoutes.js](/Users/cheng/project/aigc/backend/src/lib/apiRoutes.js) 为准。
- 登录接口统一走 `POST /session-logins`，不要再把登录塞进 `GET /sessions/current` 或重复新建其他认证路径。
