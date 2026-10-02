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
const { AppError, isAppError } = require("./lib/errors");
const { getGoalDraft, findConfirmationReceipt } = require("./store/goalDraftStore");
const {
  createDraftCommand,
  getDraftForConfirmation,
  searchSourcesCommand,
  selectSourcesCommand,
  generatePlanCommand,
} = require("./services/goalDraftService");
const { initializeRuntime } = require("./store/sessionStore");
const { createAuthSession } = require("./store/accountStore");
const { getRequestContext } = require("./context/requestContext");
const { executeRequest, initializePersistence, closePersistence } = require("./store/requestPersistence");
const { preparePlanGenerationJob } = require("./services/planGenerationJobService");
const {
  getCurrentSessionState,
  loginSession,
  completeTask,
  createTask,
  updateTask,
  replanGoalTasks,
  refreshNextSuggestion,
  adoptNextSuggestion,
  createPurchase,
  useStarMapTool,
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

function success(data, message) {
  return { statusCode: 200, payload: buildSuccessResponse(data, message) };
}

function failure(statusCode, message, errorCode, details) {
  return { statusCode, payload: buildErrorResponse(message, statusCode, errorCode, details) };
}

function healthPayload() {
  return {
    status: "ok",
    service: "aigc-backend",
    environment: env.nodeEnv,
    persistence: env.persistence.driver,
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
  };
}

function requestOptions(pathname, method) {
  if (method === "POST" && pathname === API_ROUTES.goalDrafts) return { authRequired: false };
  const draftPath = matchGoalDraftPath(pathname);
  if (draftPath) return { authRequired: false, draftId: draftPath[1] };
  const draftAction = matchGoalDraftActionPath(pathname);
  if (draftAction) return { authRequired: false, draftId: draftAction[1] };
  if (method === "POST" && pathname === API_ROUTES.sessionLogins) return { authRequired: false };
  return { authRequired: true };
}

async function handleApiRequest(req, url) {
  const pathname = url.pathname;

  if (req.method === "POST" && pathname === API_ROUTES.goalDrafts) {
    const body = await parseBody(req);
    return success(buildGoalDraftDto(createDraftCommand(body)), "学习目标草稿已创建");
  }

  const goalDraftPathMatch = matchGoalDraftPath(pathname);
  if (req.method === "GET" && goalDraftPathMatch) {
    return success(buildGoalDraftDto(getGoalDraft(goalDraftPathMatch[1])), "草稿已恢复");
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
      if (body.async === true) {
        const job = preparePlanGenerationJob(req, draftId, body);
        draft = job.draft;
        req.runPlanJob = job.run;
      } else {
        draft = await generatePlanCommand(draftId, body);
      }
    } else {
      const receipt = findConfirmationReceipt(draftId, body.confirmationKey);
      if (receipt && receipt.event) {
        const event = { ...receipt.event };
        const context = getRequestContext();
        if (event.tag === "session.created" && context && !context.userId) {
          const registration = body.registration || {};
          const loginEvent = await loginSession({
            account: registration.account,
            password: registration.password,
          });
          event.sessionToken = loginEvent.sessionToken;
        } else if (!context || !context.userId) {
          throw new AppError("AUTH_REQUIRED", "请先登录后继续", 401);
        } else if (event.tag === "session.created") {
          event.sessionToken = await createAuthSession(context.userId);
        }
        return success(buildCommandResult(event, await getCurrentSessionState()), "已恢复已确认的学习路线");
      }
      const prepared = getDraftForConfirmation(draftId, body.expectedRevision);
      const event = await confirmGoalDraft(prepared, body);
      return success(buildCommandResult(event, await getCurrentSessionState()), "已确认并开始执行");
    }
    return success(buildGoalDraftDto(draft), "草稿已更新");
  }

  if (req.method === "POST" && pathname === API_ROUTES.sessions) {
    return failure(410, "请先完成来源选择和计划确认，再开始初始化", "GOAL_DRAFT_REQUIRED");
  }

  if (req.method === "POST" && pathname === API_ROUTES.sessionLogins) {
    const body = await parseBody(req);
    const event = await loginSession(body);
    return success(buildCommandResult(event, await getCurrentSessionState()), "登录成功");
  }

  if (req.method === "GET" && pathname === API_ROUTES.currentSession) {
    return success(buildAppState(await getCurrentSessionState()), "状态同步成功");
  }

  if (req.method === "POST" && pathname === API_ROUTES.tasks) {
    const body = await parseBody(req);
    const event = await createTask(body);
    return success(buildCommandResult(event, await getCurrentSessionState()), "支线任务创建成功");
  }

  if (req.method === "POST" && pathname === API_ROUTES.goals) {
    return failure(410, "请先完成来源选择和计划确认，再新增长期目标", "GOAL_DRAFT_REQUIRED");
  }

  const goalPriorityMatch = req.method === "POST" && matchGoalPriorityPath(pathname);
  if (goalPriorityMatch) {
    const body = await parseBody(req);
    const event = await updateGoalPriority(goalPriorityMatch[1], body.priority);
    return success(buildCommandResult(event, await getCurrentSessionState()), "目标优先级已更新");
  }

  const editMatch = req.method === "POST" && matchTaskEditPath(pathname);
  if (editMatch) {
    const body = await parseBody(req);
    const event = updateTask(editMatch[1], body);
    return success(buildCommandResult(event, await getCurrentSessionState()), "任务更新成功");
  }

  if (req.method === "POST" && pathname === API_ROUTES.goalsAdvance) {
    return failure(410, "请先完成来源选择和计划确认，再开启新目标", "GOAL_DRAFT_REQUIRED");
  }

  if (req.method === "POST" && pathname === API_ROUTES.goalsReplan) {
    const body = await parseBody(req);
    const event = await replanGoalTasks(body);
    return success(buildCommandResult(event, await getCurrentSessionState()), "目标重规划成功");
  }

  if (req.method === "POST" && pathname === API_ROUTES.goalsNextSuggestion) {
    const body = await parseBody(req);
    const event = await refreshNextSuggestion(body);
    return success(buildCommandResult(event, await getCurrentSessionState()), "下一步建议已刷新");
  }

  if (req.method === "POST" && pathname === API_ROUTES.goalsAdoptSuggestion) {
    const body = await parseBody(req);
    const event = await adoptNextSuggestion(body);
    return success(buildCommandResult(event, await getCurrentSessionState()), "下一步建议已采纳");
  }

  if (req.method === "GET" && pathname === API_ROUTES.currentDungeonStatus) {
    const demoMode = url.searchParams.get("demo") === "1";
    return success(buildDungeonStatus(getCurrentDungeonStatus(demoMode), getCurrentDungeonProfile()), "副本状态获取成功");
  }

  if (req.method === "POST" && pathname === API_ROUTES.currentDungeonStart) {
    const body = await parseBody(req);
    const event = startDungeonRun(Boolean(body.demo));
    return success(buildCommandResult(event, await getCurrentSessionState()), "副本已进入");
  }

  if (req.method === "POST" && pathname === API_ROUTES.currentDungeonEvent) {
    const body = await parseBody(req);
    const event = resolveDungeonEvent(body.choiceId);
    return success(buildCommandResult(event, await getCurrentSessionState()), "事件结算成功");
  }

  if (req.method === "POST" && pathname === API_ROUTES.currentDungeonSettlement) {
    const event = await settleDungeonRun();
    return success(buildCommandResult(event, await getCurrentSessionState()), "副本结算成功");
  }

  if (req.method === "POST" && pathname === API_ROUTES.starMapToolUses) {
    const body = await parseBody(req);
    const event = await useStarMapTool(body);
    return success(buildCommandResult(event, await getCurrentSessionState()), "星宿道具已使用");
  }

  if (req.method === "GET" && pathname === API_ROUTES.currentAgent) {
    return success(buildAgentProfile(getCurrentAgentProfile()), "Agent 信息获取成功");
  }

  if (req.method === "GET" && pathname === API_ROUTES.currentAgentMemories) {
    return success(buildAgentMemory(getCurrentAgentMemories()), "Agent 记忆获取成功");
  }

  if (req.method === "POST" && pathname === API_ROUTES.purchases) {
    const body = await parseBody(req);
    const event = createPurchase(body.itemId);
    return success(buildCommandResult(event, await getCurrentSessionState()), "购买成功");
  }

  const completeMatch = req.method === "POST" && matchTaskCompletionPath(pathname);
  if (completeMatch) {
    const body = await parseBody(req);
    const event = await completeTask(completeMatch[1], body);
    return success(buildCommandResult(event, await getCurrentSessionState()), "任务结算成功");
  }

  return failure(404, "接口不存在", "NOT_FOUND");
}

