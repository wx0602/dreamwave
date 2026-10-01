# 多用户测试记录（2026-10-01）

## 结论

修复后的代码通过本机 MySQL 8.0.45 多进程并发测试。通过用户已登录的微信开发者工具访问 `cloud1-d2gh7wkxx37588619` / `aigc-backend` 时，首次 `/healthz`、`/api/roles` 均出现 `102002` 超时；稍后复测均返回 200。但云端健康响应没有当前代码中的 `persistence` 字段，线上响应与本地实现不一致，不能确认云端已启用 MySQL 或部署当前多用户版本。尚未取得该服务运行日志、MySQL 连接配置或数据库控制台访问能力，未修改线上数据库、未发布新版本。

## 实测范围

- `npm test`：语法/小程序结构检查、12 组业务回归及小程序 API 冒烟全部通过。API 冒烟使用模拟 wx 调用，不等同于真机测试。
- `npm run test:mysql-concurrency`：20 个独立账号、2 个独立 Node 进程共享真实 MySQL，40 次并发任务写入全部成功；逐用户校验无串号、无丢写。
- 本次 40 次写入耗时 377 ms，约 106 次/秒。这只是单次本机小批量结果，不是线上容量承诺。
- 同一任务跨两个进程并发完成 10 次，只有 1 次成功，成长值未重复增加。
- 关闭两个后端进程后启动新进程，20 个用户的身份与任务均恢复。
- 无历史 Bearer token 的新设备登录：修复前稳定返回数据库主键重复，修复后成功。
- MySQL 模式完整 API 冒烟通过，涵盖草稿、来源选择、计划确认、注册、任务、角色记忆、副本及再次登录。
- 微信开发者工具：确认已登录；云环境列表包含目标环境；自动化连接成功，欢迎页已加载。云端健康/角色接口先超时、后恢复 200；未完成在线注册/登录等端到端业务验收。最后探测结果见 `wechat-cloud-check.json`。首次超时可能与实例启动有关，未经运行日志确认。

测试使用隔离临时数据库；并发测试账号由服务层在真实事务中预置。并发压测不含微信身份层和外部 DeepSeek/搜索调用，不代表这两部分已通过负载测试。

## 修复

1. `backend/src/services/sessionService.js`：登录恢复状态时同步数据库版本号，避免新设备登录把已有状态作为新记录 INSERT。
2. `backend/tests/multi-user-isolation.test.js`：重启测试禁用 HTTP 连接复用，避免请求复用已关闭服务的旧 socket；原失败并非已证实的数据丢失。
3. `tools/run_local_miniprogram_smoke.js`：退出时关闭 MySQL 连接池，修复 MySQL 模式下测试结束后进程不退出。
4. 外层 `project.config.json`：补充真实小程序目录，支持从用户当前工作目录直接导入。
5. 新增真实 MySQL 多进程回归，以及开发者工具云服务只读探测脚本。

## 尚需关注

- 文件模式全局串行处理请求，不支持云托管多实例共享数据；生产必须启用 MySQL。
- 当前 MySQL 事务覆盖完整业务处理，包括可能的外部 AI/搜索等待，同一用户会被行锁串行化，连接池也会持续占用。真实 AI 延迟下需要额外容量测试。
- 未覆盖长期压力、数据库故障切换、真实微信多账号/多手机同时操作；不能保证没有其他 bug。

## 云数据库配置待办

已有部署说明见 `MULTI_USER_MYSQL_DEPLOYMENT.md`。需要在目标云环境控制台确认数据库已创建，取得内网地址和连接凭据，并将云托管服务接入对应 VPC。官方说明：<https://docs.cloudbase.net/run/develop/resource-integration/mysql>。

在云托管服务环境变量中配置（不要填入小程序代码）：

```text
PERSISTENCE_DRIVER=mysql
REQUIRE_SHARED_PERSISTENCE=true
MYSQL_URL=<控制台提供的真实内网连接串>
MYSQL_CONNECTION_LIMIT=10
MYSQL_AUTO_MIGRATE=true
AUTH_SESSION_TTL_DAYS=30
```

程序已具备自动创建四张业务表的逻辑。表结构位于 `backend/docs/mysql-multiuser-schema.sql`。这些只是配置要求，本轮并未完成线上注入、建表或部署。后续应先查看云托管启动日志和超时原因，再验证 `/healthz` 返回 `persistence: mysql`，最后执行两台微信客户端的注册、并发操作和重启恢复验收。

## 复测

在内层项目目录执行 `npm test`。

真实数据库回归需在隔离测试 MySQL 设置 `MYSQL_TEST_URL` 后执行 `npm run test:mysql-concurrency`。账号需要创建/删除测试数据库权限；脚本只创建和清理随机命名的 `aigc_test_*` 数据库，不应向生产数据库运行负载测试。

微信开发者工具启用项目自动化端口 9420 后，执行 `node tools/check_wechat_cloud.js`。该脚本仅请求健康和角色接口，结果写入 `docs/wechat-cloud-check.json`，不会注册用户或改动数据库。
