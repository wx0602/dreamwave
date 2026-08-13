const http = require("http");
const { URL } = require("url");

const env = require("./config/env");
const { initializeAgentCatalog } = require("./constants/roles");
const { json, handleCors, parseBody } = require("./lib/http");
const { API_ROUTES, matchTaskCompletionPath, matchTaskEditPath } = require("./lib/apiRoutes");
const {
  buildRoleDto,
  buildAppState,
  buildCommandResult,
  buildDungeonStatus,
  buildAgentProfile,
  buildAgentMemory,
  buildSuccessResponse,
  buildErrorResponse,
} = require("./lib/apiContract");
const { initializeRuntime } = require("./store/sessionStore");
const {
  getCurrentSessionState,
  createSession,
  loginSession,
  completeTask,
  createTask,
  updateTask,
  replanGoalTasks,
  refreshNextSuggestion,
  adoptNextSuggestion,
  createPurchase,
  advanceGoal,
  getCurrentDungeonStatus,
  startDungeonRun,
  resolveDungeonEvent,
  settleDungeonRun,
  getCurrentAgentProfile,
  getCurrentAgentMemories,
  listAvailableRoles,
  getCurrentDungeonProfile,
} = require("./services/sessionService");

function respondSuccess(res, data, message) {
  json(res, 200, buildSuccessResponse(data, message));
}

function respondError(res, statusCode, message) {
  json(res, statusCode, buildErrorResponse(message, statusCode));
}

function writeHealth(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

function respondHealth(res) {
  writeHealth(res, 200, {
    status: "ok",
    service: "aigc-backend",
    environment: env.nodeEnv,
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
  });
}

function createServer() {
  return http.createServer(async (req, res) => {
    if (!req.url) {
      json(res, 400, { error: "无效请求" });
      return;
    }

    if (handleCors(req, res)) {
      return;
    }

    const url = new URL(req.url, "http://localhost");
    const pathname = url.pathname;

    try {
      if (req.method === "GET" && (pathname === "/" || pathname === "/healthz")) {
        respondHealth(res);
        return;
      }

      if (req.method === "GET" && pathname === API_ROUTES.roles) {
        respondSuccess(res, listAvailableRoles().map(buildRoleDto), "角色列表获取成功");
        return;
      }

      if (req.method === "POST" && pathname === API_ROUTES.sessions) {
        const body = await parseBody(req);
        const event = await createSession(body);
        respondSuccess(res, buildCommandResult(event, await getCurrentSessionState()), "初始化成功");
        return;
      }

      if (req.method === "POST" && pathname === API_ROUTES.sessionLogins) {
        const body = await parseBody(req);
        const event = loginSession(body);
        respondSuccess(res, buildCommandResult(event, await getCurrentSessionState()), "登录成功");
        return;
      }

      if (req.method === "GET" && pathname === API_ROUTES.currentSession) {
        respondSuccess(res, buildAppState(await getCurrentSessionState()), "状态同步成功");
        return;
      }

      if (req.method === "POST" && pathname === API_ROUTES.tasks) {
        const body = await parseBody(req);
        const event = await createTask(body);
        respondSuccess(res, buildCommandResult(event, await getCurrentSessionState()), "支线任务创建成功");
        return;
      }

      const editMatch = req.method === "POST" && matchTaskEditPath(pathname);
      if (editMatch) {
        const body = await parseBody(req);
        const event = updateTask(editMatch[1], body);
        respondSuccess(res, buildCommandResult(event, await getCurrentSessionState()), "任务更新成功");
        return;
      }

      if (req.method === "POST" && pathname === API_ROUTES.goalsAdvance) {
        const body = await parseBody(req);
        const event = await advanceGoal(body);
        respondSuccess(res, buildCommandResult(event, await getCurrentSessionState()), "新主线生成成功");
        return;
      }

      if (req.method === "POST" && pathname === API_ROUTES.goalsReplan) {
        const body = await parseBody(req);
        const event = await replanGoalTasks(body);
        respondSuccess(res, buildCommandResult(event, await getCurrentSessionState()), "目标重规划成功");
        return;
      }

      if (req.method === "POST" && pathname === API_ROUTES.goalsNextSuggestion) {
        const body = await parseBody(req);
        const event = await refreshNextSuggestion(body);
        respondSuccess(res, buildCommandResult(event, await getCurrentSessionState()), "下一步建议已刷新");
        return;
      }

      if (req.method === "POST" && pathname === API_ROUTES.goalsAdoptSuggestion) {
        const body = await parseBody(req);
        const event = await adoptNextSuggestion(body);
        respondSuccess(res, buildCommandResult(event, await getCurrentSessionState()), "下一步建议已采纳");
        return;
      }

      if (req.method === "GET" && pathname === API_ROUTES.currentDungeonStatus) {
        const demoMode = url.searchParams.get("demo") === "1";
        respondSuccess(
          res,
          buildDungeonStatus(
            getCurrentDungeonStatus(demoMode),
            getCurrentDungeonProfile()
          ),
          "副本状态获取成功"
        );
        return;
      }

      if (req.method === "POST" && pathname === API_ROUTES.currentDungeonStart) {
        const body = await parseBody(req);
        const event = startDungeonRun(Boolean(body.demo));
        respondSuccess(res, buildCommandResult(event, await getCurrentSessionState()), "副本已进入");
        return;
      }

      if (req.method === "POST" && pathname === API_ROUTES.currentDungeonEvent) {
        const body = await parseBody(req);
        const event = resolveDungeonEvent(body.choiceId);
        respondSuccess(res, buildCommandResult(event, await getCurrentSessionState()), "事件结算成功");
        return;
      }

      if (req.method === "POST" && pathname === API_ROUTES.currentDungeonSettlement) {
        const event = settleDungeonRun();
        respondSuccess(res, buildCommandResult(event, await getCurrentSessionState()), "副本结算成功");
        return;
      }

      if (req.method === "GET" && pathname === API_ROUTES.currentAgent) {
        respondSuccess(
          res,
          buildAgentProfile(getCurrentAgentProfile()),
          "Agent 信息获取成功"
        );
        return;
      }

      if (req.method === "GET" && pathname === API_ROUTES.currentAgentMemories) {
        respondSuccess(
          res,
          buildAgentMemory(getCurrentAgentMemories()),
          "Agent 记忆获取成功"
        );
        return;
      }

      if (req.method === "POST" && pathname === API_ROUTES.purchases) {
        const body = await parseBody(req);
        const event = createPurchase(body.itemId);
        respondSuccess(res, buildCommandResult(event, await getCurrentSessionState()), "购买成功");
        return;
      }

      const completeMatch = req.method === "POST" && matchTaskCompletionPath(pathname);
      if (completeMatch) {
        const event = await completeTask(completeMatch[1]);
        respondSuccess(res, buildCommandResult(event, await getCurrentSessionState()), "任务结算成功");
        return;
      }

      respondError(res, 404, "接口不存在");
    } catch (error) {
      respondError(res, 400, error.message || "请求处理失败");
    }
  });
}

function startServer() {
  initializeAgentCatalog();
  initializeRuntime();
  const server = createServer();
  server.listen(env.port, env.host, () => {
    console.log(
      `Backend API running at http://${env.host}:${env.port} (${env.nodeEnv})`
    );
  });

  process.once("SIGINT", () => {
    server.close(() => process.exit(0));
  });

  process.once("SIGTERM", () => {
    server.close(() => process.exit(0));
  });

  process.once("SIGHUP", () => {
    server.close(() => process.exit(0));
  });

  return server;
}

module.exports = {
  createServer,
  startServer,
};
