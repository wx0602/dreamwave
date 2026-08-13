const assert = require("assert");

const baseUrl = String(process.env.SMOKE_BASE_URL || "http://127.0.0.1:3001").replace(/\/$/, "");

global.wx = {
  cloud: {
    async callContainer(options) {
      const response = await fetch(`${baseUrl}${options.path}`, {
        method: options.method || "GET",
        headers: { "content-type": "application/json" },
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

  const created = await api.createSession({
    account,
    password,
    name: "小程序烟测",
    goal: "完成原生微信小程序迁移验证",
    deadline: "30 天后",
    dailyTime: "2 小时",
    roleId: roles[0].id,
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

  const completed = await api.completeTask(task.taskId);
  assert(completed.state.tasks.some((item) => item.taskId === task.taskId && item.status === "completed"), "task completion failed");

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

  console.log("Mini program API smoke test passed.");
}

module.exports = { run };

if (require.main === module) {
  run().catch((error) => {
    console.error(error.stack || error.message || error);
    process.exit(1);
  });
}
