const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), "aigc-star-map-"));
process.env.NODE_ENV = "test";
process.env.RUNTIME_DIR = runtimeDir;
delete process.env.DEEPSEEK_API_KEY;

const {
  createSession,
  getCurrentSessionState,
  completeTask,
  createTask,
  useStarMapTool,
} = require("../src/services/sessionService");
const { getState, saveStore } = require("../src/store/sessionStore");
const { buildAppState } = require("../src/lib/apiContract");

function forceNextPlanningDay() {
  const state = getState();
  if (state.dailyPlan) state.dailyPlan.planDate = "2000-01-01";
  state.goalPortfolio.goals.forEach((goal) => {
    goal.lastReleasedDate = "2000-01-01";
    goal.nodes.forEach((node) => { if (node.releasedDate) node.releasedDate = "2000-01-01"; });
  });
  state.tasks.forEach((task) => { if (task.portfolioReleaseDate) task.portfolioReleaseDate = "2000-01-01"; });
  saveStore();
}

async function completeVisibleMainTasks() {
  const state = await getCurrentSessionState();
  for (const task of state.tasks.filter((entry) => entry.type === "main" && !entry.done)) {
    await completeTask(task.id);
  }
}

async function run() {
  try {
    await createSession({
      account: `star-map-${Date.now()}`,
      password: "star-map-test",
      name: "星图测试用户",
      goal: "完成考研高数复习",
      deadline: "6 天后",
      dailyTime: "2 小时",
      roleId: "scholar",
    });

    let state = await getCurrentSessionState();
    const goal = state.goalPortfolio.goals[0];
    assert.strictEqual(goal.constellations.length, 2, "18 颗主线星应形成两张系列星图");
    for (let day = 1; day <= 5; day += 1) {
      await completeVisibleMainTasks();
      state = await getCurrentSessionState();
      if (day < 5) {
        forceNextPlanningDay();
        state = await getCurrentSessionState();
      }
    }
    assert.strictEqual(state.goalPortfolio.goals[0].status, "ACTIVE", "第一张星图完成时整个长期系列仍应继续");
    assert.strictEqual(state.starMap.collections.length, 1, "每完成一张系列星图就应立即收入图鉴");
    assert.strictEqual(state.starMap.collections[0].starCount, 15);
    forceNextPlanningDay();
    await completeVisibleMainTasks();
    state = await getCurrentSessionState();
    assert.strictEqual(state.goalPortfolio.goals[0].status, "COMPLETED");
    assert.strictEqual(state.starMap.collections.length, 2, "系列的每张完成星图都应独立收录");
    assert(state.starMap.collections.some((entry) => entry.starCount === 3), "最后不足 15 颗的星图也应正常收录");
    const cloak = state.starMap.tools["focus-cloak"];
    assert(cloak && cloak.charges === 1, "第一个星宿应奖励一次专注披风");
    const publicState = buildAppState(state);
    assert(Array.isArray(publicState.starMap.tools), "公开状态应把道具映射为前端可迭代列表");
    assert(publicState.starMap.collections[0].title.includes(goal.title));

    state = await getCurrentSessionState();
    assert.strictEqual(state.starMap.collections.length, 2, "重复读取状态不得重复收录星宿");
    assert.strictEqual(state.starMap.tools["focus-cloak"].charges, 1);

    await createTask("整理星图测试笔记");
    state = await getCurrentSessionState();
    const pending = state.tasks.find((task) => task.type === "side" && !task.done);
    assert(pending, "应存在可使用专注道具的任务");
    const diaryCount = state.diary.length;
    const focusResult = await useStarMapTool({ toolId: "focus-cloak", taskId: pending.id });
    assert.strictEqual(focusResult.action, "FOCUS");
    state = await getCurrentSessionState();
    assert.strictEqual(state.starMap.tools["focus-cloak"].charges, 0);
    assert.strictEqual(state.diary.length, diaryCount, "使用星宿道具不应改写日志结构或额外插入日志");

    const rawState = getState();
    rawState.starMap.tools["guardian-contract"] = {
      toolId: "guardian-contract",
      name: "守护契约",
      action: "FALLBACK",
      charges: 1,
      timesUsed: 0,
    };
    saveStore();
    await useStarMapTool({ toolId: "guardian-contract", taskId: pending.id });
    state = await getCurrentSessionState();
    assert(state.tasks.some((task) => task.title.startsWith("保底行动：")), "守护契约应生成保底任务");
    assert.strictEqual(state.diary.length, diaryCount, "保底任务生成不应额外写入日志");

    console.log("Star map collection and tool tests passed.");
  } finally {
    fs.rmSync(runtimeDir, { recursive: true, force: true });
  }
}

run().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
