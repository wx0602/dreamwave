const cloudConfig = require("../config/cloud");
const storage = require("../utils/storage");

const ROUTES = Object.freeze({
  roles: "/api/roles",
  sessions: "/api/sessions",
  sessionLogins: "/api/session-logins",
  currentSession: "/api/sessions/current",
  tasks: "/api/tasks",
  goals: "/api/goals",
  goalsAdvance: "/api/goals/advance",
  goalsReplan: "/api/goals/replan",
  nextSuggestion: "/api/goals/next-suggestion",
  adoptSuggestion: "/api/goals/adopt-suggestion",
  dungeonStatus: "/api/dungeons/current/status",
  dungeonStart: "/api/dungeons/current/start",
  dungeonEvents: "/api/dungeons/current/events",
  dungeonSettlement: "/api/dungeons/current/settlement",
  starMapToolUses: "/api/star-map/tools/uses",
  currentAgent: "/api/agents/current",
  currentAgentMemories: "/api/agents/current/memories",
  purchases: "/api/purchases",
  goalDrafts: "/api/goal-drafts",
});

function normalizeError(error) {
  if (error instanceof Error) return error;
  const message = error && (error.errMsg || error.message);
  return new Error(message || "网络请求失败，请稍后重试");
}

function responseError(body, statusCode) {
  const error = new Error((body && body.message) || `请求失败（${statusCode || "未知状态"}）`);
  error.code = body && (typeof body.code === "string" ? body.code : body.errorCode) || "REQUEST_ERROR";
  error.statusCode = Number(body && body.statusCode) || statusCode || 0;
  error.details = body && (body.details === undefined ? body.data : body.details);
  return error;
}

function cleanData(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return data;
  const result = {};
  Object.keys(data).forEach((key) => {
    if (data[key] !== undefined) result[key] = data[key];
  });
  return result;
}

function unwrap(result) {
  const statusCode = Number(result && result.statusCode) || 0;
  let body = result && result.data;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch (error) {
      throw new Error("服务返回了无法解析的数据");
    }
  }
  if (statusCode < 200 || statusCode >= 300 || !body || body.success !== true) {
    throw responseError(body, statusCode);
  }
  return body.data;
}

function callContainer(path, method, data) {
  const header = {
    "content-type": "application/json",
    "X-Client-ID": storage.getOrCreateClientId(),
  };
  const sessionToken = storage.get(storage.KEYS.sessionToken, "");
  if (sessionToken) header.Authorization = `Bearer ${sessionToken}`;
  if (cloudConfig.service) header["X-WX-SERVICE"] = cloudConfig.service;
  const options = {
    path,
    method,
    header,
  };
  if (data !== undefined) options.data = cleanData(data);
  if (cloudConfig.env) options.config = { env: cloudConfig.env };
  return wx.cloud.callContainer(options);
}

function callLocal(path, method, data) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: String(cloudConfig.localBaseUrl || "http://127.0.0.1:3001").replace(/\/$/, "") + path,
      method,
      header: {
        "content-type": "application/json",
        "X-Client-ID": storage.getOrCreateClientId(),
        ...(storage.get(storage.KEYS.sessionToken, "")
          ? { Authorization: `Bearer ${storage.get(storage.KEYS.sessionToken, "")}` }
          : {}),
      },
      data: data === undefined ? undefined : cleanData(data),
      success: resolve,
      fail: reject,
    });
  });
}

async function request(path, method = "GET", data) {
  try {
    const result = cloudConfig.transport === "local" && typeof wx.request === "function"
      ? await callLocal(path, method, data)
      : await callContainer(path, method, data);
    const value = unwrap(result);
    if (value && value.sessionToken) storage.set(storage.KEYS.sessionToken, value.sessionToken);
    return value;
  } catch (error) {
    if (path === ROUTES.goals && /接口不存在|404/.test(String(error && error.message || ""))) {
      throw new Error("云端后端版本过旧，请重新部署 aigc-backend 后再新增长期目标");
    }
    throw normalizeError(error);
  }
}

