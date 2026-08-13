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
- 任务完成后写入剧情与记忆
- 自动生成 `IDENTITY.md` 与 `MEMORY.md`
- 最后一个主线任务完成后，自动提示输入下一阶段目标
- 预留 DeepSeek 叙事生成链路
- 测试版关闭进程后自动清空运行缓存

## 文档

- [微信小程序运行说明](./miniprogram/README.md)
- [后端架构](./backend/docs/architecture.md)
- [API 汇总](./backend/docs/api.md)
- [MySQL 设计](./backend/docs/mysql-design.md)
- [MySQL Schema](./backend/docs/mysql-schema.sql)
- [Agent 机制](./backend/docs/agent-system.md)
