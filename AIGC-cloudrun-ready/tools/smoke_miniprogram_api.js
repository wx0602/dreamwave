const assert = require("assert");

const baseUrl = String(process.env.SMOKE_BASE_URL || "http://127.0.0.1:3001").replace(/\/$/, "");
const localStorage = new Map();

global.wx = {
  getStorageSync(key) { return localStorage.has(key) ? localStorage.get(key) : ""; },
  setStorageSync(key, value) { localStorage.set(key, value); },
  removeStorageSync(key) { localStorage.delete(key); },
  cloud: {
    async callContainer(options) {
      const response = await fetch(`${baseUrl}${options.path}`, {
        method: options.method || "GET",
        headers: { "content-type": "application/json", ...(options.header || {}) },
        body: options.method === "GET" || options.data === undefined
          ? undefined
          : JSON.stringify(options.data),
      });
      return { statusCode: response.status, data: await response.json() };
    },
  },
};

const api = require("../miniprogram/services/api");

async function run() {
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const account = `mini-smoke-${suffix}`;
  const password = "smoke-pass-2026";

  const roles = await api.listRoles();
  assert(Array.isArray(roles) && roles.length >= 3, "role list is unavailable");

  let draft = await api.createGoalDraft({
    mode: "INITIAL",
    goalProfile: {
      account,
      password,
      name: "小程序烟测",
      goal: "学习 JavaScript 前端基础",
      deadline: "30 天后",
      dailyTime: "2 小时",
      roleId: roles[0].id,
    },
  });
  draft = await api.searchGoalSources(draft.draftId, {
    expectedRevision: draft.revision,
    userSources: [{ title: "小程序迁移验证笔记" }],
  });
  assert(draft.sourceBundles && draft.sourceBundles.length, "source bundles are unavailable");
  draft = await api.selectGoalSources(draft.draftId, {
    expectedRevision: draft.revision,
    bundleId: draft.sourceBundles[0].bundleId,
  });
  draft = await api.generateGoalPlan(draft.draftId, { expectedRevision: draft.revision });
  assert(draft.planDraft && draft.planDraft.firstWeek.length, "source-bound plan was not generated");
  assert(draft.planDraft.firstWeek.every((day) => day.mainTasks.length === 3 && day.sideTasks.length === 2), "daily 3+2 plan was not generated");
  const created = await api.confirmGoalDraft(draft.draftId, {
    expectedRevision: draft.revision,
    confirmationKey: "mini-confirm-" + suffix,
    mode: "INITIAL",
    registration: { account, password },
  });
  assert(created.state && created.state.initialized, "session was not initialized");

  let state = await api.getCurrentSession();
  assert(state.user && state.agent, "current session has no user or agent");

  const sideQuest = await api.createTask("验证小程序统一 API 层");
  const task = sideQuest.state.tasks.find((item) => item.title === "验证小程序统一 API 层");
  assert(task && task.taskId, "created task is missing");

  const updated = await api.updateTask(task.taskId, {
    title: "验证小程序页面跳转与 API 层",
    detail: "由 services/api.js 调用",
    estimatedMinutes: 12,
    deadlineAt: "2030-01-01",
  });
  assert(updated.state.tasks.some((item) => item.taskId === task.taskId && item.estimatedMinutes === 12), "task update failed");

  const completed = await api.completeTask(task.taskId, "");
  assert(completed.state.tasks.some((item) => item.taskId === task.taskId && item.status === "completed"), "task completion failed");
  const activeTasks = completed.state.tasks.filter((item) => item.status !== "completed");
  assert.strictEqual(activeTasks.filter((item) => item.priorityTier === "CORE").length, 3, "exactly three main tasks should be released");
  assert(activeTasks.filter((item) => item.priorityTier === "OPTIONAL").length <= 2, "more than two side tasks were released");

  await api.refreshNextSuggestion(task.taskId);
  state = await api.getCurrentSession();
  if (state.nextSuggestion) await api.adoptSuggestion(state.nextSuggestion);

  await api.replanGoal("NO_TIME", null, null);
  await api.getCurrentAgent();
  await api.getCurrentAgentMemories();

  let dungeon = await api.getDungeonStatus(true);
  if (!dungeon.run || (!dungeon.run.active && !dungeon.run.readyToSettle)) {
    await api.startDungeon(true);
  }
  for (let index = 0; index < 12; index += 1) {
    dungeon = await api.getDungeonStatus(true);
    if (dungeon.run && dungeon.run.readyToSettle) break;
    const choice = dungeon.run && dungeon.run.activeNode && dungeon.run.activeNode.choices[0];
    assert(choice && choice.choiceId, "dungeon choice is missing");
    await api.resolveDungeonEvent(choice.choiceId);
  }
  dungeon = await api.getDungeonStatus(true);
  assert(dungeon.run && dungeon.run.readyToSettle, "dungeon did not reach settlement");
  await api.settleDungeon();

  const loggedIn = await api.loginSession({ account, password });
  assert(loggedIn.state && loggedIn.state.user && loggedIn.state.user.nickname === "小程序烟测", "login flow failed");

  let secondDraft = await api.createGoalDraft({
    mode: "PARALLEL",
    goalProfile: { title: "学习 Python 编程", durationDays: 14, dailyTime: "1 小时" },
  });
  secondDraft = await api.searchGoalSources(secondDraft.draftId, {
    expectedRevision: secondDraft.revision,
    userSources: [{ title: "Python 练习笔记" }],
  });
  secondDraft = await api.selectGoalSources(secondDraft.draftId, {
    expectedRevision: secondDraft.revision,
    bundleId: secondDraft.sourceBundles[0].bundleId,
  });
  secondDraft = await api.generateGoalPlan(secondDraft.draftId, { expectedRevision: secondDraft.revision });
  const parallel = await api.confirmGoalDraft(secondDraft.draftId, {
    expectedRevision: secondDraft.revision,
    confirmationKey: "mini-parallel-" + suffix,
    mode: "PARALLEL",
  });
  assert(parallel.state.goalPortfolio.goals.length === 2, "parallel goal was not created through draft flow");
  const finalActive = parallel.state.tasks.filter((item) => item.status !== "completed");
  assert.strictEqual(finalActive.filter((item) => item.priorityTier === "CORE").length, 3, "parallel flow should keep the global three-main limit");
  assert(finalActive.filter((item) => item.priorityTier === "OPTIONAL").length <= 2, "parallel flow exceeded side-task limit");

  let legacyBlocked = false;
  try {
    await api.createSession({ account: "legacy-" + suffix, password, name: "旧路径", goal: "不应直接创建" });
  } catch (error) {
    legacyBlocked = /确认|来源|计划/.test(error.message);
  }
  assert(legacyBlocked, "legacy session endpoint still bypasses confirmation");

  console.log("Mini program API smoke test passed.");
}

module.exports = { run };

if (require.main === module) {
  run().catch((error) => {
    console.error(error.stack || error.message || error);
    process.exit(1);
  });
}
