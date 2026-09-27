const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), "aigc-task-summary-"));
process.env.NODE_ENV = "test";
process.env.RUNTIME_DIR = runtimeDir;
delete process.env.DEEPSEEK_API_KEY;

const {
  createSession,
  getCurrentSessionState,
  completeTask,
} = require("../src/services/sessionService");
const { getState } = require("../src/store/sessionStore");
const { AppError } = require("../src/lib/errors");

function taskId(task) {
  return task && (task.id || task.taskId);
}

async function newSession(label, days = 7) {
  await createSession({
    account: `summary-${label}-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    password: "summary-password",
    name: "总结测试用户",
    goal: `${days} 天完成总结测试`,
    deadline: `${days} 天后`,
    dailyTime: "2 小时",
    roleId: "scholar",
  });
  return getCurrentSessionState();
}

async function run() {
  try {
    let state = await newSession("empty");
    const core = state.tasks.find((task) => task.priorityTier === "CORE" && !task.done);
    assert(core);
    const emptyEvent = await completeTask(taskId(core));
    assert.strictEqual(emptyEvent.completionSummary, "");
    const emptyReward = emptyEvent.rewardDelta;
    state = await getCurrentSessionState();
    const emptyTask = state.tasks.find((task) => taskId(task) === taskId(core));
    assert.strictEqual(emptyTask.completionSummary, "", "空总结在内部任务记录中应为空字符串");
    const completedStars = state.goalPortfolio.goals[0].completedStars;
    const optional = state.tasks.find((task) => task.priorityTier === "OPTIONAL" && !task.done);
    if (optional) {
      const beforeStars = state.goalPortfolio.goals[0].completedStars;
      await completeTask(taskId(optional), { summary: "可选行动记录" });
      state = await getCurrentSessionState();
      assert.strictEqual(state.goalPortfolio.goals[0].completedStars, beforeStars, "可选任务不得点亮核心星位");
      assert.strictEqual(state.starMap.collections.length, 0, "可选任务不得单独收录星图");
    }
    assert.strictEqual(state.goalPortfolio.goals[0].completedStars, completedStars);

    state = await newSession("five");
    const fiveCore = state.tasks.find((task) => task.priorityTier === "CORE" && !task.done);
    const fiveEvent = await completeTask(taskId(fiveCore), { summary: "一二三四五" });
    assert.strictEqual(fiveEvent.completionSummary, "一二三四五");
    assert.deepStrictEqual(fiveEvent.rewardDelta, emptyReward, "是否填写总结不应改变奖励");
    state = await getCurrentSessionState();
    const fiveTask = state.tasks.find((task) => taskId(task) === taskId(fiveCore));
    assert.strictEqual(fiveTask.completionSummary, "一二三四五");
    assert(state.diary.some((entry) => String(entry.body || "").includes("一二三四五")));
    assert(getState().memories.some((entry) => String(entry.memorySummary || "").includes("一二三四五")));

    const diaryCount = getState().diary.length;
    const memoryCount = getState().memories.length;
    await assert.rejects(() => completeTask(taskId(fiveCore), { summary: "重试完成" }));
    state = await getCurrentSessionState();
    assert.strictEqual(getState().diary.length, diaryCount, "重复结算不得重复写日志");
    assert.strictEqual(getState().memories.length, memoryCount, "重复结算不得重复写记忆");

    state = await newSession("bounds");
    const boundCore = state.tasks.find((task) => task.priorityTier === "CORE" && !task.done);
    const beforeBound = await getCurrentSessionState();
    for (const summary of ["一", "一二", "一二三", "一二三四"]) {
      await assert.rejects(
        () => completeTask(taskId(boundCore), { summary }),
        (error) => error instanceof AppError && error.code === "SUMMARY_TOO_SHORT"
      );
    }
    await assert.rejects(
      () => completeTask(taskId(boundCore), { summary: "一".repeat(101) }),
      (error) => error instanceof AppError && error.code === "SUMMARY_TOO_LONG"
    );
    state = await getCurrentSessionState();
    assert.strictEqual(state.tasks.find((task) => taskId(task) === taskId(boundCore)).done, false);
    assert.strictEqual(state.stats.growth, beforeBound.stats.growth);

    state = await newSession("hundred", 1);
    const hundredCore = state.tasks.find((task) => task.priorityTier === "CORE" && !task.done);
    const hundredSummary = "一".repeat(100);
    const hundredEvent = await completeTask(taskId(hundredCore), { summary: hundredSummary });
    assert.strictEqual(hundredEvent.completionSummary, hundredSummary);
    state = await getCurrentSessionState();
    assert.strictEqual(state.goalPortfolio.goals[0].status, "COMPLETED");
    assert.strictEqual(state.starMap.collections.length, 1);
    assert.strictEqual(state.starMap.collections[0].stars[0].completionSummary, hundredSummary, "星图快照应保留总结");

    console.log("Task summary boundary and persistence tests passed.");
  } finally {
    fs.rmSync(runtimeDir, { recursive: true, force: true });
  }
}

run().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
