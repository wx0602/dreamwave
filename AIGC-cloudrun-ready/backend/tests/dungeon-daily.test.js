const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), "aigc-dungeon-daily-"));
process.env.NODE_ENV = "test";
process.env.RUNTIME_DIR = runtimeDir;
delete process.env.DEEPSEEK_API_KEY;

const {
  createSession,
  getCurrentSessionState,
  completeTask,
  getCurrentDungeonStatus,
  startDungeonRun,
  resolveDungeonEvent,
  settleDungeonRun,
} = require("../src/services/sessionService");
const { getState, saveStore } = require("../src/store/sessionStore");

function finishDungeonChoices() {
  let status = getCurrentDungeonStatus(true);
  let guard = 0;
  while (status.run && status.run.active && guard < 10) {
    const choices = status.run.activeNode && status.run.activeNode.choices;
    assert(Array.isArray(choices) && choices.length > 0, "进行中的副本必须存在可选分支");
    resolveDungeonEvent(choices[0].choiceId);
    status = getCurrentDungeonStatus(true);
    guard += 1;
  }
  assert(status.run && status.run.readyToSettle, "完成分支后副本应进入待结算状态");
}

async function run() {
  try {
    await createSession({
      account: `dungeon-daily-${Date.now()}`,
      password: "dungeon-daily-test",
      name: "副本测试用户",
      goal: "完成考研高数复习",
      deadline: "120 天后",
      dailyTime: "2 小时",
      roleId: "scholar",
    });

    let state = await getCurrentSessionState();
    await completeTask(state.tasks[0].id);
    state = await getCurrentSessionState();

    const statsBeforeDemo = { ...state.stats };
    startDungeonRun(true);
    let status = getCurrentDungeonStatus(true);
    assert.strictEqual(status.run.completionRoute, "DAILY_CLEAR", "完成今日唯一核心任务应进入今日全清路线");
    assert.strictEqual(status.run.rewardEligible, false, "演示副本不得具备正式奖励资格");
    assert.strictEqual(status.run.stageTheme.name, "无穷迷雾边境", "高数首阶段应映射到对应副本主题");
    finishDungeonChoices();
    const demoSettlement = await settleDungeonRun();
    state = await getCurrentSessionState();
    assert.deepStrictEqual(state.stats, statsBeforeDemo, "演示副本不得改变成长、资源、等级或连续天数");
    assert.deepStrictEqual(demoSettlement.rewardDelta, { growth: 0, resources: 0 });

    const resourcesBeforeOfficial = state.stats.resources;
    const streakBeforeOfficial = state.stats.streak;
    startDungeonRun(false, { ignoreTime: true });
    status = getCurrentDungeonStatus(false);
    assert.strictEqual(status.run.rewardEligible, true, "当天首次正式副本应具备奖励资格");
    assert.deepStrictEqual(status.run.rewardPreview, { growth: 0, resources: 12 });
    finishDungeonChoices();
    const officialSettlement = await settleDungeonRun();
    state = await getCurrentSessionState();
    assert.deepStrictEqual(officialSettlement.rewardDelta, { growth: 0, resources: 12 });
    assert.strictEqual(state.stats.resources, resourcesBeforeOfficial + 12, "今日全清奖励应由后端固定计算");
    assert.strictEqual(state.stats.streak, streakBeforeOfficial, "副本结算不得增加连续天数");

    startDungeonRun(false, { ignoreTime: true });
    status = getCurrentDungeonStatus(false);
    assert.strictEqual(status.run.rewardEligible, false, "同一每日计划重玩不得重复获得奖励");
    finishDungeonChoices();
    const replaySettlement = await settleDungeonRun();
    state = await getCurrentSessionState();
    assert.deepStrictEqual(replaySettlement.rewardDelta, { growth: 0, resources: 0 });
    assert.strictEqual(state.stats.resources, resourcesBeforeOfficial + 12, "重玩结算不得再次增加资源");

    const rawState = getState();
    const completedStage = rawState.goalPlan.stageGoals[0];
    completedStage.status = "DONE";
    completedStage.progress = 100;
    completedStage.tasks.forEach((task) => {
      task.status = "DONE";
      task.completedAt = task.completedAt || new Date().toISOString();
    });
    rawState.goalPlan.currentStageId = rawState.goalPlan.stageGoals[1].id;
    rawState.dailyPlan.stageGoalId = completedStage.id;
    rawState.tasks.filter((task) => task.source === "STAGE").forEach((task) => {
      task.done = true;
    });
    saveStore();

    startDungeonRun(true);
    status = getCurrentDungeonStatus(true);
    assert.strictEqual(status.run.completionRoute, "STAGE_BREAKTHROUGH", "阶段切换当天应进入突破路线");
    assert.strictEqual(status.run.nextStageTitle, rawState.goalPlan.stageGoals[1].title);

    console.log("Dungeon daily progression and reward tests passed.");
  } finally {
    fs.rmSync(runtimeDir, { recursive: true, force: true });
  }
}

run().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
