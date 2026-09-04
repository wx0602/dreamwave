# 自律者联盟 - 后端开发者文档

## 1. 技术栈说明

- Runtime: Node.js
- Framework: 原生 `http`
- 正式接口入口：[backend/src/app.js](/Users/cheng/project/aigc/backend/src/app.js)
- 路径常量：[backend/src/lib/apiRoutes.js](/Users/cheng/project/aigc/backend/src/lib/apiRoutes.js)
- 旧版 Flask 备份：`backend/fallback-python/`

## 2. 启动与检查

```bash
npm install
npm run dev:backend
npm run check:backend
```

## 3. 正式接口

所有接口前缀均为 `/api`。

| 方法 | 路径 | 服务层方法 |
| :--- | :--- | :--- |
| `GET` | `/roles` | `listAvailableRoles()` |
| `POST` | `/goal-drafts` 及其 action 路由 | Goal Draft 状态机 |
| `POST` | `/sessions` | 已停用，410 `GOAL_DRAFT_REQUIRED` |
| `POST` | `/session-logins` | `loginSession()` |
| `GET` | `/sessions/current` | `getCurrentSessionState()` |
| `POST` | `/tasks` | `createTask()` |
| `POST` | `/tasks/{taskId}/completion` | `completeTask()` |
| `POST` | `/goals`、`/goals/advance` | 已停用，410 `GOAL_DRAFT_REQUIRED` |
| `POST` | `/goals/{goalId}/priority` | `updateGoalPriority()` |
| `GET` | `/dungeons/current/status` | `getCurrentDungeonProfile()` + `getDungeonState()` |
| `GET` | `/agents/current` | `getCurrentAgentProfile()` |
| `GET` | `/agents/current/memories` | `getCurrentAgentMemories()` |
| `POST` | `/purchases` | `createPurchase()` |

## 4. 协议约束

- 当前正式后端只有 Node 版本。
- `backend/fallback-python/app.py` 仅作历史参考，不参与联调协议。
- 后端 mutation 响应统一返回 `CommandResultDto`，并携带最新 `state`，前端不应自行推演状态。
- `event.tag` 已统一为机器可读命名，避免旧版本中的大小写和空格混用；当前包括 `session.created`、`session.logged_in`、`task.created`、`task.completed.main`、`task.completed.side`、`goal.advanced`、`purchase.created`。

## 5. 运行时存储

- 会话状态：`backend/runtime/session-store.json`
- Agent 档案：`backend/runtime/agents/{agentId}/IDENTITY.md`
- Agent 记忆：`backend/runtime/agents/{agentId}/MEMORY.md`
- 静态角色配置：`backend/config/agents/roles/*.md`
- 静态技能配置：`backend/config/agents/skills/*.md`