function createServer() {
  return http.createServer(async (req, res) => {
    if (!req.url) {
      json(res, 400, buildErrorResponse("无效请求", 400, "INVALID_REQUEST"));
      return;
    }
    if (handleCors(req, res)) return;

    const url = new URL(req.url, "http://localhost");
    const pathname = url.pathname;
    try {
      if (req.method === "GET" && (pathname === "/" || pathname === "/healthz")) {
        json(res, 200, healthPayload());
        return;
      }
      if (req.method === "GET" && pathname === API_ROUTES.roles) {
        json(res, 200, buildSuccessResponse(listAvailableRoles().map(buildRoleDto), "角色列表获取成功"));
        return;
      }
      const result = await executeRequest(req, requestOptions(pathname, req.method), () => handleApiRequest(req, url));
      json(res, result.statusCode, result.payload);
      if (req.runPlanJob) {
        setImmediate(() => req.runPlanJob().catch(error => console.warn('[planning] job save failed', error.name)));
      }
    } catch (error) {
      const statusCode = Number(error && error.statusCode) || 400;
      json(res, statusCode, buildErrorResponse(
        error.message || "请求处理失败",
        statusCode,
        isAppError(error) ? error.code : "REQUEST_ERROR",
        isAppError(error) ? error.details : null
      ));
    }
  });
}

async function startServer() {
  initializeAgentCatalog();
  initializeRuntime();
  await initializePersistence();
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(env.port, env.host, () => {
      server.removeListener("error", reject);
      console.log(`Backend API running at http://${env.host}:${env.port} (${env.nodeEnv}, ${env.persistence.driver})`);
      resolve();
    });
  });

  const shutdown = () => {
    server.close(async () => {
      try { await closePersistence(); } finally { process.exit(0); }
    });
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  process.once("SIGHUP", shutdown);
  return server;
}

module.exports = { createServer, startServer };
