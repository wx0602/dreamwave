const http = require("http");
const { URL } = require("url");

const env = require("./config/env");
const { initializeAgentCatalog } = require("./constants/roles");
const { json, handleCors, parseBody } = require("./lib/http");
const {
  API_ROUTES,
  matchTaskCompletionPath,
  matchTaskEditPath,
  matchGoalDraftPath,
  matchGoalDraftActionPath,
  matchGoalPriorityPath,
} = require("./lib/apiRoutes");
const {
  buildRoleDto,
  buildAppState,
  buildCommandResult,
  buildDungeonStatus,
  buildAgentProfile,
  buildAgentMemory,
  buildSuccessResponse,
  buildErrorResponse,
  buildGoalDraftDto,
} = require("./lib/apiContract");
const { isAppError } = require("./lib/errors");
const { getGoalDraft, findConfirmationReceipt } = require("./store/goalDraftStore");
const {
  createDraftCommand,
  getDraftForConfirmation,
  searchSourcesCommand,
  selectSourcesCommand,
  generatePlanCommand,
} = require("./services/goalDraftService");
const { initializeRuntime } = require("./store/sessionStore");
const {
  getCurrentSessionState,
  createSession,
  loginSession,
  completeTask,
  createTask,
  createParallelGoal,
  updateTask,
  replanGoalTasks,
  refreshNextSuggestion,
  adoptNextSuggestion,
  createPurchase,
  useStarMapTool,
  advanceGoal,
  getCurrentDungeonStatus,
  startDungeonRun,
  resolveDungeonEvent,
  settleDungeonRun,
  getCurrentAgentProfile,
  getCurrentAgentMemories,
  listAvailableRoles,
  getCurrentDungeonProfile,
  confirmGoalDraft,
  updateGoalPriority,
} = require("./services/sessionService");

function respondSuccess(res, data, message) {
  json(res, 200, buildSuccessResponse(data, message));
}

function respondError(res, statusCode, message, errorCode, details) {
  json(res, statusCode, buildErrorResponse(message, statusCode, errorCode, details));
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

      if (req.method === "POST" && pathname === API_ROUTES.goalDrafts) {
        const body = await parseBody(req);
        respondSuccess(res, buildGoalDraftDto(createDraftCommand(body)), "学习目标草稿已创建");
        return;
      }

      const goalDraftPathMatch = matchGoalDraftPath(pathname);
      if (req.method === "GET" && goalDraftPathMatch) {
        respondSuccess(res, buildGoalDraftDto(getGoalDraft(goalDraftPathMatch[1])), "草稿已恢复");
        return;
      }

      const goalDraftActionMatch = req.method === "POST" && matchGoalDraftActionPath(pathname);
      if (goalDraftActionMatch) {
        const body = await parseBody(req);
        const draftId = goalDraftActionMatch[1];
        const action = goalDraftActionMatch[2];
        let draft;
        if (action === "source-searches") {
          draft = await searchSourcesCommand(draftId, body);
        } else if (action === "source-selections") {
          draft = selectSourcesCommand(draftId, body);
        } else if (action === "plan-generations") {
          draft = await generatePlanCommand(draftId, body);
        } else {
          const receipt = findConfirmationReceipt(draftId, body.confirmationKey);
          if (receipt && receipt.event) {
            respondSuccess(res, buildCommandResult(receipt.event, await getCurrentSessionState()), "已恢复已确认的学习路线");
            return;
          }
          const prepared = getDraftForConfirmation(draftId, body.expectedRevision);
          const event = await confirmGoalDraft(prepared, body);
          respondSuccess(res, buildCommandResult(event, await getCurrentSessionState()), "已确认并开始执行");
          return;
        }
        respondSuccess(res, buildGoalDraftDto(draft), "草稿已更新");
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

      if (req.method === "POST" && pathname === API_ROUTES.goals) {
        const body = await parseBody(req);
        const event = await createParallelGoal(body);
        respondSuccess(res, buildCommandResult(event, await getCurrentSessionState()), "长期目标创建成功");
        return;
      }

      const goalPriorityMatch = req.method === "POST" && matchGoalPriorityPath(pathname);
      if (goalPriorityMatch) {
        const body = await parseBody(req);
        const event = await updateGoalPriority(goalPriorityMatch[1], body.priority);
        respondSuccess(res, buildCommandResult(event, await getCurrentSessionState()), "目标优先级已更新");
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
        const event = await settleDungeonRun();
        respondSuccess(res, buildCommandResult(event, await getCurrentSessionState()), "副本结算成功");
        return;
      }

      if (req.method === "POST" && pathname === API_ROUTES.starMapToolUses) {
        const body = await parseBody(req);
        const event = await useStarMapTool(body);
        respondSuccess(res, buildCommandResult(event, await getCurrentSessionState()), "星宿道具已使用");
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
        const body = await parseBody(req);
        const event = await completeTask(completeMatch[1], body);
        respondSuccess(res, buildCommandResult(event, await getCurrentSessionState()), "任务结算成功");
        return;
      }

      respondError(res, 404, "接口不存在");
    } catch (error) {
      respondError(
        res,
        Number(error && error.statusCode) || 400,
        error.message || "请求处理失败",
        isAppError(error) ? error.code : "REQUEST_ERROR",
        isAppError(error) ? error.details : null
      );
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
