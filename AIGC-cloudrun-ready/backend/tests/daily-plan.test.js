const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), "aigc-daily-plan-"));
process.env.NODE_ENV = "test";
process.env.RUNTIME_DIR = runtimeDir;
delete process.env.DEEPSEEK_API_KEY;

const {
  createSession,
  getCurrentSessionState,
  completeTask,
  createTask,
} = require("../src/services/sessionService");
const { getState, saveStore } = require("../src/store/sessionStore");

function pendingLongTermTasks(state, goalId) {
  return state.tasks.filter((task) => task.type === "main" && !task.done && task.portfolioGoalId === goalId);
}

function forceNextPlanningDay() {
  const state = getState();
  state.dailyPlan.planDate = "2000-01-01";
  state.goalPortfolio.goals.forEach((goal) => {
    goal.lastReleasedDate = "2000-01-01";
    goal.nodes.forEach((node) => { if (node.releasedDate) node.releasedDate = "2000-01-01"; });
  });
  state.tasks.forEach((task) => { if (task.portfolioReleaseDate) task.portfolioReleaseDate = "2000-01-01"; });
  saveStore();
}

async function run() {
  try {
    await createSession({
      account: `daily-plan-${Date.now()}`,
      password: "daily-plan-test",
      name: "每日节点测试用户",
      goal: "7 天完成高数复习",
      deadline: "7 天后",
      dailyTime: "1 小时",
      roleId: "scholar",
    });

    let state = await getCurrentSessionState();
    const goal = state.goalPortfolio.goals[0];
    assert(state.dailyPlan, "首次进入时应生成今日计划");
    assert.strictEqual(goal.durationDays, 7);
    assert.strictEqual(goal.nodes.length, 21);
    assert.strictEqual(pendingLongTermTasks(state, goal.goalId).length, 3, "每个目标当天应释放三个主线星点");
    assert.strictEqual(state.tasks.filter((task) => task.type === "side" && task.portfolioGoalId === goal.goalId).length, 2, "每个目标当天应生成两个支线");

    const firstPlanId = state.dailyPlan.id;
    const firstTaskId = pendingLongTermTasks(state, goal.goalId)[0].id;
    state = await getCurrentSessionState();
    assert.strictEqual(state.dailyPlan.id, firstPlanId, "同一自然日不得重建每日计划");
    assert.strictEqual(pendingLongTermTasks(state, goal.goalId)[0].id, firstTaskId, "同日刷新必须幂等");

    for (const task of pendingLongTermTasks(state, goal.goalId)) await completeTask(task.id);
    state = await getCurrentSessionState();
    assert.strictEqual(state.goalPortfolio.goals[0].completedDays, 1);
    assert.strictEqual(pendingLongTermTasks(state, goal.goalId).length, 0, "完成后必须等到明天");
    assert.strictEqual(state.transition.needsNewGoalPrompt, false, "未完成整张星图时不得请求新长期目标");

    await createTask("整理今天的书桌");
    state = await getCurrentSessionState();
    assert(state.tasks.some((task) => task.type === "side" && !task.done), "仍可添加临时支线任务");
    assert.strictEqual(pendingLongTermTasks(state, goal.goalId).length, 0, "添加支线不得偷偷补发长期任务");

    forceNextPlanningDay();
    state = await getCurrentSessionState();
    assert.strictEqual(pendingLongTermTasks(state, goal.goalId).length, 3, "到第二天释放下一组三个主线");
    assert.strictEqual(
      state.goalPortfolio.goals[0].nodes.find((node) => node.status === "AVAILABLE").day,
      2
    );
    assert(state.taskHistory.length > 0, "跨天后已完成任务应进入历史记录");
    assert(state.dailyPlanHistory.length > 0, "跨天计划应保留历史摘要");

    console.log("Daily goal-node release tests passed.");
  } finally {
    fs.rmSync(runtimeDir, { recursive: true, force: true });
  }
}

run().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
