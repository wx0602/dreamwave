const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), "aigc-goal-portfolio-"));
process.env.NODE_ENV = "test";
process.env.RUNTIME_DIR = runtimeDir;
delete process.env.DEEPSEEK_API_KEY;

const {
  createSession,
  createParallelGoal,
  getCurrentSessionState,
  completeTask,
} = require("../src/services/sessionService");
const { getState, saveStore } = require("../src/store/sessionStore");

function pendingGoalTasks(state, goalId) {
  return state.tasks.filter((task) => (
    task.type === "main"
    && !task.done
    && (!goalId || task.portfolioGoalId === goalId)
  ));
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
      account: `portfolio-${Date.now()}`,
      password: "portfolio-test",
      name: "星图测试用户",
      goal: "30 天完成一轮跑步训练",
      deadline: "30 天后",
      dailyTime: "25 分钟",
      roleId: "scholar",
    });

    const initializedState = getState();
    assert.strictEqual(initializedState.goalPortfolio.goals.length, 1, "初始目标必须在注册响应前直接进入星图");
    assert.strictEqual(initializedState.goalPortfolio.goals[0].title, "30 天完成一轮跑步训练");

    let state = await getCurrentSessionState();
    assert.strictEqual(state.goalPortfolio.goals.length, 1, "初始长期目标应创建一张星图");
    const firstGoal = state.goalPortfolio.goals[0];
    assert.strictEqual(firstGoal.durationDays, 30, "30 天目标必须有 30 个日节点");
    assert.strictEqual(firstGoal.totalStarCount, 90, "30 天星图应预留 90 个主线星位");
    assert.strictEqual(firstGoal.nodes.length, 21, "首次只应生成包含今天在内的 7 天详细任务");
    assert.strictEqual(Math.max(...firstGoal.nodes.map((node) => node.day)), 7, "第 8 天以后不得提前生成任务");
    assert.strictEqual(firstGoal.planningVersion, 3, "长期目标应使用 AI 滚动规划版本");
    assert(firstGoal.planningBlueprint.phases.length >= 2, "应先生成阶段层级");
    assert.strictEqual(firstGoal.planningBlueprint.weeklyMilestones.length, 5, "30 天目标应生成 5 个周里程碑");
    assert.strictEqual(firstGoal.planningQuality.status, "PASSED", "七日任务必须通过质量门禁");
    assert(firstGoal.nodes.every((node) => node.qualityScore >= 85), "详细任务必须达到最低质量分");
    assert.strictEqual(firstGoal.constellations.length, 6, "90 颗星应拆成 6 张系列星图");
    assert(firstGoal.constellations.every((map) => map.starCount === 15), "系列中每张星图最多承载 15 颗主线星");
    assert.strictEqual(new Set(firstGoal.constellations.map((map) => map.constellationId)).size, 6, "系列星图应使用不同的真实星宿形态");
    assert.strictEqual(pendingGoalTasks(state, firstGoal.goalId).length, 3, "当天应释放三个主线星点");
    assert.deepStrictEqual(
      pendingGoalTasks(state, firstGoal.goalId).map((task) => task.taskRole),
      ["LEARN", "PRACTICE", "VERIFY"],
      "每日三条主线必须分别承担学习、练习和验证"
    );
    assert.strictEqual(
      new Set(pendingGoalTasks(state, firstGoal.goalId).map((task) => task.title)).size,
      3,
      "同日主线不得重复"
    );
    assert.strictEqual(firstGoal.nodes.filter((node) => node.status === "AVAILABLE").length, 3);
    assert.strictEqual(state.tasks.filter((task) => task.type === "side" && task.portfolioGoalId === firstGoal.goalId).length, 2);

    for (const task of pendingGoalTasks(state, firstGoal.goalId)) await completeTask(task.id);
    state = await getCurrentSessionState();
    assert.strictEqual(state.goalPortfolio.goals[0].completedDays, 1);
    assert.strictEqual(pendingGoalTasks(state, firstGoal.goalId).length, 0, "完成后同一天不得补发下一节点");
    assert.strictEqual(state.transition.needsNewGoalPrompt, false, "完成一天不得索要下一个长期目标");

    state = await getCurrentSessionState();
    assert.strictEqual(pendingGoalTasks(state, firstGoal.goalId).length, 0, "同日重复刷新必须幂等");

    await createParallelGoal({ title: "14 天完成阅读计划", durationDays: 14 });
    state = await getCurrentSessionState();
    assert.strictEqual(state.goalPortfolio.goals.length, 2, "应允许并行添加其他长期目标");
    const secondGoal = state.goalPortfolio.goals[1];
    assert.strictEqual(secondGoal.constellations.length, 3, "14 天的 42 颗星应拆成 3 张系列星图");
    assert.notStrictEqual(firstGoal.constellationId, secondGoal.constellationId, "并行目标应分配独立星宿");
    assert.strictEqual(pendingGoalTasks(state, firstGoal.goalId).length, 0, "添加新目标不得重新释放旧目标节点");
    assert.strictEqual(pendingGoalTasks(state, secondGoal.goalId).length, 3, "新建目标当日应获得三个主线星点");
    assert.strictEqual(state.tasks.filter((task) => task.type === "side" && task.portfolioGoalId === secondGoal.goalId).length, 2);

    for (const task of pendingGoalTasks(state, secondGoal.goalId)) await completeTask(task.id);
    state = await getCurrentSessionState();
    assert.strictEqual(pendingGoalTasks(state).length, 0, "两个目标当日完成后都不得继续生成");

    forceNextPlanningDay();
    state = await getCurrentSessionState();
    assert.strictEqual(pendingGoalTasks(state, firstGoal.goalId).length, 3, "次日应释放第一个目标的三个主线");
    assert.strictEqual(pendingGoalTasks(state, secondGoal.goalId).length, 3, "次日应独立释放第二个目标的三个主线");
    assert.strictEqual(
      state.goalPortfolio.goals[0].nodes.find((node) => node.status === "AVAILABLE").day,
      2,
      "次日必须解锁第 2 天而不是新的长期目标"
    );
    assert.strictEqual(
      Math.max(...state.goalPortfolio.goals[0].nodes.map((node) => node.day)),
      8,
      "进入第 2 天时只应补充规划第 8 天"
    );

    for (const task of pendingGoalTasks(state, firstGoal.goalId)) await completeTask(task.id);
    state = await getCurrentSessionState();
    assert.strictEqual(state.goalPortfolio.goals[0].completedDays, 2, "完成两天只应记录 2/30 进度");
    assert.strictEqual(state.goalPortfolio.goals[0].status, "ACTIVE", "2/30 的长期目标必须仍在进行中");
    assert.strictEqual(state.transition.needsNewGoalPrompt, false, "完成两天后也不得索要下一个长期目标");
    assert.strictEqual(pendingGoalTasks(state, firstGoal.goalId).length, 0, "第 3 天节点必须等到再次跨天刷新");

    console.log("Parallel daily goal portfolio tests passed.");
  } finally {
    fs.rmSync(runtimeDir, { recursive: true, force: true });
  }
}

run().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
