const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), "aigc-session-v9-"));
process.env.NODE_ENV = "test";
process.env.RUNTIME_DIR = runtimeDir;
delete process.env.DEEPSEEK_API_KEY;

const {
  createSession,
  getCurrentSessionState,
  loginSession,
} = require("../src/services/sessionService");
const { getState, saveStore } = require("../src/store/sessionStore");

function legacyNode(goalId, day, done) {
  return {
    nodeId: `${goalId}-legacy-${day}`,
    day,
    slot: 1,
    status: done ? "DONE" : "LOCKED",
    releasedDate: done ? "2026-08-01" : null,
    completedAt: done ? `2026-08-01T0${Math.min(day, 9)}:00:00.000Z` : null,
    title: `旧计划第 ${day} 天任务`,
    detail: "旧计划中的待执行范围",
    estimatedMinutes: 25,
    taskRole: ["LEARN", "PRACTICE", "VERIFY"][day % 3],
    taskRoleLabel: "旧任务角色",
  };
}

async function makeLegacyState(completedCount, options = {}) {
  const account = `migration-${completedCount}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const password = "migration-password";
  await createSession({
    account,
    password,
    name: "迁移测试用户",
    goal: "20 天完成迁移验证",
    deadline: "20 天后",
    dailyTime: "2 小时",
    roleId: "scholar",
  });
  const state = getState();
  const goal = state.goalPortfolio.goals[0];
  const nodes = Array.from({ length: 20 }, (_, index) => legacyNode(goal.goalId, index + 1, index < completedCount));
  goal.planningVersion = 3;
  goal.totalStarCount = 60;
  goal.starsPerDay = 3;
  goal.plannedThroughDay = 0;
  delete goal.planningBlueprint;
  goal.nodes = nodes;
  goal.constellations = [
    { mapId: `${goal.goalId}-map-1`, order: 1, constellationId: "ursa-major", constellationName: "大熊座", nodeIds: nodes.slice(0, 15).map((node) => node.nodeId), status: "ACTIVE" },
    { mapId: `${goal.goalId}-map-2`, order: 2, constellationId: "orion", constellationName: "猎户座", nodeIds: nodes.slice(15).map((node) => node.nodeId), status: "LOCKED" },
  ];
  goal.status = "ACTIVE";
  state.meta.version = 8;
  state.goalPortfolio.version = 1;
  const pendingStart = Math.min(completedCount, nodes.length - 1);
  state.tasks = [0, 1, 2].map((offset) => ({
    id: `legacy-pending-${completedCount}-${offset}`,
    type: "main",
    done: false,
    title: `旧待执行任务 ${offset + 1}`,
    detail: "旧计划任务内容",
    estimatedMinutes: 25,
    portfolioGoalId: goal.goalId,
    portfolioNodeId: nodes[pendingStart + offset] && nodes[pendingStart + offset].nodeId,
    portfolioDay: pendingStart + offset + 1,
    scheduledDate: "2026-08-01",
    source: "LONG_TERM",
  }));
  if (options.awarded) {
    state.starMap.collections = [{
      seriesMapId: `${goal.goalId}-map-1`,
      goalPlanId: goal.goalId,
      title: "已领取的大熊座",
      starCount: 15,
      stars: [],
    }];
  } else {
    state.starMap.collections = [];
  }
  saveStore();
  return { account, password, goalId: goal.goalId, done: nodes.slice(0, completedCount).map((node) => ({ nodeId: node.nodeId, completedAt: node.completedAt })) };
}

async function run() {
  try {
    for (const completedCount of [0, 1, 2, 15, 16]) {
      const fixture = await makeLegacyState(completedCount, { awarded: completedCount >= 15 });
      let state = await getCurrentSessionState();
      const rawAfterMigration = getState();
      const goal = state.goalPortfolio.goals.find((entry) => entry.goalId === fixture.goalId);
      assert(goal, "迁移后目标必须保留");
      assert.strictEqual(rawAfterMigration.meta && rawAfterMigration.meta.version, 9);
      assert(rawAfterMigration.dailyPlan.optionalSlotsUsed >= 0 && rawAfterMigration.dailyPlan.optionalSlotsUsed <= 2);
      assert.strictEqual(goal.planningVersion, 5);
      assert.strictEqual(goal.totalStarCount, 60);
      assert.strictEqual(goal.nodes.length, Math.min(60, 21 + completedCount * 3), "迁移后应补齐历史星位并保留七日滚动窗口");
      assert.strictEqual(goal.plannedThroughDay, Math.min(20, completedCount + 7));
      fixture.done.forEach((expected) => {
        const migrated = goal.nodes.find((node) => node.nodeId === expected.nodeId);
        assert(migrated, "DONE 节点 ID 不得改变");
        assert.strictEqual(migrated.completedAt, expected.completedAt, "DONE 节点完成时间不得改变");
      });
      const pending = state.tasks.filter((task) => !task.done && task.portfolioGoalId === fixture.goalId);
      assert(pending.filter((task) => task.priorityTier === "CORE").length <= 3);
      assert(pending.filter((task) => task.priorityTier === "OPTIONAL").length <= 2);
      assert.strictEqual(state.starMap.collections.length, completedCount >= 15 ? 1 : 0, "已领取星图不得重复发奖");

      const stable = JSON.stringify({
        nodes: goal.nodes,
        taskIds: state.tasks.map((task) => task.id).sort(),
        history: state.taskHistory.map((task) => task.id).sort(),
        collections: state.starMap.collections.map((entry) => entry.seriesMapId).sort(),
      });
      state = await getCurrentSessionState();
      const migratedAgain = state.goalPortfolio.goals.find((entry) => entry.goalId === fixture.goalId);
      const stableAgain = JSON.stringify({
        nodes: migratedAgain.nodes,
        taskIds: state.tasks.map((task) => task.id).sort(),
        history: state.taskHistory.map((task) => task.id).sort(),
        collections: state.starMap.collections.map((entry) => entry.seriesMapId).sort(),
      });
      assert.strictEqual(stableAgain, stable, "重复迁移必须幂等");
    }

    const loginFixture = await makeLegacyState(2);
    await loginSession({ account: loginFixture.account, password: loginFixture.password });
    const loggedIn = await getCurrentSessionState();
    assert.strictEqual(getState().meta && getState().meta.version, 9, "登录旧账号时也必须执行 v9 迁移");
    assert.strictEqual(loggedIn.goalPortfolio.goals[0].planningVersion, 5);

    console.log("Session v9 migration tests passed.");
  } finally {
    fs.rmSync(runtimeDir, { recursive: true, force: true });
  }
}

run().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
