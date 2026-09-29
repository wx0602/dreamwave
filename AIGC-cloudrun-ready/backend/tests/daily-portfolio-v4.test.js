const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), "aigc-daily-portfolio-v4-"));
process.env.NODE_ENV = "test";
process.env.RUNTIME_DIR = runtimeDir;
delete process.env.DEEPSEEK_API_KEY;

const {
  createSession,
  createParallelGoal,
  getCurrentSessionState,
  completeTask,
  createTask,
  updateGoalPriority,
} = require("../src/services/sessionService");
const { getState, saveStore } = require("../src/store/sessionStore");
const { AppError } = require("../src/lib/errors");

function pending(state, priorityTier) {
  return state.tasks.filter((task) => !task.done && (!priorityTier || task.priorityTier === priorityTier));
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
      account: `daily-v4-${Date.now()}`,
      password: "daily-v4-password",
      name: "全局调度测试用户",
      goal: "30 天完成 JavaScript 基础",
      deadline: "30 天后",
      dailyTime: "2 小时",
      roleId: "scholar",
    });
    await createParallelGoal({ title: "14 天完成 Python 入门", durationDays: 14 });
    await createParallelGoal({ title: "10 天完成阅读计划", durationDays: 10 });
    let state = await updateGoalPriority((await getCurrentSessionState()).goalPortfolio.goals[1].goalId, "SECONDARY")
      .then(() => getCurrentSessionState());
    assert.strictEqual(state.goalPortfolio.goals.filter((goal) => goal.status === "ACTIVE").length, 3);
    const primary = state.goalPortfolio.goals.find((goal) => goal.priority === "PRIMARY");
    const secondary = state.goalPortfolio.goals.find((goal) => goal.priority === "SECONDARY");
    const inactive = state.goalPortfolio.goals.find((goal) => goal.priority === "INACTIVE");
    assert(primary && secondary && inactive);

    let cores = pending(state, "CORE");
    let optionals = pending(state, "OPTIONAL");
    assert.strictEqual(cores.length, 3, "三个目标合计每天应发布三个主线任务");
    assert.strictEqual(optionals.length, 2, "三个目标合计每天应发布两个支线任务");
    assert.strictEqual(cores.filter((task) => task.portfolioGoalId === primary.goalId).length, 3, "同日新增目标不应改写已经发布的主线");
    assert.strictEqual(cores.filter((task) => task.portfolioGoalId === secondary.goalId).length, 0);
    assert(optionals.every((task) => task.portfolioGoalId === primary.goalId || task.portfolioGoalId === secondary.goalId));
    assert(!state.tasks.some((task) => !task.done && task.portfolioGoalId === inactive.goalId), "暂停目标不得自动发布任务");
    assert(pending(state).reduce((sum, task) => sum + Number(task.estimatedMinutes || 0), 0) <= state.dailyPlan.capacityMinutes);

    const expiredCoreIds = cores.map((task) => task.taskId || task.id);
    forceNextPlanningDay();
    state = await getCurrentSessionState();
    cores = pending(state, "CORE");
    assert.strictEqual(cores.length, 3, "次日必须发布三个新的主线任务");
    assert.strictEqual(cores.filter((task) => task.portfolioGoalId === primary.goalId).length, 2);
    assert.strictEqual(cores.filter((task) => task.portfolioGoalId === secondary.goalId).length, 1);
    assert(cores.every((task) => !expiredCoreIds.includes(task.id)), "未完成主线不得顺延到次日");
    assert(expiredCoreIds.every((id) => state.taskHistory.some((task) => task.id === id && task.archivedReason === "DAILY_TASK_EXPIRED")));

    for (const task of cores) await completeTask(task.id);
    state = await getCurrentSessionState();
    assert.strictEqual(pending(state, "CORE").length, 0, "当天完成三个主线后不得继续补发");

    await createTask("整理本周学习笔记");
    await createTask("整理本周错题清单");
    state = await getCurrentSessionState();
    optionals = pending(state, "OPTIONAL");
    assert.strictEqual(optionals.length, 2, "自定义可选任务应替换自动可选任务而不是叠加");
    assert.strictEqual(optionals.filter((task) => task.source === "CUSTOM").length, 2);
    await assert.rejects(
      () => createTask("再加一项临时安排"),
      (error) => error instanceof AppError && error.code === "DAILY_OPTIONAL_LIMIT_REACHED"
    );

    forceNextPlanningDay();
    state = await getCurrentSessionState();
    assert(pending(state, "OPTIONAL").length <= 2, "自动可选任务隔日不得堆积");
    assert.strictEqual(pending(state, "OPTIONAL").filter((task) => task.source === "CUSTOM").length, 2, "自定义可选任务应可跨日携带");
    assert.strictEqual(pending(state, "CORE").length, 3);

    const completedOptional = pending(state, "OPTIONAL")[0];
    await completeTask(completedOptional.id);
    state = await getCurrentSessionState();
    assert.strictEqual(state.dailyPlan.optionalSlotsUsed, 2, "完成可选任务不应释放当天名额");
    assert.strictEqual(pending(state, "OPTIONAL").length, 1, "完成可选任务后不得补发第三个可选任务");
    await assert.rejects(
      () => createTask("完成后再加一项"),
      (error) => error instanceof AppError && error.code === "DAILY_OPTIONAL_LIMIT_REACHED"
    );

    console.log("Global daily portfolio 3+2 tests passed.");
  } finally {
    fs.rmSync(runtimeDir, { recursive: true, force: true });
  }
}

run().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
