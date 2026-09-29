# 云开发 MySQL 多用户部署

目标环境：`cloud1-d2gh7wkxx37588619`；目标云托管服务：`aigc-backend`。

## 1. 数据库网络

1. 在“云开发 → MySQL 数据库 → 数据库设置 → 直连服务”开启内网连接。
2. 复制控制台提供的完整内网连接字符串，不要手写或使用公网地址。
3. 在“云托管 → aigc-backend → 服务配置 → 网络配置”开启私有网络，并选择 MySQL 所在 VPC。

官方说明：

- <https://docs.cloudbase.net/run/develop/resource-integration/mysql>
- <https://docs.cloudbase.net/database/configuration/db/tdsql/direct-connection>

## 2. 云托管环境变量

在 `aigc-backend` 中配置：

```text
PERSISTENCE_DRIVER=mysql
REQUIRE_SHARED_PERSISTENCE=true
MYSQL_URL=mysql://用户名:URL编码后的密码@内网地址:3306/数据库名
MYSQL_CONNECTION_LIMIT=10
MYSQL_AUTO_MIGRATE=true
AUTH_SESSION_TTL_DAYS=30
```

连接串中的用户名、密码和地址必须使用控制台显示的真实值。密码包含 `@`、`:`、`/`、`#` 等字符时必须进行 URL 编码。不要把连接串写入代码、提交到 Git 或放进小程序配置。

首次启动时服务会自动创建以下表：

- `aigc_accounts`
- `aigc_auth_sessions`
- `aigc_user_states`
- `aigc_goal_drafts`

如果生产数据库账号没有建表权限，可在控制台先执行 [`backend/docs/mysql-multiuser-schema.sql`](../backend/docs/mysql-multiuser-schema.sql)，然后将 `MYSQL_AUTO_MIGRATE` 改为 `false`。

## 3. 部署与验收

1. 使用仓库根目录的 `Dockerfile` 新建云托管版本。
2. 等待健康检查通过，再将新版本流量调整为 100%。
3. 请求 `/healthz`，确认返回：

```json
{
  "status": "ok",
  "persistence": "mysql"
}
```

4. 使用两个微信客户端分别注册 A、B：
   - A 新建一项只属于 A 的任务；
   - B 的首页、日志和星图不能出现该任务；
   - A、B 同时操作时都应成功；
   - 重启或重新部署云托管版本后，两人的数据仍应存在。
5. 对同一任务快速重复点击完成，成长值、资源点和星图奖励只能增加一次。

## 4. 一致性保证

- 每个请求从会话令牌解析 `user_id`，未认证请求不能访问用户业务接口。
- 用户状态按 `user_id` 保存，不使用进程全局活动用户。
- 同一用户的写操作使用 MySQL `SELECT ... FOR UPDATE` 行锁串行化；不同用户使用不同行，可并发处理。
- 学习路线草稿绑定微信 OpenID/设备身份，确认后绑定正式 `user_id`。
- 草稿确认使用 `confirmationKey` 和数据库行锁防止重复创建目标。
- 任务完成在用户状态事务内检查 `done`，并发重复请求只允许一次发奖。
- 成功响应在数据库事务提交后才发送；失败会回滚。

## 5. 本地开发

没有 MySQL 时可以继续使用：

```text
PERSISTENCE_DRIVER=file
REQUIRE_SHARED_PERSISTENCE=false
```

文件模式用于开发和测试，不支持云托管多实例。生产镜像已设置 `REQUIRE_SHARED_PERSISTENCE=true`，没有正确配置 MySQL 时会拒绝启动，避免误以为本地 JSON 已具备多实例一致性。
