# 自律者联盟

一个将学习目标拆解为任务，并由 Agent 将学习过程转译为冒险故事的像素风 demo 项目。

## 当前结构

- `backend/`：Node 后端 API、Agent 机制、记忆文件与叙事服务
- `miniprogram/`：原生微信小程序前端（WXML + WXSS + JavaScript + JSON）
- `backend/fallback-python/`：旧版 Flask 备选实现，仅保留参考

## 快速启动

```bash
npm start
npm run check
```

微信小程序前端：

- 微信开发者工具导入仓库根目录（`project.config.json` 已指定 `miniprogram/`）
- 在 `miniprogram/config/cloud.js` 配置云环境 ID 与云托管服务名
- 所有后端调用统一由 `miniprogram/services/api.js` 通过 `wx.cloud.callContainer()` 发出
- DeepSeek Key 只配置在云托管服务环境变量中，不进入小程序代码

后端 API：

- `http://127.0.0.1:3001/api`

## 关键能力

- 角色初始化即 Agent 初始化
- DeepSeek API Key 由云托管环境变量统一管理
- 支持并行长期目标、7 天滚动规划与全局每日 1 个核心任务 + 最多 2 个可选行动
- 任务完成后写入剧情、星图进度与分层记忆
- 自动生成 `IDENTITY.md` 与 `MEMORY.md`
- 每 15 颗主线星收集一张星图，并解锁可作用于真实任务的道具
- 预留 DeepSeek 叙事生成链路
- 未配置 DeepSeek 时自动使用规则与模板降级
- 运行状态默认保存在 `backend/runtime/`，并为账号保存状态快照

## 文档

- [项目功能与架构全景](./docs/PROJECT_OVERVIEW.md)
- [开源项目调研、产品评估与工程建议](./docs/OPEN_SOURCE_RESEARCH_AND_REVIEW.md)
- [微信小程序运行说明](./miniprogram/README.md)
- [后端架构](./backend/docs/architecture.md)
- [API 汇总](./backend/docs/api.md)
- [MySQL 设计](./backend/docs/mysql-design.md)
- [MySQL Schema](./backend/docs/mysql-schema.sql)
- [Agent 机制](./backend/docs/agent-system.md)
