const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), "aigc-goal-completion-guard-"));
process.env.NODE_ENV = "test";
process.env.RUNTIME_DIR = runtimeDir;
delete process.env.DEEPSEEK_API_KEY;

const {
  createSession,
  getCurrentSessionState,
} = require("../src/services/sessionService");
const { getState, saveStore } = require("../src/store/sessionStore");

async function run() {
  try {
    await createSession({
      account: `goal-guard-${Date.now()}`,
      password: "goal-guard-test",
      name: "长期目标测试用户",
      goal: "完成毕业论文并通过答辩",
      deadline: "90 天后",
      dailyTime: "2 小时",
      roleId: "scholar",
    });

    let state = await getCurrentSessionState();
    assert.strictEqual(state.goalPlan.goalLevel, "LONG_TERM", "毕业、考试和备考目标应优先识别为长期目标");
    assert(state.goalPlan.stageGoals.length >= 3, "长期目标至少应包含三个阶段");
    assert(
      state.goalPlan.stageGoals.reduce((sum, stage) => sum + stage.tasks.length, 0) >= 6,
      "长期目标至少应包含六个必做节点"
    );

    const rawState = getState();
    const truncatedStage = rawState.goalPlan.stageGoals[0];
    truncatedStage.tasks = truncatedStage.tasks.slice(0, 2).map((task) => ({
      ...task,
      status: "DONE",
      completedAt: new Date().toISOString(),
    }));
    truncatedStage.status = "DONE";
    truncatedStage.progress = 100;
    rawState.goalPlan.stageGoals = [truncatedStage];
    rawState.goalPlan.currentStageId = null;
    rawState.goalPlan.status = "COMPLETED";
    rawState.transition.needsNewGoalPrompt = true;
    saveStore();

    state = await getCurrentSessionState();
    assert.strictEqual(state.transition.needsNewGoalPrompt, false, "只有两个完成节点的旧计划不得提示新长期目标");
    assert.strictEqual(state.goalPlan.status, "ACTIVE", "过短旧计划应恢复为进行中");
    assert(state.goalPlan.currentStageId, "修复后必须进入后续阶段，不能让计划卡死");
    assert(state.goalPlan.stageGoals.length >= 3, "旧账号过短计划应自动补足后续阶段");

    console.log("Goal completion guard regression tests passed.");
  } finally {
    fs.rmSync(runtimeDir, { recursive: true, force: true });
  }
}

run().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