async function generateGoalPlan(draftId, payload) {
  const path = `${ROUTES.goalDrafts}/${encodeURIComponent(draftId)}`;
  const started = Date.now();
  let draft = await request(path);
  try {
    if (!draft.planGeneration || draft.planGeneration.status !== "RUNNING") {
      draft = await request(`${path}/plan-generations`, "POST", { ...payload, expectedRevision: draft.revision, async: true });
    }
  } catch (error) {
    // An interrupted response may still have queued the job. Recover rather than submit twice.
    if (!/102002|timeout|超时/i.test(error.message) && error.code !== "DRAFT_REVISION_CONFLICT") throw error;
    draft = await request(path);
    if (!draft.planGeneration) throw error;
  }
  let transientFailures = 0;
  while (Date.now() - started < 310000) {
    if (draft.planGeneration && draft.planGeneration.status === "FAILED") {
      throw new Error(draft.planGeneration.message || "任务生成失败，请重试");
    }
    if (draft.status === "PLAN_READY" && draft.planDraft) return draft;
    if (!draft.planGeneration || draft.planGeneration.status !== "RUNNING") {
      throw new Error("草稿已更新，请返回并重新打开计划页面");
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
    try {
      draft = await request(path);
      transientFailures = 0;
    } catch (error) {
      if (!/102002|timeout|超时|网络/i.test(error.message) || ++transientFailures > 3) throw error;
    }
  }
  throw new Error("生成等待超时，请重新打开计划页面查看结果；目标和资料已保留");
}

module.exports = {
  listRoles: () => request(ROUTES.roles),
  createSession: (payload) => request(ROUTES.sessions, "POST", payload),
  loginSession: (payload) => request(ROUTES.sessionLogins, "POST", payload),
  getCurrentSession: () => request(ROUTES.currentSession),
  createTask: (title) => request(ROUTES.tasks, "POST", { title }),
  createGoal: (title, durationDays) => request(ROUTES.goals, "POST", { title, durationDays }),
  updateTask: (taskId, payload) => request(`${ROUTES.tasks}/${encodeURIComponent(taskId)}/edits`, "POST", payload),
 completeTask: (taskId, summary) => request(`${ROUTES.tasks}/${encodeURIComponent(taskId)}/completion`, "POST", {
   summary: summary === undefined ? undefined : summary,
 }),
  createGoalDraft: (payload) => request(ROUTES.goalDrafts, "POST", payload),
  getGoalDraft: (draftId) => request(`${ROUTES.goalDrafts}/${encodeURIComponent(draftId)}`),
  searchGoalSources: (draftId, payload) => request(
    `${ROUTES.goalDrafts}/${encodeURIComponent(draftId)}/source-searches`,
    "POST",
    payload
  ),
  selectGoalSources: (draftId, payload) => request(
    `${ROUTES.goalDrafts}/${encodeURIComponent(draftId)}/source-selections`,
    "POST",
    payload
  ),
  generateGoalPlan,
  confirmGoalDraft: (draftId, payload) => request(
    `${ROUTES.goalDrafts}/${encodeURIComponent(draftId)}/confirmations`,
    "POST",
    payload
  ),
  updateGoalPriority: (goalId, priority) => request(
    `${ROUTES.goals}/${encodeURIComponent(goalId)}/priority`,
    "POST",
    { priority }
  ),
  advanceGoal: (goal) => request(ROUTES.goalsAdvance, "POST", { goal }),
  replanGoal: (reason, taskId, newGoal) => request(ROUTES.goalsReplan, "POST", { reason, taskId: taskId || null, newGoal: newGoal || null }),
  refreshNextSuggestion: (completedTaskId) => request(ROUTES.nextSuggestion, "POST", { completedTaskId: completedTaskId || null }),
  adoptSuggestion: (suggestion) => request(ROUTES.adoptSuggestion, "POST", { suggestion }),
  getDungeonStatus: (demo) => request(`${ROUTES.dungeonStatus}?demo=${demo ? 1 : 0}`),
  startDungeon: (demo) => request(ROUTES.dungeonStart, "POST", { demo: Boolean(demo) }),
  resolveDungeonEvent: (choiceId) => request(ROUTES.dungeonEvents, "POST", { choiceId }),
  settleDungeon: () => request(ROUTES.dungeonSettlement, "POST", {}),
  useStarMapTool: (toolId, taskId) => request(ROUTES.starMapToolUses, "POST", { toolId, taskId }),
  getCurrentAgent: () => request(ROUTES.currentAgent),
  getCurrentAgentMemories: () => request(ROUTES.currentAgentMemories),
  createPurchase: (itemId) => request(ROUTES.purchases, "POST", { itemId }),
};
