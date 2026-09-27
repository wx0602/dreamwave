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
    assert.strictEqual(cores.length, 1, "三个目标合计每天只能发布一个核心任务");
    assert(optionals.length <= 2, "三个目标合计每天最多发布两个可选任务");
    assert.strictEqual(cores[0].portfolioGoalId, primary.goalId);
    assert(optionals.every((task) => task.portfolioGoalId === primary.goalId || task.portfolioGoalId === secondary.goalId));
    assert(!state.tasks.some((task) => !task.done && task.portfolioGoalId === inactive.goalId), "暂停目标不得自动发布任务");
    assert(pending(state).reduce((sum, task) => sum + Number(task.estimatedMinutes || 0), 0) <= state.dailyPlan.capacityMinutes);

    const carriedCoreId = cores[0].taskId || cores[0].id;
    forceNextPlanningDay();
    state = await getCurrentSessionState();
    cores = pending(state, "CORE");
    assert.strictEqual(cores.length, 1, "未完成核心任务跨天只能携带一项核心任务");
    assert.strictEqual(cores[0].id, carriedCoreId);
    assert(cores[0].carryoverCount >= 1, "携带核心任务应记录跨天次数");

    await completeTask(cores[0].id);
    state = await getCurrentSessionState();
    assert.strictEqual(pending(state, "CORE").length, 0, "当天完成核心后不得补发第二个核心任务");

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
    assert(pending(state, "CORE").length <= 1);

    const completedOptional = pending(state, "OPTIONAL")[0];
    await completeTask(completedOptional.id);
    state = await getCurrentSessionState();
    assert.strictEqual(state.dailyPlan.optionalSlotsUsed, 2, "完成可选任务不应释放当天名额");
    assert.strictEqual(pending(state, "OPTIONAL").length, 1, "完成可选任务后不得补发第三个可选任务");
    await assert.rejects(
      () => createTask("完成后再加一项"),
      (error) => error instanceof AppError && error.code === "DAILY_OPTIONAL_LIMIT_REACHED"
    );

    console.log("Global daily portfolio v4 tests passed.");
  } finally {
    fs.rmSync(runtimeDir, { recursive: true, force: true });
  }
}

run().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
