# 织梦学旅 · 原生微信小程序

前端使用 WXML、WXSS、JavaScript 和 JSON 实现，不依赖 Vue、React、Taro 或 UniApp。

## 目录

- `pages/`：首页、日志、副本、我的四个 Tab 页，以及欢迎页
- `features/account/`：登录、角色选择、注册、世界生成、初始化结果
- `features/adventure/`：专注、任务结算、目标地图、副本运行与结算
- `services/api.js`：唯一后端请求入口，统一使用 `wx.cloud.callContainer()`
- `config/cloud.js`：云环境 ID 与云托管服务名
- `utils/`：本地存储、角色视觉映射、通用 UI 数据处理

## 微信开发者工具运行

1. 使用微信开发者工具导入仓库根目录，不要只导入 `miniprogram/`；根目录的 `project.config.json` 已声明 `miniprogramRoot`。
2. 将 `project.config.json` 中的 `appid` 替换成自己的小程序 AppID，也可以在导入时由开发者工具填写。
3. 修改 `config/cloud.js`：
   - `env`：云开发环境 ID；
   - `service`：已经部署好的微信云托管服务名。
4. 确认该小程序 AppID、云开发环境和云托管服务属于同一可调用环境。
5. 点击“编译”。首次运行从欢迎页进入；已有账号可走登录入口。

## Secret

小程序不包含、也不接收 DeepSeek Key。请把 `DEEPSEEK_API_KEY` 配置在云托管服务环境变量中。

## 检查

在仓库根目录运行：

```bash
npm run check:miniprogram
```

该命令检查页面四件套、JSON、JavaScript 语法、模块引用、导航目标、图片引用、Secret 特征、`callContainer` 使用和分包体积。
# 本地联调

开发者工具中可将 `config/cloud.js` 的 `transport` 设为 `local`，并先在项目根目录运行 `npm run dev:backend`。本地模式请求 `http://127.0.0.1:3001`，需要在开发者工具“详情 → 本地设置”中勾选“不校验合法域名”。真机预览或发布前必须将 `transport` 改回 `cloud`。
